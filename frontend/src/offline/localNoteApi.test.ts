import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { createLocalNote, updateLocalNote, deleteLocalNote, getLocalNotes } from "./localNoteApi";

describe("localNoteApi", () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.syncQueue.clear();
  });

  it("creates a note and adds CREATE_NOTE to sync queue", async () => {
    const note = await createLocalNote({ content: "hello" });
    expect(note.content).toBe("hello");
    expect(note.syncStatus).toBe("pending");
    const queue = await db.syncQueue.toArray();
    expect(queue[0].type).toBe("CREATE_NOTE");
    expect(queue[0].entityId).toBe(note.id);
  });

  it("updates a note and adds UPDATE_NOTE to sync queue", async () => {
    const created = await createLocalNote({ content: "hello" });
    await db.syncQueue.clear();
    const updated = await updateLocalNote(created.id, { content: "world" });
    expect(updated.content).toBe("world");
    const queue = await db.syncQueue.toArray();
    expect(queue[0].type).toBe("UPDATE_NOTE");
  });

  it("deletes a note and adds DELETE_NOTE to sync queue", async () => {
    const created = await createLocalNote({ content: "hello" });
    await db.syncQueue.clear();
    await deleteLocalNote(created.id);
    const got = await db.notes.get(created.id);
    expect(got?.isDeleted).toBe(true);
    const queue = await db.syncQueue.toArray();
    expect(queue[0].type).toBe("DELETE_NOTE");
  });
});
