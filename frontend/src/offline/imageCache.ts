import { db } from "./db";
import { generateId } from "./id";

export const LOCAL_IMAGE_PREFIX = "local://";

export async function saveLocalImage(
  blob: Blob,
  mimeType: string,
  noteId: string | null = null
) {
  const id = generateId();
  await db.images.add({ id, noteId, blob, mimeType, syncStatus: "pending" });
  return id;
}

export async function getLocalImageUrl(id: string) {
  const image = await db.images.get(id);
  if (!image) return null;
  return URL.createObjectURL(image.blob);
}

export function replaceLocalImageUrls(
  content: string,
  urlMap: Record<string, string>
) {
  return content.replace(
    new RegExp(`${LOCAL_IMAGE_PREFIX}([a-zA-Z0-9_-]+)`, "g"),
    (_, id) => {
      return urlMap[id] || `${LOCAL_IMAGE_PREFIX}${id}`;
    }
  );
}

export function parseLocalImageIds(content: string): string[] {
  const matches = content.match(
    new RegExp(`${LOCAL_IMAGE_PREFIX}([a-zA-Z0-9_-]+)`, "g")
  );
  return matches ? matches.map((m) => m.replace(LOCAL_IMAGE_PREFIX, "")) : [];
}

export async function setImageNoteId(imageId: string, noteId: string) {
  await db.images.update(imageId, { noteId });
}

export async function markImageSynced(imageId: string) {
  await db.images.update(imageId, { syncStatus: "synced" });
}

export async function getPendingImagesForNote(noteId: string) {
  return db.images.where({ noteId, syncStatus: "pending" }).toArray();
}
