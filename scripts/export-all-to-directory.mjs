#!/usr/bin/env node
/**
 * Export all notes from Zenotes to a local directory on your filesystem.
 *
 * Usage:
 *   node scripts/export-all-to-directory.mjs [output-directory]
 *
 * Environment variables:
 *   ZENOTES_API_BASE     Default: http://127.0.0.1:8787/api (or https://api.zenotes.site/api)
 *   ZENOTES_USER         Username to authenticate
 *   ZENOTES_PASSWORD     Password to authenticate
 *   ZENOTES_GLOBAL_TOKEN Optional: Global token instead of user/pass
 *
 * Example:
 *   export ZENOTES_API_BASE=http://127.0.0.1:8787/api
 *   export ZENOTES_USER=myuser
 *   export ZENOTES_PASSWORD=mypassword
 *   node scripts/export-all-to-directory.mjs ./my_exported_notes
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const MEDIA_RE = /(?:zenotes:media:|mynotes:media:|local:\/\/|(?:\/api)?\/notes\/[^/]+\/media\/)([0-9a-fA-F-]{36}|[a-zA-Z0-9_-]{8,})/g;

function sanitizeFilename(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/_+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[_\s.]+|[_\s.]+$/g, "")
    .slice(0, 80);
}

function getUniqueName(base, used) {
  const norm = base.trim() || "untitled";
  let candidate = norm;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${norm} (${counter++})`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function extensionFromMime(mime) {
  if (!mime) return ".png";
  const lower = mime.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return ".jpg";
  if (lower.includes("png")) return ".png";
  if (lower.includes("webp")) return ".webp";
  if (lower.includes("gif")) return ".gif";
  if (lower.includes("svg")) return ".svg";
  return ".png";
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

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Zenotes Export CLI
Usage:
  node scripts/export-all-to-directory.mjs [output-directory]

Environment variables:
  ZENOTES_API_BASE       Default: http://127.0.0.1:8787/api
  ZENOTES_USER           Username to authenticate
  ZENOTES_PASSWORD       Password to authenticate
  ZENOTES_GLOBAL_TOKEN   Global token (optional alternative to user/password)
`);
    return;
  }

  const outputDirArg = process.argv[2] || "./zenotes_export";
  const targetDir = path.resolve(process.cwd(), outputDirArg);

  const apiBase = (process.env.ZENOTES_API_BASE || "http://127.0.0.1:8787/api").replace(/\/+$/, "");
  const username = process.env.ZENOTES_USER;
  const password = process.env.ZENOTES_PASSWORD;
  const globalToken = process.env.ZENOTES_GLOBAL_TOKEN;

  let authHeaders = {};

  if (globalToken) {
    authHeaders = {
      "X-Global-Token": globalToken,
    };
    console.log(`Using Global Token for authentication.`);
  } else if (username && password) {
    console.log(`Signing in as ${username}...`);
    const loginRes = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!loginRes.ok) {
      console.error(`Sign in failed: ${loginRes.status} ${await loginRes.text()}`);
      process.exit(1);
    }
    const cookie = cookieFromResponse(loginRes);
    const loginData = await loginRes.json();
    authHeaders = {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(loginData?.token ? { Authorization: `Bearer ${loginData.token}` } : {}),
    };
    console.log(`Signed in successfully.`);
  } else {
    console.log(`No credentials provided; proceeding unauthenticated or relying on cookie / local worker.`);
  }

  console.log(`Fetching notes from ${apiBase}...`);
  let notes = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const res = await fetch(`${apiBase}/notes?page=${page}&pageSize=${pageSize}`, {
      headers: authHeaders,
    });
    if (!res.ok) {
      console.error(`Failed to fetch notes page ${page}: ${res.status} ${await res.text()}`);
      break;
    }
    const data = await res.json();
    const batch = data.notes || [];
    notes.push(...batch);
    if (batch.length < pageSize || (data.pagination && page >= data.pagination.totalPages)) {
      break;
    }
    page++;
  }

  console.log(`Found ${notes.length} note(s). Target directory: ${targetDir}`);
  await fs.mkdir(targetDir, { recursive: true });

  const usedFolders = new Set();
  const manifest = [];

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const title = (note.title || "").trim() || "Untitled";
    const baseName = sanitizeFilename(title) || `note_${note.id.slice(0, 8)}`;
    const folderName = getUniqueName(baseName, usedFolders);
    const noteDir = path.join(targetDir, folderName);
    await fs.mkdir(noteDir, { recursive: true });

    // Find and export media
    let content = note.content || "";
    const mediaIds = new Set();
    let m;
    const mediaRe = new RegExp(MEDIA_RE.source, "g");
    while ((m = mediaRe.exec(content)) !== null) {
      if (m[1]) mediaIds.add(m[1]);
    }

    const mediaMap = {};
    let exportedMediaCount = 0;

    for (const mediaId of mediaIds) {
      try {
        const mediaRes = await fetch(`${apiBase}/notes/${note.id}/media/${mediaId}`, {
          headers: authHeaders,
        });
        if (mediaRes.ok) {
          const ct = mediaRes.headers.get("content-type") || "image/png";
          const ext = extensionFromMime(ct);
          const mediaFileName = `${mediaId}${ext}`;
          const mediaRelPath = `media/${mediaFileName}`;
          mediaMap[mediaId] = mediaRelPath;

          const mediaFolder = path.join(noteDir, "media");
          await fs.mkdir(mediaFolder, { recursive: true });
          const buf = Buffer.from(await mediaRes.arrayBuffer());
          await fs.writeFile(path.join(mediaFolder, mediaFileName), buf);
          exportedMediaCount++;
        }
      } catch (e) {
        console.warn(`[warning] Failed to download media ${mediaId}:`, e.message);
      }
    }

    // Replace media references in markdown
    for (const [id, relPath] of Object.entries(mediaMap)) {
      const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const r = new RegExp(
        `(?:zenotes:media:|mynotes:media:|local:\\/\\/|(?:\/api)?\/notes\\/[^/]+\\/media\\/)${esc}`,
        "g",
      );
      content = content.replace(r, relPath);
    }

    // Download attached files
    const files = note.files || [];
    let exportedFileCount = 0;
    for (const f of files) {
      try {
        const fileUrl = `${apiBase}/notes/${note.id}/files/${f.id}`;
        const fRes = await fetch(fileUrl, { headers: authHeaders });
        if (fRes.ok) {
          const rel = (f.path || f.filename).replace(/^\/+/, "");
          const destFile = path.join(noteDir, "files", rel);
          await fs.mkdir(path.dirname(destFile), { recursive: true });
          const buf = Buffer.from(await fRes.arrayBuffer());
          await fs.writeFile(destFile, buf);
          exportedFileCount++;
        }
      } catch (e) {
        console.warn(`[warning] Failed to download attached file ${f.filename}:`, e.message);
      }
    }

    // Generate frontmatter
    const tagsYaml = (note.tags || []).length > 0
      ? `tags:\n${note.tags.map((t) => `  - ${JSON.stringify(t)}`).join("\n")}\n`
      : `tags: []\n`;

    const frontmatter = [
      "---",
      `id: ${JSON.stringify(note.id)}`,
      `title: ${JSON.stringify(note.title ?? "")}`,
      `createdAt: ${JSON.stringify(note.createdAt || "")}`,
      `updatedAt: ${JSON.stringify(note.updatedAt || "")}`,
      `color: ${JSON.stringify(note.color || "white")}`,
      `pinned: ${Boolean(note.pinned)}`,
      tagsYaml.trimEnd(),
      "---",
      "",
    ].join("\n");

    const fullMarkdown = content.trim().startsWith("---") ? content : `${frontmatter}\n${content}`;
    const mdFile = `${folderName}.md`;
    await fs.writeFile(path.join(noteDir, mdFile), fullMarkdown, "utf8");

    manifest.push({
      id: note.id,
      title: note.title ?? null,
      folder: folderName,
      filename: mdFile,
      createdAt: note.createdAt || "",
      updatedAt: note.updatedAt || "",
      tags: note.tags || [],
      color: note.color || "white",
      pinned: Boolean(note.pinned),
      fileCount: exportedFileCount,
      mediaCount: exportedMediaCount,
    });

    if ((i + 1) % 10 === 0 || i + 1 === notes.length) {
      console.log(`Exported ${i + 1}/${notes.length} notes...`);
    }
  }

  // Write manifest.json
  const manifestData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    totalNotes: notes.length,
    notes: manifest,
  };
  await fs.writeFile(
    path.join(targetDir, "manifest.json"),
    JSON.stringify(manifestData, null, 2),
    "utf8",
  );

  console.log(`\nExport complete! Successfully exported ${notes.length} note(s) to ${targetDir}`);
}

main().catch((err) => {
  console.error("Export error:", err);
  process.exit(1);
});
