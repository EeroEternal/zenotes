import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "./db";
import { createLocalNote, deleteLocalNote } from "./localNoteApi";
import { processSyncQueue } from "./syncEngine";
import * as api from "../lib/api";

describe("syncEngine", () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.syncQueue.clear();
    vi.restoreAllMocks();
  });

  it("creates a note on the server and marks it synced", async () => {
    const note = await createLocalNote({ content: "sync me" });
    vi.spyOn(api, "fetchAuthMe").mockResolvedValue({ id: 1, username: "test", email: "test@test.com" });
    const createSpy = vi.spyOn(api, "createNote").mockResolvedValue({ ...note, syncStatus: "synced" } as any);

    await processSyncQueue();

    expect(createSpy).toHaveBeenCalledWith({ id: note.id, content: "sync me" });
    expect(createSpy).toHaveBeenCalledTimes(1);
    const queue = await db.syncQueue.toArray();
    expect(queue.length).toBe(0);
    const synced = await db.notes.get(note.id);
    expect(synced?.syncStatus).toBe("synced");
  });

  it("does not call createNote again after retries are exhausted", async () => {
    const note = await createLocalNote({ content: "retry me" });
    const queueItem = await db.syncQueue.orderBy("createdAt").first();
    expect(queueItem?.id).toBeDefined();
    await db.syncQueue.update(queueItem!.id!, { retries: 3 });

    vi.spyOn(api, "fetchAuthMe").mockResolvedValue({ id: 1, username: "test", email: "test@test.com" });
    const createSpy = vi.spyOn(api, "createNote");

    await processSyncQueue();

    expect(createSpy).not.toHaveBeenCalled();
    const queue = await db.syncQueue.toArray();
    expect(queue.length).toBe(0);
    const local = await db.notes.get(note.id);
    expect(local?.syncStatus).toBe("pending");
  });

  it("drops CREATE_NOTE when the local note is already synced", async () => {
    const note = await createLocalNote({ content: "already synced" });
    await db.notes.update(note.id, { syncStatus: "synced" });

    vi.spyOn(api, "fetchAuthMe").mockResolvedValue({ id: 1, username: "test", email: "test@test.com" });
    const createSpy = vi.spyOn(api, "createNote");

    await processSyncQueue();

    expect(createSpy).not.toHaveBeenCalled();
    const queue = await db.syncQueue.toArray();
    expect(queue.length).toBe(0);
  });

  it("runs create only once across two sync passes for the same pending note", async () => {
    const note = await createLocalNote({ content: "once" });

    vi.spyOn(api, "fetchAuthMe").mockResolvedValue({ id: 1, username: "test", email: "test@test.com" });
    const createSpy = vi.spyOn(api, "createNote").mockResolvedValue({ ...note, syncStatus: "synced" } as any);

    await processSyncQueue();
    await processSyncQueue();

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect((await db.syncQueue.toArray()).length).toBe(0);
  });

  it("tombstones deleted notes instead of removing them locally", async () => {
    const note = await createLocalNote({ content: "delete me" });
    await deleteLocalNote(note.id);
    const deleteItem = await db.syncQueue.orderBy("createdAt").last();
    expect(deleteItem?.type).toBe("DELETE_NOTE");

    vi.spyOn(api, "fetchAuthMe").mockResolvedValue({ id: 1, username: "test", email: "test@test.com" });
    vi.spyOn(api, "deleteNote").mockResolvedValue(undefined as any);

    await processSyncQueue();

    const row = await db.notes.get(note.id);
    expect(row?.isDeleted).toBe(true);
    expect(row?.syncStatus).toBe("synced");
  });
});
