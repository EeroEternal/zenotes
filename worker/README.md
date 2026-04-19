# MyNotes Cloudflare Worker（D1 + R2）

API 与 `backend`（Actix + PostgreSQL）路由兼容：`/api/notes`、`/api/auth/*` 等。正文存 R2（`{userId}/{noteId}/body.json`），元数据在 D1。

## 一次性准备

```bash
cd worker
npm install
wrangler login
wrangler d1 create mynotes-db
wrangler r2 bucket create mynotes-bodies
```

把 `wrangler.jsonc` 里的 `REPLACE_WITH_D1_DATABASE_ID` 换成 `wrangler d1 list` 里显示的 id。

## 本地

```bash
npm run migrate:d1:local
npm run dev
```

默认监听 `http://127.0.0.1:8787`。前端 `vite` 已把 `/api` 代理到该端口。

## 部署与域名

```bash
npm run migrate:d1
npm run deploy
```

在 Cloudflare 控制台为 Worker 绑定自定义域名 **`api.zenotes.site`**（DNS 在 Cloudflare 时可直接添加路由）。前端用 **Pages** 部署 `frontend` 的 `dist`，绑定 **`zenotes.site`**，构建时设置环境变量：

`VITE_API_BASE=https://api.zenotes.site/api`

## 从 SQLite（服务器 mynotes.db）迁移

将 `mynotes.db` 放到 `worker/out/mynotes-source.db`（或在服务器 `scp` 下来），然后：

```bash
cd worker
# 默认 SQLITE_PATH=out/mynotes-source.db；R2 用 wrangler，不需 R2 API 密钥
node scripts/migrate-from-sqlite.mjs
npx wrangler d1 execute mynotes-db --remote --file=out/migration/d1-import-from-sqlite.sql
```

预览：`DRY_RUN=1`。迁完顺手打 D1：`APPLY_D1=1`（慎用）。

## 从 PostgreSQL 迁移

在仍可读旧库的机器上：

```bash
export DATABASE_URL=postgres://...
export R2_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_BUCKET=mynotes-bodies
node scripts/migrate-from-postgres.mjs
wrangler d1 execute mynotes-db --remote --file=out/migration/d1-import.sql
```

只生成 SQL、不落 R2：`DRY_RUN=1` 运行脚本。`TARGET_USER_ID` 默认 `1`，与 D1 中默认用户一致。

## GitHub Actions 一键迁移

仓库已包含 **`.github/workflows/migrate-postgres-to-cloudflare.yml`**，仅 **`workflow_dispatch`（手动运行）**。在 Actions 里选该 workflow → **Run workflow** 即可。

需先在 **Settings → Secrets and variables → Actions** 配置：`DATABASE_URL`、`R2_*`、`CLOUDFLARE_API_TOKEN`（需含 **D1 编辑** 等与 `wrangler d1 execute --remote` 匹配权限）。可选秘密见 workflow 文件顶部注释。

**注意**：Runner 必须能直连 PostgreSQL；若腾讯云数据库**仅 VPC 内**，GitHub 托管 runner 连不上，需改用 **self-hosted runner** 放在内网，或临时开公网并限制来源 IP（仍不够稳时优先 self-hosted）。

## Google Keep 导入

在浏览器中选择 Takeout 解压后的多个 `.json` 文件上传；不再依赖服务器本地目录。
