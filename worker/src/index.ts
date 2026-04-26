import { argon2Verify } from "hash-wasm";

export interface Env {
  DB: D1Database;
  NOTES: R2Bucket;
  ALLOWED_ORIGINS?: string;
  /** 设为 "true" 时才在 Worker 内调用 argon2Verify（付费/高 CPU 场景）；默认不调用，避免免费套餐长时间卡住 */
  ALLOW_ARGON2_VERIFY?: string;
}

const ARGON2_MIGRATION_MSG =
  "This account still uses a legacy Argon2 password hash; the free Workers tier cannot verify it at the edge. In a terminal, cd into the worker folder and run: node scripts/d1-set-password-sha256.mjs YOUR_USERNAME NEW_PASSWORD, then run the printed wrangler d1 execute … --remote command (after wrangler login), and sign in with the new password.";

const SESSION_COOKIE = "zenotes_session";

function corsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  const raw =
    env.ALLOWED_ORIGINS ||
    "http://localhost:8080,http://127.0.0.1:8080,https://zenotes.site,https://www.zenotes.site";
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin) return allowed[0] ?? null;
  if (allowed.includes(origin)) return origin;
  return null;
}

function corsHeaders(env: Env, request: Request, extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  const o = corsOrigin(request, env);
  if (o) {
    h.set("Access-Control-Allow-Origin", o);
    h.set("Access-Control-Allow-Credentials", "true");
  }
  h.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Cookie");
  return h;
}

async function sha256Hex(password: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sessionUserId(request: Request): number | null {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!m) return null;
  const id = parseInt(decodeURIComponent(m[1]), 10);
  return Number.isNaN(id) ? null : id;
}

/**
 * 线上：apex / www 页面请求 api 子域属于「跨源」fetch，须 SameSite=None + Secure，否则 Chrome 等不带上会话 Cookie。
 * Domain=zenotes.site 让 zenotes.site 与 api.zenotes.site 共享同一块 Cookie。
 */
function sessionCookie(userId: number, request: Request): string {
  const url = new URL(request.url);
  const maxAge = 60 * 60 * 24 * 7;
  if (url.protocol === "https:") {
    const host = url.hostname;
    const domain =
      host === "api.zenotes.site" || host === "www.zenotes.site" ? "; Domain=zenotes.site" : "";
    return `${SESSION_COOKIE}=${userId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}${domain}`;
  }
  return `${SESSION_COOKIE}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie(request: Request): string {
  const url = new URL(request.url);
  if (url.protocol === "https:") {
    const host = url.hostname;
    const domain =
      host === "api.zenotes.site" || host === "www.zenotes.site" ? "; Domain=zenotes.site" : "";
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0${domain}`;
  }
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

interface NoteRow {
  id: string;
  user_id: number;
  title: string | null;
  color: string;
  tags: string;
  pinned: number;
  position: number;
  r2_key: string;
  created_at: string;
  updated_at: string;
}

function noteResponse(
  row: NoteRow,
  content: string,
): Record<string, unknown> {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title ?? undefined,
    content,
    color: row.color,
    tags,
    pinned: Boolean(row.pinned),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function r2BodyKey(userId: string, noteId: string): string {
  return `${userId}/${noteId}/body.json`;
}

function r2NotePrefix(userId: string, noteId: string): string {
  return `${userId}/${noteId}/`;
}

function r2MediaKey(userId: string, noteId: string, mediaId: string): string {
  return `${userId}/${noteId}/media/${mediaId}`;
}

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/tiff",
]);

function normalizeImageContentType(header: string | null): string | null {
  const raw = (header ?? "").split(";")[0].trim().toLowerCase();
  if (!raw || raw === "application/octet-stream") return null;
  const alias: Record<string, string> = {
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/x-jpeg": "image/jpeg",
    "image/x-png": "image/png",
    "image/x-ms-bmp": "image/bmp",
  };
  return alias[raw] ?? raw;
}

/** 在 Content-Type 缺失或不可信时，用魔数判断常见图片 */
function sniffImageMime(buf: ArrayBuffer): string | null {
  const n = buf.byteLength;
  if (n < 12) return null;
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) return "image/jpeg";
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return "image/png";
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return "image/gif";
  if (u8[0] === 0x42 && u8[1] === 0x4d) return "image/bmp";
  if (
    (u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2a && u8[3] === 0x0) ||
    (u8[0] === 0x4d && u8[1] === 0x4d && u8[2] === 0x0 && u8[3] === 0x2a)
  ) {
    return "image/tiff";
  }
  if (
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46 &&
    n >= 12 &&
    u8[8] === 0x57 &&
    u8[9] === 0x45 &&
    u8[10] === 0x42 &&
    u8[11] === 0x50
  ) {
    return "image/webp";
  }
  if (n >= 12 && u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
    const b = (i: number) => String.fromCharCode(u8[i]!);
    const minor = `${b(8)}${b(9)}${b(10)}${b(11)}`.toLowerCase();
    if (
      minor === "heic" ||
      minor === "heix" ||
      minor === "hevc" ||
      minor === "hevx" ||
      minor === "mif1" ||
      minor === "msf1" ||
      minor === "heim"
    ) {
      return "image/heic";
    }
    if (minor === "avif" || minor === "avis") return "image/avif";
  }
  return null;
}

function resolveImageContentType(header: string | null, buf: ArrayBuffer): string | null {
  /** 魔数优先：避免浏览器/代理把类型标错（例如 PNG 被标成 octet-stream） */
  const sniffed = sniffImageMime(buf);
  if (sniffed && ALLOWED_IMAGE_TYPES.has(sniffed)) return sniffed;
  const normalized = normalizeImageContentType(header);
  if (normalized && ALLOWED_IMAGE_TYPES.has(normalized)) return normalized;
  return null;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

async function deleteAllNoteObjects(bucket: R2Bucket, userId: number, noteId: string): Promise<void> {
  const prefix = r2NotePrefix(String(userId), noteId);
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor });
    for (const o of listed.objects) {
      await bucket.delete(o.key);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function readBodyContent(bucket: R2Bucket, key: string): Promise<string> {
  const obj = await bucket.get(key);
  if (!obj) return "";
  const text = await obj.text();
  try {
    const j = JSON.parse(text) as { content?: string };
    return typeof j.content === "string" ? j.content : "";
  } catch {
    return "";
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";

    try {
      if (path === "/" && request.method === "GET") {
        return json(env, request, {
          ok: true,
          service: "zenotes-api",
          health: "/api/health",
          notes: "/api/notes",
        });
      }

      if (path === "/api" && request.method === "GET") {
        return json(env, request, {
          ok: true,
          message: "API root; set VITE_API_BASE=https://api.zenotes.site/api in the frontend",
          try: ["/api/health", "/api/notes"],
        });
      }

      if (path === "/api/health" && request.method === "GET") {
        return json(env, request, { status: "ok" });
      }

      if (path === "/api/auth/register" && request.method === "POST") {
        return handleRegister(request, env);
      }
      if (path === "/api/auth/login" && request.method === "POST") {
        return handleLogin(request, env);
      }
      if (path === "/api/auth/logout" && request.method === "POST") {
        const h = corsHeaders(env, request, { "Content-Type": "application/json" });
        h.append("Set-Cookie", clearSessionCookie(request));
        return new Response(JSON.stringify({ message: "Signed out" }), { headers: h });
      }
      if (path === "/api/auth/me" && request.method === "GET") {
        return handleMe(request, env);
      }

      if (path === "/api/notes" && request.method === "GET") {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        return listNotes(env, request, uid);
      }
      if (path === "/api/notes" && request.method === "POST") {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        return createNote(request, env, uid);
      }

      if (path === "/api/notes/reorder" && request.method === "POST") {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        return reorderNotes(request, env, uid);
      }

      if (path === "/api/notes/import/google-keep" && request.method === "POST") {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        return importGoogleKeep(request, env, uid);
      }

      const mediaUploadMatch = path.match(/^\/api\/notes\/([^/]+)\/media$/);
      if (mediaUploadMatch && request.method === "POST") {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        return uploadNoteMedia(request, env, uid, mediaUploadMatch[1]);
      }

      const mediaItemMatch = path.match(/^\/api\/notes\/([^/]+)\/media\/([^/]+)$/);
      if (mediaItemMatch) {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        const noteId = mediaItemMatch[1];
        const mediaId = mediaItemMatch[2];
        if (request.method === "GET") {
          return getNoteMedia(env, request, uid, noteId, mediaId);
        }
        if (request.method === "DELETE") {
          return deleteNoteMedia(env, request, uid, noteId, mediaId);
        }
      }

      const noteIdMatch = path.match(/^\/api\/notes\/([^/]+)$/);
      if (noteIdMatch) {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        const id = noteIdMatch[1];
        if (request.method === "PATCH") {
          return updateNote(request, env, uid, id);
        }
        if (request.method === "DELETE") {
          return deleteNote(env, request, uid, id);
        }
      }

      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: corsHeaders(env, request, { "Content-Type": "application/json" }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "internal_error";
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: corsHeaders(env, request, { "Content-Type": "application/json" }),
      });
    }
  },
};

function json(env: Env, request: Request, data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: corsHeaders(env, request, {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    }),
  });
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as {
    username?: string;
    email?: string;
    password?: string;
  };
  const username = (body.username ?? "").trim();
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";

  if (username.length < 3) {
    return json(env, request, { error: "Username must be at least 3 characters" }, { status: 400 });
  }
  if (password.length < 6) {
    return json(env, request, { error: "Password must be at least 6 characters" }, { status: 400 });
  }
  if (!email.includes("@")) {
    return json(env, request, { error: "Invalid email format" }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ? OR email = ?",
  )
    .bind(username, email)
    .first<{ id: number }>();

  if (existing) {
    return json(env, request, { error: "User already exists" }, { status: 409 });
  }

  const hash = await sha256Hex(password);
  const row = await env.DB.prepare(
    `INSERT INTO users (username, email, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))
     RETURNING id, username, email`,
  )
    .bind(username, email, hash)
    .first<{ id: number; username: string; email: string }>();

  if (!row) {
    return json(env, request, { error: "register_failed" }, { status: 500 });
  }

  const h = corsHeaders(env, request, { "Content-Type": "application/json" });
  h.append("Set-Cookie", sessionCookie(row.id, request));
  return new Response(
    JSON.stringify({ id: row.id, username: row.username, email: row.email }),
    { headers: h },
  );
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const plain = body.password ?? "";
  const sha = await sha256Hex(plain);

  const row = await env.DB.prepare(
    "SELECT id, username, email, password_hash FROM users WHERE username = ?",
  )
    .bind(username)
    .first<{ id: number; username: string; email: string; password_hash: string }>();

  if (!row) {
    return json(env, request, { error: "Invalid credentials" }, { status: 401 });
  }

  const ph = row.password_hash;

  if (ph === sha) {
    // 已是 Worker 使用的 SHA256
  } else if (ph.startsWith("$argon2")) {
    if (env.ALLOW_ARGON2_VERIFY !== "true") {
      return json(
        env,
        request,
        { error: "argon2_unavailable", message: ARGON2_MIGRATION_MSG },
        { status: 503 },
      );
    }
    let ok = false;
    try {
      ok = await argon2Verify({ password: plain, hash: ph });
    } catch (e) {
      console.error("argon2Verify failed (often: free Worker CPU too limited for Argon2id)", e);
      return json(
        env,
        request,
        { error: "argon2_unavailable", message: ARGON2_MIGRATION_MSG },
        { status: 503 },
      );
    }
    if (!ok) {
      return json(env, request, { error: "Invalid credentials" }, { status: 401 });
    }
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(sha, row.id).run();
  } else {
    return json(env, request, { error: "Invalid credentials" }, { status: 401 });
  }

  const h = corsHeaders(env, request, { "Content-Type": "application/json" });
  h.append("Set-Cookie", sessionCookie(row.id, request));
  return new Response(
    JSON.stringify({ id: row.id, username: row.username, email: row.email }),
    { headers: h },
  );
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const userId = sessionUserId(request);
  if (userId === null) {
    return json(env, request, { error: "Unauthorized" }, { status: 401 });
  }

  const row = await env.DB.prepare("SELECT id, username, email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: number; username: string; email: string }>();

  if (!row) {
    return json(env, request, { error: "Unauthorized" }, { status: 401 });
  }
  return json(env, request, { id: row.id, username: row.username, email: row.email });
}

async function listNotes(env: Env, request: Request, userId: number): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at
     FROM notes WHERE user_id = ?
     ORDER BY pinned DESC, position ASC, updated_at DESC`,
  )
    .bind(userId)
    .all<NoteRow>();

  const rows = results ?? [];
  const withContent = await Promise.all(
    rows.map(async (row) => {
      const content = await readBodyContent(env.NOTES, row.r2_key);
      return noteResponse(row, content);
    }),
  );

  return json(env, request, withContent);
}

async function createNote(request: Request, env: Env, userId: number): Promise<Response> {
  const body = (await request.json()) as {
    title?: string;
    content?: string;
    color?: string;
    tags?: string[];
  };

  const titleRaw = body.title?.trim();
  const title = titleRaw && titleRaw.length > 0 ? titleRaw : null;
  const content = (body.content ?? "").trim();
  const color = body.color ?? "white";
  const tagsJson = JSON.stringify(body.tags ?? []);

  const maxRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), 0) as m FROM notes WHERE user_id = ? AND pinned = 0",
  )
    .bind(userId)
    .first<{ m: number }>();
  const position = (maxRow?.m ?? 0) + 1;

  const id = crypto.randomUUID();
  const r2Key = r2BodyKey(String(userId), id);

  const ins = await env.DB.prepare(
    `INSERT INTO notes (id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'), datetime('now'))
     RETURNING id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at`,
  )
    .bind(id, userId, title, color, tagsJson, position, r2Key)
    .first<NoteRow>();

  if (!ins) {
    return json(env, request, { error: "create_failed" }, { status: 500 });
  }

  try {
    await env.NOTES.put(r2Key, JSON.stringify({ content }), {
      httpMetadata: { contentType: "application/json" },
    });
  } catch (e) {
    await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
    throw e;
  }

  return json(env, request, noteResponse(ins, content), { status: 201 });
}

async function updateNote(
  request: Request,
  env: Env,
  userId: number,
  id: string,
): Promise<Response> {
  const body = (await request.json()) as {
    title?: string;
    content?: string;
    color?: string;
    tags?: string[];
    pinned?: boolean;
  };

  const existing = await env.DB.prepare(
    "SELECT * FROM notes WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .first<NoteRow>();

  if (!existing) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  let newPinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : existing.pinned;
  let newPosition = existing.position;

  if (newPinned !== existing.pinned) {
    const maxRow = await env.DB.prepare(
      "SELECT COALESCE(MAX(position), 0) as m FROM notes WHERE user_id = ? AND pinned = ?",
    )
      .bind(userId, newPinned)
      .first<{ m: number }>();
    newPosition = (maxRow?.m ?? 0) + 1;
  }

  let newTitle: string | null = existing.title;
  if (body.title !== undefined) {
    const t = body.title.trim();
    newTitle = t.length > 0 ? t : null;
  }

  let newColor = body.color !== undefined ? body.color : existing.color;

  let tagsJson = existing.tags;
  if (body.tags !== undefined) {
    tagsJson = JSON.stringify(body.tags);
  }

  const contentUpdate = body.content !== undefined ? body.content.trim() : null;

  const updated = await env.DB.prepare(
    `UPDATE notes SET title = ?, color = ?, tags = ?, pinned = ?, position = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?
     RETURNING id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at`,
  )
    .bind(newTitle, newColor, tagsJson, newPinned, newPosition, id, userId)
    .first<NoteRow>();

  if (!updated) {
    return json(env, request, { error: "update_failed" }, { status: 500 });
  }

  let finalContent = await readBodyContent(env.NOTES, updated.r2_key);
  if (contentUpdate !== null) {
    finalContent = contentUpdate;
    await env.NOTES.put(updated.r2_key, JSON.stringify({ content: finalContent }), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  return json(env, request, noteResponse(updated, finalContent));
}

async function deleteNote(env: Env, request: Request, userId: number, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT r2_key FROM notes WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ r2_key: string }>();

  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, userId).run();
  await deleteAllNoteObjects(env.NOTES, userId, id);

  return new Response(null, { status: 204, headers: corsHeaders(env, request) });
}

async function assertNoteOwned(
  env: Env,
  userId: number,
  noteId: string,
): Promise<NoteRow | null> {
  return env.DB.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .bind(noteId, userId)
    .first<NoteRow>();
}

async function uploadNoteMedia(
  request: Request,
  env: Env,
  userId: number,
  noteId: string,
): Promise<Response> {
  const row = await assertNoteOwned(env, userId, noteId);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) {
    return json(env, request, { error: "empty_body" }, { status: 400 });
  }
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return json(env, request, { error: "image_too_large", maxBytes: MAX_IMAGE_BYTES }, { status: 413 });
  }

  const contentType = resolveImageContentType(request.headers.get("Content-Type"), buf);
  if (!contentType) {
    return json(env, request, {
      error: "invalid_image_type",
      message:
        "Unrecognized image format (supported: JPEG, PNG, GIF, WebP, AVIF, HEIC, BMP, TIFF, and more)",
    }, { status: 400 });
  }

  const mediaId = crypto.randomUUID();
  const key = r2MediaKey(String(userId), noteId, mediaId);
  await env.NOTES.put(key, buf, {
    httpMetadata: { contentType },
  });

  return json(env, request, { id: mediaId, contentType }, { status: 201 });
}

async function getNoteMedia(
  env: Env,
  request: Request,
  userId: number,
  noteId: string,
  mediaId: string,
): Promise<Response> {
  if (!isUuid(mediaId)) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  const owned = await assertNoteOwned(env, userId, noteId);
  if (!owned) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  const key = r2MediaKey(String(userId), noteId, mediaId);
  const obj = await env.NOTES.get(key);
  if (!obj) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  const ct = obj.httpMetadata?.contentType || "application/octet-stream";
  const h = corsHeaders(env, request, {
    "Content-Type": ct,
    "Cache-Control": "private, max-age=3600",
  });
  return new Response(obj.body, { headers: h });
}

async function deleteNoteMedia(
  env: Env,
  request: Request,
  userId: number,
  noteId: string,
  mediaId: string,
): Promise<Response> {
  if (!isUuid(mediaId)) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  const owned = await assertNoteOwned(env, userId, noteId);
  if (!owned) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  const key = r2MediaKey(String(userId), noteId, mediaId);
  await env.NOTES.delete(key);
  return new Response(null, { status: 204, headers: corsHeaders(env, request) });
}

async function reorderNotes(request: Request, env: Env, userId: number): Promise<Response> {
  const body = (await request.json()) as { pinned?: boolean; orderedIds?: string[] };
  const pinned = body.pinned ? 1 : 0;
  const ids = body.orderedIds ?? [];

  const stmts = ids.map((noteId, idx) =>
    env.DB.prepare(
      "UPDATE notes SET position = ? WHERE id = ? AND user_id = ? AND pinned = ?",
    ).bind(idx + 1, noteId, userId, pinned),
  );

  if (stmts.length > 0) {
    await env.DB.batch(stmts);
  }

  return json(env, request, { ok: true });
}

// --- Google Keep import (JSON 与 Rust 版一致；由前端读取本地目录后 POST files[]) ---

interface KeepLabel {
  name?: string;
}

interface KeepListItem {
  text?: string;
  is_checked?: boolean;
}

interface KeepNote {
  title?: string;
  text_content?: string;
  labels?: KeepLabel[];
  list_content?: KeepListItem[];
  is_trashed?: boolean;
  is_pinned?: boolean;
  created_timestamp_usec?: number;
  user_edited_timestamp_usec?: number;
}

function trimOpt(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = s.trim();
  return t.length === 0 ? undefined : t;
}

function tsFromUsec(usec: number | undefined, fallback: string): string {
  if (usec === undefined) return fallback;
  const sec = Math.floor(usec / 1_000_000);
  const micros = usec % 1_000_000;
  const d = new Date(sec * 1000 + micros / 1000);
  return d.toISOString();
}

function extractKeepContent(note: KeepNote): string | undefined {
  const text = trimOpt(note.text_content);
  if (text) return text;

  const items = note.list_content;
  if (!items?.length) return undefined;
  const lines = items
    .map((item) => {
      const t = trimOpt(item.text);
      if (!t) return undefined;
      const marker = item.is_checked ? "[x]" : "[ ]";
      return `${marker} ${t}`;
    })
    .filter((x): x is string => Boolean(x));
  return lines.length ? lines.join("\n") : undefined;
}

function extractKeepTags(note: KeepNote): string[] {
  const tags: string[] = [];
  for (const l of note.labels ?? []) {
    const n = trimOpt(l.name);
    if (n && !tags.includes(n)) tags.push(n);
  }
  return tags;
}

async function importGoogleKeep(request: Request, env: Env, userId: number): Promise<Response> {
  const payload = (await request.json()) as { files?: { raw: string }[] };
  const files = payload.files;
  if (!files?.length) {
    return json(
      env,
      request,
      { error: "no_files", message: "Choose JSON files from an extracted Google Takeout (multiple allowed)" },
      { status: 400 },
    );
  }

  let totalFiles = 0;
  let importedCount = 0;
  let skippedCount = 0;

  const maxPinned = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), 0) as m FROM notes WHERE user_id = ? AND pinned = 1",
  )
    .bind(userId)
    .first<{ m: number }>();
  const maxUnpinned = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), 0) as m FROM notes WHERE user_id = ? AND pinned = 0",
  )
    .bind(userId)
    .first<{ m: number }>();

  let nextPinned = maxPinned?.m ?? 0;
  let nextUnpinned = maxUnpinned?.m ?? 0;

  for (const f of files) {
    totalFiles += 1;
    let note: KeepNote;
    try {
      note = JSON.parse(f.raw) as KeepNote;
    } catch {
      skippedCount += 1;
      continue;
    }

    if (note.is_trashed) {
      skippedCount += 1;
      continue;
    }

    const title = trimOpt(note.title);
    const content = extractKeepContent(note) ?? "";
    if (!title && !content.trim()) {
      skippedCount += 1;
      continue;
    }

    const tags = extractKeepTags(note);
    const tagsJson = JSON.stringify(tags);
    const pinned = note.is_pinned ? 1 : 0;
    const position = pinned ? ++nextPinned : ++nextUnpinned;

    const id = crypto.randomUUID();
    const r2Key = r2BodyKey(String(userId), id);
    const createdAt = tsFromUsec(note.created_timestamp_usec, new Date().toISOString());
    const updatedAt = tsFromUsec(note.user_edited_timestamp_usec, createdAt);

    await env.DB.prepare(
      `INSERT INTO notes (id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at)
       VALUES (?, ?, ?, 'white', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        userId,
        title ?? null,
        tagsJson,
        pinned,
        position,
        r2Key,
        createdAt,
        updatedAt,
      )
      .run();

    await env.NOTES.put(r2Key, JSON.stringify({ content }), {
      httpMetadata: { contentType: "application/json" },
    });
    importedCount += 1;
  }

  return json(env, request, {
    totalFiles,
    importedCount,
    skippedCount,
  });
}
