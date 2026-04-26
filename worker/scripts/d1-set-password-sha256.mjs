#!/usr/bin/env node
/**
 * 生成与 Worker 一致的 SHA256(hex) 密码，并打印可执行的 wrangler d1 命令（用于把 Argon2 迁出账号改为可登录）。
 *
 *   node scripts/d1-set-password-sha256.mjs <用户名> <新明文密码>
 *
 * 勿把明文密码提交到 git；在本地终端执行即可。
 */

import { createHash } from "node:crypto";

const username = process.argv[2];
const password = process.argv[3];
if (!username || !password) {
  console.error("用法: node scripts/d1-set-password-sha256.mjs <用户名> <新明文密码>");
  process.exit(1);
}

const hex = createHash("sha256").update(password, "utf8").digest("hex");
const u = username.replace(/'/g, "''");

console.log("-- 以下与 Worker 内 sha256Hex 一致（小写 hex）\n");
console.log(
  `npx wrangler d1 execute zenotes-db --remote --command="UPDATE users SET password_hash = '${hex}' WHERE username = '${u}';"`,
);
