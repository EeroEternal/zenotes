import type { Note, NoteFile, NoteShare } from "@/types/note";
import { ApiError, throwIfNotOk } from "@/lib/api-error";

const AUTH_FETCH_MS = 25_000;

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const TOKEN_KEY = "zenotes_auth_token";
const SIGNED_OUT_KEY = "zenotes_signed_out";

export function isSignedOut(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

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
      localStorage.removeItem(SIGNED_OUT_KEY); // 登录成功即解除登出标记
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

export type CurrentUser = {
  id: number;
  username: string;
  email: string;
  token?: string;
};

export { ApiError };

export async function fetchAuthMe(): Promise<CurrentUser | null> {
  if (isSignedOut()) return null; // 本地已登出：即使 Cookie 还活着也不当作已登录
  const res = await fetchWithTimeout(`${API_BASE}/auth/me`, { method: "GET" }, 15_000);
  if (res.status === 401) {
    setAuthToken(null);
    return null;
  }
  await throwIfNotOk(res);
  const data = (await res.json()) as CurrentUser;
  if (data?.token) {
    setAuthToken(data.token); // 滑动续签
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
  if (data?.token) setAuthToken(data.token);
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
  if (data?.token) setAuthToken(data.token);
  return data;
}

export async function logout(): Promise<void> {
  // 本地先行：无论服务端请求成功与否，这台设备都必须立刻登出
  try {
    localStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {}
  setAuthToken(null);
  setSavedGlobalToken(""); // /global 页凭它展示全部笔记，登出必须一并作废
  try {
    await fetchWithTimeout(`${API_BASE}/auth/logout`, { method: "POST" }, 10_000);
  } catch {
    // 服务端没收到也没关系：本地已登出；下次登录会重设 Cookie/Token
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
  const res = await fetchWithTimeout(`${API_BASE}/notes/${encodeURIComponent(id)}`, fetchOpts);
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
  const res = await fetchWithTimeout(`${API_BASE}/notes/${encodeURIComponent(noteId)}/rebuild-from-r2-media`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }, 60_000);
  await throwIfNotOk(res);
  return res.json() as Promise<{ noteId: string; imageCount: number }>;
}

export async function reorderNotes(pinned: boolean, orderedIds: string[]): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/notes/reorder`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pinned, orderedIds }),
  });
  await throwIfNotOk(res);
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

/** 大图先在浏览器缩到 ≤2048px 再上传：手机原图动辄好几 MB，上传慢且易中断 */
async function shrinkImage(file: File): Promise<File> {
  const t = (file.type || "").trim().toLowerCase();
  if (!t.startsWith("image/") || file.size <= 1_000_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const outType = t === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outType, 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: outType });
  } catch {
    return file; // 浏览器解码不了（如部分环境的 HEIC）就传原图
  }
}

export async function uploadNoteMedia(noteId: string, file: File): Promise<{ id: string }> {
  const f = await shrinkImage(file);
  const t = (f.type || "").trim().toLowerCase();
  /** 空类型时误标成 png 会导致服务端误判；交给 Worker 用魔数识别 */
  const headers: HeadersInit =
    t.startsWith("image/") ? { "Content-Type": f.type.trim() } : { "Content-Type": "application/octet-stream" };
  // 必须走 fetchWithTimeout：它带 Authorization。仅靠 Cookie 时 Cookie 一丢就 401“未登录”，
  // 且裸 fetch 无超时，弱网会一直转圈。
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE}/notes/${noteId}/media`, {
      ...fetchOpts,
      method: "POST",
      headers,
      body: f,
    }, sizeTimeoutMs(f.size));
  } catch (e) {
    return rethrowAbort(e);
  }
  await throwIfNotOk(res);
  return res.json();
}

/** 大文件按大小放宽超时：固定2分钟在慢网上必然误杀（保底 2 分钟，20KB/s 估算，上限 10 分钟） */
function sizeTimeoutMs(bytes: number): number {
  return Math.min(600_000, Math.max(120_000, bytes / 20));
}

/** 大文件上传/下载被中断时，服务器很可能已写入成功——提示先刷新别急着重试 */
function rethrowAbort(e: unknown): never {
  if (e instanceof Error && e.name === "AbortError") {
    throw new ApiError("网络超时：文件可能已在服务端保存成功，请先刷新查看，再决定是否重试");
  }
  throw e;
}

export async function uploadNoteFiles(
  noteId: string,
  files: File[],
  paths?: string[],
): Promise<{ files: NoteFile[] }> {
  const uploaded: NoteFile[] = [];
  // 逐个文件发请求：一次请求塞全部文件会超出 Worker 单请求子请求上限，
  // 多文件/目录传到一半就失败，且已传的文件已在服务端保存
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const formData = new FormData();
    formData.append(`file_0`, file);
    if (paths && paths[i]) formData.append(`path_0`, paths[i]!);
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${API_BASE}/notes/${encodeURIComponent(noteId)}/files`,
        { method: "POST", body: formData },
        sizeTimeoutMs(file.size),
      );
    } catch (e) {
      return rethrowAbort(e);
    }
    await throwIfNotOk(res);
    const data = (await res.json()) as { files?: NoteFile[] };
    uploaded.push(...(data.files ?? []));
  }
  return { files: uploaded };
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
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${API_BASE}/notes/${encodeURIComponent(noteId)}/files/${encodeURIComponent(fileId)}`,
      fetchOpts,
      300_000, // 大附件下载给 5 分钟，勿用默认 25s
    );
  } catch (e) {
    return rethrowAbort(e);
  }
  await throwIfNotOk(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 立即 revoke 会被 Safari 取消下载
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 带鉴权/超时地取附件（打包下载、目录导出用）：裸 fetch 会缺 Authorization 且无超时 */
export function fetchNoteFileRaw(url: string): Promise<Response> {
  return fetchWithTimeout(url, fetchOpts, 300_000);
}

const GLOBAL_TOKEN_KEY = "zenotes_global_token";

export function getSavedGlobalToken(): string {
  try {
    return localStorage.getItem(GLOBAL_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setSavedGlobalToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(GLOBAL_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(GLOBAL_TOKEN_KEY);
    }
  } catch {}
}

export async function fetchGlobalToken(): Promise<{ ok: boolean; globalToken: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/settings/global-token`, { method: "GET" });
  await throwIfNotOk(res);
  return res.json();
}

export async function updateGlobalToken(token: string): Promise<{ ok: boolean; globalToken: string; message: string }> {
  const res = await fetchWithTimeout(`${API_BASE}/settings/global-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  await throwIfNotOk(res);
  return res.json();
}

export interface GlobalNoteItem extends Note {
  author: string;
  files: NoteFile[];
  directories: string[];
  downloadZipUrl: string;
  downloadMarkdownUrl: string;
}

export interface GlobalNotesResponse {
  ok: boolean;
  total: number;
  notes: GlobalNoteItem[];
  exportAllZipUrl: string;
}

export async function searchGlobalNotes(token: string, q: string = ""): Promise<GlobalNotesResponse> {
  const base = `${API_BASE}/global/notes`;
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  params.set("token", token.trim());
  const url = `${base}?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "X-Global-Token": token.trim(),
    },
  });
  await throwIfNotOk(res);
  return res.json();
}

export function getGlobalExportAllUrl(token: string): string {
  return `${API_BASE}/global/export-all.zip?token=${encodeURIComponent(token.trim())}`;
}

export function getGlobalNoteZipUrl(noteId: string, token: string): string {
  return `${API_BASE}/global/notes/${encodeURIComponent(noteId)}/export.zip?token=${encodeURIComponent(token.trim())}`;
}

export function getGlobalNoteMarkdownUrl(noteId: string, token: string): string {
  return `${API_BASE}/global/notes/${encodeURIComponent(noteId)}/markdown?token=${encodeURIComponent(token.trim())}`;
}

export function getGlobalFileDownloadUrl(noteId: string, fileId: string, token: string): string {
  return `${API_BASE}/global/notes/${encodeURIComponent(noteId)}/files/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token.trim())}`;
}

