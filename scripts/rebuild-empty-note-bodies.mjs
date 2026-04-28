#!/usr/bin/env node
/**
 * 对「正文字符串为空」的笔记逐条尝试 POST /notes/:id/rebuild-from-r2-media
 *（R2 里已有图但 body.json 未合并时，列表上会一直显示「无正文」）
 *
 *   export ZENOTES_API_BASE=http://127.0.0.1:8787/api
 *   export ZENOTES_USER=…  ZENOTES_PASSWORD=…
 *   node scripts/rebuild-empty-note-bodies.mjs
 */
import process from "node:process";

function baseNorm(b) {
  return String(b || "http://127.0.0.1:8787/api").replace(/\/$/, "");
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

async function main() {
  const base = baseNorm(process.env.ZENOTES_API_BASE);
  const user = process.env.ZENOTES_USER;
  const pass = process.env.ZENOTES_PASSWORD;
  if (!user || !pass) {
    console.error("请设置 ZENOTES_USER 与 ZENOTES_PASSWORD");
    process.exit(1);
  }
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user.trim(), password: pass }),
  });
  if (!login.ok) {
    console.error("登录失败", await login.text());
    process.exit(1);
  }
  const cookie = cookieFromResponse(login);
  if (!cookie) {
    console.error("无 Set-Cookie，需 Node 20+");
    process.exit(1);
  }
  const c = { Cookie: cookie, "Content-Type": "application/json" };

  const res = await fetch(`${base}/notes`, { headers: { Cookie: cookie } });
  if (!res.ok) {
    console.error("GET /notes 失败", await res.text());
    process.exit(1);
  }
  const list = await res.json();
  if (!Array.isArray(list)) {
    console.error("非数组", list);
    process.exit(1);
  }
  const empty = list.filter((n) => !String(n.content ?? "").trim());
  console.log("共", list.length, "条，其中正文字面量为空", empty.length, "条，尝试从 R2 恢复…");

  let ok = 0;
  let fail = 0;
  for (const n of empty) {
    const id = n.id;
    const r = await fetch(`${base}/notes/${encodeURIComponent(id)}/rebuild-from-r2-media`, {
      method: "POST",
      headers: c,
      body: "{}",
    });
    const t = await r.text();
    if (r.ok) {
      const j = JSON.parse(t);
      const count = j.imageCount ?? "?";
      console.log("OK", id, "→", count, "张", n.title || "");
      ok += 1;
    } else {
      if (r.status === 400 && /no_media|no_media_objects/i.test(t)) {
        console.log("skip（无 R2 图）", id, n.title || "");
      } else {
        console.warn("fail", r.status, id, t);
        fail += 1;
      }
    }
  }
  console.log("完成：恢复", ok, "条；失败", fail, "条；本无可恢复媒体的已跳过。刷新 http://localhost:8080 。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
