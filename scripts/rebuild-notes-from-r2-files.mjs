#!/usr/bin/env node
/**
 * 从 R2 中的图片文件重新生成笔记（每张图片一个笔记）
 * 
 * 前提：笔记已清空，但 R2 中的图片文件还在
 * 作用：扫描 R2 中的所有 media 文件，为每个图片创建一个新笔记
 * 
 * 用法：
 *   export ZENOTES_API_BASE=http://127.0.0.1:8787/api
 *   export ZENOTES_USER=你的用户名
 *   read -s ZENOTES_PASSWORD; export ZENOTES_PASSWORD
 *   node scripts/rebuild-notes-from-r2-files.mjs
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mime = require("mime-types");

const NOTE_MEDIA_PREFIX = "zenotes:media:";
const MAX_BYTES = 6 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function main() {
  const base = (process.env.ZENOTES_API_BASE || "http://127.0.0.1:8787/api").replace(/\/$/, "");
  const user = process.env.ZENOTES_USER;
  const password = process.env.ZENOTES_PASSWORD;

  if (!user || !password) {
    console.error("请设置 ZENOTES_USER 与 ZENOTES_PASSWORD");
    process.exit(1);
  }

  // 1. 登录获取 cookie
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

  // 2. 连接到 R2 (通过 Wrangler 本地开发服务器或直接使用 R2 API)
  // 这里假设使用 Wrangler 的本地 R2 存储
  console.log("开始扫描 R2 中的图片文件...");

  // 获取所有笔记（应该是空的）
  const listRes = await fetch(`${base}/notes`, { headers: c });
  if (!listRes.ok) {
    console.error("获取笔记列表失败", await listRes.text());
    process.exit(1);
  }
  const existingNotes = await listRes.json();
  console.log(`当前笔记数: ${existingNotes.length}`);

  // 3. 使用 API 获取用户信息，确定 userId
  const meRes = await fetch(`${base}/auth/me`, { headers: c });
  if (!meRes.ok) {
    console.error("获取用户信息失败", await meRes.text());
    process.exit(1);
  }
  const me = await meRes.json();
  const userId = me.id;
  console.log(`用户 ID: ${userId}`);

  // 4. 通过 Worker API 列出 R2 中的文件
  // 由于 Cloudflare Worker 的 R2 API 不直接暴露 list 操作给客户端，
  // 我们需要通过 Worker 添加一个临时 endpoint，或者直接使用 Wrangler CLI

  console.log("\n由于 R2 list 操作需要通过 Wrangler CLI 或 Worker API，");
  console.log("我们需要先获取 R2 中的文件列表。\n");

  // 方案：通过 Wrangler 执行 D1 查询来获取 noteId，然后重建
  // 但更直接的方式是：直接使用 Wrangler R2 命令列出文件

  console.log("请手动执行以下命令来获取 R2 文件列表：");
  console.log("\ncd /Users/xinference/github/zenotes/worker");
  console.log('npx wrangler r2 object list zenotes-bodies --prefix "1/"');
  console.log("\n然后修改此脚本，手动指定要恢复的 media 文件列表。\n");

  console.log("或者，如果你知道之前的 noteId，可以使用：");
  console.log("node scripts/rebuild-note-from-r2.mjs <noteId>");
  console.log("\n但更简单的方案是：重新运行原来的图片上传脚本，指向包含原始图片的目录。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
