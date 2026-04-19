#!/usr/bin/env node
/**
 * 从 PostgreSQL 迁出笔记与用户，写入 R2（正文）并生成 D1 可执行的 SQL（元数据）。
 *
 * 用法：
 *   DATABASE_URL=postgres://... \
 *   R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *   R2_BUCKET=mynotes-bodies \
 *   node scripts/migrate-from-postgres.mjs
 *
 * 仅生成 SQL 不上传 R2：
 *   DRY_RUN=1 DATABASE_URL=... node scripts/migrate-from-postgres.mjs
 *
 * 依赖：在 worker 目录执行 npm install
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "out", "migration");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("请设置 DATABASE_URL");
    process.exit(1);
  }

  const dryRun = process.env.DRY_RUN === "1";
  const userId = parseInt(process.env.TARGET_USER_ID || "1", 10);

  mkdirSync(OUT, { recursive: true });

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const users = (await client.query(`SELECT id, username, email, password_hash, created_at, updated_at FROM users ORDER BY id`)).rows;
  const notes = (await client.query(`SELECT id, title, content, color, tags, pinned, position, created_at, updated_at FROM notes ORDER BY created_at`)).rows;

  await client.end();

  const sqlLines = [];
  sqlLines.push(`-- 由 migrate-from-postgres.mjs 生成；D1 不支持 SQL 文件中的 BEGIN/COMMIT。`);

  for (const u of users) {
    const ca = new Date(u.created_at).toISOString();
    const ua = new Date(u.updated_at).toISOString();
    sqlLines.push(
      `INSERT OR REPLACE INTO users (id, username, email, password_hash, created_at, updated_at) VALUES (${u.id}, ${sqlQuote(u.username)}, ${sqlQuote(u.email)}, ${sqlQuote(u.password_hash)}, ${sqlQuote(ca)}, ${sqlQuote(ua)});`,
    );
  }

  if (!users.some((u) => u.id === userId)) {
    sqlLines.push(
      `INSERT OR IGNORE INTO users (id, username, email, password_hash, created_at, updated_at) VALUES (${userId}, 'default', 'default@zenotes.site', '${"0".repeat(64)}', datetime('now'), datetime('now'));`,
    );
  }

  const s3 =
    !dryRun &&
    new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  const bucket = process.env.R2_BUCKET || "mynotes-bodies";

  if (!dryRun && (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY)) {
    console.error("未设置 R2 凭证时请加 DRY_RUN=1 只生成 SQL，或设置 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
    process.exit(1);
  }

  for (const n of notes) {
    const id = n.id;
    const r2Key = `${userId}/${id}/body.json`;
    const tagsJson = JSON.stringify(n.tags ?? []);
    const pinned = n.pinned ? 1 : 0;
    const ca = new Date(n.created_at).toISOString();
    const ua = new Date(n.updated_at).toISOString();
    const title = n.title === null || n.title === undefined ? null : String(n.title);

    sqlLines.push(
      `INSERT OR REPLACE INTO notes (id, user_id, title, color, tags, pinned, position, r2_key, created_at, updated_at) VALUES (${sqlQuote(id)}, ${userId}, ${title === null ? "NULL" : sqlQuote(title)}, ${sqlQuote(n.color)}, ${sqlQuote(tagsJson)}, ${pinned}, ${n.position}, ${sqlQuote(r2Key)}, ${sqlQuote(ca)}, ${sqlQuote(ua)});`,
    );

    const body = JSON.stringify({ content: n.content ?? "" });
    if (!dryRun) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: r2Key,
          Body: body,
          ContentType: "application/json",
        }),
      );
    } else {
      writeFileSync(join(OUT, `${id}.body.json`), body);
    }
  }

  const sqlPath = join(OUT, "d1-import.sql");
  writeFileSync(sqlPath, sqlLines.join("\n") + "\n");
  console.log(`已写入 ${sqlPath}`);
  if (dryRun) {
    console.log("DRY_RUN：正文示例已写入 out/migration/*.body.json，请配置 R2 后去掉 DRY_RUN 再运行上传。");
  } else {
    console.log("R2 上传完成。将 d1-import.sql 应用到 D1：");
    console.log(`  wrangler d1 execute mynotes-db --remote --file=${sqlPath}`);
  }
}

function sqlQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
