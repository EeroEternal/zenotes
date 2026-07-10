# Zenotes Cloudflare Worker（D1 + R2）

提供 `/api/notes`、`/api/auth/*` 等 API。正文存 R2（`{userId}/{noteId}/body.json`），元数据在 D1。

## 一次性准备

```bash
cd worker
npm install
wrangler login
wrangler d1 create zenotes-db
wrangler r2 bucket create zenotes-bodies
```

把 `wrangler.jsonc` 里的 `REPLACE_WITH_D1_DATABASE_ID` 换成 `wrangler d1 list` 里显示的 id。

## 本地

首次或清空 `.wrangler` 后，本地 D1 要先跑迁移（`npm run dev` 已自动在启动前执行 `migrate:d1:local`）：

```bash
npm run dev
```

若你单独用 `wrangler dev` 而未先迁移，会出现 **`no such table: users` / `notes`**。此时手动执行：`npm run migrate:d1:local`。

默认监听 `http://127.0.0.1:8787`。前端 `vite` 已把 `/api` 代理到该端口。

## 部署与域名

```bash
npm run migrate:d1
npm run deploy
```

在 Cloudflare 控制台为 Worker 绑定自定义域名 **`api.zenotes.site`**（DNS 在 Cloudflare 时可直接添加路由）。前端用 **Pages** 部署 `frontend` 的 `dist`，绑定 **`zenotes.site`**，构建时设置环境变量：

`VITE_API_BASE=https://api.zenotes.site/api`

## 从 SQLite（如服务器上的旧 `mynotes.db`）迁移

将 SQLite 文件放到 `worker/out/zenotes-source.db`（或沿用 `mynotes-source.db` 并设置 `SQLITE_PATH`），然后：

```bash
cd worker
# 默认 SQLITE_PATH=out/zenotes-source.db；R2 用 wrangler，不需 R2 API 密钥
node scripts/migrate-from-sqlite.mjs
npx wrangler d1 execute zenotes-db --remote --file=out/migration/d1-import-from-sqlite.sql
```

预览：`DRY_RUN=1`。迁完顺手打 D1：`APPLY_D1=1`（慎用）。

## 从 PostgreSQL 迁移

在仍可读旧库的机器上：

```bash
export DATABASE_URL=postgres://...
export R2_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_BUCKET=zenotes-bodies
node scripts/migrate-from-postgres.mjs
wrangler d1 execute zenotes-db --remote --file=out/migration/d1-import.sql
```

只生成 SQL、不落 R2：`DRY_RUN=1` 运行脚本。`TARGET_USER_ID` 默认 `1`，与 D1 中默认用户一致。

## GitHub Actions 一键迁移

仓库已包含 **`.github/workflows/migrate-postgres-to-cloudflare.yml`**，仅 **`workflow_dispatch`（手动运行）**。在 Actions 里选该 workflow → **Run workflow** 即可。

需先在 **Settings → Secrets and variables → Actions** 配置：`DATABASE_URL`、`R2_*`、`CLOUDFLARE_API_TOKEN`（需含 **D1 编辑** 等与 `wrangler d1 execute --remote` 匹配权限）。可选秘密见 workflow 文件顶部注释。

**注意**：Runner 必须能直连 PostgreSQL；若腾讯云数据库**仅 VPC 内**，GitHub 托管 runner 连不上，需改用 **self-hosted runner** 放在内网，或临时开公网并限制来源 IP（仍不够稳时优先 self-hosted）。

## Argon2 旧密码在免费 Worker 上无法登录

从 SQLite 迁出的 `password_hash` 多为 **Argon2id**。默认 **不在 Worker 内调用** `argon2Verify`（避免免费套餐长时间卡住并误判），遇到 Argon2 会直接返回 **503** 与说明。处理方式二选一：

1. **（推荐）** 在本机执行：  
   `node scripts/d1-set-password-sha256.mjs 你的用户名 你的新密码`  
   按输出运行 **`wrangler d1 execute zenotes-db --remote --command="..."`**，将库中密码改为与 Worker 一致的 **SHA256**；之后用新密码登录。  
2. 仅在确有高 CPU、且需用**原明文密码**尝试校验 Argon2 时：在 `wrangler.jsonc` 的 `vars` 中设置 **`ALLOW_ARGON2_VERIFY": "true"`** 并重新部署（仍可能因参数过重在边缘失败）。

## Google Keep 导入

在浏览器中选择 Takeout 解压后的多个 `.json` 文件上传；不再依赖服务器本地目录。
