import type { Note } from "@/types/note";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export type ImportGoogleKeepResult = {
  totalFiles: number;
  importedCount: number;
  skippedCount: number;
};

export async function fetchNotes(): Promise<Note[]> {
  const res = await fetch(`${API_BASE}/notes`);
  if (!res.ok) throw new Error("fetch_notes_failed");
  return res.json();
}

export async function createNote(input: {
  title?: string;
  content: string;
  color?: string;
  tags?: string[];
}): Promise<Note> {
  const res = await fetch(`${API_BASE}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("create_note_failed");
  return res.json();
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note> {
  const res = await fetch(`${API_BASE}/notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("update_note_failed");
  return res.json();
}

export async function deleteNote(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notes/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("delete_note_failed");
}

export async function reorderNotes(pinned: boolean, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/notes/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned, orderedIds }),
  });
  if (!res.ok) throw new Error("reorder_failed");
}

export async function importGoogleKeep(): Promise<ImportGoogleKeepResult> {
  const res = await fetch(`${API_BASE}/notes/import/google-keep`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("import_google_keep_failed");
  return res.json();
}
