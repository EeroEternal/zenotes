import { argon2Verify } from "hash-wasm";

export interface Env {
  DB: D1Database;
  NOTES: R2Bucket;
  ALLOWED_ORIGINS?: string;
  DEFAULT_USER_ID?: string;
}

const SESSION_COOKIE = "mynotes_session";

function defaultUserId(env: Env): number {
  const v = env.DEFAULT_USER_ID;
  if (v) {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return 1;
}

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

async function passwordMatches(plain: string, storedHash: string, sha256HexResult: string): Promise<boolean> {
  if (storedHash === sha256HexResult) return true;
  if (storedHash.startsWith("$argon2")) {
    try {
      return await argon2Verify({ password: plain, hash: storedHash });
    } catch {
      return false;
    }
  }
  return false;
}

function sessionUserId(request: Request): number | null {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!m) return null;
  const id = parseInt(decodeURIComponent(m[1]), 10);
  return Number.isNaN(id) ? null : id;
}

function sessionCookie(userId: number): string {
  return `${SESSION_COOKIE}=${userId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
}

function clearSessionCookie(): string {
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
    const uid = defaultUserId(env);

    try {
      if (path === "/" && request.method === "GET") {
        return json(env, request, {
          ok: true,
          service: "mynotes-api",
          health: "/api/health",
          notes: "/api/notes",
        });
      }

      if (path === "/api" && request.method === "GET") {
        return json(env, request, {
          ok: true,
          message: "API 根路径；前端请设置 VITE_API_BASE=https://api.zenotes.site/api",
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
        h.append("Set-Cookie", clearSessionCookie());
        return new Response(JSON.stringify({ message: "已退出登录" }), { headers: h });
      }
      if (path === "/api/auth/me" && request.method === "GET") {
        return handleMe(request, env);
      }

      if (path === "/api/notes" && request.method === "GET") {
        return listNotes(env, request, uid);
      }
      if (path === "/api/notes" && request.method === "POST") {
        return createNote(request, env, uid);
      }

      if (path === "/api/notes/reorder" && request.method === "POST") {
        return reorderNotes(request, env, uid);
      }

      if (path === "/api/notes/import/google-keep" && request.method === "POST") {
        return importGoogleKeep(request, env, uid);
      }

      const noteIdMatch = path.match(/^\/api\/notes\/([^/]+)$/);
      if (noteIdMatch) {
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
    return json(env, request, { error: "用户名至少3个字符" }, { status: 400 });
  }
  if (password.length < 6) {
    return json(env, request, { error: "密码至少6个字符" }, { status: 400 });
  }
  if (!email.includes("@")) {
    return json(env, request, { error: "邮箱格式不正确" }, { status: 400 });
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
  h.append("Set-Cookie", sessionCookie(row.id));
  return new Response(
    JSON.stringify({ id: row.id, username: row.username, email: row.email }),
    { headers: h },
  );
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const plain = body.password ?? "";
  const hash = await sha256Hex(plain);

  const row = await env.DB.prepare(
    "SELECT id, username, email, password_hash FROM users WHERE username = ?",
  )
    .bind(username)
    .first<{ id: number; username: string; email: string; password_hash: string }>();

  if (!row || !(await passwordMatches(plain, row.password_hash, hash))) {
    return json(env, request, { error: "Invalid credentials" }, { status: 401 });
  }

  const h = corsHeaders(env, request, { "Content-Type": "application/json" });
  h.append("Set-Cookie", sessionCookie(row.id));
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

  if (!title && content.length === 0) {
    return json(env, request, { error: "content_or_title_required" }, { status: 400 });
  }

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
  await env.NOTES.delete(row.r2_key);

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
      { error: "no_files", message: "请选择 Google Takeout 解压后的 JSON 文件（可多选）" },
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
