import { describe, it, expect, beforeEach } from "vitest";
import {
  getSavedGlobalToken,
  setSavedGlobalToken,
  getGlobalExportAllUrl,
  getGlobalNoteZipUrl,
  getGlobalNoteMarkdownUrl,
  getGlobalFileDownloadUrl,
} from "@/lib/api";

describe("Global Token & Export URL Helpers", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {}
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
});
