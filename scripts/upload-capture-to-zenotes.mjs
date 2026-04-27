#!/usr/bin/env node
/**
 * 将本地目录中的图片批量上传到 Zenotes。
 * 默认：一条笔记里嵌多图。若希望「每张图一条笔记、列表都看得见」，加 --per-image
 *
 *   export ZENOTES_API_BASE=https://api.zenotes.site/api
 *   export ZENOTES_USER=lipi
 *   read -s ZENOTES_PASSWORD; export ZENOTES_PASSWORD
 *   node scripts/upload-capture-to-zenotes.mjs /path/to/capture
 *   # 每张图单独建一条笔记（列表里逐条出现，不挤在同一条里）：
 *   node scripts/upload-capture-to-zenotes.mjs --per-image /path/to/capture
 *   node scripts/upload-capture-to-zenotes.mjs --probe
 *
 * 大批量上传（数百张）易遇 EPIPE/断连，可调：
 *   ZENOTES_UPLOAD_DELAY_MS=150   每张间隔毫秒
 *   ZENOTES_UPLOAD_RETRIES=5      单次上传重试次数
 *   ZENOTES_PATCH_EVERY=20        每成功 N 张就 PATCH 一次正文（防中途中断后笔记仍空白；默认已加密）
 *   Ctrl+C 时尽量把已上传的图先 PATCH 进正文，或在网页/脚本里用「用已上传的图片恢复正文」/ rebuild
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";

const NOTE_MEDIA_PREFIX = "zenotes:media:";
const MAX_BYTES = 6 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetriableNetworkError(e) {
  if (!(e instanceof Error)) return false;
  if (e.name === "TypeError" && /fetch failed/i.test(e.message)) return true;
  const c = e.cause;
  if (c && typeof c === "object" && "code" in c) {
    const code = String(/** @type {{ code?: string }} */ (c).code);
    if (["EPIPE", "ECONNRESET", "ETIMEDOUT", "ECONNABORTED"].includes(code)) return true;
  }
  return false;
}

/**
 * @param {string} url
 * @param {RequestInit} init
 */
async function fetchWithRetry(url, init) {
  const max = Math.max(1, Number(process.env.ZENOTES_UPLOAD_RETRIES) || 5);
  const baseDelay = Math.max(100, Number(process.env.ZENOTES_UPLOAD_RETRY_MS) || 400);
  let lastErr;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      if (!isRetriableNetworkError(/** @type {Error} */ (e)) || attempt === max) {
        throw e;
      }
      const wait = Math.min(30_000, baseDelay * 2 ** (attempt - 1));
      const code = e instanceof Error && e.cause && typeof e.cause === "object" && "code" in e.cause
        ? String(/** @type {{ code?: string }} */(e.cause).code)
        : "";
      console.warn(`网络异常${code ? `(${code})` : ""}，${wait}ms 后重试（第 ${attempt} 次失败，共 ${max} 次）…`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

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

function normOpt(s) {
  return String(s).replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let recursive = false;
  let perImage = false;
  const positionals = [];

  for (const a of argv) {
    const n = normOpt(a);
    if (n === "--probe") continue;
    if (n === "--per-image" || n === "-1" || n === "--one-per-image") {
      perImage = true;
      continue;
    }
    if (n === "--recursive" || n === "-r") {
      recursive = true;
      continue;
    }
    positionals.push(a);
  }

  const probe = argv.some((a) => normOpt(a) === "--probe");

  if (positionals[0] != null && normOpt(positionals[0]) === "--probe") {
    positionals.shift();
  }

  let dir = positionals[0] ?? process.env.CAPTURE_DIR;
  if (dir != null && dir !== "" && normOpt(String(dir)) === "--probe") {
    dir = undefined;
  }
  if (dir != null && dir !== "" && normOpt(String(dir)).startsWith("-")) {
    console.error("「" + dir + "」不是合法目录。");
    process.exit(1);
  }
  if ((!dir || dir === "") && !probe) {
    console.error("用法: node scripts/upload-capture-to-zenotes.mjs [--probe] [--per-image] [--recursive] <图片目录>");
    process.exit(1);
  }
  return { dir: dir != null && dir !== "" ? dir : "", recursive, perImage, probe };
}

function cookieFromResponse(res) {
  const h = res.headers;
  if (typeof h.getSetCookie === "function") {
    const list = h.getSetCookie();
    if (list && list.length) {
      return list
        .map((c) => c.split(";")[0].trim())
        .filter(Boolean)
        .join("; ");
    }
  }
  const one = h.get("set-cookie");
  if (one) return one.split(/,(?=[^;]+?=)/).map((p) => p.split(";")[0].trim()).join("; ");
  return "";
}

async function listImageFiles(root, recursive) {
  const out = [];
  async function walk(d) {
    const names = await readdir(d, { withFileTypes: true });
    for (const e of names) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (recursive) await walk(p);
        continue;
      }
      if (EXT_TYPES[extname(e.name).toLowerCase()]) out.push(p);
    }
  }
  await walk(root);
  return out.sort((a, b) => basename(a).localeCompare(basename(b), "en"));
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

function extractNoteId(note) {
  const raw = note?.id ?? note?.note_id ?? note?.noteId;
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^[0-9a-f-]{36}$/i.test(s)) return null;
  return s;
}

function sameNoteId(a, b) {
  if (a == null || b == null) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

async function main() {
  let { dir, recursive, perImage, probe } = parseArgs();
  if (process.argv.slice(2).some((a) => normOpt(a) === "--probe")) probe = true;
  if (dir && normOpt(String(dir)) === "--probe") {
    dir = "";
    probe = true;
  }
  const base = (process.env.ZENOTES_API_BASE || "https://api.zenotes.site/api").replace(/\/$/, "");
  const user = process.env.ZENOTES_USER;
  const password = process.env.ZENOTES_PASSWORD;
  if (!user || !password) {
    console.error("请设置 ZENOTES_USER 与 ZENOTES_PASSWORD。");
    process.exit(1);
  }

  if (!probe) {
    const st = await stat(dir).catch(() => null);
    if (!st || !st.isDirectory()) {
      console.error("目录不存在或不是目录:", dir);
      process.exit(1);
    }
  }

  const files = probe ? [] : await listImageFiles(dir, recursive);
  if (!probe && files.length === 0) {
    console.log("未找到可上传的图片。");
    process.exit(0);
  }
  if (perImage && probe) {
    console.error("probe 与 --per-image 不能同时用。probe 不扫目录；正式上传时再加 --per-image。");
    process.exit(1);
  }
  console.log(
    probe
      ? "probe 模式：开始登录…"
      : (perImage ? "每张一笔记，共 " : "单笔记共嵌 ") + files.length + " 张图，开始登录…",
  );

  const loginRes = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user.trim(), password }),
  });
  if (!loginRes.ok) {
    console.error("登录失败", loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const cookie = cookieFromResponse(loginRes);
  if (!cookie) {
    console.error("未收到 Set-Cookie，需 Node 20+。");
    process.exit(1);
  }
  const authHeaders = { Cookie: cookie, "Content-Type": "application/json" };

  if (!perImage) {
  const createRes = await fetch(base + "/notes", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      title: "Capture 导入 " + new Date().toISOString().slice(0, 10),
      content: "",
      color: "white",
      tags: ["capture"],
    }),
  });
  if (!createRes.ok) {
    console.error("创建笔记失败", createRes.status, await createRes.text());
    process.exit(1);
  }
  const note = await createRes.json();
  const noteId = extractNoteId(note);
  if (!noteId) {
    console.error("创建笔记无 id", note);
    process.exit(1);
  }
  const listRes = await fetch(base + "/notes", { headers: { Cookie: cookie } });
  if (listRes.ok) {
    const all = await listRes.json();
    if (Array.isArray(all) && !all.some((n) => sameNoteId(extractNoteId(n), noteId))) {
      console.warn("GET /notes 未列出刚建的笔记 id。");
    }
  }
  console.log("已创建笔记", noteId, probe ? "probe 试传…" : "开始上传…");

  if (probe) {
    const patchUrl = `${base}/notes/${encodeURIComponent(noteId)}`;
    const mediaUrl = `${base}/notes/${encodeURIComponent(noteId)}/media`;
    const patchProbe = await fetch(patchUrl, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ content: " " }),
    });
    const patchBody = await patchProbe.text();
    console.log("probe: PATCH", patchUrl, "→", patchProbe.status);
    if (!patchProbe.ok) {
      console.error("PATCH 失败:", patchBody);
      process.exit(1);
    }
    const up = await fetch(mediaUrl, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "image/png" },
      body: TINY_PNG,
    });
    const t = await up.text();
    console.log("probe: POST", mediaUrl, "→", up.status);
    if (!up.ok) {
      console.error("媒体上传失败:", t);
      console.error("若 POST 为 404 而 PATCH 为 2xx：在 worker 目录执行 npx wrangler deploy，让线上跑当前含 POST .../media 的 Worker。");
      process.exit(1);
    }
    console.log("probe 成功:", t);
    process.exit(0);
  }

  const lines = [];
  let ok = 0;
  const delayBetween = Math.max(0, Number(process.env.ZENOTES_UPLOAD_DELAY_MS) || 120);
  const patchEvery = Math.max(1, Number(process.env.ZENOTES_PATCH_EVERY) || 20);
  const total = files.length;

  async function patchContent() {
    const patchRes = await fetchWithRetry(base + "/notes/" + encodeURIComponent(noteId), {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ content: lines.join("").trim() }),
    });
    if (!patchRes.ok) {
      console.error("更新笔记失败", patchRes.status, await patchRes.text());
      process.exit(1);
    }
  }

  const onSigInt = () => {
    void (async () => {
      process.removeListener("SIGINT", onSigInt);
      if (ok <= 0) {
        process.stderr.write("已中断，尚无已上传的图可写入正文。\n");
        process.exit(130);
        return;
      }
      process.stderr.write("正在中断，先把已成功的 " + ok + " 张合并进正文…\n");
      try {
        await patchContent();
        console.log("已保存当前进度。若仍不完整，可在网页用「用已上传的图片恢复正文」或 node scripts/rebuild-note-from-r2.mjs。");
      } catch {
        return;
      }
      process.exit(0);
    })();
  };
  process.on("SIGINT", onSigInt);

  try {
  for (let i = 0; i < files.length; i++) {
    const fp = files[i];
    if (!fp) continue;
    try {
      const buf = await readFile(fp);
      if (buf.length > MAX_BYTES) {
        console.warn("跳过（>6MB）:", fp);
        continue;
      }
      const ext = extname(fp).toLowerCase();
      const ct = EXT_TYPES[ext] || "application/octet-stream";
      const up = await fetchWithRetry(`${base}/notes/${encodeURIComponent(noteId)}/media`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": ct },
        body: buf,
      });
      if (!up.ok) {
        console.warn("上传失败", fp, up.status, await up.text());
        continue;
      }
      const { id: mediaId } = await up.json();
      if (!mediaId) continue;
      const alt = basename(fp).replace(/\]/g, "");
      lines.push(`![${alt}](${NOTE_MEDIA_PREFIX}${mediaId})\n\n`);
      ok += 1;
      if (ok % patchEvery === 0) {
        await patchContent();
        console.log(`已保存进度到笔记: 当前 ${ok} 张（处理到 ${i + 1}/${total} 个文件）`);
      }
      if (ok % 25 === 0 || i + 1 === total) {
        console.log(`进度: 已成功 ${ok} 张（已处理 ${i + 1}/${total} 个文件）`);
      }
    } catch (e) {
      console.warn("上传异常，跳过该文件:", fp, e instanceof Error ? e.message : e);
      continue;
    }
    if (delayBetween > 0) await sleep(delayBetween);
  }

  await patchContent();
  console.log("完成，内嵌 " + ok + " 张。打开 https://zenotes.site 查看。");
  } finally {
    process.removeListener("SIGINT", onSigInt);
  }
  } else {
    const day = new Date().toISOString().slice(0, 10);
    let ok = 0;
    const delayBetween = Math.max(0, Number(process.env.ZENOTES_UPLOAD_DELAY_MS) || 120);
    const total = files.length;
    for (let i = 0; i < files.length; i++) {
      const fp = files[i];
      if (!fp) continue;
      const safeName = basename(fp).replace(/\]/g, "");
      const title = ("Cap " + day + " · " + safeName).slice(0, 200);
      let buf;
      try {
        buf = await readFile(fp);
      } catch (e) {
        console.warn("读文件失败，跳过:", fp, e instanceof Error ? e.message : e);
        continue;
      }
      if (buf.length > MAX_BYTES) {
        console.warn("跳过（>6MB）:", fp);
        continue;
      }
      const createOne = await fetchWithRetry(base + "/notes", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          title,
          content: "",
          color: "white",
          tags: ["capture"],
        }),
      });
      if (!createOne.ok) {
        console.warn("创建笔记失败，跳过", fp, createOne.status, await createOne.text());
        continue;
      }
      const created = await createOne.json();
      const oneId = extractNoteId(created);
      if (!oneId) {
        console.warn("创建笔记无 id，跳过", fp);
        continue;
      }
      const ext = extname(fp).toLowerCase();
      const ct = EXT_TYPES[ext] || "application/octet-stream";
      const up = await fetchWithRetry(`${base}/notes/${encodeURIComponent(oneId)}/media`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": ct },
        body: buf,
      });
      if (!up.ok) {
        console.warn("上传媒体失败，已有空笔记可删", oneId, fp, up.status, await up.text());
        continue;
      }
      const { id: mediaId } = await up.json();
      if (!mediaId) {
        console.warn("无 mediaId", fp);
        continue;
      }
      const alt = safeName;
      const bodyMd = `![${alt}](${NOTE_MEDIA_PREFIX}${mediaId})\n`;
      const patchRes = await fetchWithRetry(base + "/notes/" + encodeURIComponent(oneId), {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ content: bodyMd }),
      });
      if (!patchRes.ok) {
        console.warn("写入正文失败", oneId, patchRes.status, await patchRes.text());
        continue;
      }
      ok += 1;
      if (ok % 10 === 0 || i + 1 === total) {
        console.log(`进度: 已建 ${ok} 条含图笔记（${i + 1}/${total} 个文件）`);
      }
      if (delayBetween > 0) await sleep(delayBetween);
    }
    console.log("完成，每张一笔记，共 " + ok + " 条。打开 https://zenotes.site 在列表/网格中查看。");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
