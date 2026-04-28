#!/usr/bin/env node
/**
 * 从 R2 中的现有图片直接创建笔记（每张图片一个笔记）
 * 不重新上传，而是：
 *   1. 列出 R2 中的所有 media 文件
 *   2. 为每个 media 创建一个新笔记
 *   3. 从 R2 下载图片，上传到新笔记（或使用 R2 copy）
 *
 * 用法：
 *   export ZENOTES_API_BASE=http://127.0.0.1:8787/api
 *   export ZENOTES_USER=你的用户名
 *   read -s ZENOTES_PASSWORD; export ZENOTES_PASSWORD
 *
 *   # 如果需要从远程 R2 读取（而不是本地）：
 *   export R2_ACCOUNT_ID=...
 *   export R2_ACCESS_KEY_ID=...
 *   export R2_SECRET_ACCESS_KEY=...
 *   export R2_BUCKET=zenotes-bodies
 *
 *   node scripts/rebuild-notes-from-r2.mjs
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mime = require("mime-types");

const NOTE_MEDIA_PREFIX = "zenotes:media:";
const MAX_BYTES = 6 * 1024 * 1024;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryableNetworkError(err) {
  const m = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? "");
  return /ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|EPIPE|socket|timeout|network/i.test(m);
}

async function withRetry(fn, label, max = 5) {
  let lastErr;
  for (let i = 1; i <= max; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryableNetworkError(e) || i === max) throw e;
      const wait = Math.min(5000, 300 * 2 ** (i - 1));
      console.warn(`  ${label} 网络异常，${wait}ms 后重试 (${i}/${max})`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function cookieFromResponse(res) {
  const h = res.headers;
  if (typeof h.getSetCookie === "function") {
    const list = h.getSetCookie();
    if (list?.length) {
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

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sourceMediaIdFromR2Key(key) {
  const name = String(key || "").split("/").pop() || "";
  const m = name.match(UUID_RE);
  return m ? m[0].toLowerCase() : null;
}

function sourceMediaIdFromNote(note) {
  const title = String(note?.title || "");
  const fromTitle = title.match(UUID_RE);
  if (fromTitle) return fromTitle[0].toLowerCase();
  const content = String(note?.content || "");
  const fromAlt = content.match(/!\[([^\]]+)\]\((?:mynotes|zenotes):media:[0-9a-f-]{36}\)/i);
  if (!fromAlt) return null;
  const m = String(fromAlt[1] || "").match(UUID_RE);
  return m ? m[0].toLowerCase() : null;
}

async function listAllNotes(base, cookie) {
  const out = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const r = await fetch(`${base}/notes?page=${page}&pageSize=${pageSize}`, { headers: { Cookie: cookie } });
    if (!r.ok) throw new Error(`获取笔记失败: ${r.status} ${await r.text()}`);
    const j = await r.json();
    const notes = Array.isArray(j?.notes) ? j.notes : Array.isArray(j) ? j : [];
    out.push(...notes);
    const totalPages = Number(j?.pagination?.totalPages || 1);
    if (page >= totalPages || notes.length === 0) break;
    page += 1;
  }
  return out;
}

async function main() {
  const base = (process.env.ZENOTES_API_BASE || "http://127.0.0.1:8787/api").replace(/\/$/, "");
  const user = process.env.ZENOTES_USER;
  const password = process.env.ZENOTES_PASSWORD;

  if (!user || !password) {
    console.error("请设置 ZENOTES_USER 与 ZENOTES_PASSWORD");
    process.exit(1);
  }

  // 1. 登录
  console.log("登录中...");
  const loginRes = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user.trim(), password }),
  });

  if (!loginRes.ok) {
    console.error("登录失败", await loginRes.text());
    process.exit(1);
  }

  const cookie = cookieFromResponse(loginRes);
  if (!cookie) {
    console.error("无 Set-Cookie");
    process.exit(1);
  }

  const authHeaders = { Cookie: cookie, "Content-Type": "application/json" };
  const c = { Cookie: cookie };

  // 2. 连接到 R2
  const useRemoteR2 = process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY;
  
  let s3Client;
  let bucketName = "zenotes-bodies";

  if (useRemoteR2) {
    console.log("使用远程 R2...");
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      maxAttempts: 5,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    bucketName = process.env.R2_BUCKET || "zenotes-bodies";
  } else {
    console.log("使用本地 R2 (Minio)...");
    // 本地 Wrangler 使用 Minio，默认端口 9253
    s3Client = new S3Client({
      region: "us-east-1",
      endpoint: "http://127.0.0.1:9253",
      credentials: {
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
      },
      forcePathStyle: true,
    });
  }

  // 3. 列出 R2 中的所有 media 文件
  console.log("扫描 R2 中的图片文件...");
  const mediaFiles = [];
  const r2SourceIdSet = new Set();
  let continuationToken;

  do {
    const listCmd = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: "1/",  // 假设 userId 是 1
      ContinuationToken: continuationToken,
    });

    const listRes = await withRetry(() => s3Client.send(listCmd), "列举 R2 对象");
    
    for (const obj of listRes.Contents || []) {
      if (obj.Key?.includes("/media/")) {
        mediaFiles.push(obj.Key);
        const sid = sourceMediaIdFromR2Key(obj.Key);
        if (sid) r2SourceIdSet.add(sid);
      }
    }

    continuationToken = listRes.NextContinuationToken;
  } while (continuationToken);

  console.log(`找到 ${mediaFiles.length} 个图片文件`);

  if (mediaFiles.length === 0) {
    console.log("没有找到图片文件。请检查：");
    console.log("  1. userId 是否正确（当前：1）");
    console.log("  2. R2 bucket 名称是否正确（当前：zenotes-bodies）");
    process.exit(0);
  }

  // 4. 读取现有笔记，避免重复导入
  const allNotes = await listAllNotes(base, cookie);
  const importedNotes = allNotes.filter((n) => Array.isArray(n?.tags) && n.tags.includes("from-r2"));
  const importedBySource = new Map();
  for (const n of importedNotes) {
    const sid = sourceMediaIdFromNote(n);
    if (!sid) continue;
    const arr = importedBySource.get(sid) || [];
    arr.push(n);
    importedBySource.set(sid, arr);
  }

  const existingSourceIds = new Set(importedBySource.keys());
  const duplicateSourceIds = [...importedBySource.entries()].filter(([, arr]) => arr.length > 1).map(([k]) => k);
  const missingSourceIds = [...r2SourceIdSet].filter((sid) => !existingSourceIds.has(sid));

  console.log(
    `本地已存在 from-r2 笔记 ${importedNotes.length} 条，覆盖来源图 ${existingSourceIds.size} 张；` +
      `R2 图 ${r2SourceIdSet.size} 张；待新增 ${missingSourceIds.length} 张。`,
  );
  if (duplicateSourceIds.length > 0) {
    console.warn(`检测到重复来源图 ${duplicateSourceIds.length} 张（将跳过，不再重复导入）`);
  }

  // 5. 为每个尚未存在的图片创建新笔记
  let ok = 0;
  let skippedExisting = 0;
  const delayMs = Math.max(0, Number(process.env.ZENOTES_DELAY_MS) || 100);

  for (let i = 0; i < mediaFiles.length; i++) {
    const r2Key = mediaFiles[i];
    if (!r2Key) continue;
    const sourceId = sourceMediaIdFromR2Key(r2Key);
    if (sourceId && existingSourceIds.has(sourceId)) {
      skippedExisting += 1;
      continue;
    }

    try {
      // 从 R2 下载图片
      console.log(`[${i + 1}/${mediaFiles.length}] 处理: ${r2Key}`);
      
      const getCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
      });
      const getRes = await withRetry(() => s3Client.send(getCmd), "读取 R2 对象");
      
      if (!getRes.Body) {
        console.warn("  跳过：无法读取文件");
        continue;
      }

      const buf = await streamToBuffer(getRes.Body);
      if (buf.length > MAX_BYTES) {
        console.warn("  跳过：文件过大（>6MB）");
        continue;
      }

      const contentType = getRes.ContentType || mime.lookup(r2Key) || "application/octet-stream";

      // 创建新笔记
      const day = new Date().toISOString().slice(0, 10);
      const filename = r2Key.split("/").pop() || `image-${i + 1}`;
      const title = `Cap ${day} #${i + 1} · ${filename}`.slice(0, 200);

      const createRes = await fetch(`${base}/notes`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          title,
          content: "",
          color: "white",
          tags: ["capture", "from-r2"],
        }),
      });

      if (!createRes.ok) {
        console.warn(`  创建笔记失败: ${createRes.status}`);
        continue;
      }

      const newNote = await createRes.json();
      const newNoteId = newNote?.id;

      if (!newNoteId) {
        console.warn("  创建笔记无 ID");
        continue;
      }

      // 上传图片到新笔记
      const uploadRes = await fetch(`${base}/notes/${encodeURIComponent(newNoteId)}/media`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": contentType },
        body: buf,
      });

      if (!uploadRes.ok) {
        console.warn(`  上传图片失败: ${uploadRes.status}`);
        continue;
      }

      const { id: newMediaId } = await uploadRes.json();
      if (!newMediaId) {
        console.warn("  上传无 mediaId");
        continue;
      }

      // 更新笔记内容
      const bodyMd = `![${filename}](${NOTE_MEDIA_PREFIX}${newMediaId})`;
      const patchRes = await fetch(`${base}/notes/${encodeURIComponent(newNoteId)}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ content: bodyMd }),
      });

      if (!patchRes.ok) {
        console.warn(`  更新笔记失败: ${patchRes.status}`);
        continue;
      }

      ok++;
      if (sourceId) existingSourceIds.add(sourceId);
      console.log(`  ✓ 已创建笔记: ${newNoteId}`);

      if (delayMs > 0 && ok % 10 === 0) {
        console.log(`  进度: ${ok}/${mediaFiles.length}`);
        await sleep(delayMs);
      }
    } catch (e) {
      console.warn(`  处理失败: ${e instanceof Error ? e.message : e}`);
      continue;
    }
  }

  console.log(`\n完成：新增 ${ok} 条，已存在跳过 ${skippedExisting} 条，总 R2 图片 ${mediaFiles.length} 条`);
  console.log("打开 http://localhost:8080 查看");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
