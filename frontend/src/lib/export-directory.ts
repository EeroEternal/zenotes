import JSZip from "jszip";
import type { Note, NoteFile } from "@/types/note";
import { db } from "@/offline/db";
import * as api from "@/lib/api";
import { noteMediaUrl } from "@/lib/note-media";

export interface ExportProgress {
  current: number;
  total: number;
  noteTitle: string;
}

export interface ExportOptions {
  notes?: Note[];
  onProgress?: (progress: ExportProgress) => void;
}

export interface ExportResult {
  success: boolean;
  exportedCount: number;
  cancelled?: boolean;
  mode: "directory" | "zip";
  error?: string;
}

export interface ManifestNoteItem {
  id: string;
  title: string | null;
  folder: string;
  filename: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  color: string;
  pinned: boolean;
  fileCount: number;
  mediaCount: number;
}

export interface ExportManifest {
  version: number;
  exportedAt: string;
  totalNotes: number;
  notes: ManifestNoteItem[];
}

/** Sanitize string for valid directory/file names across Windows, macOS, and Linux */
export function sanitizeFilename(name: string): string {
  return name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/_+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[_\s.]+|[_\s.]+$/g, "")
    .slice(0, 80);
}

/** Returns unique folder/file name if base name already used */
export function getUniqueName(base: string, used: Set<string>): string {
  const norm = base.trim() || "untitled";
  let candidate = norm;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${norm} (${counter++})`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Extract media/image IDs referenced in Markdown content */
export function extractMediaIds(content: string): string[] {
  if (!content) return [];
  const regex = /(?:zenotes:media:|mynotes:media:|local:\/\/|(?:\/api)?\/notes\/[^/]+\/media\/)([0-9a-fA-F-]{36}|[a-zA-Z0-9_-]{8,})/g;
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) ids.add(match[1]);
  }
  return Array.from(ids);
}

/** Guess file extension from mime type */
export function extensionFromMime(mime: string | null | undefined): string {
  if (!mime) return ".png";
  const lower = mime.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return ".jpg";
  if (lower.includes("png")) return ".png";
  if (lower.includes("webp")) return ".webp";
  if (lower.includes("gif")) return ".gif";
  if (lower.includes("svg")) return ".svg";
  if (lower.includes("bmp")) return ".bmp";
  return ".png";
}

/** Generate YAML frontmatter for a note */
export function generateFrontmatter(note: Note): string {
  const tagsStr = (note.tags || []).length > 0
    ? `tags:\n${note.tags.map((t) => `  - ${JSON.stringify(t)}`).join("\n")}\n`
    : `tags: []\n`;

  const safeTitle = JSON.stringify(note.title ?? "");
  const color = JSON.stringify(note.color || "white");

  return [
    "---",
    `id: ${JSON.stringify(note.id)}`,
    `title: ${safeTitle}`,
    `createdAt: ${JSON.stringify(note.createdAt || "")}`,
    `updatedAt: ${JSON.stringify(note.updatedAt || "")}`,
    `color: ${color}`,
    `pinned: ${Boolean(note.pinned)}`,
    tagsStr.trimEnd(),
    "---",
    "",
  ].join("\n");
}

/** Format markdown text with frontmatter and relative media paths */
export function formatNoteMarkdown(
  note: Note,
  mediaMap: Record<string, string>,
): string {
  let content = note.content || "";

  // Replace media references with relative paths
  for (const [id, relPath] of Object.entries(mediaMap)) {
    const escId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:zenotes:media:|mynotes:media:|local://|(?:/api)?/notes/[^/]+/media/)${escId}`,
      "g",
    );
    content = content.replace(re, relPath);
  }

  // Prepend frontmatter if not already present
  if (!content.trim().startsWith("---")) {
    const frontmatter = generateFrontmatter(note);
    content = `${frontmatter}\n${content}`;
  }

  return content;
}

/** Write file into FileSystemDirectoryHandle, creating intermediate directories as needed */
export async function writeFileToHandle(
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string,
  data: Blob | string | ArrayBuffer,
): Promise<void> {
  const parts = relativePath.split("/").filter(Boolean);
  let currentDir = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    currentDir = await currentDir.getDirectoryHandle(parts[i]!, { create: true });
  }
  const filename = parts[parts.length - 1]!;
  const fileHandle = await currentDir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
    startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }) => Promise<FileSystemDirectoryHandle>;
};

/** Check if File System Access API directory picker is supported */
export function isDirectoryPickerSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as DirectoryPickerWindow).showDirectoryPicker === "function"
  );
}

/**
 * Main function: Export all notes, media, and files into a chosen directory,
 * or fallback to downloading a ZIP file if directory picker is unsupported.
 */
export async function exportAllToDirectory(options: ExportOptions = {}): Promise<ExportResult> {
  // 1. Collect notes
  let notes = options.notes;
  if (!notes) {
    const local = await db.notes.filter((n) => !n.isDeleted).toArray();
    notes = local as Note[];
  }

  if (notes.length === 0) {
    return { success: false, exportedCount: 0, error: "No notes found to export" };
  }

  // 2. Determine directory handle or zip mode
  const canPickDir = isDirectoryPickerSupported();
  let dirHandle: FileSystemDirectoryHandle | null = null;

  if (canPickDir) {
    try {
      const pickerWin = window as unknown as DirectoryPickerWindow;
      if (pickerWin.showDirectoryPicker) {
        dirHandle = await pickerWin.showDirectoryPicker({
          mode: "readwrite",
          startIn: "documents",
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return { success: false, exportedCount: 0, cancelled: true, mode: "directory" };
      }
      console.warn("showDirectoryPicker failed, falling back to ZIP:", err);
      dirHandle = null;
    }
  }

  const mode: "directory" | "zip" = dirHandle ? "directory" : "zip";
  const zip = dirHandle ? null : new JSZip();

  const manifest: ManifestNoteItem[] = [];
  const usedFolderNames = new Set<string>();

  // 3. Process each note
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const title = note.title?.trim() || "Untitled";
    options.onProgress?.({
      current: i + 1,
      total: notes.length,
      noteTitle: title,
    });

    const sanitizedBase = sanitizeFilename(title) || `note_${note.id.slice(0, 8)}`;
    const folderName = getUniqueName(sanitizedBase, usedFolderNames);
    const mdFilename = `${folderName}.md`;

    // Process media/images
    const mediaIds = extractMediaIds(note.content || "");
    const mediaMap: Record<string, string> = {};
    let exportedMediaCount = 0;

    for (const mediaId of mediaIds) {
      let blob: Blob | null = null;
      let mimeType: string = "image/png";

      // Try local IndexedDB image cache first
      try {
        const localImg = await db.images.get(mediaId);
        if (localImg?.blob) {
          blob = localImg.blob;
          mimeType = localImg.mimeType || blob.type || "image/png";
        }
      } catch (e) {
        console.warn("Error reading local image", mediaId, e);
      }

      // If not in local cache, try fetching from server
      if (!blob && note.id) {
        try {
          const res = await fetch(noteMediaUrl(note.id, mediaId), { credentials: "include" });
          if (res.ok) {
            blob = await res.blob();
            mimeType = res.headers.get("content-type") || blob.type || "image/png";
          }
        } catch (e) {
          console.warn("Error fetching remote media", mediaId, e);
        }
      }

      if (blob) {
        const ext = extensionFromMime(mimeType);
        const mediaFileName = `${mediaId}${ext}`;
        const relativeMediaRelPath = `media/${mediaFileName}`;
        mediaMap[mediaId] = relativeMediaRelPath;

        const mediaDestPath = `${folderName}/${relativeMediaRelPath}`;
        if (dirHandle) {
          try {
            await writeFileToHandle(dirHandle, mediaDestPath, blob);
            exportedMediaCount++;
          } catch (e) {
            console.error("Error writing media file:", mediaDestPath, e);
          }
        } else if (zip) {
          zip.file(mediaDestPath, blob);
          exportedMediaCount++;
        }
      }
    }

    // Process attached files
    const files = (note.files || []) as NoteFile[];
    let exportedFileCount = 0;

    for (const f of files) {
      try {
        const downloadUrl = api.getNoteFileDownloadUrl(note.id, f.id);
        const res = await api.fetchNoteFileRaw(downloadUrl);
        if (res.ok) {
          const blob = await res.blob();
          const cleanRel = (f.path || f.filename).replace(/^\/+/, "");
          const fileDestPath = `${folderName}/files/${cleanRel}`;

          if (dirHandle) {
            await writeFileToHandle(dirHandle, fileDestPath, blob);
            exportedFileCount++;
          } else if (zip) {
            zip.file(fileDestPath, blob);
            exportedFileCount++;
          }
        }
      } catch (e) {
        console.warn("Error archiving attached file:", f.filename, e);
      }
    }

    // Format & write the note Markdown file
    const markdownContent = formatNoteMarkdown(note, mediaMap);
    const mdDestPath = `${folderName}/${mdFilename}`;

    if (dirHandle) {
      await writeFileToHandle(dirHandle, mdDestPath, markdownContent);
    } else if (zip) {
      zip.file(mdDestPath, markdownContent);
    }

    manifest.push({
      id: note.id,
      title: note.title ?? null,
      folder: folderName,
      filename: mdFilename,
      createdAt: note.createdAt || "",
      updatedAt: note.updatedAt || "",
      tags: note.tags || [],
      color: note.color || "white",
      pinned: Boolean(note.pinned),
      fileCount: exportedFileCount,
      mediaCount: exportedMediaCount,
    });
  }

  // 4. Write manifest.json
  const manifestData: ExportManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    totalNotes: notes.length,
    notes: manifest,
  };
  const manifestJson = JSON.stringify(manifestData, null, 2);

  if (dirHandle) {
    await writeFileToHandle(dirHandle, "manifest.json", manifestJson);
  } else if (zip) {
    zip.file("manifest.json", manifestJson);
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zenotes_export_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    success: true,
    exportedCount: notes.length,
    mode,
  };
}
