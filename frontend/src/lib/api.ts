import type { Note } from "@/types/note";
import { ApiError, throwIfNotOk } from "@/lib/api-error";

const AUTH_FETCH_MS = 25_000;

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const fetchOpts: RequestInit = { credentials: "include" };

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = AUTH_FETCH_MS): Promise<Response> {
  if (typeof AbortController === "undefined") {
    return fetch(url, init);
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

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

export { ApiError };

export async function fetchAuthMe(): Promise<CurrentUser | null> {
  const res = await fetch(`${API_BASE}/auth/me`, fetchOpts);
  if (res.status === 401) return null;
  await throwIfNotOk(res);
  return res.json();
}

export async function login(username: string, password: string): Promise<CurrentUser> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
      ...fetchOpts,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }, AUTH_FETCH_MS);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError("Sign-in request timed out. Check your network and try again.");
    }
    throw e;
  }
  await throwIfNotOk(res);
  return res.json();
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
}): Promise<CurrentUser> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE}/auth/register`, {
      ...fetchOpts,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }, AUTH_FETCH_MS);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError("Registration request timed out. Check your network and try again.");
    }
    throw e;
  }
  await throwIfNotOk(res);
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/logout`, { ...fetchOpts, method: "POST" });
  await throwIfNotOk(res);
}

export interface NotesResponse {
  notes: Note[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchNotes(page = 1, pageSize = 50): Promise<NotesResponse> {
  const url = `${API_BASE}/notes?page=${page}&pageSize=${pageSize}`;
  console.log('[API] Fetching notes:', url);
  const res = await fetch(url, fetchOpts);
  console.log('[API] Response status:', res.status);
  if (res.status === 401) {
    console.warn('[API] Unauthorized');
    return { notes: [], pagination: { page: 1, pageSize, total: 0, totalPages: 0 } };
  }
  await throwIfNotOk(res);
  const data = await res.json();
  console.log('[API] Response data:', data);
  return data;
}

export async function fetchNote(id: string): Promise<Note> {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(id)}`, fetchOpts);
  await throwIfNotOk(res);
  return res.json();
}

export async function createNote(body: { content: string; title?: string | null; color?: string; tags?: string[]; pinned?: boolean; position?: number }) {
  return fetchWithTimeout(`${API_BASE}/notes`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(throwIfNotOk).then(r => r.json());
}

export async function updateNote(id: string, body: Partial<{ content: string; title: string | null; color: string; tags: string[]; pinned: boolean; position: number }>) {
  return fetchWithTimeout(`${API_BASE}/notes/${id}`, {
    ...fetchOpts,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(throwIfNotOk).then(r => r.json());
}

export async function deleteNote(id: string) {
  return fetchWithTimeout(`${API_BASE}/notes/${id}`, {
    ...fetchOpts,
    method: "DELETE",
  }).then(throwIfNotOk);
}

export async function uploadImage(id: string, file: File) {
  const formData = new FormData();
  formData.append("image", file);
  return fetchWithTimeout(`${API_BASE}/notes/${id}/images`, {
    ...fetchOpts,
    method: "POST",
    body: formData,
  }).then(throwIfNotOk).then(r => r.json());
}

/** 用 R2 中该笔记已有 `media` 文件重写正文（上传中断、正文未合并时可恢复） */
export async function rebuildNoteFromR2Media(
  noteId: string,
): Promise<{ noteId: string; imageCount: number }> {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(noteId)}/rebuild-from-r2-media`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  await throwIfNotOk(res);
  return res.json() as Promise<{ noteId: string; imageCount: number }>;
}

export async function reorderNotes(pinned: boolean, orderedIds: string[]): Promise<void> {
  const res = await fetch(`${API_BASE}/notes/reorder`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned, orderedIds }),
  });
  await throwIfNotOk(res);
}

export async function importGoogleKeep(files: { raw: string }[]): Promise<ImportGoogleKeepResult> {
  const res = await fetch(`${API_BASE}/notes/import/google-keep`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  await throwIfNotOk(res);
  return res.json();
}

export async function uploadNoteMedia(noteId: string, file: File): Promise<{ id: string }> {
  const t = (file.type || "").trim().toLowerCase();
  /** 空类型时误标成 png 会导致服务端误判；交给 Worker 用魔数识别 */
  const headers: HeadersInit =
    t.startsWith("image/") ? { "Content-Type": file.type.trim() } : { "Content-Type": "application/octet-stream" };
  const res = await fetch(`${API_BASE}/notes/${noteId}/media`, {
    ...fetchOpts,
    method: "POST",
    headers,
    body: file,
  });
  await throwIfNotOk(res);
  return res.json();
}
