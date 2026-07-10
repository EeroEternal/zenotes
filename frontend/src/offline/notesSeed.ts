import type { Note } from "@/types/note";
import { db } from "./db";

/** Merge server notes into IndexedDB without resurrecting locally deleted tombstones. */
export async function mergeServerNotesIntoLocal(notes: Note[]) {
  await db.transaction("rw", db.notes, async () => {
    for (const note of notes) {
      const exists = await db.notes.get(note.id);
      if (exists?.isDeleted) continue;
      if (!exists) {
        await db.notes.add({
          ...note,
          syncStatus: "synced",
          isDeleted: false,
        } as any);
      }
    }
  });
}
