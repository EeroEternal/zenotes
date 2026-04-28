#!/usr/bin/env node
/**
 * 把「线上/任意远端」已登录用户下的全部笔记 + 内嵌 R2 图片，复制到「本地或另一环境」的同一账号中。
 * 适本地 Worker 为空的场景：在网页先注册好本地用户（或已有账号），再执行本脚本。
 *
 * 需 Node 20+（Set-Cookie / fetch 行为）。
 *
 * 例：线上 -> 本机 127.0.0.1:8787（Vite 代理 /api 时仍建议直连 Worker 口，与 worker/README 一致）
 *
 *   export PULL_SOURCE_API_BASE=https://api.zenotes.site/api
 *   export PULL_SOURCE_USER=你的线上用户名
 *   export PULL_SOURCE_PASSWORD=xx
 *   export PULL_DEST_API_BASE=http://127.0.0.1:8787/api
 *   export PULL_DEST_USER=本地同名或另一用户
 *   export PULL_DEST_PASSWORD=xx
 *   node scripts/pull-notes-from-remote.mjs
 *
 * 环境变量可简写：与 upload 脚本类似也可用 ZENOTES_USER（仅当源/目用户名相同时分别省略 *_USER）。
 *
 * 源或目标有已有笔记时加 --force 才继续，避免误重复导入。
 */
import process from "node:process";

const EMBED_RE = /!\[([^\]]*)\]\((?:mynotes|zenotes):media:([0-9a-f-]{36})\)/gi;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseNorm(u) {
  return String(u || "")
    .replace(/\/$/, "");
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

async function apiLogin(base, username, password) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  if (!res.ok) {
    throw new Error(`login ${base} → ${res.status} ${await res.text()}`);
  }
  const c = cookieFromResponse(res);
  if (!c) throw new Error("未收到 Set-Cookie，需 Node 20+。");
  return c;
}

/**
 * 返回 Map：小写 uuid -> 正文中出现过的形式（供 GET 路径用，与线上 key 一致）
 */
function extractMediaIdMap(content) {
  const byLower = new Map();
  const re = new RegExp(EMBED_RE.source, EMBED_RE.flags);
  let m;
  while ((m = re.exec(String(content || ""))) !== null) {
    const exact = m[2];
    const k = exact.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, exact);
  }
  return byLower;
}

function replaceWithNewIds(content, idMapByLower) {
  return String(content || "").replace(
    new RegExp(EMBED_RE.source, EMBED_RE.flags),
    (full, alt, uuidInBody) => {
      const k = uuidInBody.toLowerCase();
      const newId = idMapByLower.get(k);
      if (!newId) return full;
      return `![${alt}](zenotes:media:${newId})`;
    },
  );
}

async function fetchWithRetry(url, init, label, max = 6) {
  let lastErr;
  for (let i = 1; i <= max; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 || res.status === 429) {
        const txt = await res.text();
        if (i === max) {
          throw new Error(`${label} ${res.status} ${txt.slice(0, 200)}`);
        }
        const wait = Math.min(8000, 250 * 2 ** (i - 1));
        console.warn(`${label} ${res.status}，${wait}ms 后重试 (${i}/${max})`);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i === max) break;
      const wait = Math.min(8000, 250 * 2 ** (i - 1));
      console.warn(`${label} 网络异常，${wait}ms 后重试 (${i}/${max})`);
      await sleep(wait);
    }
  }
  throw lastErr || new Error(`${label} failed`);
}

async function getJson(url, cookie) {
  const res = await fetchWithRetry(url, { headers: { Cookie: cookie } }, "GET JSON");
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

function normalizeNotesPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.notes)) return payload.notes;
  return [];
}

async function listAllNotes(base, cookie) {
  const out = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const payload = await getJson(`${base}/notes?page=${page}&pageSize=${pageSize}`, cookie);
    const notes = normalizeNotesPayload(payload);
    out.push(...notes);
    const totalPages = Number(payload?.pagination?.totalPages || 1);
    if (page >= totalPages || notes.length === 0) break;
    page += 1;
  }
  return out;
}

async function getBuf(url, cookie) {
  const res = await fetchWithRetry(url, { headers: { Cookie: cookie } }, "GET media");
  if (!res.ok) throw new Error(`GET media ${url} → ${res.status} ${await res.text()}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const ct = res.headers.get("content-type") || "application/octet-stream";
  return { buf, contentType: ct };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  return { force };
}

async function main() {
  const { force } = parseArgs();
  const srcBase = baseNorm(process.env.PULL_SOURCE_API_BASE || process.env.ZENOTES_API_BASE);
  const srcUser = process.env.PULL_SOURCE_USER || process.env.ZENOTES_USER;
  const srcPass = process.env.PULL_SOURCE_PASSWORD || process.env.ZENOTES_PASSWORD;
  const destBase = baseNorm(
    process.env.PULL_DEST_API_BASE || "http://127.0.0.1:8787/api",
  );
  const destUser = process.env.PULL_DEST_USER || process.env.ZENOTES_USER;
  const destPass = process.env.PULL_DEST_PASSWORD || process.env.ZENOTES_PASSWORD;

  if (!srcBase || !srcUser || !srcPass) {
    console.error(
      "请设置 PULL_SOURCE_API_BASE（或 ZENOTES_API_BASE）、PULL_SOURCE_USER（或 ZENOTES_USER）与 PULL_SOURCE_PASSWORD。",
    );
    process.exit(1);
  }
  if (!destUser || !destPass) {
    console.error("请设置 PULL_DEST_USER / PULL_DEST_PASSWORD（或与源共用 ZENOTES_USER + ZENOTES_PASSWORD）。");
    process.exit(1);
  }

  console.log("源:", srcBase, "用户:", srcUser);
  console.log("目标:", destBase, "用户:", destUser);

  const srcCookie = await apiLogin(srcBase, srcUser, srcPass);
  const destCookie = await apiLogin(destBase, destUser, destPass);

  const destExisting = await listAllNotes(destBase, destCookie);
  if (destExisting.length > 0 && !force) {
    console.error(
      `目标环境已有 ${destExisting.length} 条笔记。若仍要合并导入，请加上 --force（可能产生重复数据）。`,
    );
    process.exit(1);
  }

  const notes = await listAllNotes(srcBase, srcCookie);
  if (notes.length === 0) {
    console.log("源无笔记，退出。");
    return;
  }

  const concurrency = Math.max(1, Math.min(8, Number(process.env.PULL_CONCURRENCY) || 4));
  console.log("并发:", concurrency);

  let nextIndex = 0;
  let ok = 0;
  const results = new Array(notes.length);

  async function processOne(n) {
    const sid = n.id;
    const oldContent = n.content ?? "";
    const refMap = extractMediaIdMap(oldContent);
    const createRes = await fetchWithRetry(
      `${destBase}/notes`,
      {
        method: "POST",
        headers: { Cookie: destCookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: n.title,
          content: "",
          color: n.color || "white",
          tags: Array.isArray(n.tags) ? n.tags : [],
        }),
      },
      "POST create note",
    );
    if (!createRes.ok) {
      throw new Error(`创建失败 ${createRes.status} ${await createRes.text()}`);
    }
    const created = await createRes.json();
    const did = created.id;
    if (!did) {
      throw new Error(`创建响应无 id ${JSON.stringify(created)}`);
    }

    const idMapByLower = new Map();
    for (const [low, exactId] of refMap) {
      const { buf, contentType } = await getBuf(
        `${srcBase}/notes/${encodeURIComponent(sid)}/media/${encodeURIComponent(exactId)}`,
        srcCookie,
      );
      const up = await fetchWithRetry(
        `${destBase}/notes/${encodeURIComponent(did)}/media`,
        {
          method: "POST",
          headers: { Cookie: destCookie, "Content-Type": contentType },
          body: buf,
        },
        "POST media",
      );
      if (!up.ok) {
        throw new Error(`上传媒体失败 ${exactId} ${up.status} ${await up.text()}`);
      }
      const { id: newId } = await up.json();
      idMapByLower.set(low, newId);
    }

    let newContent = replaceWithNewIds(oldContent, idMapByLower);
    newContent = newContent.replace(/mynotes:media:/gi, "zenotes:media:");

    const patchRes = await fetchWithRetry(
      `${destBase}/notes/${encodeURIComponent(did)}`,
      {
        method: "PATCH",
        headers: { Cookie: destCookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: n.title,
          content: newContent.trimEnd(),
          color: n.color,
          tags: Array.isArray(n.tags) ? n.tags : [],
          pinned: Boolean(n.pinned),
        }),
      },
      "PATCH note",
    );
    if (!patchRes.ok) {
      throw new Error(`PATCH 失败 ${patchRes.status} ${await patchRes.text()}`);
    }
    return { did, sid, pinned: Boolean(n.pinned) };
  }

  async function workerLoop() {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= notes.length) return;
      const n = notes[i];
      try {
        const r = await processOne(n);
        results[i] = r;
        ok += 1;
        if (ok % 20 === 0 || ok === notes.length) {
          console.log(`[${ok}/${notes.length}] latest ${r.did} ← ${r.sid}`);
        }
      } catch (e) {
        console.error(`同步失败 at ${i + 1}/${notes.length} sid=${n.id}`, e instanceof Error ? e.message : e);
        throw e;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => workerLoop()));

  const newPinned = [];
  const newUnpinned = [];
  for (const r of results) {
    if (!r) continue;
    if (r.pinned) newPinned.push(r.did);
    else newUnpinned.push(r.did);
  }

  for (const pinned of [true, false]) {
    const ids = pinned ? newPinned : newUnpinned;
    if (ids.length === 0) continue;
    const r = await fetchWithRetry(`${destBase}/notes/reorder`, {
      method: "POST",
      headers: { Cookie: destCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ pinned, orderedIds: ids }),
    }, "POST reorder");
    if (!r.ok) {
      console.warn("reorder 失败（可忽略，顺序或略有偏差）", r.status, await r.text());
    }
  }

  console.log("完成。已导入", ok, "条。在本地打开 http://localhost:8080 用同一目标账号查看。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
