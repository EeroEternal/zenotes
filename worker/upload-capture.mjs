#!/usr/bin/env node
/**
 * 在 worker/ 目录下可执行，转发到仓库根的 scripts/upload-capture-to-zenotes.mjs
 * 用法: node upload-capture.mjs --probe
 *       node upload-capture.mjs /path/to/images
 * 默认每张图一条笔记；多图合并一条加 --all-in-one
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const script = join(root, "scripts", "upload-capture-to-zenotes.mjs");
const r = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
