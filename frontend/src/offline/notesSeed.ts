import type { Note } from "@/types/note";
import * as api from "@/lib/api";
import { db } from "./db";
import { processSyncQueue } from "./syncEngine";

/** Merge server notes into IndexedDB without resurrecting locally deleted tombstones. */
export async function mergeServerNotesIntoLocal(
  notes: Note[],
  opts: { purgeMissing?: boolean; knownServerIds?: Set<string> } = {},
) {
  const purgeMissing = opts.purgeMissing === true;
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

    if (purgeMissing) {
      const serverIds = opts.knownServerIds ?? new Set(notes.map((n) => n.id));
      const allLocal = await db.notes.filter((n) => !n.isDeleted && n.syncStatus === "synced").toArray();
      for (const local of allLocal) {
        if (!serverIds.has(local.id) && !pendingCreates.has(local.id)) {
          await db.notes.delete(local.id);
        }
      }
    }
  });
}

const SEED_PAGE_SIZE = 100;
const PAGE_RETRIES = 3;

async function fetchNotesPage(page: number) {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= PAGE_RETRIES; attempt++) {
    try {
      return await api.fetchNotes(page, SEED_PAGE_SIZE);
    } catch (err) {
      lastErr = err;
      if (attempt === PAGE_RETRIES) break;
      const wait = Math.min(8000, 400 * 2 ** (attempt - 1));
      console.warn(`[notes seed] page ${page} failed (attempt ${attempt}), retry in ${wait}ms`, err);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** Push local changes first, then merge server state (avoids seed/sync races). */
export async function pullServerNotes() {
  await processSyncQueue();

  const serverIds = new Set<string>();
  let page = 1;
  let total = 0;
  let totalPages = 1;
  let loaded = 0;

  do {
    const data = await fetchNotesPage(page);
    const batch = data.notes ?? [];
    total = data.pagination?.total ?? loaded + batch.length;
    totalPages = Math.max(1, data.pagination?.totalPages ?? 1);

    if (batch.length === 0) {
      // Only legitimate end: past last page or truly empty account.
      if (page === 1 || page > totalPages) break;
      throw new Error(`notes seed: page ${page}/${totalPages} returned 0 notes`);
    }

    for (const n of batch) serverIds.add(n.id);
    await mergeServerNotesIntoLocal(batch, { purgeMissing: false });
    loaded += batch.length;
    console.info(`[notes seed] page ${page}/${totalPages} (+${batch.length}, local ${loaded}/${total})`);

    page += 1;
  } while (page <= totalPages);

  // Purge only after a full successful walk of the server list.
  if (serverIds.size > 0 || total === 0) {
    await mergeServerNotesIntoLocal([], {
      purgeMissing: true,
      knownServerIds: serverIds,
    });
  }

  return {
    notes: [],
    pagination: { page: 1, pageSize: loaded, total, totalPages: 1 },
  };
}
