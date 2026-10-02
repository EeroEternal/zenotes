import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizeFilename,
  getUniqueName,
  extractMediaIds,
  extensionFromMime,
  generateFrontmatter,
  formatNoteMarkdown,
  exportAllToDirectory,
} from "@/lib/export-directory";
import { db } from "@/offline/db";
import type { Note } from "@/types/note";

describe("export-directory utilities", () => {
  describe("sanitizeFilename", () => {
    it("strips illegal characters for filesystem safety", () => {
      expect(sanitizeFilename("Hello: World / Test? <Yes> *No* | Bar")).toBe(
        "Hello_ World _ Test_ _Yes_ _No_ _ Bar",
      );
    });

    it("trims whitespace, dots, and collapses multiple spaces", () => {
      expect(sanitizeFilename("   ...my note title...   ")).toBe("my note title");
    });

    it("truncates names longer than 80 chars", () => {
      const longName = "a".repeat(120);
      expect(sanitizeFilename(longName).length).toBe(80);
    });

    it("returns empty string if nothing left", () => {
      expect(sanitizeFilename("    :::   ")).toBe("");
    });
  });

  describe("getUniqueName", () => {
    it("returns candidate if not yet used", () => {
      const used = new Set<string>();
      expect(getUniqueName("Meeting", used)).toBe("Meeting");
      expect(used.has("meeting")).toBe(true);
    });

    it("appends counter when collision occurs", () => {
      const used = new Set<string>(["meeting"]);
      expect(getUniqueName("Meeting", used)).toBe("Meeting (2)");
      expect(getUniqueName("Meeting", used)).toBe("Meeting (3)");
    });

    it("handles empty or whitespace as untitled", () => {
      const used = new Set<string>();
      expect(getUniqueName("", used)).toBe("untitled");
      expect(getUniqueName("   ", used)).toBe("untitled (2)");
    });
  });

  describe("extractMediaIds", () => {
    it("extracts media ids from various note media url formats", () => {
      const content = `
        Hello world
        ![img1](zenotes:media:11111111-2222-3333-4444-555555555555)
        Some text in between
        ![img2](local://img_local_12345678)
        ![img3](/api/notes/note-1/media/22222222-3333-4444-5555-666666666666)
        ![img4](mynotes:media:33333333-4444-5555-6666-777777777777)
      `;
      const ids = extractMediaIds(content);
      expect(ids).toContain("11111111-2222-3333-4444-555555555555");
      expect(ids).toContain("img_local_12345678");
      expect(ids).toContain("22222222-3333-4444-5555-666666666666");
      expect(ids).toContain("33333333-4444-5555-6666-777777777777");
    });

    it("returns empty array when content has no media", () => {
      expect(extractMediaIds("Plain text note")).toEqual([]);
      expect(extractMediaIds("")).toEqual([]);
    });
  });

  describe("extensionFromMime", () => {
    it("returns appropriate extensions", () => {
      expect(extensionFromMime("image/png")).toBe(".png");
      expect(extensionFromMime("image/jpeg")).toBe(".jpg");
      expect(extensionFromMime("image/webp")).toBe(".webp");
      expect(extensionFromMime("image/svg+xml")).toBe(".svg");
      expect(extensionFromMime("image/gif")).toBe(".gif");
      expect(extensionFromMime(null)).toBe(".png");
    });
  });

  describe("generateFrontmatter and formatNoteMarkdown", () => {
    const sampleNote: Note = {
      id: "note-123",
      title: "My Project",
      content: "Here is note body with ![pic](zenotes:media:media-abc-123456).",
      tags: ["dev", "work"],
      color: "yellow",
      pinned: true,
      position: 1,
      createdAt: "2026-03-01T10:00:00Z",
      updatedAt: "2026-03-02T12:00:00Z",
    };

    it("generates yaml frontmatter", () => {
      const fm = generateFrontmatter(sampleNote);
      expect(fm).toContain("id: \"note-123\"");
      expect(fm).toContain("title: \"My Project\"");
      expect(fm).toContain("pinned: true");
      expect(fm).toContain("- \"dev\"");
      expect(fm).toContain("- \"work\"");
    });

    it("replaces media ids with relative media paths", () => {
      const mediaMap = {
        "media-abc-123456": "media/media-abc-123456.png",
      };
      const formatted = formatNoteMarkdown(sampleNote, mediaMap);
      expect(formatted).toContain("![pic](media/media-abc-123456.png)");
      expect(formatted).toContain("---");
      expect(formatted).toContain("title: \"My Project\"");
    });
  });

  describe("exportAllToDirectory execution", () => {
    beforeEach(async () => {
      await db.notes.clear();
      await db.images.clear();
    });

    it("returns error if no notes exist", async () => {
      const res = await exportAllToDirectory({ notes: [] });
      expect(res.success).toBe(false);
      expect(res.error).toBe("No notes found to export");
    });

    it("exports via FileSystemDirectoryHandle when showDirectoryPicker is supported", async () => {
      const writtenFiles: Record<string, string | Blob> = {};

      const createMockDirHandle = (dirName = ""): FileSystemDirectoryHandle =>
        ({
          getDirectoryHandle: vi.fn(async (subName: string) =>
            createMockDirHandle(dirName ? `${dirName}/${subName}` : subName),
          ),
          getFileHandle: vi.fn(async (fileName: string) => ({
            createWritable: vi.fn(async () => ({
              write: vi.fn(async (data: string | Blob | ArrayBuffer) => {
                const fullPath = dirName ? `${dirName}/${fileName}` : fileName;
                writtenFiles[fullPath] = data as string | Blob;
              }),
              close: vi.fn(async () => {}),
            })),
          })),
        }) as unknown as FileSystemDirectoryHandle;

      const rootHandle = createMockDirHandle();
      (window as unknown as Record<string, unknown>).showDirectoryPicker = vi.fn().mockResolvedValue(rootHandle);

      const notes: Note[] = [
        {
          id: "1",
          title: "First Note",
          content: "Hello world content",
          tags: ["sample"],
          color: "white",
          pinned: false,
          position: 1,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ];

      const res = await exportAllToDirectory({ notes });
      expect(res.success).toBe(true);
      expect(res.exportedCount).toBe(1);
      expect(res.mode).toBe("directory");

      expect(writtenFiles["manifest.json"]).toBeDefined();
      expect(writtenFiles["First Note/First Note.md"]).toBeDefined();
      expect(writtenFiles["First Note/First Note.md"]).toContain("Hello world content");
    });

    it("handles user cancellation in showDirectoryPicker gracefully", async () => {
      const abortErr = new Error("User cancelled");
      abortErr.name = "AbortError";
      (window as unknown as Record<string, unknown>).showDirectoryPicker = vi.fn().mockRejectedValue(abortErr);

      const notes: Note[] = [
        {
          id: "1",
          title: "Note",
          content: "Body",
          tags: [],
          color: "white",
          pinned: false,
          position: 1,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ];

      const res = await exportAllToDirectory({ notes });
      expect(res.success).toBe(false);
      expect(res.cancelled).toBe(true);
    });

    it("falls back to ZIP when showDirectoryPicker is not supported", async () => {
      delete (window as unknown as Record<string, unknown>).showDirectoryPicker;

      // Mock URL.createObjectURL and click
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn(() => "blob:test");
      URL.revokeObjectURL = vi.fn();

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const notes: Note[] = [
        {
          id: "1",
          title: "Zip Fallback Note",
          content: "Body in zip",
          tags: [],
          color: "white",
          pinned: false,
          position: 1,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ];

      const res = await exportAllToDirectory({ notes });
      expect(res.success).toBe(true);
      expect(res.mode).toBe("zip");
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();

      clickSpy.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });
  });
});
