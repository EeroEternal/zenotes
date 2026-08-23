import type { Note } from "@/types/note";
import * as api from "@/lib/api";
import { db } from "./db";
import { processSyncQueue } from "./syncEngine";

/** Merge server notes into IndexedDB without resurrecting locally deleted tombstones. */
export async function mergeServerNotesIntoLocal(notes: Note[]) {
  const pendingCreates = new Set(
    (await db.syncQueue.where("type").equals("CREATE_NOTE").toArray()).map((op) => op.entityId),
  );

  await db.transaction("rw", db.notes, async () => {
    for (const note of notes) {
      if (pendingCreates.has(note.id)) continue;

      const exists = await db.notes.get(note.id);
      if (exists?.isDeleted) continue;
      if (exists) {
        if (exists.syncStatus === "synced") {
          await db.notes.update(note.id, {
            ...note,
            title: note.title ?? null,
            tags: note.tags ?? [],
            syncStatus: "synced",
            isDeleted: false,
          } as any);
        }
        continue;
      }

      try {
        await db.notes.add({
          ...note,
          title: note.title ?? null,
          tags: note.tags ?? [],
          syncStatus: "synced",
          isDeleted: false,
        } as any);
      } catch (err) {
        // Race: another tab or sync just wrote this id — update instead of crashing.
        if (err instanceof Error && err.name === "ConstraintError") {
          await db.notes.update(note.id, {
            ...note,
            title: note.title ?? null,
            tags: note.tags ?? [],
            syncStatus: "synced",
            isDeleted: false,
          } as any);
        } else {
          throw err;
        }
      }
    }
  });
}

/** Push local changes first, then merge server state (avoids seed/sync races). */
export async function pullServerNotes() {
  await processSyncQueue();
  const data = await api.fetchNotes(1, 1000);
  await mergeServerNotesIntoLocal(data.notes);
  return data;
}
