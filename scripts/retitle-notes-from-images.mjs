#!/usr/bin/env node
/**
 * 清空标签，并用本地 OCR 为含图片的笔记生成标题（不调用第三方 AI）。
 *
 * 用法：
 *   export ZENOTES_API_BASE=http://127.0.0.1:8788/api
 *   export ZENOTES_USER=lipi
 *   export ZENOTES_PASSWORD=welcome10
 *   node scripts/retitle-notes-from-images.mjs
 *
 * 可选：
 *   OCR_LANG=chi_sim            # 默认（单语言最稳）
 *   OCR_CONCURRENCY=2           # 并发 worker 数
 *   OCR_TITLE_MAX=28            # 标题最大长度
 *   OCR_LIMIT=0                 # >0 时仅处理前 N 条，便于试跑
 */

import process from "node:process";
import os from "node:os";
import { createWorker } from "tesseract.js";

const EMBED_RE = /!\[([^\]]*)\]\((?:mynotes|zenotes):media:([0-9a-f-]{36})\)/i;
const OCR_SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/bmp", "image/tiff"]);

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

function normalizeTitleText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/[|_`~^]+/g, " ")
    .replace(/[“”"''（）()\[\]【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineScore(line) {
  if (!line) return -1;
  let score = 0;
  const len = line.length;
  score += Math.min(50, len);
  if (/[\u4e00-\u9fff]/.test(line)) score += 30;
  if (/[A-Za-z]/.test(line)) score += 20;
  if (/\d/.test(line)) score += 8;
  if (/^[0-9a-f-]{24,}$/i.test(line)) score -= 40;
  if (len < 4) score -= 20;
  if (len > 60) score -= 10;
  return score;
}

function summarizeOcrText(text, maxLen) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => normalizeTitleText(l))
    .filter(Boolean)
    .filter((l) => !/^[^\u4e00-\u9fffA-Za-z0-9]+$/.test(l));
  if (lines.length === 0) return "";
  const best = [...lines].sort((a, b) => lineScore(b) - lineScore(a))[0] || "";
  if (!best) return "";
  return best.length > maxLen ? `${best.slice(0, maxLen).trim()}…` : best;
}

function extractMediaRef(note) {
  const content = String(note?.content || "");
  const m = content.match(EMBED_RE);
  if (!m) return null;
  return {
    alt: String(m[1] || "").trim(),
    mediaId: String(m[2] || "").trim(),
  };
}

async function listAllNotes(base, cookie) {
  const out = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const r = await fetch(`${base}/notes?page=${page}&pageSize=${pageSize}`, { headers: { Cookie: cookie } });
    if (!r.ok) {
      throw new Error(`GET /notes 失败: ${r.status} ${await r.text()}`);
    }
    const j = await r.json();
    const arr = Array.isArray(j?.notes) ? j.notes : [];
    out.push(...arr);
    const totalPages = Number(j?.pagination?.totalPages || 1);
    if (page >= totalPages || arr.length === 0) break;
    page += 1;
  }
  return out;
}

async function main() {
  const base = String(process.env.ZENOTES_API_BASE || "http://127.0.0.1:8788/api").replace(/\/$/, "");
  const user = process.env.ZENOTES_USER;
  const pass = process.env.ZENOTES_PASSWORD;
  if (!user || !pass) {
    console.error("请设置 ZENOTES_USER 与 ZENOTES_PASSWORD");
    process.exit(1);
  }

  const ocrLangRaw = process.env.OCR_LANG || "chi_sim";
  const ocrLangs = ocrLangRaw
    .split(/[+,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ocrLang = ocrLangs[0] || "chi_sim";
  const titleMax = Math.max(10, Number(process.env.OCR_TITLE_MAX) || 28);
  const limit = Math.max(0, Number(process.env.OCR_LIMIT) || 0);
  const cpu = os.cpus()?.length || 4;
  const concurrency = Math.max(1, Math.min(6, Number(process.env.OCR_CONCURRENCY) || Math.max(1, Math.floor(cpu / 3))));

  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user.trim(), password: pass }),
  });
  if (!login.ok) {
    console.error("登录失败", login.status, await login.text());
    process.exit(1);
  }
  const cookie = cookieFromResponse(login);
  if (!cookie) {
    console.error("无 Set-Cookie");
    process.exit(1);
  }

  const all = await listAllNotes(base, cookie);
  const targets = all.filter((n) => extractMediaRef(n));
  const picked = limit > 0 ? targets.slice(0, limit) : targets;
  console.log(
    `总笔记 ${all.length} 条；含图 ${targets.length} 条；本次处理 ${picked.length} 条；OCR 并发 ${concurrency}；语言 ${ocrLang}`,
  );

  const workers = await Promise.all(
    Array.from({ length: concurrency }, async () => createWorker(ocrLang, 1)),
  );

  let idx = 0;
  let renamed = 0;
  let tagCleared = 0;
  let failed = 0;

  async function runOne(workerIndex) {
    const worker = workers[workerIndex];
    while (true) {
      const i = idx;
      idx += 1;
      if (i >= picked.length) return;

      const note = picked[i];
      const ref = extractMediaRef(note);
      if (!ref) continue;

      try {
        const mediaRes = await fetch(
          `${base}/notes/${encodeURIComponent(note.id)}/media/${encodeURIComponent(ref.mediaId)}`,
          { headers: { Cookie: cookie } },
        );
        if (!mediaRes.ok) {
          throw new Error(`下载媒体失败 ${mediaRes.status}`);
        }
        const contentType = (mediaRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
        let ocrTitle = "";
        if (OCR_SAFE_TYPES.has(contentType)) {
          const buf = Buffer.from(await mediaRes.arrayBuffer());
          const { data } = await worker.recognize(buf);
          ocrTitle = summarizeOcrText(data?.text || "", titleMax);
        }
        const fallbackAlt = normalizeTitleText(ref.alt);
        const fallbackDate = String(note.createdAt || "").slice(0, 10) || "image";
        const nextTitle = ocrTitle || (fallbackAlt ? `图片：${fallbackAlt.slice(0, titleMax)}` : `图片笔记 ${fallbackDate}`);
        const nextTags = [];

        const prevTags = Array.isArray(note.tags) ? note.tags : [];
        const titleChanged = String(note.title || "") !== nextTitle;
        const tagsChanged = prevTags.length > 0;

        if (!titleChanged && !tagsChanged) {
          if ((i + 1) % 25 === 0 || i + 1 === picked.length) {
            console.log(`进度 ${i + 1}/${picked.length}（无变更）`);
          }
          continue;
        }

        const patchRes = await fetch(`${base}/notes/${encodeURIComponent(note.id)}`, {
          method: "PATCH",
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle, tags: nextTags }),
        });
        if (!patchRes.ok) {
          throw new Error(`PATCH 失败 ${patchRes.status} ${await patchRes.text()}`);
        }
        if (titleChanged) renamed += 1;
        if (tagsChanged) tagCleared += 1;

        if ((i + 1) % 20 === 0 || i + 1 === picked.length) {
          console.log(`进度 ${i + 1}/${picked.length}，已改标题 ${renamed}，已清标签 ${tagCleared}，失败 ${failed}`);
        }
      } catch (e) {
        failed += 1;
        console.warn(
          `失败 ${i + 1}/${picked.length} note=${note.id}:`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }
  }

  await Promise.all(workers.map((_, wi) => runOne(wi)));
  await Promise.all(workers.map((w) => w.terminate()));

  // 清理非图片笔记标签（如果有）
  let otherTagCleared = 0;
  for (const n of all) {
    if (extractMediaRef(n)) continue;
    const tags = Array.isArray(n.tags) ? n.tags : [];
    if (tags.length === 0) continue;
    const r = await fetch(`${base}/notes/${encodeURIComponent(n.id)}`, {
      method: "PATCH",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [] }),
    });
    if (r.ok) otherTagCleared += 1;
  }

  console.log(
    `完成：图片标题更新 ${renamed} 条，图片标签清空 ${tagCleared} 条，非图片标签清空 ${otherTagCleared} 条，失败 ${failed} 条。`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
