import type { Note } from "@/types/note";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const fetchOpts: RequestInit = { credentials: "include" };

export type ImportGoogleKeepResult = {
  totalFiles: number;
  importedCount: number;
  skippedCount: number;
};

export type CurrentUser = {
  id: number;
  username: string;
  email: string;
};

export async function fetchAuthMe(): Promise<CurrentUser | null> {
  const res = await fetch(`${API_BASE}/auth/me`, fetchOpts);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("auth_me_failed");
  return res.json();
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("login_failed");
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/logout`, { ...fetchOpts, method: "POST" });
  if (!res.ok) throw new Error("logout_failed");
}

export async function fetchNotes(): Promise<Note[]> {
  const res = await fetch(`${API_BASE}/notes`, fetchOpts);
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
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("create_note_failed");
  return res.json();
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<Note> {
  const res = await fetch(`${API_BASE}/notes/${id}`, {
    ...fetchOpts,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("update_note_failed");
  return res.json();
}

export async function deleteNote(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/notes/${id}`, { ...fetchOpts, method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("delete_note_failed");
}

export async function reorderNotes(pinned: boolean, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/notes/reorder`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned, orderedIds }),
  });
  if (!res.ok) throw new Error("reorder_failed");
}

export async function importGoogleKeep(files: { raw: string }[]): Promise<ImportGoogleKeepResult> {
  const res = await fetch(`${API_BASE}/notes/import/google-keep`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  if (!res.ok) throw new Error("import_google_keep_failed");
  return res.json();
}
