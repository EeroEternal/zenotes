import { db } from "./db";
import * as api from "../lib/api";
import { ApiError } from "../lib/api-error";
import { getPendingImagesForNote, markImageSynced, replaceLocalImageUrls } from "./imageCache";
import { markNoteSynced, removeLocalNote } from "./localNoteApi";

const MAX_RETRIES = 3;
const SYNC_LOCK_NAME = "zenotes-sync";

let _syncing = false;

export async function processSyncQueue() {
  const run = async () => {
    if (_syncing) return;
    _syncing = true;
    try {
      await processSyncQueueInner();
    } finally {
      _syncing = false;
    }
  };

  if (typeof navigator !== "undefined" && "locks" in navigator) {
    await navigator.locks.request(SYNC_LOCK_NAME, run);
  } else {
    await run();
  }
}

async function claimCreateNote(entityId: string): Promise<boolean> {
  return db.transaction("rw", db.notes, async () => {
    const note = await db.notes.get(entityId);
    if (!note || note.isDeleted) return false;
    if (note.syncStatus === "synced" || note.syncStatus === "syncing") return false;
    await db.notes.update(entityId, { syncStatus: "syncing" });
    return true;
  });
}

async function processSyncQueueInner() {
  try {
    const user = await api.fetchAuthMe();
    if (!user) return;
  } catch {
    return;
  }

  while (true) {
    const pending = await db.syncQueue.orderBy("createdAt").toArray();
    if (pending.length === 0) break;

    let processed = 0;
    for (const op of pending) {
      if (!op.id) continue;

      if (op.retries >= MAX_RETRIES) {
        await db.syncQueue.delete(op.id);
        processed++;
        continue;
      }

      if (op.type === "CREATE_NOTE") {
        const localNote = await db.notes.get(op.entityId);
        if (!localNote || localNote.isDeleted) {
          await db.syncQueue.delete(op.id);
          processed++;
          continue;
        }
        if (localNote.syncStatus === "synced") {
          await db.syncQueue.delete(op.id);
          processed++;
          continue;
        }
        if (localNote.syncStatus === "syncing") {
          continue;
        }
      }

      try {
        await executeOperation(op);
        await db.syncQueue.delete(op.id);
        processed++;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
        console.error("[SyncEngine] failed", op.type, op.entityId, msg);
        if (op.type === "CREATE_NOTE") {
          const note = await db.notes.get(op.entityId);
          if (note?.syncStatus === "syncing") {
            await db.notes.update(op.entityId, { syncStatus: "pending" });
          }
        }
        await db.syncQueue.update(op.id, { retries: op.retries + 1 });
      }
    }

    if (processed === 0) break;
  }
}

async function executeOperation(op: { type: string; entityId: string; payload: Record<string, unknown> }) {
  switch (op.type) {
    case "CREATE_NOTE": {
      const claimed = await claimCreateNote(op.entityId);
      if (!claimed) return;

      const p = op.payload ?? {};
      const createBody: Record<string, unknown> = { id: op.entityId };
      if (typeof p.content === "string") createBody.content = p.content;
      if (typeof p.title === "string" && p.title) createBody.title = p.title;
      if (typeof p.color === "string") createBody.color = p.color;
      if (Array.isArray(p.tags)) createBody.tags = p.tags;

      try {
        const serverNote = await api.createNote(createBody as any);
        await markNoteSynced(op.entityId, serverNote as any);
        const finalId = serverNote?.id || op.entityId;
        await syncImagesForNote(finalId);
      } catch (err) {
        const note = await db.notes.get(op.entityId);
        if (note?.syncStatus === "syncing") {
          await db.notes.update(op.entityId, { syncStatus: "pending" });
        }
        throw err;
      }
      break;
    }
    case "UPDATE_NOTE": {
      const p = op.payload ?? {};
      const updateBody: Record<string, unknown> = {};
      if (typeof p.content === "string") updateBody.content = p.content;
      if (p.title !== undefined) updateBody.title = typeof p.title === "string" ? p.title : null;
      if (typeof p.color === "string") updateBody.color = p.color;
      if (Array.isArray(p.tags)) updateBody.tags = p.tags;
      if (typeof p.pinned === "boolean") updateBody.pinned = p.pinned;

      await api.updateNote(op.entityId, updateBody as any);
      await markNoteSynced(op.entityId);
      await syncImagesForNote(op.entityId);
      break;
    }
    case "DELETE_NOTE": {
      await api.deleteNote(op.entityId);
      await removeLocalNote(op.entityId);
      break;
    }
    case "UPLOAD_IMAGE": {
      break;
    }
    default:
      console.warn("[SyncEngine] unknown op", op);
  }
}

async function syncImagesForNote(noteId: string) {
  const images = await getPendingImagesForNote(noteId);
  if (images.length === 0) return;
  const note = await db.notes.get(noteId);
  if (!note) return;

  const urlMap: Record<string, string> = {};
  for (const image of images) {
    const file = new File([image.blob], `${image.id}.png`, { type: image.mimeType });
    const result = (await api.uploadImage(noteId, file)) as { imageUrl: string };
    urlMap[image.id] = result.imageUrl;
    await markImageSynced(image.id);
  }

  if (Object.keys(urlMap).length > 0) {
    const newContent = replaceLocalImageUrls(note.content, urlMap);
    await db.notes.update(noteId, { content: newContent, syncStatus: "pending", updatedAt: new Date().toISOString() });
    await db.syncQueue.add({
      type: "UPDATE_NOTE",
      entityId: noteId,
      payload: { content: newContent },
      retries: 0,
      createdAt: Date.now(),
    });
  }
}
