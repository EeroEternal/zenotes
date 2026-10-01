import type { Note, NoteFile, NoteShare } from "@/types/note";
import { ApiError, throwIfNotOk } from "@/lib/api-error";

const AUTH_FETCH_MS = 25_000;

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const TOKEN_KEY = "zenotes_auth_token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

const fetchOpts: RequestInit = { credentials: "include" };

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = AUTH_FETCH_MS): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const mergedInit: RequestInit = {
    credentials: "include",
    ...init,
    headers,
  };
  if (typeof AbortController === "undefined") {
    return fetch(url, mergedInit);
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...mergedInit, signal: ac.signal });
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
  token?: string;
};

export { ApiError };

export async function fetchAuthMe(): Promise<CurrentUser | null> {
  const res = await fetchWithTimeout(`${API_BASE}/auth/me`, { method: "GET" }, 15_000);
  if (res.status === 401) {
    setAuthToken(null);
    return null;
  }
  await throwIfNotOk(res);
  const data = (await res.json()) as CurrentUser;
  if (data?.id && !getAuthToken()) {
    setAuthToken(String(data.id));
  }
  return data;
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
  const data = (await res.json()) as CurrentUser;
  if (data?.token) {
    setAuthToken(data.token);
  } else if (data?.id) {
    setAuthToken(String(data.id));
  }
  return data;
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
  const data = (await res.json()) as CurrentUser;
  if (data?.token) {
    setAuthToken(data.token);
  } else if (data?.id) {
    setAuthToken(String(data.id));
  }
  return data;
}

export async function logout(): Promise<void> {
  try {
    await fetchWithTimeout(`${API_BASE}/auth/logout`, { method: "POST" }, 10_000);
  } finally {
    setAuthToken(null);
  }
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
  const res = await fetchWithTimeout(url, fetchOpts, 60_000);
  // Throw on 401 so seed/sync can distinguish "not signed in" from "empty list".
  // Returning a fake empty page previously made pullServerNotes stop after page 1.
  await throwIfNotOk(res);
  return res.json();
}

export async function fetchNote(id: string): Promise<Note> {
  const res = await fetch(`${API_BASE}/notes/${encodeURIComponent(id)}`, fetchOpts);
  await throwIfNotOk(res);
  return res.json();
}

export async function createNote(body: { id?: string; content: string; title?: string | null; color?: string; tags?: string[]; pinned?: boolean; position?: number }) {
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
    method: "PATCH",
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

export type AnalyzeNoteResult = {
  noteId: string;
  summary: string;
  ocrText: string;
  ocrErrors: string[];
  mediaCount: number;
  appended: boolean;
  note: Note | null;
};

/** OCR images (OpenRouter) + summarize note; optionally append result into note body. */
export async function analyzeNote(
  noteId: string,
  opts: { append?: boolean; lang?: string } = {},
): Promise<AnalyzeNoteResult> {
  const res = await fetchWithTimeout(
    `${API_BASE}/notes/${encodeURIComponent(noteId)}/analyze`,
    {
      ...fetchOpts,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        append: opts.append !== false,
        lang: opts.lang ?? "zh",
      }),
    },
    120_000,
  );
  await throwIfNotOk(res);
  return res.json() as Promise<AnalyzeNoteResult>;
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

export async function uploadNoteFiles(
  noteId: string,
  files: File[],
  paths?: string[],
): Promise<{ files: NoteFile[] }> {
  const formData = new FormData();
  files.forEach((f, idx) => {
    formData.append(`file_${idx}`, f);
    if (paths && paths[idx]) {
      formData.append(`path_${idx}`, paths[idx]!);
    }
  });
  const res = await fetchWithTimeout(`${API_BASE}/notes/${encodeURIComponent(noteId)}/files`, {
    method: "POST",
    body: formData,
  }, 120_000);
  await throwIfNotOk(res);
  return res.json();
}

export async function fetchNoteFiles(noteId: string): Promise<{ files: NoteFile[] }> {
  const res = await fetchWithTimeout(`${API_BASE}/notes/${encodeURIComponent(noteId)}/files`, {
    method: "GET",
  });
  await throwIfNotOk(res);
  return res.json();
}

export async function deleteNoteFile(noteId: string, fileId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_BASE}/notes/${encodeURIComponent(noteId)}/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE" },
  );
  await throwIfNotOk(res);
}

export async function toggleShareNote(noteId: string, isPublic: boolean): Promise<NoteShare> {
  const res = await fetchWithTimeout(`${API_BASE}/notes/${encodeURIComponent(noteId)}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isPublic }),
  });
  await throwIfNotOk(res);
  return res.json();
}

export async function fetchNoteShare(noteId: string): Promise<NoteShare> {
  const res = await fetchWithTimeout(`${API_BASE}/notes/${encodeURIComponent(noteId)}/share`, {
    method: "GET",
  });
  await throwIfNotOk(res);
  return res.json();
}

export interface PublicShareData {
  note: Note;
  files: NoteFile[];
  author: string;
  shareId: string;
}

export async function fetchPublicShare(shareId: string): Promise<PublicShareData> {
  const res = await fetchWithTimeout(`${API_BASE}/public/shares/${encodeURIComponent(shareId)}`, {
    method: "GET",
  });
  await throwIfNotOk(res);
  return res.json();
}

export function getPublicFileDownloadUrl(shareId: string, fileId: string): string {
  return `${API_BASE}/public/shares/${encodeURIComponent(shareId)}/files/${encodeURIComponent(fileId)}`;
}

export function getPublicMediaUrl(shareId: string, mediaId: string): string {
  return `${API_BASE}/public/shares/${encodeURIComponent(shareId)}/media/${encodeURIComponent(mediaId)}`;
}

export function getNoteFileDownloadUrl(noteId: string, fileId: string): string {
  const token = getAuthToken();
  const base = `${API_BASE}/notes/${encodeURIComponent(noteId)}/files/${encodeURIComponent(fileId)}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export async function downloadNoteFile(noteId: string, fileId: string, filename: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_BASE}/notes/${encodeURIComponent(noteId)}/files/${encodeURIComponent(fileId)}`,
    fetchOpts,
  );
  await throwIfNotOk(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

