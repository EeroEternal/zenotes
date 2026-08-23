#!/usr/bin/env node
/**
 * Upload images from dirs as one-note-per-image, skipping titles already on server.
 * Adds request timeouts so large uploads don't hang forever.
 *
 *   ZENOTES_API_BASE=https://api.zenotes.site/api \
 *   ZENOTES_USER=lipi ZENOTES_PASSWORD=... \
 *   node scripts/upload-pics-resume.mjs /path/a /path/b
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";

const BASE = (process.env.ZENOTES_API_BASE || "https://api.zenotes.site/api").replace(/\/$/, "");
const USER = process.env.ZENOTES_USER || "lipi";
const PASS = process.env.ZENOTES_PASSWORD || "";
const MAX_BYTES = 6 * 1024 * 1024;
const DELAY_MS = Math.max(0, Number(process.env.ZENOTES_UPLOAD_DELAY_MS) || 80);
const TIMEOUT_MS = Math.max(10_000, Number(process.env.ZENOTES_UPLOAD_TIMEOUT_MS) || 90_000);
const MAX_RETRIES = Math.max(1, Number(process.env.ZENOTES_UPLOAD_RETRIES) || 4);
const PREFIX = "zenotes:media:";

const EXT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cookieFromResponse(res) {
  const h = res.headers;
  if (typeof h.getSetCookie === "function") {
    const list = h.getSetCookie();
    if (list?.length) {
      return list.map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
    }
  }
  const one = h.get("set-cookie");
  if (one) return one.split(/,(?=[^;]+?=)/).map((p) => p.split(";")[0].trim()).join("; ");
  return "";
}

async function fetchTimeout(url, init = {}, timeoutMs = TIMEOUT_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRetry(url, init = {}, label = "req") {
  let lastErr;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      const res = await fetchTimeout(url, init);
      if (res.status >= 500 || res.status === 429) {
        const txt = await res.text();
        if (i === MAX_RETRIES) throw new Error(`${label} ${res.status} ${txt.slice(0, 160)}`);
        const wait = Math.min(12_000, 300 * 2 ** (i - 1));
        console.warn(`${label} ${res.status}，${wait}ms 后重试 (${i}/${MAX_RETRIES})`);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i === MAX_RETRIES) break;
      const wait = Math.min(12_000, 300 * 2 ** (i - 1));
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`${label} 异常(${msg})，${wait}ms 后重试 (${i}/${MAX_RETRIES})`);
      await sleep(wait);
    }
  }
  throw lastErr || new Error(`${label} failed`);
}

async function listImages(dir) {
  const names = await readdir(dir);
  const out = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const fp = join(dir, name);
    const st = await stat(fp).catch(() => null);
    if (!st?.isFile()) continue;
    const ext = extname(name).toLowerCase();
    if (!EXT_TYPES[ext]) continue;
    out.push(fp);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function titleFor(fp, day) {
  const safeName = basename(fp).replace(/\]/g, "");
  return (`Cap ${day} · ${safeName}`).slice(0, 200);
}

async function listAllNoteTitles(cookie) {
  const titles = new Set();
  let page = 1;
  let totalPages = 1;
  // metadata only path still pulls bodies — keep page small
  do {
    const res = await fetchRetry(
      `${BASE}/notes?page=${page}&pageSize=100`,
      { headers: { Cookie: cookie } },
      `list p${page}`,
    );
    if (!res.ok) throw new Error(`list notes ${res.status} ${await res.text()}`);
    const data = await res.json();
    const notes = Array.isArray(data) ? data : data.notes ?? [];
    for (const n of notes) {
      if (n?.title) titles.add(String(n.title));
    }
    totalPages = Math.max(1, Number(data?.pagination?.totalPages || 1));
    if (notes.length === 0) break;
    page += 1;
  } while (page <= totalPages);
  return titles;
}

async function main() {
  const dirs = process.argv.slice(2).filter(Boolean);
  if (!PASS || dirs.length === 0) {
    console.error("用法: ZENOTES_PASSWORD=... node scripts/upload-pics-resume.mjs dir1 [dir2...]");
    process.exit(1);
  }

  const loginRes = await fetchTimeout(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER.trim(), password: PASS }),
  }, 30_000);
  if (!loginRes.ok) {
    console.error("登录失败", loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const cookie = cookieFromResponse(loginRes);
  if (!cookie) {
    console.error("未收到 cookie");
    process.exit(1);
  }
  const authHeaders = { Cookie: cookie, "Content-Type": "application/json" };
  console.log("登录成功，拉取已有笔记标题…");
  const existing = await listAllNoteTitles(cookie);
  console.log(`已有笔记标题 ${existing.size} 个`);

  const day = new Date().toISOString().slice(0, 10);
  let ok = 0;
  let skippedExist = 0;
  let skippedBig = 0;
  let failed = 0;

  for (const dir of dirs) {
    const files = await listImages(dir);
    console.log(`\n===== ${dir} (${files.length} images) =====`);
    for (let i = 0; i < files.length; i++) {
      const fp = files[i];
      const title = titleFor(fp, day);
      if (existing.has(title)) {
        skippedExist += 1;
        continue;
      }
      let buf;
      try {
        buf = await readFile(fp);
      } catch (e) {
        console.warn("读失败", fp, e instanceof Error ? e.message : e);
        failed += 1;
        continue;
      }
      if (buf.length > MAX_BYTES) {
        console.warn("跳过(>6MB)", fp, `(${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
        skippedBig += 1;
        continue;
      }

      try {
        const createRes = await fetchRetry(
          `${BASE}/notes`,
          {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ title, content: "", color: "white", tags: ["capture"] }),
          },
          "create",
        );
        if (!createRes.ok) {
          console.warn("创建失败", fp, createRes.status, await createRes.text());
          failed += 1;
          continue;
        }
        const created = await createRes.json();
        const noteId = created?.id;
        if (!noteId) {
          console.warn("无 id", fp);
          failed += 1;
          continue;
        }

        const ext = extname(fp).toLowerCase();
        const ct = EXT_TYPES[ext] || "application/octet-stream";
        const up = await fetchRetry(
          `${BASE}/notes/${encodeURIComponent(noteId)}/media`,
          {
            method: "POST",
            headers: { Cookie: cookie, "Content-Type": ct },
            body: buf,
          },
          `media ${basename(fp)}`,
        );
        if (!up.ok) {
          console.warn("上传媒体失败", fp, up.status, await up.text());
          failed += 1;
          continue;
        }
        const { id: mediaId } = await up.json();
        if (!mediaId) {
          console.warn("无 mediaId", fp);
          failed += 1;
          continue;
        }

        const bodyMd = `![${basename(fp).replace(/\]/g, "")}](${PREFIX}${mediaId})\n`;
        const patchRes = await fetchRetry(
          `${BASE}/notes/${encodeURIComponent(noteId)}`,
          {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ content: bodyMd }),
          },
          "patch",
        );
        if (!patchRes.ok) {
          console.warn("PATCH 失败", noteId, patchRes.status, await patchRes.text());
          failed += 1;
          continue;
        }

        existing.add(title);
        ok += 1;
        if (ok % 10 === 0 || i + 1 === files.length) {
          console.log(`进度: 新建 ${ok}，跳过已有 ${skippedExist}，过大 ${skippedBig}，失败 ${failed}（本目录 ${i + 1}/${files.length}）`);
        }
      } catch (e) {
        console.warn("异常跳过", fp, e instanceof Error ? e.message : e);
        failed += 1;
      }
      if (DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }

  console.log("\n完成。新建", ok, "条；跳过已有", skippedExist, "；过大", skippedBig, "；失败", failed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
