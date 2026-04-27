#!/usr/bin/env node
/**
 * 不重新上传：对已存在 R2 媒体（userId/noteId/media/uuid）的笔记，重写正文为 zenotes:media: Markdown。
 * 需先部署含 POST /api/notes/:id/rebuild-from-r2-media 的 Worker。
 *
 *   export ZENOTES_API_BASE=https://api.zenotes.site/api
 *   export ZENOTES_USER=lipi
 *   read -s ZENOTES_PASSWORD; export ZENOTES_PASSWORD
 *
 * 只修一条（把下面 UUID 换成你的笔记 id）:
 *   node scripts/rebuild-note-from-r2.mjs 8bb3efab-e954-4d1d-8d62-387e5e927779
 *
 * 修所有带 capture 标签或标题以「Capture 导入」开头的笔记:
 *   node scripts/rebuild-note-from-r2.mjs --all-capture
 */

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

async function main() {
  const base = (process.env.ZENOTES_API_BASE || "https://api.zenotes.site/api").replace(/\/$/, "");
  const user = process.env.ZENOTES_USER;
  const password = process.env.ZENOTES_PASSWORD;
  if (!user || !password) {
    console.error("请设置 ZENOTES_USER 与 ZENOTES_PASSWORD");
    process.exit(1);
  }

  const arg = process.argv[2];
  if (!arg) {
    console.error("用法: node scripts/rebuild-note-from-r2.mjs <笔记UUID> | --all-capture");
    process.exit(1);
  }

  const loginRes = await fetch(base + "/auth/login", {
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
  const h = { Cookie: cookie, "Content-Type": "application/json" };

  /** @type {string[]} */
  let ids = [];
  if (arg === "--all-capture") {
    const lr = await fetch(base + "/notes", { headers: { Cookie: cookie } });
    if (!lr.ok) {
      console.error("GET /notes 失败", await lr.text());
      process.exit(1);
    }
    const notes = await lr.json();
    if (!Array.isArray(notes)) {
      console.error("异常响应");
      process.exit(1);
    }
    for (const n of notes) {
      const title = (n.title && String(n.title)) || "";
      const tags = Array.isArray(n.tags) ? n.tags : [];
      if (tags.includes("capture") || title.startsWith("Capture 导入")) {
        ids.push(String(n.id));
      }
    }
    ids = [...new Set(ids)];
    if (ids.length === 0) {
      console.log("没有匹配的笔记（capture 标签或 Capture 导入 标题）。");
      process.exit(0);
    }
    console.log("将处理", ids.length, "条笔记:", ids.join(", "));
  } else {
    ids = [arg.trim()];
  }

  for (const noteId of ids) {
    const url = `${base}/notes/${encodeURIComponent(noteId)}/rebuild-from-r2-media`;
    const res = await fetch(url, { method: "POST", headers: h, body: "{}" });
    const t = await res.text();
    if (!res.ok) {
      console.error("失败", noteId, res.status, t);
      continue;
    }
    console.log("成功", noteId, t);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
