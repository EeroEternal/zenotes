#!/usr/bin/env node
/**
 * 清除本地环境的所有笔记（保留 R2 图片）
 * 用法：node scripts/clear-all-notes.mjs
 */

const BASE = "http://127.0.0.1:8787/api";

async function main() {
  // 1. 登录
  console.log("登录中...");
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.ZENOTES_USER || "lipi",
      password: process.env.ZENOTES_PASSWORD || "",
    }),
  });

  if (!loginRes.ok) {
    console.error("登录失败", await loginRes.text());
    process.exit(1);
  }

  const cookie = loginRes.headers.get("set-cookie") || "";
  const headers = { Cookie: cookie };

  // 2. 获取所有笔记
  console.log("获取笔记列表...");
  const listRes = await fetch(`${BASE}/notes`, { headers });
  if (!listRes.ok) {
    console.error("获取笔记失败", await listRes.text());
    process.exit(1);
  }

  const notes = await listRes.json();
  console.log(`共 ${notes.length} 条笔记`);

  if (notes.length === 0) {
    console.log("没有笔记需要删除");
    process.exit(0);
  }

  // 3. 删除每条笔记
  let ok = 0;
  for (const note of notes) {
    const id = note.id;
    const delRes = await fetch(`${BASE}/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    if (delRes.ok || delRes.status === 204) {
      ok++;
      console.log(`✓ 已删除 ${ok}/${notes.length}: ${note.title || id}`);
    } else {
      console.warn(`✗ 删除失败 ${id}: ${delRes.status}`);
    }
  }

  console.log(`\n完成：已删除 ${ok}/${notes.length} 条笔记`);
  console.log("R2 中的图片文件已保留");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
