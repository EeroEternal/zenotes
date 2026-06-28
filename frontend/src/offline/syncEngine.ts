import { toast } from "sonner";
import { db } from "./db";
import * as api from "../lib/api";
import { ApiError } from "../lib/api-error";
import { getPendingImagesForNote, markImageSynced, replaceLocalImageUrls } from "./imageCache";
import { markNoteSynced, removeLocalNote } from "./localNoteApi";

const MAX_RETRIES = 3;

let _syncing = false;

export async function processSyncQueue() {
  // Prevent concurrent sync runs (can be triggered by onSuccess + useEffect simultaneously)
  if (_syncing) return;
  _syncing = true;
  try {
    // Skip sync entirely if the user is not signed in (avoids 401 spam)
    try {
      const user = await api.fetchAuthMe();
      if (!user) return;
    } catch {
      return;
    }

    const pending = await db.syncQueue.orderBy("createdAt").toArray();
    for (const op of pending) {
      if (!op.id) continue;

      // Skip stale CREATE_NOTE operations where the local note is already gone
      if (op.type === "CREATE_NOTE") {
        const localNote = await db.notes.get(op.entityId);
        if (!localNote) {
          await db.syncQueue.delete(op.id);
          continue;
        }
      }

      try {
        await executeOperation(op);
        await db.syncQueue.delete(op.id);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : String(err));
        console.error("[SyncEngine] failed", op.type, op.entityId, msg);
        if (op.retries >= MAX_RETRIES) {
          toast.error(`Sync failed: ${msg}`);
        } else {
          await db.syncQueue.update(op.id, { retries: op.retries + 1 });
        }
      }
    }
  } finally {
    _syncing = false;
  }
}

async function executeOperation(op: { type: string; entityId: string; payload: Record<string, unknown> }) {
  switch (op.type) {
    case "CREATE_NOTE": {
      const p = op.payload ?? {};
      const createBody: Record<string, unknown> = {};
      if (typeof p.content === "string") createBody.content = p.content;
      if (typeof p.title === "string" && p.title) createBody.title = p.title;
      if (typeof p.color === "string") createBody.color = p.color;
      if (Array.isArray(p.tags)) createBody.tags = p.tags;

      const serverNote = await api.createNote(createBody as any);
      await markNoteSynced(op.entityId, serverNote as any);
      const finalId = serverNote?.id || op.entityId;
      await syncImagesForNote(finalId);
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
      // handled inside syncImagesForNote after note exists
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
    await processSyncQueue(); // recursively sync the content update
  }
}
