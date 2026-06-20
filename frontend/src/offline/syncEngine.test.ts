import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "./db";
import { createLocalNote } from "./localNoteApi";
import { processSyncQueue } from "./syncEngine";
import * as api from "../lib/api";

describe("syncEngine", () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.syncQueue.clear();
  });

  it("creates a note on the server and marks it synced", async () => {
    const note = await createLocalNote({ content: "sync me" });
    const createSpy = vi.spyOn(api, "createNote").mockResolvedValue({ ...note, syncStatus: "synced" } as any);

    await processSyncQueue();

    expect(createSpy).toHaveBeenCalledWith({ content: "sync me" });
    const queue = await db.syncQueue.toArray();
    expect(queue.length).toBe(0);
    const synced = await db.notes.get(note.id);
    expect(synced?.syncStatus).toBe("synced");
  });
});
