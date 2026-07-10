import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { mergeServerNotesIntoLocal } from "./notesSeed";

describe("notesSeed", () => {
  beforeEach(async () => {
    await db.notes.clear();
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
});

describe("generateId", () => {
  it("returns a UUID", async () => {
    const { generateId } = await import("./id");
    expect(generateId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
