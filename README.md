# Zenotes

一个简洁的笔记应用，支持创建、编辑、删除、置顶、拖拽排序和标签筛选。

## 技术栈

- **前端**: React + TypeScript + Vite + TailwindCSS + shadcn/ui + React Query + dnd-kit
- **后端**: Rust + Actix-web + SQLx + PostgreSQL

## 项目结构

```
zenotes/
├── frontend/    # React 前端（可部署到 Cloudflare Pages）
├── backend/     # Rust 后端 + PostgreSQL（本地/VPS）
├── worker/      # Cloudflare Worker + D1 + R2（见 worker/README.md）
└── README.md
```

## 快速开始

### 前置条件

- Node.js >= 18
- Rust >= 1.75
- PostgreSQL >= 15

### 1. 配置数据库

```sh
# 创建数据库
createdb zenotes

# 配置后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 填入你的数据库连接信息
```

### 2. 启动后端

```sh
cd backend
cargo run
# API 运行在 http://localhost:8081
```

### 3. 启动前端

```sh
cd frontend
npm install
npm run dev
# 前端运行在 http://localhost:8080
```

## GitHub Actions（Cloudflare Pages）

推送到 `main` 时由 **`.github/workflows/deploy-pages.yml`** 构建 `frontend` 并部署到 Cloudflare Pages。请在仓库 **Settings → Secrets → Actions** 配置 **`CLOUDFLARE_API_TOKEN`**、**`VITE_API_BASE`**（例如 `https://api.zenotes.site/api`）；可选 **`PAGES_PROJECT_NAME`**（默认 `zenotes-web`）。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notes` | 获取所有笔记 |
| POST | `/api/notes` | 创建笔记 |
| PATCH | `/api/notes/:id` | 更新笔记 |
| DELETE | `/api/notes/:id` | 删除笔记 |
| POST | `/api/notes/reorder` | 重新排序 |
