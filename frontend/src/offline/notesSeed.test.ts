import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "./db";
import { mergeServerNotesIntoLocal } from "./notesSeed";
import { createLocalNote } from "./localNoteApi";
import * as api from "../lib/api";

describe("notesSeed", () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.syncQueue.clear();
    vi.restoreAllMocks();
  });

  it("does not resurrect locally deleted tombstones on refresh", async () => {
    await db.notes.add({
      id: "note-1",
      content: "gone",
      title: null,
      color: "white",
      tags: [],
      pinned: false,
      position: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: "synced",
      isDeleted: true,
    });

    await mergeServerNotesIntoLocal([
      {
        id: "note-1",
        content: "gone",
        color: "white",
        tags: [],
        pinned: false,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const row = await db.notes.get("note-1");
    expect(row?.isDeleted).toBe(true);
  });

  it("adds new server notes that are not present locally", async () => {
    await mergeServerNotesIntoLocal([
      {
        id: "server-note",
        content: "from server",
        color: "white",
        tags: [],
        pinned: false,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const row = await db.notes.get("server-note");
    expect(row?.content).toBe("from server");
    expect(row?.isDeleted).toBe(false);
  });

  it("does not duplicate when server note id already exists locally", async () => {
    const note = await createLocalNote({ content: "local pending" });
    await db.notes.update(note.id, { syncStatus: "pending" });

    await mergeServerNotesIntoLocal([
      {
        id: note.id,
        content: "from server",
        color: "white",
        tags: [],
        pinned: false,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const rows = await db.notes.toArray();
    expect(rows.filter((r) => r.id === note.id)).toHaveLength(1);
    expect(rows[0]?.content).toBe("local pending");
  });

  it("markNoteSynced merge does not throw when seed already inserted server id", async () => {
    const serverId = crypto.randomUUID();
    const localId = crypto.randomUUID();

    await db.notes.bulkAdd([
      {
        id: localId,
        content: "sync me",
        title: null,
        color: "white",
        tags: [],
        pinned: false,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: "pending",
        isDeleted: false,
      },
      {
        id: serverId,
        content: "from seed race",
        title: null,
        color: "white",
        tags: [],
        pinned: false,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: "synced",
        isDeleted: false,
      },
    ]);

    const { markNoteSynced } = await import("./localNoteApi");
    await expect(
      markNoteSynced(localId, {
        id: serverId,
        content: "sync me",
        color: "white",
        tags: [],
        pinned: false,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any),
    ).resolves.not.toThrow();

    const rows = await db.notes.toArray();
    expect(rows.filter((r) => r.id === serverId)).toHaveLength(1);
    expect(rows.find((r) => r.id === localId)).toBeUndefined();
    expect(rows[0]?.content).toBe("sync me");
    expect(rows[0]?.syncStatus).toBe("synced");
  });
});

describe("generateId", () => {
  it("returns a UUID", async () => {
    const { generateId } = await import("./id");
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
