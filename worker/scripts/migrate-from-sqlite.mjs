#!/usr/bin/env node
/**
 * 从 SQLite（mynotes.db）迁出 users / notes，正文写入 R2，并生成 D1 SQL。
 *
 * R2 上传默认走 wrangler（需已 wrangler login），无需 R2 S3 API 密钥：
 *   SQLITE_PATH=out/mynotes-source.db node scripts/migrate-from-sqlite.mjs
 *
 * 仅预览（不落 R2、不写远程）：
 *   DRY_RUN=1 SQLITE_PATH=... node scripts/migrate-from-sqlite.mjs
 *
 * 迁完自动执行 D1（慎用）：
 *   APPLY_D1=1 SQLITE_PATH=... node scripts/migrate-from-sqlite.mjs
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = join(__dirname, "..");
const OUT = join(WORKER_ROOT, "out", "migration");

function sqlQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

function toIso(val) {
  if (!val) return new Date().toISOString();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function putR2ViaWrangler(key, bodyStr, dryRun) {
  const tmp = join(tmpdir(), `r2-${randomBytes(8).toString("hex")}.json`);
  writeFileSync(tmp, bodyStr, "utf8");
  if (dryRun) {
    const safe = key.replace(/\//g, "_");
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `body-preview__${safe}.json`), bodyStr, "utf8");
  } else {
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `mynotes-bodies/${key}`, "--remote", "-f", tmp, "-y"],
      { cwd: WORKER_ROOT, stdio: "inherit" },
    );
  }
  unlinkSync(tmp);
}

async function main() {
  const sqlitePath = process.env.SQLITE_PATH || join(WORKER_ROOT, "out", "mynotes-source.db");
  const dryRun = process.env.DRY_RUN === "1";
  const applyD1 = process.env.APPLY_D1 === "1";
  const d1Name = process.env.D1_DATABASE_NAME || "mynotes-db";

  mkdirSync(OUT, { recursive: true });

  const filebuffer = readFileSync(sqlitePath);
  const SQL = await initSqlJs({
    locateFile: (file) => join(WORKER_ROOT, "node_modules", "sql.js", "dist", file),
  });
  const db = new SQL.Database(filebuffer);

  /** @type {Record<string, unknown>[]} */
  const users = [];
  const uStmt = db.prepare(
    "SELECT id, username, email, password_hash, created_at, updated_at FROM users ORDER BY id",
  );
  while (uStmt.step()) {
    users.push(uStmt.getAsObject());
  }
  uStmt.free();

  /** @type {Record<string, unknown>[]} */
  const notes = [];
  const nStmt = db.prepare(
    `SELECT id, user_id, title, content, color, pinned, "order", created_at, updated_at FROM notes ORDER BY datetime(created_at)`,
  );
  while (nStmt.step()) {
    const row = nStmt.getAsObject();
    notes.push({
      ...row,
      ord: /** @type {any} */ (row).order,
    });
  }
  nStmt.free();

  db.close();

  const sqlLines = [];
  sqlLines.push(`-- 由 migrate-from-sqlite.mjs 生成；D1 不支持 BEGIN/COMMIT，逐条执行。`);

  for (const u of users) {
    const ca = toIso(u.created_at);
    const ua = toIso(u.updated_at);
    sqlLines.push(
      `INSERT OR REPLACE INTO users (id, username, email, password_hash, created_at, updated_at) VALUES (${Number(u.id)}, ${sqlQuote(String(u.username))}, ${sqlQuote(String(u.email))}, ${sqlQuote(String(u.password_hash))}, ${sqlQuote(ca)}, ${sqlQuote(ua)});`,
    );
  }

  const tagsJson = "[]";
  for (const n of notes) {
    const id = String(n.id);
    const userId = Number(n.user_id);
    const r2Key = `${userId}/${id}/body.json`;
    const position = Number(n.ord ?? 0);
    const pinned = n.pinned ? 1 : 0;
    const ca = toIso(n.created_at);
    const ua = toIso(n.updated_at);
    const titleVal = n.title == null || String(n.title).trim() === "" ? null : String(n.title).trim();

    sqlLines.push(
      `INSERT OR REPLACE INTO notes (id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at) VALUES (${sqlQuote(id)}, ${userId}, ${titleVal === null ? "NULL" : sqlQuote(titleVal)}, ${sqlQuote(String(n.color || "white"))}, ${sqlQuote(tagsJson)}, ${pinned}, ${position}, ${sqlQuote(r2Key)}, ${sqlQuote(ca)}, ${sqlQuote(ua)});`,
    );

    const body = JSON.stringify({ content: String(n.content ?? "") });
    putR2ViaWrangler(r2Key, body, dryRun);
  }

  const sqlPath = join(OUT, "d1-import-from-sqlite.sql");
  writeFileSync(sqlPath, sqlLines.join("\n") + "\n", "utf8");
  console.log(`已写入 ${sqlPath}`);

  if (dryRun) {
    console.log("DRY_RUN：未上传 R2；正文预览见 out/migration/body-preview__*.json");
  }

  if (applyD1 && !dryRun) {
    execFileSync(
      "npx",
      ["wrangler", "d1", "execute", d1Name, "--remote", `--file=${sqlPath}`],
      { cwd: WORKER_ROOT, stdio: "inherit" },
    );
    console.log(`已执行 wrangler d1 execute ${d1Name}`);
  } else if (!dryRun) {
    console.log(`下一步：npx wrangler d1 execute ${d1Name} --remote --file=${sqlPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
