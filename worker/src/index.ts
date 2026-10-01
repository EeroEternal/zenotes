import { argon2Verify } from "hash-wasm";
import git from "isomorphic-git";
import http from "isomorphic-git/http/web";
import { MemoryFS } from "./memory-fs";
import JSZip from "jszip";

// Custom Agent implementation to replace missing Flue SDK parts
class Agent {
  private apiKey: string;
  private system: string;
  private tools: any[];

  constructor(config: any) {
    this.apiKey = config.model.apiKey;
    this.system = config.system;
    this.tools = config.tools;
  }

  async run(prompt: string) {
    const history = [
      { role: 'system', content: `You are a self-maintaining AI Agent. You can read the code in the current directory and update it according to requirements. You are running in a Cloudflare Worker memory sandbox. Here are the available tools: ${JSON.stringify(this.tools.map(t => ({ name: t.name, description: t.description })))}` },
      { role: 'user', content: prompt }
    ];

    for (let i = 0; i < 10; i++) {
      const response = await fetch(`https://api.deepseek.com/chat/completions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: history,
          tools: this.tools.map(t => ({
            type: "function",
            function: {
              name: t.name,
              description: t.description,
              parameters: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  content: { type: 'string' }
                },
                required: ['path']
              }
            }
          }))
        })
      });

      const data: any = await response.json();
      const message = data.choices[0].message;
      history.push(message);

      if (!message.tool_calls) break;

      const toolResults = [];
      for (const call of message.tool_calls) {
        const tool = this.tools.find(t => t.name === call.function.name);
        if (tool) {
          const args = JSON.parse(call.function.arguments);
          const result = await tool.execute(args);
          toolResults.push({
            role: 'tool',
            content: JSON.stringify({ result }),
            tool_call_id: call.id
          });
        }
      }
      history.push(...toolResults);
    }
  }
}

function createAgent(config: any) {
  return new Agent(config);
}

export interface Env {
  DB: D1Database;
  NOTES: R2Bucket;
  ARTIFACTS: any; // Cloudflare Artifacts binding
  ALLOWED_ORIGINS?: string;
  /** 设为 "true" 时才在 Worker 内调用 argon2Verify（付费/高 CPU 场景）；默认不调用，避免免费套餐长时间卡住 */
  ALLOW_ARGON2_VERIFY?: string;
  GEMINI_API_KEY?: string; // For the agent's LLM
  DEEPSEEK_API_KEY?: string;
  /** OpenRouter key — used for OCR + note summary */
  OPENROUTER_API_KEY?: string;
  /** default: mistralai/mistral-small-3.2-24b-instruct (cheap vision OCR) */
  OPENROUTER_OCR_MODEL?: string;
  /** default: mistralai/mistral-small-3.2-24b-instruct */
  OPENROUTER_SUMMARY_MODEL?: string;
  GLOBAL_TOKEN?: string;
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
  h.set("Access-Control-Allow-Headers", "Content-Type, Cookie, Authorization, X-Global-Token");
  return h;
}

async function sha256Hex(password: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sessionUserId(request: Request): number | null {
  // 1. Check Authorization: Bearer <token>
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const raw = auth.slice(7).trim();
    const id = parseInt(raw, 10);
    if (!Number.isNaN(id) && id > 0) return id;
  }

  // 2. Check query param ?token=
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (token) {
      const id = parseInt(token, 10);
      if (!Number.isNaN(id) && id > 0) return id;
    }
  } catch {}

  // 3. Check Cookie (robust against multiple or empty values)
  const cookieHeader = request.headers.get("Cookie") || "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx !== -1) {
      const name = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      if (name === SESSION_COOKIE && val) {
        const id = parseInt(decodeURIComponent(val), 10);
        if (!Number.isNaN(id) && id > 0) return id;
      }
    }
  }
  return null;
}

/**
 * zenotes.site → api.zenotes.site is same-site (not cross-site).
 * SameSite=Lax is enough for credentials:include. SameSite=None + Domain=
 * parent domain is treated as a third-party cookie and dropped by Chrome/Safari.
 */
function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

function sessionCookie(userId: number, request: Request): string {
  const maxAge = 60 * 60 * 24 * 30; // 30 days
  const secure = isHttps(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${userId}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookies(request: Request): string[] {
  const secure = isHttps(request) ? "; Secure" : "";
  return [
    `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`,
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0; Domain=zenotes.site`,
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Domain=zenotes.site`,
  ];
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

export interface NoteFileRow {
  id: string;
  note_id: string;
  user_id: number;
  filename: string;
  path: string;
  size: number;
  content_type: string;
  r2_key: string;
  created_at: string;
}

function fileResponse(row: NoteFileRow) {
  return {
    id: row.id,
    noteId: row.note_id,
    filename: row.filename,
    path: row.path,
    size: row.size,
    contentType: row.content_type,
    createdAt: row.created_at,
    downloadUrl: `/api/notes/${row.note_id}/files/${row.id}`,
  };
}

let _tablesEnsured = false;
async function ensureDbTables(db: D1Database): Promise<void> {
  if (_tablesEnsured) return;
  try {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS note_files (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          filename TEXT NOT NULL,
          path TEXT NOT NULL DEFAULT '',
          size INTEGER NOT NULL DEFAULT 0,
          content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
          r2_key TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_note_files_note_id ON note_files(note_id);`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_note_files_user_id ON note_files(user_id);`),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS note_shares (
          id TEXT PRIMARY KEY,
          note_id TEXT NOT NULL UNIQUE,
          user_id INTEGER NOT NULL,
          is_public INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_note_shares_id ON note_shares(id);`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_note_shares_note_id ON note_shares(note_id);`),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `),
    ]);
    _tablesEnsured = true;
  } catch (e) {
    console.error("Failed to ensure tables:", e);
  }
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;
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

/** Accept UUID or legacy client ids (url-safe, 8–64 chars). */
function isClientNoteId(s: string): boolean {
  if (isUuid(s)) return true;
  return /^[A-Za-z0-9_-]{8,64}$/.test(s);
}

/** URL 路径里的一段，可能是 percent-encoding；与 D1 里存的一致才能命中 */
function pathIdSegment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
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

/** 与前端 `NOTE_MEDIA_PREFIX` 一致 */
const NOTE_MARKDOWN_MEDIA_PREFIX = "zenotes:media:";

/**
 * 根据 R2 中 `userId/noteId/media/*` 已有对象重写笔记正文，不重新上传文件。
 */
async function rebuildNoteFromR2Media(
  env: Env,
  request: Request,
  userId: number,
  noteId: string,
): Promise<Response> {
  const row = await assertNoteOwned(env, userId, noteId);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  const prefix = `${userId}/${noteId}/media/`;
  const mediaIds: string[] = [];
  let cursor: string | undefined;
  do {
    const listed = await env.NOTES.list({ prefix, cursor });
    for (const o of listed.objects) {
      const name = o.key.split("/").pop() ?? "";
      if (isUuid(name)) {
        mediaIds.push(name);
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  mediaIds.sort();
  if (mediaIds.length === 0) {
    return json(
      env,
      request,
      { error: "no_media_objects", message: "该前缀下没有媒体: " + prefix },
      { status: 400 },
    );
  }
  const header = "以下由 R2 中已有媒体重新生成，未再次上传。";
  const bodyMd = [header, "", ...mediaIds.map((id) => `![image](${NOTE_MARKDOWN_MEDIA_PREFIX}${id})`)].join(
    "\n\n",
  );
  await env.NOTES.put(row.r2_key, JSON.stringify({ content: bodyMd }), {
    httpMetadata: { contentType: "application/json" },
  });
  await env.DB.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .bind(noteId, userId)
    .run();
  return json(env, request, { ok: true, noteId, imageCount: mediaIds.length });
}

async function runAgentWorkflow(fs: MemoryFS, dir: string, remote: string, env: Env, prompt: string) {
  const agent = createAgent({
    model: {
      provider: "deepseek",
      name: "deepseek-chat",
      apiKey: env.DEEPSEEK_API_KEY,
    },
    system: "You are a self-maintaining AI Agent. You can read the code in the current directory and update it as needed. You are running in a Cloudflare Worker memory sandbox.",
    tools: [
      {
        name: 'read_file',
        description: 'Read the content of a file at the specified path',
        execute: async ({ path }: { path: string }) => {
          const content = await fs.promises.readFile(`${dir}/${path}`, 'utf8');
          return content;
        }
      },
      {
        name: 'write_file',
        description: 'Overwrite or create a file with the given content',
        execute: async ({ path, content }: { path: string, content: string }) => {
          await fs.promises.writeFile(`${dir}/${path}`, content);
          return `Successfully updated ${path}`;
        }
      },
      {
        name: 'list_directory',
        description: 'List the directory structure',
        execute: async ({ path }: { path: string }) => {
          const files = await fs.promises.readdir(`${dir}/${path}`);
          return files.join('\n');
        }
      }
    ]
  });

  await agent.run(prompt);

  await commitAndPushChanges(fs, dir, remote);
}

async function commitAndPushChanges(fs: MemoryFS, dir: string, remote: string) {
  const status = await git.statusMatrix({ fs, dir });
  let changed = false;
  for (const [filepath, head, workdir, stage] of status) {
    if (workdir !== head) {
      await git.add({ fs, dir, filepath });
      changed = true;
    }
  }

  if (!changed) return;

  await git.commit({
    fs,
    dir,
    author: { name: 'Flue Auto-Agent', email: 'agent@serverless.local' },
    message: `chore(auto): Agent code update at ${new Date().toISOString()}`
  });

  await git.push({
    fs,
    http,
    dir,
    remote: 'origin',
    url: remote,
    ref: 'main'
  });
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
          agentGuide: "/api/agent/guide",
          llms: "/llms.txt",
        });
      }

      if (path === "/api" && request.method === "GET") {
        return json(env, request, {
          ok: true,
          message: "API root; set VITE_API_BASE=https://api.zenotes.site/api in the frontend",
          try: ["/api/health", "/api/notes", "/api/agent/guide", "/llms.txt"],
        });
      }

      if ((path === "/llms.txt" || path === "/api/agent/guide" || path === "/api/agent/instructions") && request.method === "GET") {
        return handleAgentGuide(env, request);
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
        for (const c of clearSessionCookies(request)) h.append("Set-Cookie", c);
        h.set("Cache-Control", "private, no-store");
        return new Response(JSON.stringify({ message: "Signed out" }), { headers: h });
      }
      if (path === "/api/auth/me" && request.method === "GET") {
        return handleMe(request, env);
      }

      if (path === "/api/agent/run" && request.method === "POST") {
        const uid = sessionUserId(request);
        if (uid === null) {
          // For now, let's allow it for testing, or restrict to a specific user
          // return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }

        const body = (await request.json()) as { prompt: string, repoName?: string };
        const sandboxId = body.repoName || "zenotes-agent-project";
        const prompt = body.prompt;

        if (!prompt) {
          return json(env, request, { error: "Prompt is required" }, { status: 400 });
        }

        try {
          // 1. 获取或创建 Artifacts 仓库
          const repo = await env.ARTIFACTS.get(sandboxId);
          // 提取鉴权 Token (Artifacts 的 Git Basic Auth 使用 Secret 作为密码)
          const tokenResult = await repo.createToken("write", 3600);
          const tokenSecret = tokenResult.plaintext.split("?expires=")[0];
          const authRemote = `https://x:${tokenSecret}@${repo.remote.slice(8)}`;

          const fs = new MemoryFS();
          const dir = "/workspace";

          // 2. 将代码极速拉取到 Worker 内存中
          await git.clone({
            fs,
            http,
            dir,
            url: authRemote,
            singleBranch: true,
            depth: 1
          });

          // 3. 运行 Agent Workflow
          await runAgentWorkflow(fs, dir, authRemote, env, prompt);

          return json(env, request, { ok: true, message: "Agent workflow completed & code updated." });
        } catch (err: any) {
          return json(env, request, { error: err.message }, { status: 500 });
        }
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

      const rebuildMatch = path.match(/^\/api\/notes\/([^/]+)\/rebuild-from-r2-media\/?$/);
      if (rebuildMatch && request.method === "POST") {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        return rebuildNoteFromR2Media(env, request, uid, pathIdSegment(rebuildMatch[1]!));
      }

      const analyzeMatch = path.match(/^\/api\/notes\/([^/]+)\/analyze\/?$/);
      if (analyzeMatch && request.method === "POST") {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        return analyzeNote(request, env, uid, pathIdSegment(analyzeMatch[1]!));
      }

      const mediaUploadMatch = path.match(/^\/api\/notes\/([^/]+)\/media\/?$/);
      if (mediaUploadMatch && request.method === "POST") {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        return uploadNoteMedia(request, env, uid, pathIdSegment(mediaUploadMatch[1]));
      }

      const mediaItemMatch = path.match(/^\/api\/notes\/([^/]+)\/media\/([^/]+)\/?$/);
      if (mediaItemMatch) {
        const uid = sessionUserId(request);
        const noteId = pathIdSegment(mediaItemMatch[1]!);
        const mediaId = pathIdSegment(mediaItemMatch[2]!);
        if (request.method === "GET") {
          return getNoteMedia(env, request, uid, noteId, mediaId);
        }
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        if (request.method === "DELETE") {
          return deleteNoteMedia(env, request, uid, noteId, mediaId);
        }
      }

      // Public share routes (no auth required)
      const publicShareMatch = path.match(/^\/api\/public\/shares\/([^/]+)\/?$/);
      if (publicShareMatch && request.method === "GET") {
        return getPublicShare(env, request, pathIdSegment(publicShareMatch[1]!));
      }

      const publicShareFileMatch = path.match(/^\/api\/public\/shares\/([^/]+)\/files\/([^/]+)\/?$/);
      if (publicShareFileMatch && request.method === "GET") {
        return getPublicShareFile(
          env,
          request,
          pathIdSegment(publicShareFileMatch[1]!),
          pathIdSegment(publicShareFileMatch[2]!),
        );
      }

      const publicShareMediaMatch = path.match(/^\/api\/public\/shares\/([^/]+)\/media\/([^/]+)\/?$/);
      if (publicShareMediaMatch && request.method === "GET") {
        return getPublicShareMedia(
          env,
          request,
          pathIdSegment(publicShareMediaMatch[1]!),
          pathIdSegment(publicShareMediaMatch[2]!),
        );
      }

      // Note share routes (authenticated)
      const noteShareMatch = path.match(/^\/api\/notes\/([^/]+)\/share\/?$/);
      if (noteShareMatch) {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        const noteId = pathIdSegment(noteShareMatch[1]!);
        if (request.method === "GET") {
          return getNoteShareStatus(env, request, uid, noteId);
        }
        if (request.method === "POST") {
          return handleShareNote(request, env, uid, noteId);
        }
      }

      // Note files routes (authenticated)
      const noteFilesMatch = path.match(/^\/api\/notes\/([^/]+)\/files\/?$/);
      if (noteFilesMatch) {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        const noteId = pathIdSegment(noteFilesMatch[1]!);
        if (request.method === "GET") {
          return listNoteFiles(env, request, uid, noteId);
        }
        if (request.method === "POST") {
          return uploadNoteFiles(request, env, uid, noteId);
        }
      }

      const noteFileItemMatch = path.match(/^\/api\/notes\/([^/]+)\/files\/([^/]+)\/?$/);
      if (noteFileItemMatch) {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        const noteId = pathIdSegment(noteFileItemMatch[1]!);
        const fileId = pathIdSegment(noteFileItemMatch[2]!);
        if (request.method === "GET") {
          return getNoteFile(env, request, uid, noteId, fileId);
        }
        if (request.method === "DELETE") {
          return deleteNoteFile(env, request, uid, noteId, fileId);
        }
      }

      const noteIdMatch = path.match(/^\/api\/notes\/([^/]+)\/?$/);
      if (noteIdMatch) {
        const uid = sessionUserId(request);
        if (uid === null) {
          return json(env, request, { error: "Unauthorized" }, { status: 401 });
        }
        const id = pathIdSegment(noteIdMatch[1]!);
        if (request.method === "GET") {
          return getNote(env, request, uid, id);
        }
        if (request.method === "PATCH") {
          return updateNote(request, env, uid, id);
        }
        if (request.method === "DELETE") {
          return deleteNote(env, request, uid, id);
        }
      }

      // Global settings
      if (path === "/api/settings/global-token") {
        if (request.method === "GET") {
          return handleGetGlobalToken(env, request);
        }
        if (request.method === "POST") {
          return handleUpdateGlobalToken(env, request);
        }
      }

      // Global batch export (ZIP of all notes, files, directories)
      if (path === "/api/global/export-all.zip" && request.method === "GET") {
        return exportGlobalAllZip(env, request);
      }

      // Global search & list notes
      if (path === "/api/global/notes" && request.method === "GET") {
        return listGlobalNotes(env, request);
      }

      // Global single note export (ZIP of note + its files/directories)
      const globalNoteZipMatch = path.match(/^\/api\/global\/notes\/([^/]+)\/export\.zip\/?$/);
      if (globalNoteZipMatch && request.method === "GET") {
        return exportGlobalNoteZip(env, request, pathIdSegment(globalNoteZipMatch[1]!));
      }

      // Global single note markdown download
      const globalNoteMdMatch = path.match(/^\/api\/global\/notes\/([^/]+)\/markdown\/?$/);
      if (globalNoteMdMatch && request.method === "GET") {
        return getGlobalNoteMarkdown(env, request, pathIdSegment(globalNoteMdMatch[1]!));
      }

      // Global single file download
      const globalNoteFileMatch = path.match(/^\/api\/global\/notes\/([^/]+)\/files\/([^/]+)\/?$/);
      if (globalNoteFileMatch && request.method === "GET") {
        return getGlobalNoteFile(
          env,
          request,
          pathIdSegment(globalNoteFileMatch[1]!),
          pathIdSegment(globalNoteFileMatch[2]!),
        );
      }

      // Global single note detail
      const globalNoteDetailMatch = path.match(/^\/api\/global\/notes\/([^/]+)\/?$/);
      if (globalNoteDetailMatch && request.method === "GET") {
        return getGlobalNote(env, request, pathIdSegment(globalNoteDetailMatch[1]!));
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
      "Cache-Control": "private, no-store",
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

  const h = corsHeaders(env, request, {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
  });
  h.append("Set-Cookie", sessionCookie(row.id, request));
  return new Response(
    JSON.stringify({
      id: row.id,
      username: row.username,
      email: row.email,
      token: String(row.id),
    }),
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

  const h = corsHeaders(env, request, {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
  });
  h.append("Set-Cookie", sessionCookie(row.id, request));
  return new Response(
    JSON.stringify({
      id: row.id,
      username: row.username,
      email: row.email,
      token: String(row.id),
    }),
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
  await ensureDbTables(env.DB);
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  // Cap at 100: each note body is an R2 read. pageSize=1000 exceeds Worker subrequest limits (CF 1101).
  const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get("pageSize") ?? "50", 10)));
  const offset = (page - 1) * pageSize;

  const { results } = await env.DB.prepare(
    `SELECT id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at
     FROM notes WHERE user_id = ?
     ORDER BY pinned DESC, position ASC, updated_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(userId, pageSize, offset)
    .all<NoteRow>();

  const rows = results ?? [];

  // Fetch files and shares for these notes in bulk
  const { results: fileRows } = await env.DB.prepare(
    "SELECT id, note_id, user_id, filename, path, size, content_type, r2_key, created_at FROM note_files WHERE user_id = ?"
  ).bind(userId).all<NoteFileRow>();

  const filesByNoteId: Record<string, any[]> = {};
  for (const f of fileRows || []) {
    if (!filesByNoteId[f.note_id]) filesByNoteId[f.note_id] = [];
    filesByNoteId[f.note_id]!.push(fileResponse(f));
  }

  const { results: shareRows } = await env.DB.prepare(
    "SELECT id, note_id, is_public FROM note_shares WHERE user_id = ?"
  ).bind(userId).all<{ id: string; note_id: string; is_public: number }>();

  const sharesByNoteId: Record<string, { shareId: string; isPublic: boolean; shareUrl: string }> = {};
  for (const s of shareRows || []) {
    sharesByNoteId[s.note_id] = {
      shareId: s.id,
      isPublic: Boolean(s.is_public),
      shareUrl: `/share/${s.id}`,
    };
  }

  const withContent = await Promise.all(
    rows.map(async (row) => {
      const content = await readBodyContent(env.NOTES, row.r2_key);
      const base = noteResponse(row, content);
      return {
        ...base,
        files: filesByNoteId[row.id] || [],
        share: sharesByNoteId[row.id] || null,
      };
    }),
  );

  const countResult = await env.DB.prepare(
    "SELECT COUNT(*) as total FROM notes WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ total: number }>();

  const total = countResult?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return json(env, request, {
    notes: withContent,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  });
}

async function createNote(request: Request, env: Env, userId: number): Promise<Response> {
  const body = (await request.json()) as {
    id?: string;
    title?: string;
    content?: string;
    color?: string;
    tags?: string[];
    pinned?: boolean;
  };

  const titleRaw = body.title?.trim();
  const title = titleRaw && titleRaw.length > 0 ? titleRaw : null;
  const content = (body.content ?? "").trim();
  const color = body.color ?? "white";
  const tagsJson = JSON.stringify(body.tags ?? []);
  const isPinned = body.pinned ? 1 : 0;

  const clientId = typeof body.id === "string" && isClientNoteId(body.id) ? body.id : null;

  if (clientId) {
    const existing = await env.DB.prepare(
      `SELECT id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at
       FROM notes WHERE id = ? AND user_id = ?`,
    )
      .bind(clientId, userId)
      .first<NoteRow>();

    if (existing) {
      const existingContent = await readBodyContent(env.NOTES, existing.r2_key);
      return json(env, request, noteResponse(existing, existingContent), { status: 200 });
    }
  }

  const topRow = await env.DB.prepare(
    "SELECT COALESCE(MIN(position), 1) as m FROM notes WHERE user_id = ? AND pinned = ?",
  )
    .bind(userId, isPinned)
    .first<{ m: number }>();
  const position = (topRow?.m ?? 1) - 1;

  const id = clientId ?? crypto.randomUUID();
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

async function getNote(env: Env, request: Request, userId: number, id: string): Promise<Response> {
  const row = await assertNoteOwned(env, userId, id);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  await ensureDbTables(env.DB);
  const content = await readBodyContent(env.NOTES, row.r2_key);
  const { results: fileRows } = await env.DB.prepare(
    "SELECT * FROM note_files WHERE note_id = ? AND user_id = ? ORDER BY created_at ASC"
  ).bind(id, userId).all<NoteFileRow>();

  const share = await env.DB.prepare(
    "SELECT * FROM note_shares WHERE note_id = ? AND user_id = ?"
  ).bind(id, userId).first<{ id: string; is_public: number }>();

  const base = noteResponse(row, content);
  return json(env, request, {
    ...base,
    files: (fileRows || []).map(fileResponse),
    share: share ? { shareId: share.id, isPublic: Boolean(share.is_public), shareUrl: `/share/${share.id}` } : null,
  });
}

async function deleteNote(env: Env, request: Request, userId: number, id: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT r2_key FROM notes WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<{ r2_key: string }>();

  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  await ensureDbTables(env.DB);
  await env.DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, userId).run();
  await env.DB.prepare("DELETE FROM note_files WHERE note_id = ? AND user_id = ?").bind(id, userId).run();
  await env.DB.prepare("DELETE FROM note_shares WHERE note_id = ? AND user_id = ?").bind(id, userId).run();
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
  userId: number | null,
  noteId: string,
  mediaId: string,
): Promise<Response> {
  if (!isUuid(mediaId)) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  let noteUserId = userId;
  if (noteUserId === null) {
    const note = await env.DB.prepare("SELECT user_id FROM notes WHERE id = ?")
      .bind(noteId)
      .first<{ user_id: number }>();
    if (!note) {
      return json(env, request, { error: "not_found" }, { status: 404 });
    }
    noteUserId = note.user_id;
  } else {
    const owned = await assertNoteOwned(env, noteUserId, noteId);
    if (!owned) {
      return json(env, request, { error: "not_found" }, { status: 404 });
    }
  }

  const key = r2MediaKey(String(noteUserId), noteId, mediaId);
  const obj = await env.NOTES.get(key);
  if (!obj) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  const ct = obj.httpMetadata?.contentType || "application/octet-stream";
  const h = corsHeaders(env, request, {
    "Content-Type": ct,
    "Cache-Control": "public, max-age=86400",
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

async function uploadNoteFiles(
  request: Request,
  env: Env,
  userId: number,
  noteId: string,
): Promise<Response> {
  const row = await assertNoteOwned(env, userId, noteId);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  await ensureDbTables(env.DB);

  const contentType = request.headers.get("Content-Type") || "";
  const uploadedFiles: Array<{
    id: string;
    noteId: string;
    filename: string;
    path: string;
    size: number;
    contentType: string;
    createdAt: string;
    downloadUrl: string;
  }> = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const files: File[] = [];
    const paths: string[] = [];

    let idx = 0;
    for (const [key, value] of formData.entries()) {
      if (typeof value !== "string" && value && typeof (value as any).arrayBuffer === "function") {
        const file = value as unknown as File;
        files.push(file);
        const pathVal = formData.get(`path_${idx}`) || formData.get(`path_${file.name}`) || "";
        paths.push(typeof pathVal === "string" ? pathVal : "");
        idx++;
      }
    }

    if (files.length === 0) {
      return json(env, request, { error: "no_files" }, { status: 400 });
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      if (file.size > MAX_FILE_BYTES) {
        return json(
          env,
          request,
          { error: "file_too_large", filename: file.name, maxBytes: MAX_FILE_BYTES },
          { status: 413 },
        );
      }
      const fileId = crypto.randomUUID();
      const filename = file.name || "unnamed";
      const relPath = paths[i] || "";
      const size = file.size;
      const mime = file.type || "application/octet-stream";
      const key = `${userId}/${noteId}/files/${fileId}/${encodeURIComponent(filename)}`;

      const arrayBuf = await file.arrayBuffer();
      await env.NOTES.put(key, arrayBuf, {
        httpMetadata: {
          contentType: mime,
          contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
        },
      });

      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO note_files (id, note_id, user_id, filename, path, size, content_type, r2_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(fileId, noteId, userId, filename, relPath, size, mime, key, now)
        .run();

      uploadedFiles.push({
        id: fileId,
        noteId,
        filename,
        path: relPath,
        size,
        contentType: mime,
        createdAt: now,
        downloadUrl: `/api/notes/${noteId}/files/${fileId}`,
      });
    }

    await env.DB.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .bind(noteId, userId)
      .run();

    return json(env, request, { files: uploadedFiles }, { status: 201 });
  }

  // Single binary upload
  const fileId = crypto.randomUUID();
  const filename = decodeURIComponent(request.headers.get("X-Filename") || "file");
  const relPath = decodeURIComponent(request.headers.get("X-Path") || "");
  const mime = request.headers.get("Content-Type") || "application/octet-stream";
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_FILE_BYTES) {
    return json(env, request, { error: "file_too_large", maxBytes: MAX_FILE_BYTES }, { status: 413 });
  }

  const size = buf.byteLength;
  const key = `${userId}/${noteId}/files/${fileId}/${encodeURIComponent(filename)}`;

  await env.NOTES.put(key, buf, {
    httpMetadata: {
      contentType: mime,
      contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO note_files (id, note_id, user_id, filename, path, size, content_type, r2_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(fileId, noteId, userId, filename, relPath, size, mime, key, now)
    .run();

  await env.DB.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .bind(noteId, userId)
    .run();

  uploadedFiles.push({
    id: fileId,
    noteId,
    filename,
    path: relPath,
    size,
    contentType: mime,
    createdAt: now,
    downloadUrl: `/api/notes/${noteId}/files/${fileId}`,
  });

  return json(env, request, { files: uploadedFiles }, { status: 201 });
}

async function listNoteFiles(
  env: Env,
  request: Request,
  userId: number,
  noteId: string,
): Promise<Response> {
  const row = await assertNoteOwned(env, userId, noteId);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  await ensureDbTables(env.DB);
  const { results } = await env.DB.prepare(
    "SELECT * FROM note_files WHERE note_id = ? AND user_id = ? ORDER BY created_at ASC",
  )
    .bind(noteId, userId)
    .all<NoteFileRow>();

  const files = (results || []).map(fileResponse);
  return json(env, request, { files });
}

async function getNoteFile(
  env: Env,
  request: Request,
  userId: number,
  noteId: string,
  fileId: string,
): Promise<Response> {
  const row = await assertNoteOwned(env, userId, noteId);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  await ensureDbTables(env.DB);
  const file = await env.DB.prepare(
    "SELECT * FROM note_files WHERE id = ? AND note_id = ? AND user_id = ?",
  )
    .bind(fileId, noteId, userId)
    .first<NoteFileRow>();

  if (!file) {
    return json(env, request, { error: "file_not_found" }, { status: 404 });
  }

  const obj = await env.NOTES.get(file.r2_key);
  if (!obj) {
    return json(env, request, { error: "file_not_found" }, { status: 404 });
  }

  const h = corsHeaders(env, request, {
    "Content-Type": file.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
    "Content-Length": String(file.size),
  });
  return new Response(obj.body, { headers: h });
}

async function deleteNoteFile(
  env: Env,
  request: Request,
  userId: number,
  noteId: string,
  fileId: string,
): Promise<Response> {
  const row = await assertNoteOwned(env, userId, noteId);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  await ensureDbTables(env.DB);
  const file = await env.DB.prepare(
    "SELECT * FROM note_files WHERE id = ? AND note_id = ? AND user_id = ?",
  )
    .bind(fileId, noteId, userId)
    .first<NoteFileRow>();

  if (!file) {
    return json(env, request, { error: "file_not_found" }, { status: 404 });
  }

  await env.NOTES.delete(file.r2_key);
  await env.DB.prepare("DELETE FROM note_files WHERE id = ?").bind(fileId).run();
  return new Response(null, { status: 204, headers: corsHeaders(env, request) });
}

async function handleShareNote(
  request: Request,
  env: Env,
  userId: number,
  noteId: string,
): Promise<Response> {
  const row = await assertNoteOwned(env, userId, noteId);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }
  await ensureDbTables(env.DB);

  let isPublic = 1;
  try {
    const b = (await request.json()) as { isPublic?: boolean };
    if (b.isPublic === false) isPublic = 0;
  } catch {
    // default 1
  }

  const existing = await env.DB.prepare("SELECT * FROM note_shares WHERE note_id = ?")
    .bind(noteId)
    .first<{ id: string; note_id: string; is_public: number }>();

  let shareId = existing?.id;
  if (existing) {
    await env.DB.prepare("UPDATE note_shares SET is_public = ? WHERE note_id = ?")
      .bind(isPublic, noteId)
      .run();
  } else {
    shareId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    await env.DB.prepare(
      "INSERT INTO note_shares (id, note_id, user_id, is_public, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
    )
      .bind(shareId, noteId, userId, isPublic)
      .run();
  }

  return json(env, request, {
    shareId,
    isPublic: Boolean(isPublic),
    shareUrl: `/share/${shareId}`,
  });
}

async function getNoteShareStatus(
  env: Env,
  request: Request,
  userId: number,
  noteId: string,
): Promise<Response> {
  await ensureDbTables(env.DB);
  const share = await env.DB.prepare("SELECT * FROM note_shares WHERE note_id = ? AND user_id = ?")
    .bind(noteId, userId)
    .first<{ id: string; is_public: number }>();

  return json(env, request, {
    shareId: share?.id ?? null,
    isPublic: Boolean(share?.is_public),
    shareUrl: share?.id ? `/share/${share.id}` : null,
  });
}

async function getPublicShare(
  env: Env,
  request: Request,
  shareId: string,
): Promise<Response> {
  await ensureDbTables(env.DB);
  const share = await env.DB.prepare(
    "SELECT * FROM note_shares WHERE id = ? AND is_public = 1",
  )
    .bind(shareId)
    .first<{ note_id: string; user_id: number; created_at: string }>();

  if (!share) {
    return json(env, request, { error: "share_not_found_or_private" }, { status: 404 });
  }

  const note = await env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(share.note_id)
    .first<NoteRow>();

  if (!note) {
    return json(env, request, { error: "note_not_found" }, { status: 404 });
  }

  const content = await readBodyContent(env.NOTES, note.r2_key);

  const { results: fileRows } = await env.DB.prepare(
    "SELECT * FROM note_files WHERE note_id = ? ORDER BY created_at ASC",
  )
    .bind(share.note_id)
    .all<NoteFileRow>();

  const files = (fileRows || []).map((f) => ({
    id: f.id,
    filename: f.filename,
    path: f.path,
    size: f.size,
    contentType: f.content_type,
    createdAt: f.created_at,
    downloadUrl: `/api/public/shares/${shareId}/files/${f.id}`,
  }));

  const user = await env.DB.prepare("SELECT username FROM users WHERE id = ?")
    .bind(note.user_id)
    .first<{ username: string }>();

  return json(env, request, {
    note: noteResponse(note, content),
    files,
    author: user?.username ?? "Zenotes User",
    shareId,
  });
}

async function getPublicShareFile(
  env: Env,
  request: Request,
  shareId: string,
  fileId: string,
): Promise<Response> {
  await ensureDbTables(env.DB);
  const share = await env.DB.prepare(
    "SELECT * FROM note_shares WHERE id = ? AND is_public = 1",
  )
    .bind(shareId)
    .first<{ note_id: string; user_id: number }>();

  if (!share) {
    return json(env, request, { error: "share_not_found" }, { status: 404 });
  }

  const file = await env.DB.prepare(
    "SELECT * FROM note_files WHERE id = ? AND note_id = ?",
  )
    .bind(fileId, share.note_id)
    .first<NoteFileRow>();

  if (!file) {
    return json(env, request, { error: "file_not_found" }, { status: 404 });
  }

  const obj = await env.NOTES.get(file.r2_key);
  if (!obj) {
    return json(env, request, { error: "file_not_found" }, { status: 404 });
  }

  const h = corsHeaders(env, request, {
    "Content-Type": file.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
    "Content-Length": String(file.size),
  });
  return new Response(obj.body, { headers: h });
}

async function getPublicShareMedia(
  env: Env,
  request: Request,
  shareId: string,
  mediaId: string,
): Promise<Response> {
  await ensureDbTables(env.DB);
  const share = await env.DB.prepare(
    "SELECT * FROM note_shares WHERE id = ? AND is_public = 1",
  )
    .bind(shareId)
    .first<{ note_id: string; user_id: number }>();

  if (!share) {
    return json(env, request, { error: "share_not_found" }, { status: 404 });
  }

  const key = r2MediaKey(String(share.user_id), share.note_id, mediaId);
  const obj = await env.NOTES.get(key);
  if (!obj) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  const ct = obj.httpMetadata?.contentType || "application/octet-stream";
  const h = corsHeaders(env, request, {
    "Content-Type": ct,
    "Cache-Control": "public, max-age=86400",
  });
  return new Response(obj.body, { headers: h });
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

const MEDIA_EMBED_RE = /!\[[^\]]*\]\((?:mynotes|zenotes):media:([0-9a-f-]{36})\)/gi;
const MAX_OCR_IMAGES = 4;
const MAX_OCR_IMAGE_BYTES = 4 * 1024 * 1024;
const ANALYZE_MARKER = "<!-- zenotes:ai-summary -->";

function extractMediaIds(content: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(MEDIA_EMBED_RE.source, MEDIA_EMBED_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const id = m[1]!.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(m[1]!);
  }
  return ids;
}

function stripAiSummary(content: string): string {
  const idx = content.indexOf(ANALYZE_MARKER);
  if (idx === -1) return content.trimEnd();
  return content.slice(0, idx).trimEnd();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function stripTextWithoutMedia(content: string): string {
  return content
    .replace(new RegExp(MEDIA_EMBED_RE.source, MEDIA_EMBED_RE.flags), " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function openRouterChat(
  env: Env,
  body: Record<string, unknown>,
): Promise<{ content: string; raw: unknown }> {
  const key = env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://zenotes.site",
      "X-Title": "Zenotes",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      typeof (raw as { error?: { message?: string } })?.error?.message === "string"
        ? (raw as { error: { message: string } }).error.message
        : JSON.stringify(raw).slice(0, 300);
    throw new Error(`openrouter ${res.status}: ${msg}`);
  }
  const content = String(
    (raw as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message
      ?.content ?? "",
  );
  return { content, raw };
}

/** Describe one image via OpenRouter vision (what it is / what it's for). */
async function describeImageOpenRouter(
  env: Env,
  bytes: Uint8Array,
  contentType: string,
  lang: string,
): Promise<string> {
  const model = env.OPENROUTER_OCR_MODEL || "mistralai/mistral-small-3.2-24b-instruct";
  const language =
    lang === "en" ? "English" : lang === "zh" || !lang ? "简体中文" : lang;
  const b64 = bytesToBase64(bytes);
  const dataUrl = `data:${contentType || "image/jpeg"};base64,${b64}`;
  const { content } = await openRouterChat(env, {
    model,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `用${language}说明这张图是什么、在干什么、关键信息是什么。\n\n要求：\n1. 2–5 句话，像笔记说明，不要罗列 OCR 原文\n2. 说清场景/产品/界面用途（例如聊天截图、架构图、账单、推文等）\n3. 只保留真正重要的人名、数字、结论；不要逐字抄屏\n4. 不要开场白、不要标题`,
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });
  return content.trim();
}

async function summarizeOpenRouter(env: Env, sourceText: string, lang: string): Promise<string> {
  const model = env.OPENROUTER_SUMMARY_MODEL || "mistralai/mistral-small-3.2-24b-instruct";
  const language =
    lang === "en" ? "English" : lang === "zh" || !lang ? "简体中文" : lang;
  const clipped = sourceText.slice(0, 24_000);
  const { content } = await openRouterChat(env, {
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You write short note captions. Describe what the material is about and what it is for. Be concise and factual. Do not dump raw OCR.",
      },
      {
        role: "user",
        content: `请用${language}把下面材料整理成一段笔记说明。\n\n要求：\n1. 2–6 句话，说明这是什么、在干什么、为什么值得记\n2. 不要 OCR 原文堆砌，不要大段 bullet\n3. 只保留关键数字/人名/结论\n4. 不要开场白\n\n---\n${clipped}`,
      },
    ],
  });
  return content.trim();
}

async function analyzeNote(
  request: Request,
  env: Env,
  userId: number,
  noteId: string,
): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) {
    return json(
      env,
      request,
      {
        error: "openrouter_not_configured",
        message: "Set OPENROUTER_API_KEY on the worker (wrangler secret put OPENROUTER_API_KEY).",
      },
      { status: 503 },
    );
  }

  const row = await assertNoteOwned(env, userId, noteId);
  if (!row) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  let append = true;
  let lang = "zh";
  try {
    const body = (await request.json()) as { append?: boolean; lang?: string };
    if (typeof body.append === "boolean") append = body.append;
    if (typeof body.lang === "string" && body.lang.trim()) lang = body.lang.trim();
  } catch {
    // empty body ok
  }

  const rawContent = await readBodyContent(env.NOTES, row.r2_key);
  const baseContent = stripAiSummary(rawContent);
  const mediaIds = extractMediaIds(baseContent).slice(0, MAX_OCR_IMAGES);
  const plainText = stripTextWithoutMedia(baseContent);

  const imageDescriptions: string[] = [];
  const ocrErrors: string[] = [];
  for (let i = 0; i < mediaIds.length; i++) {
    const mediaId = mediaIds[i]!;
    const key = r2MediaKey(String(userId), noteId, mediaId);
    const obj = await env.NOTES.get(key);
    if (!obj) {
      ocrErrors.push(`${mediaId}: missing`);
      continue;
    }
    const ab = await obj.arrayBuffer();
    if (ab.byteLength > MAX_OCR_IMAGE_BYTES) {
      ocrErrors.push(`${mediaId}: too_large`);
      continue;
    }
    const bytes = new Uint8Array(ab);
    const ct = obj.httpMetadata?.contentType || "image/jpeg";
    try {
      const text = await describeImageOpenRouter(env, bytes, ct, lang);
      if (text) {
        imageDescriptions.push(
          mediaIds.length > 1 ? `图 ${i + 1}：${text}` : text,
        );
      }
    } catch (e) {
      ocrErrors.push(`${mediaId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const imageText = imageDescriptions.join("\n\n").trim();
  let summary = "";
  try {
    if (plainText && imageText) {
      summary = await summarizeOpenRouter(
        env,
        `笔记文字：\n${plainText}\n\n图片说明：\n${imageText}`,
        lang,
      );
    } else if (imageText) {
      // Image-only note: vision description is already the caption.
      summary =
        imageDescriptions.length === 1
          ? imageText
          : await summarizeOpenRouter(env, imageText, lang);
    } else if (plainText) {
      summary = await summarizeOpenRouter(env, plainText, lang);
    }
  } catch (e) {
    return json(
      env,
      request,
      {
        error: "summary_failed",
        message: e instanceof Error ? e.message : String(e),
        ocrErrors,
      },
      { status: 502 },
    );
  }

  if (!summary) {
    const detail = ocrErrors.length ? ` ${ocrErrors.slice(0, 2).join("; ")}` : "";
    return json(
      env,
      request,
      {
        error: "nothing_to_analyze",
        message: `笔记没有可分析的文字或图片。${detail}`,
        ocrErrors,
      },
      { status: 400 },
    );
  }

  let content = baseContent;
  if (append && summary) {
    const block = ["", ANALYZE_MARKER, "", "## AI 总结", "", summary, ""].join("\n");
    content = `${baseContent.trimEnd()}\n${block}`;
    await env.NOTES.put(row.r2_key, JSON.stringify({ content }), {
      httpMetadata: { contentType: "application/json" },
    });
    await env.DB.prepare("UPDATE notes SET updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .bind(noteId, userId)
      .run();
  }

  const updated = await assertNoteOwned(env, userId, noteId);
  return json(env, request, {
    noteId,
    summary,
    ocrText: "",
    ocrErrors,
    mediaCount: mediaIds.length,
    appended: append,
    note: updated ? noteResponse(updated, content) : null,
  });
}

// ==================== Global Master Token & Operations ====================

async function getEffectiveGlobalToken(env: Env): Promise<string> {
  try {
    await ensureDbTables(env.DB);
    const row = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'global_token'")
      .first<{ value: string }>();
    if (row && row.value && row.value.trim()) {
      return row.value.trim();
    }
  } catch (e) {
    console.error("Error reading global_token from DB:", e);
  }
  return env.GLOBAL_TOKEN?.trim() || "zenotes_master_sec_token";
}

async function verifyGlobalToken(request: Request, env: Env): Promise<boolean> {
  const effective = await getEffectiveGlobalToken(env);
  if (!effective) return false;

  // 1. Check Header X-Global-Token
  const customHeader = request.headers.get("X-Global-Token");
  if (customHeader && customHeader.trim() === effective) return true;

  // 2. Check Header Authorization: Bearer <token>
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) {
    const raw = auth.slice(7).trim();
    if (raw === effective) return true;
  }

  // 3. Check query param: ?token= or ?global_token=
  try {
    const url = new URL(request.url);
    const qToken = url.searchParams.get("token") || url.searchParams.get("global_token");
    if (qToken && qToken.trim() === effective) return true;
  } catch {}

  return false;
}

async function handleGetGlobalToken(env: Env, request: Request): Promise<Response> {
  const uid = sessionUserId(request);
  const isGlobalAuth = await verifyGlobalToken(request, env);
  if (uid === null && !isGlobalAuth) {
    return json(env, request, { error: "unauthorized" }, { status: 401 });
  }

  const token = await getEffectiveGlobalToken(env);
  return json(env, request, {
    ok: true,
    globalToken: token,
  });
}

async function handleUpdateGlobalToken(env: Env, request: Request): Promise<Response> {
  const uid = sessionUserId(request);
  const isGlobalAuth = await verifyGlobalToken(request, env);
  if (uid === null && !isGlobalAuth) {
    return json(env, request, { error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { token?: string };
  const newToken = (body.token ?? "").trim();
  if (!newToken || newToken.length < 4) {
    return json(
      env,
      request,
      { error: "Token must be at least 4 characters long" },
      { status: 400 },
    );
  }

  await ensureDbTables(env.DB);
  await env.DB.prepare(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ('global_token', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
    .bind(newToken)
    .run();

  return json(env, request, {
    ok: true,
    message: "Global token updated successfully",
    globalToken: newToken,
  });
}

async function listGlobalNotes(env: Env, request: Request): Promise<Response> {
  if (!(await verifyGlobalToken(request, env))) {
    return json(env, request, { error: "unauthorized", message: "Invalid or missing global token" }, { status: 401 });
  }
  await ensureDbTables(env.DB);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;
  const token = await getEffectiveGlobalToken(env);

  let notes: (NoteRow & { username?: string })[] = [];
  if (q) {
    const likeQ = `%${q}%`;
    const { results } = await env.DB.prepare(
      `SELECT n.*, u.username FROM notes n
       LEFT JOIN users u ON n.user_id = u.id
       WHERE (n.title LIKE ? OR n.tags LIKE ? OR u.username LIKE ?
              OR n.id IN (SELECT note_id FROM note_files WHERE filename LIKE ? OR path LIKE ?))
       ORDER BY n.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(likeQ, likeQ, likeQ, likeQ, likeQ, limit, offset)
      .all<NoteRow & { username?: string }>();
    notes = results || [];
  } else {
    const { results } = await env.DB.prepare(
      `SELECT n.*, u.username FROM notes n
       LEFT JOIN users u ON n.user_id = u.id
       ORDER BY n.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(limit, offset)
      .all<NoteRow & { username?: string }>();
    notes = results || [];
  }

  // Pre-fetch files for these specific notes in bulk
  const noteIds = notes.map((n) => n.id);
  const filesByNoteId: Record<string, NoteFileRow[]> = {};
  if (noteIds.length > 0) {
    const placeholders = noteIds.map(() => "?").join(",");
    const { results: allFiles } = await env.DB.prepare(
      `SELECT * FROM note_files WHERE note_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
      .bind(...noteIds)
      .all<NoteFileRow>();

    if (allFiles) {
      for (const f of allFiles) {
        if (!filesByNoteId[f.note_id]) filesByNoteId[f.note_id] = [];
        filesByNoteId[f.note_id].push(f);
      }
    }
  }

  // Fetch content concurrently
  const list = await Promise.all(
    notes.map(async (n) => {
      const content = await readBodyContent(env.NOTES, n.r2_key);
      const files = filesByNoteId[n.id] || [];
      const fileSummaries = files.map((f) => ({
        id: f.id,
        filename: f.filename,
        path: f.path,
        size: f.size,
        contentType: f.content_type,
        createdAt: f.created_at,
        downloadUrl: `/api/global/notes/${n.id}/files/${f.id}?token=${encodeURIComponent(token)}`,
      }));

      const directorySet = new Set<string>();
      for (const f of files) {
        if (f.path && f.path.includes("/")) {
          const dir = f.path.substring(0, f.path.lastIndexOf("/"));
          if (dir) directorySet.add(dir);
        }
      }
      const directories = Array.from(directorySet);

      return {
        ...noteResponse(n, content),
        author: n.username || "Zenotes User",
        files: fileSummaries,
        directories,
        downloadZipUrl: `/api/global/notes/${n.id}/export.zip?token=${encodeURIComponent(token)}`,
        downloadMarkdownUrl: `/api/global/notes/${n.id}/markdown?token=${encodeURIComponent(token)}`,
      };
    }),
  );

  return json(env, request, {
    ok: true,
    total: list.length,
    notes: list,
    exportAllZipUrl: `/api/global/export-all.zip?token=${encodeURIComponent(token)}`,
  });
}

async function getGlobalNote(env: Env, request: Request, noteId: string): Promise<Response> {
  if (!(await verifyGlobalToken(request, env))) {
    return json(env, request, { error: "unauthorized" }, { status: 401 });
  }
  await ensureDbTables(env.DB);
  const note = await env.DB.prepare(
    "SELECT n.*, u.username FROM notes n LEFT JOIN users u ON n.user_id = u.id WHERE n.id = ?",
  )
    .bind(noteId)
    .first<NoteRow & { username?: string }>();

  if (!note) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  const token = await getEffectiveGlobalToken(env);
  const content = await readBodyContent(env.NOTES, note.r2_key);
  const { results: fileRows } = await env.DB.prepare(
    "SELECT * FROM note_files WHERE note_id = ? ORDER BY created_at ASC",
  )
    .bind(noteId)
    .all<NoteFileRow>();

  const files = (fileRows || []).map((f) => ({
    id: f.id,
    filename: f.filename,
    path: f.path,
    size: f.size,
    contentType: f.content_type,
    createdAt: f.created_at,
    downloadUrl: `/api/global/notes/${noteId}/files/${f.id}?token=${encodeURIComponent(token)}`,
  }));

  const directorySet = new Set<string>();
  for (const f of files) {
    if (f.path && f.path.includes("/")) {
      const dir = f.path.substring(0, f.path.lastIndexOf("/"));
      if (dir) directorySet.add(dir);
    }
  }

  return json(env, request, {
    ...noteResponse(note, content),
    author: note.username || "Zenotes User",
    files,
    directories: Array.from(directorySet),
    downloadZipUrl: `/api/global/notes/${noteId}/export.zip?token=${encodeURIComponent(token)}`,
    downloadMarkdownUrl: `/api/global/notes/${noteId}/markdown?token=${encodeURIComponent(token)}`,
  });
}

async function getGlobalNoteMarkdown(
  env: Env,
  request: Request,
  noteId: string,
): Promise<Response> {
  if (!(await verifyGlobalToken(request, env))) {
    return json(env, request, { error: "unauthorized" }, { status: 401 });
  }
  const note = await env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(noteId)
    .first<NoteRow>();

  if (!note) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  const content = await readBodyContent(env.NOTES, note.r2_key);
  const filename = `note_${note.id.slice(0, 8)}.md`;
  return new Response(content, {
    headers: corsHeaders(env, request, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    }),
  });
}

async function getGlobalNoteFile(
  env: Env,
  request: Request,
  noteId: string,
  fileId: string,
): Promise<Response> {
  if (!(await verifyGlobalToken(request, env))) {
    return json(env, request, { error: "unauthorized" }, { status: 401 });
  }
  await ensureDbTables(env.DB);
  const file = await env.DB.prepare(
    "SELECT * FROM note_files WHERE id = ? AND note_id = ?",
  )
    .bind(fileId, noteId)
    .first<NoteFileRow>();

  if (!file) {
    return json(env, request, { error: "file_not_found" }, { status: 404 });
  }

  const obj = await env.NOTES.get(file.r2_key);
  if (!obj) {
    return json(env, request, { error: "file_not_found" }, { status: 404 });
  }

  const h = corsHeaders(env, request, {
    "Content-Type": file.content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
    "Content-Length": String(file.size),
  });
  return new Response(obj.body, { headers: h });
}

async function exportGlobalNoteZip(
  env: Env,
  request: Request,
  noteId: string,
): Promise<Response> {
  if (!(await verifyGlobalToken(request, env))) {
    return json(env, request, { error: "unauthorized" }, { status: 401 });
  }
  const note = await env.DB.prepare("SELECT * FROM notes WHERE id = ?")
    .bind(noteId)
    .first<NoteRow>();

  if (!note) {
    return json(env, request, { error: "not_found" }, { status: 404 });
  }

  await ensureDbTables(env.DB);
  const content = await readBodyContent(env.NOTES, note.r2_key);
  const { results: fileRows } = await env.DB.prepare(
    "SELECT * FROM note_files WHERE note_id = ? ORDER BY created_at ASC",
  )
    .bind(noteId)
    .all<NoteFileRow>();

  const zip = new JSZip();
  zip.file("note.md", content);

  if (fileRows) {
    for (const f of fileRows) {
      try {
        const obj = await env.NOTES.get(f.r2_key);
        if (obj) {
          const ab = await obj.arrayBuffer();
          const fullPath = f.path ? f.path.replace(/^\/+/, "") : f.filename;
          zip.file(fullPath, ab);
        }
      } catch (e) {
        console.error("Error reading file for zip:", f.r2_key, e);
      }
    }
  }

  try {
    const mediaPrefix = r2NotePrefix(String(note.user_id), note.id) + "media/";
    const mediaList = await env.NOTES.list({ prefix: mediaPrefix });
    for (const m of mediaList.objects) {
      const mObj = await env.NOTES.get(m.key);
      if (mObj) {
        const mediaFilename = m.key.split("/").pop() || "image";
        const ab = await mObj.arrayBuffer();
        zip.file(`media/${mediaFilename}`, ab);
      }
    }
  } catch (e) {
    console.error("Error archiving media:", e);
  }

  const zipData = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const filename = `note_${note.id.slice(0, 8)}.zip`;
  return new Response(zipData, {
    headers: corsHeaders(env, request, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipData.byteLength),
    }),
  });
}

async function exportGlobalAllZip(
  env: Env,
  request: Request,
): Promise<Response> {
  if (!(await verifyGlobalToken(request, env))) {
    return json(env, request, { error: "unauthorized" }, { status: 401 });
  }
  await ensureDbTables(env.DB);

  const { results: notes } = await env.DB.prepare(
    "SELECT n.*, u.username FROM notes n LEFT JOIN users u ON n.user_id = u.id ORDER BY n.created_at ASC",
  ).all<NoteRow & { username?: string }>();

  const { results: allFiles } = await env.DB.prepare(
    "SELECT * FROM note_files ORDER BY created_at ASC",
  ).all<NoteFileRow>();

  const filesByNoteId: Record<string, NoteFileRow[]> = {};
  if (allFiles) {
    for (const f of allFiles) {
      if (!filesByNoteId[f.note_id]) filesByNoteId[f.note_id] = [];
      filesByNoteId[f.note_id].push(f);
    }
  }

  const zip = new JSZip();
  const manifest: any[] = [];

  if (notes) {
    for (const n of notes) {
      const dirName = `note_${n.id.slice(0, 8)}`;
      const noteFolder = zip.folder(dirName);
      const content = await readBodyContent(env.NOTES, n.r2_key);

      if (noteFolder) {
        noteFolder.file("note.md", content);

        const files = filesByNoteId[n.id] || [];
        for (const f of files) {
          try {
            const obj = await env.NOTES.get(f.r2_key);
            if (obj) {
              const ab = await obj.arrayBuffer();
              const fullPath = f.path ? f.path.replace(/^\/+/, "") : f.filename;
              noteFolder.file(fullPath, ab);
            }
          } catch (e) {
            console.error("Error archiving file:", f.r2_key, e);
          }
        }

        try {
          const mediaPrefix = r2NotePrefix(String(n.user_id), n.id) + "media/";
          const mediaList = await env.NOTES.list({ prefix: mediaPrefix });
          for (const m of mediaList.objects) {
            const mObj = await env.NOTES.get(m.key);
            if (mObj) {
              const mediaFilename = m.key.split("/").pop() || "image";
              const ab = await mObj.arrayBuffer();
              noteFolder.file(`media/${mediaFilename}`, ab);
            }
          }
        } catch (e) {
          console.error("Error archiving media in export all:", e);
        }
      }

      manifest.push({
        id: n.id,
        author: n.username || "unknown",
        createdAt: n.created_at,
        updatedAt: n.updated_at,
        tags: n.tags,
        fileCount: (filesByNoteId[n.id] || []).length,
        folder: dirName,
      });
    }
  }

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const zipData = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const filename = `zenotes_all_export_${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(zipData, {
    headers: corsHeaders(env, request, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zipData.byteLength),
    }),
  });
}

async function handleAgentGuide(env: Env, request: Request): Promise<Response> {
  const text = `# Zenotes API Guide for AI Agents

Zenotes is a privacy-first note-taking and knowledge base service storing Markdown notes, uploaded files, and directories.

## Authentication
Every agent request should provide your master global token:
- Header: \`X-Global-Token: <YOUR_GLOBAL_TOKEN>\`
- Or Header: \`Authorization: Bearer <YOUR_GLOBAL_TOKEN>\`
- Or Query Parameter: \`?token=<YOUR_GLOBAL_TOKEN>\`

## How to Get and Search Notes
1. **Search Notes & Files**:
   \`GET https://api.zenotes.site/api/global/notes?q={keyword}&token=<YOUR_GLOBAL_TOKEN>\`
   Returns JSON list with note metadata, body content (Markdown), associated files with directory paths, tags, and timestamps.

2. **Get Single Note as Raw Markdown**:
   \`GET https://api.zenotes.site/api/global/notes/{noteId}/markdown?token=<YOUR_GLOBAL_TOKEN>\`
   Returns raw clean Markdown text.

3. **Download a File Attachment**:
   \`GET https://api.zenotes.site/api/global/notes/{noteId}/files/{fileId}?token=<YOUR_GLOBAL_TOKEN>\`

4. **Export a Note with all Files/Directories as ZIP**:
   \`GET https://api.zenotes.site/api/global/notes/{noteId}/export.zip?token=<YOUR_GLOBAL_TOKEN>\`

5. **Export Entire Knowledge Base as ZIP**:
   \`GET https://api.zenotes.site/api/global/export-all.zip?token=<YOUR_GLOBAL_TOKEN>\`

## Example (cURL)
\`\`\`bash
curl -s -H "X-Global-Token: <YOUR_GLOBAL_TOKEN>" "https://api.zenotes.site/api/global/notes?q="
\`\`\`
`;

  return new Response(text, {
    headers: corsHeaders(env, request, {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    }),
  });
}
