import { toast } from "sonner";
import { db } from "./db";
import * as api from "../lib/api";
import { getPendingImagesForNote, markImageSynced, replaceLocalImageUrls } from "./imageCache";
import { markNoteSynced, removeLocalNote } from "./localNoteApi";

const MAX_RETRIES = 3;

export async function processSyncQueue() {
  const pending = await db.syncQueue.orderBy("createdAt").toArray();
  for (const op of pending) {
    if (!op.id) continue;
    try {
      await db.syncQueue.update(op.id, { retries: op.retries + 1 });
      await executeOperation(op);
      await db.syncQueue.delete(op.id);
    } catch (err) {
      console.error("[SyncEngine] failed", op.type, op.entityId, err);
      if (op.retries + 1 >= MAX_RETRIES) {
        toast.error(`同步失败: ${op.type}`);
      }
    }
  }
}

async function executeOperation(op: { type: string; entityId: string; payload: Record<string, unknown> }) {
  switch (op.type) {
    case "CREATE_NOTE": {
      const serverNote = await api.createNote(op.payload as any);
      await markNoteSynced(op.entityId, serverNote as any);
      const finalId = serverNote?.id || op.entityId;
      await syncImagesForNote(finalId);
      break;
    }
    case "UPDATE_NOTE": {
      await api.updateNote(op.entityId, op.payload as any);
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
