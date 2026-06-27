import { db, type LocalNote } from "./db";
import { generateId } from "./id";
import { idRemap } from "./idRemap";

export type NoteInput = Partial<Omit<LocalNote, "id" | "syncStatus" | "isDeleted" | "createdAt" | "updatedAt">>;

export function nowIso(): string {
  return new Date().toISOString();
}

export async function createLocalNote(input: NoteInput = {}) {
  const ts = nowIso();
  const note: LocalNote = {
    id: generateId(),
    content: "",
    title: null,
    color: "white",
    tags: [],
    pinned: false,
    position: 0,
    ...input,
    createdAt: ts,
    updatedAt: ts,
    syncStatus: "pending",
    isDeleted: false,
  };
  await db.notes.add(note);
  await db.syncQueue.add({
    type: "CREATE_NOTE",
    entityId: note.id,
    payload: input,
    retries: 0,
    createdAt: Date.now(),
  });
  return note;
}

export async function updateLocalNote(id: string, input: NoteInput) {
  const existing = await db.notes.get(id);
  if (!existing) throw new Error(`Note not found: ${id}`);
  const updates: Partial<LocalNote> = {
    ...input,
    updatedAt: nowIso(),
    syncStatus: "pending",
  };
  await db.notes.update(id, updates);
  const updated = { ...existing, ...updates } as LocalNote;
  await db.syncQueue.add({
    type: "UPDATE_NOTE",
    entityId: id,
    payload: updated,
    retries: 0,
    createdAt: Date.now(),
  });
  return updated;
}

export async function deleteLocalNote(id: string) {
  await db.notes.update(id, { isDeleted: true, syncStatus: "pending", updatedAt: nowIso() });
  await db.syncQueue.add({
    type: "DELETE_NOTE",
    entityId: id,
    payload: {},
    retries: 0,
    createdAt: Date.now(),
  });
}

export async function getLocalNotes() {
  const notes = await db.notes.filter((n) => !n.isDeleted).toArray();
  return notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getLocalNote(id: string) {
  return db.notes.get(id);
}

export async function markNoteSynced(id: string, serverNote?: Partial<LocalNote>) {
  await db.transaction("rw", [db.notes, db.syncQueue, db.images], async () => {
    const existing = await db.notes.get(id);
    if (!existing) return;

    if (serverNote && serverNote.id && serverNote.id !== id) {
      const serverId = serverNote.id;
      idRemap.set(id, serverId);

      // 1. Delete the old note
      await db.notes.delete(id);

      // 2. Add the new note with the server ID and syncStatus: "synced"
      const newNote: LocalNote = {
        ...existing,
        ...serverNote,
        id: serverId,
        syncStatus: "synced",
      };
      await db.notes.add(newNote);

      // 3. Update any pending syncQueue operations targeting the old note ID
      const pendingOps = await db.syncQueue.where("entityId").equals(id).toArray();
      for (const op of pendingOps) {
        if (op.id) {
          const updatedPayload = { ...op.payload };
          if (updatedPayload.id === id) {
            updatedPayload.id = serverId;
          }
          await db.syncQueue.update(op.id, {
            entityId: serverId,
            payload: updatedPayload,
          });
        }
      }

      // 4. Update any local images targeting the old note ID
      const localImages = await db.images.where("noteId").equals(id).toArray();
      for (const img of localImages) {
        await db.images.update(img.id, { noteId: serverId });
      }
    } else {
      // Just update the note as synced
      await db.notes.update(id, {
        syncStatus: "synced",
        ...serverNote,
      });
    }
  });
}

export async function removeLocalNote(id: string) {
  await db.notes.delete(id);
}
