#!/usr/bin/env node
/**
 * 把「一条大笔记里多张 zenotes:media: 图」拆成「每条笔记一图」：按当前 API 经 GET 原图、POST 新笔记、再上传，
 * 不依赖本机原文件。大笔记可事后删除。
 *
 * 以后新传请用: node scripts/upload-capture-to-zenotes.mjs --per-image <目录>（一条笔记只含一张图）
 *
 * 用法:
 *   export ZENOTES_API_BASE=https://api.zenotes.site/api
 *   export ZENOTES_USER=…
 *   read -s ZENOTES_PASSWORD; export ZENOTES_PASSWORD
 *   node scripts/split-capture-note-to-per-image.mjs 那条大笔记的UUID
 */

const NOTE_RE = /!\[([^\]]*)\]\((?:mynotes|zenotes):media:([0-9a-f-]{36})\)/gi;
const NOTE_MEDIA_PREFIX = "zenotes:media:";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const sourceId = process.argv[2]?.trim();
  if (!sourceId) {
    console.error("用法: node scripts/split-capture-note-to-per-image.mjs <源笔记UUID>");
    process.exit(1);
  }

  const base = (process.env.ZENOTES_API_BASE || "https://api.zenotes.site/api").replace(/\/$/, "");
  const user = process.env.ZENOTES_USER;
  const password = process.env.ZENOTES_PASSWORD;
  if (!user || !password) {
    console.error("请设置 ZENOTES_USER 与 ZENOTES_PASSWORD");
    process.exit(1);
  }

  const delayMs = Math.max(0, Number(process.env.ZENOTES_SPLIT_DELAY_MS) || 80);

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
  const authHeaders = { Cookie: cookie, "Content-Type": "application/json" };
  const c = { Cookie: cookie };

  const noteRes = await fetch(`${base}/notes/${encodeURIComponent(sourceId)}`, { headers: c });
  if (!noteRes.ok) {
    console.error("GET 单条笔记失败，请确认已部署含 GET /api/notes/:id 的 Worker", noteRes.status, await noteRes.text());
    process.exit(1);
  }
  const note = await noteRes.json();
  const content = String(note?.content ?? "");
  const fromTitle = (note?.title && String(note.title)) || "Capture 拆分";
  const day = new Date().toISOString().slice(0, 10);

  const found = [];
  let m;
  const re = new RegExp(NOTE_RE.source, NOTE_RE.flags);
  while ((m = re.exec(content)) !== null) {
    found.push({ alt: (m[1] && m[1].trim()) || "image", mediaId: m[2] });
  }
  if (found.length === 0) {
    console.error("正文中没有 zenotes:media: 可拆分");
    process.exit(1);
  }
  console.log("将拆成", found.length, "条单图笔记。源笔记可稍后手动删:", sourceId);

  let ok = 0;
  for (let i = 0; i < found.length; i++) {
    const { mediaId, alt } = found[i];
    const fromUrl = `${base}/notes/${encodeURIComponent(sourceId)}/media/${encodeURIComponent(mediaId)}`;
    const getBin = await fetch(fromUrl, { headers: c });
    if (!getBin.ok) {
      console.warn("跳过，无法读原图", mediaId, getBin.status);
      continue;
    }
    const buf = new Uint8Array(await getBin.arrayBuffer());
    const ct = (getBin.headers.get("Content-Type") || "application/octet-stream").split(";")[0].trim() || "application/octet-stream";

    const create = await fetch(`${base}/notes`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        title: `Cap ${day} #${i + 1} · ${fromTitle}`.slice(0, 200),
        content: "",
        color: "white",
        tags: ["capture", "split"],
      }),
    });
    if (!create.ok) {
      console.warn("创建笔记失败", create.status, await create.text());
      continue;
    }
    const newNote = await create.json();
    const newId = newNote?.id;
    if (!newId) continue;

    const up = await fetch(`${base}/notes/${encodeURIComponent(newId)}/media`, {
      method: "POST",
      headers: { ...c, "Content-Type": ct },
      body: buf,
    });
    if (!up.ok) {
      console.warn("上传到新笔记失败，可删空笔记", newId, up.status, await up.text());
      continue;
    }
    const { id: newMediaId } = await up.json();
    if (!newMediaId) continue;
    const safeAlt = alt.replace(/\]/g, "");
    const bodyMd = `![${safeAlt}](${NOTE_MEDIA_PREFIX}${newMediaId})`;
    const patch = await fetch(`${base}/notes/${encodeURIComponent(newId)}`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ content: bodyMd }),
    });
    if (!patch.ok) {
      console.warn("PATCH 新笔记失败", newId, await patch.text());
      continue;
    }
    ok += 1;
    if (ok % 10 === 0) console.log("已建", ok, "/", found.length);
    if (delayMs) await sleep(delayMs);
  }
  console.log("完成: 新增强图笔记", ok, "条。源笔记仍在，请自删:", sourceId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
