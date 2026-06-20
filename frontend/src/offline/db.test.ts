import { describe, it, expect } from "vitest";
import { db, LocalNote, LocalImage, SyncOperation } from "./db";

describe("offline db", () => {
  it("stores and retrieves a note", async () => {
    await db.notes.clear();
    const note: LocalNote = {
      id: "n1",
      content: "hello",
      title: null,
      color: "white",
      tags: [],
      pinned: false,
      position: 1,
      createdAt: "2026-06-20T00:00:00Z",
      updatedAt: "2026-06-20T00:00:00Z",
      syncStatus: "pending",
      isDeleted: false,
    };
    await db.notes.add(note);
    const got = await db.notes.get("n1");
    expect(got?.content).toBe("hello");
  });

  it("stores a sync operation", async () => {
    await db.syncQueue.clear();
    const op: SyncOperation = {
      type: "CREATE_NOTE",
      entityId: "n1",
      payload: { content: "hello" },
      retries: 0,
      createdAt: Date.now(),
    };
    const id = await db.syncQueue.add(op);
    const got = await db.syncQueue.get(id);
    expect(got?.type).toBe("CREATE_NOTE");
  });
});
