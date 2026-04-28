#!/usr/bin/env node
/**
 * 把「一条大笔记里多张 zenotes:media: 图」拆成「每条笔记一图」：按当前 API 经 GET 原图、POST 新笔记、再上传，
 * 不依赖本机原文件。大笔记可事后删除。
 *
 * 以后新传: node scripts/upload-capture-to-zenotes.mjs <目录> 默认一图一笔记；多图同条加 --all-in-one
 *
 * 用法:
 *   export ZENOTES_API_BASE=https://api.zenotes.site/api
 *   export ZENOTES_USER=…
 *   read -s ZENOTES_PASSWORD; export ZENOTES_PASSWORD
 *   node scripts/split-capture-note-to-per-image.mjs 那条大笔记的UUID
 *
 * 或按标题子串在列表里找第一条（如 4-26 那天的 Capture）:
 *   node scripts/split-capture-note-to-per-image.mjs --title-includes=4-26
 *
 * 若正文里还没有 ![] 占位、但 R2 里已有图，先让服务端按 R2 重写正文再拆:
 *   node scripts/split-capture-note-to-per-image.mjs --rebuild-first --title-includes=4-26
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

function parseArgs(argv) {
  let sourceId;
  let titleIncludes;
  let rebuildFirst = false;
  for (const a of argv) {
    if (a === "--rebuild-first") {
      rebuildFirst = true;
      continue;
    }
    if (a.startsWith("--title-includes=")) {
      titleIncludes = a.slice(17).trim();
      continue;
    }
    const t = a.trim();
    if (t && !t.startsWith("-") && /^[0-9a-f-]{36}$/i.test(t)) {
      sourceId = t;
    }
  }
  return { sourceId, titleIncludes, rebuildFirst };
}

async function main() {
  const { sourceId: idArg, titleIncludes, rebuildFirst } = parseArgs(process.argv.slice(2));

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

  let sourceId = idArg;
  if (!sourceId && titleIncludes) {
    const listRes = await fetch(`${base}/notes`, { headers: c });
    if (!listRes.ok) {
      console.error("GET /notes 失败", await listRes.text());
      process.exit(1);
    }
    const list = await listRes.json();
    const found = Array.isArray(list) ? list.find((n) => String(n?.title ?? "").includes(titleIncludes)) : null;
    if (!found?.id) {
      console.error("未找到标题含「" + titleIncludes + "」的笔记");
      process.exit(1);
    }
    sourceId = found.id;
    console.log("选用笔记", sourceId, "标题:", found.title);
  }

  if (!sourceId) {
    console.error(
      "请提供源笔记 UUID，或加 --title-includes=子串 自动匹配。例: node ... --rebuild-first --title-includes=4-26",
    );
    process.exit(1);
  }

  const noteRes = await fetch(`${base}/notes/${encodeURIComponent(sourceId)}`, { headers: c });
  if (!noteRes.ok) {
    console.error("GET 单条笔记失败，请确认已部署含 GET /api/notes/:id 的 Worker", noteRes.status, await noteRes.text());
    process.exit(1);
  }
  let note = await noteRes.json();
  if (rebuildFirst) {
    const rb = await fetch(`${base}/notes/${encodeURIComponent(sourceId)}/rebuild-from-r2-media`, {
      method: "POST",
      headers: authHeaders,
      body: "{}",
    });
    const rbText = await rb.text();
    if (rb.ok) {
      const j = JSON.parse(rbText);
      console.log("已从 R2 生成正文, imageCount:", j.imageCount);
      const again = await fetch(`${base}/notes/${encodeURIComponent(sourceId)}`, { headers: c });
      if (again.ok) note = await again.json();
    } else {
      console.warn("rebuild 未成功，继续用当前正文。状态:", rb.status, rbText);
    }
  }

  let content = String(note?.content ?? "");
  const fromTitle = (note?.title && String(note.title)) || "Capture 拆分";
  const day = new Date().toISOString().slice(0, 10);

  const tryParse = (text) => {
    const out = [];
    const re2 = new RegExp(NOTE_RE.source, NOTE_RE.flags);
    let m;
    while ((m = re2.exec(text)) !== null) {
      out.push({ alt: (m[1] && m[1].trim()) || "image", mediaId: m[2] });
    }
    return out;
  };

  let found = tryParse(content);
  if (found.length === 0) {
    console.error("正文中没有 zenotes:media: 可拆。可尝试: 先运行 node scripts/rebuild-empty-note-bodies.mjs 再拆；或本命令加 --rebuild-first。");
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
