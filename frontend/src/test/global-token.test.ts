import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSavedGlobalToken,
  setSavedGlobalToken,
  getGlobalExportAllUrl,
  getGlobalNoteZipUrl,
  getGlobalNoteMarkdownUrl,
  getGlobalFileDownloadUrl,
  createGlobalNote,
  updateGlobalNote,
  deleteGlobalNote,
} from "@/lib/api";

describe("Global Token & Export URL Helpers", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
    vi.restoreAllMocks();
  });

  it("handles saving and retrieving global token in localStorage", () => {
    setSavedGlobalToken("my_test_secret_token");
    expect(getSavedGlobalToken()).toBe("my_test_secret_token");

    setSavedGlobalToken("");
    expect(getSavedGlobalToken()).toBe("");
  });

  it("generates correct global export URLs", () => {
    const token = "sec_token_123";
    const exportAll = getGlobalExportAllUrl(token);
    expect(exportAll).toContain("/global/export-all.zip?token=sec_token_123");

    const noteZip = getGlobalNoteZipUrl("note-abc", token);
    expect(noteZip).toContain("/global/notes/note-abc/export.zip?token=sec_token_123");

    const noteMd = getGlobalNoteMarkdownUrl("note-abc", token);
    expect(noteMd).toContain("/global/notes/note-abc/markdown?token=sec_token_123");

    const noteFile = getGlobalFileDownloadUrl("note-abc", "file-xyz", token);
    expect(noteFile).toContain("/global/notes/note-abc/files/file-xyz?token=sec_token_123");
  });

  it("sends X-Global-Token header on create, update, and delete global note calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const method = init?.method || "GET";
      if (method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response(
        JSON.stringify({
          id: "note-1",
          title: "Test",
          content: "Body",
          color: "white",
          tags: ["agent"],
          pinned: false,
          position: 0,
          createdAt: "2026-10-17T00:00:00Z",
          updatedAt: "2026-10-17T00:00:00Z",
        }),
        { status: method === "POST" ? 201 : 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const created = await createGlobalNote("master_tok", {
      title: "Test",
      content: "Body",
      tags: ["agent"],
    });
    expect(created.id).toBe("note-1");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/global/notes"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Global-Token": "master_tok" }),
      }),
    );

    const updated = await updateGlobalNote("master_tok", "note-1", { content: "Updated Body" });
    expect(updated.id).toBe("note-1");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/global/notes/note-1"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-Global-Token": "master_tok" }),
      }),
    );

    await deleteGlobalNote("master_tok", "note-1");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/global/notes/note-1"),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-Global-Token": "master_tok" }),
      }),
    );
  });
});
