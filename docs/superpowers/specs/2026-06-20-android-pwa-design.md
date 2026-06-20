# Android PWA 离线优先设计文档

## 1. 目标

把现有 zenotes Web 应用改造为支持 Android 手机和平板的 PWA，核心能力：

- 可安装到主屏幕，独立运行（standalone）。
- 离线优先：本地新增/编辑/删除笔记，联网后即时同步。
- 本地优先冲突策略：离线期间的本地改动覆盖云端。
- 图片离线缓存：新增图片先存本地，联网后上传到 R2。
- 手机单栏、平板双栏的响应式布局。

## 2. 方案选择

采用 **Dexie.js + 自定义同步队列** 的方案。

理由：
- 不引入商业同步框架，避免授权和协议适配成本。
- 与现有 React + Vite + React Query 技术栈自然集成。
- 对现有 Cloudflare Worker 后端改动最小，复用现有 REST API。

## 3. 架构概览

新增 `frontend/src/offline/` 模块：

| 文件 | 职责 |
|------|------|
| `db.ts` | Dexie.js 本地数据库定义（notes / images / syncQueue） |
| `localNoteApi.ts` | 前端读写入口，优先本地，后台同步 |
| `syncEngine.ts` | 监听网络，消费 `syncQueue`，调用 REST API |
| `imageCache.ts` | 图片本地缓存、object URL 生成、上传替换 |
| `network.ts` | 网络状态监听与在线/离线事件 |
| `pwa/` | manifest、service worker 注册、安装提示 |

路由调整：

- `/`：笔记列表。
- `/note/:id`：笔记详情/编辑。
- 平板下 `/` 同时渲染列表 + 详情；无 `id` 时右侧显示空状态。

## 4. 数据模型

### 4.1 `notes` 表

```ts
interface LocalNote {
  id: string;                    // 本地 UUID，云端创建后保持一致
  content: string;               // 笔记内容；图片用 local://<imageId> 占位
  title: string | null;
  color: string;
  tags: string[];
  pinned: boolean;
  position: number;
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  syncStatus: 'synced' | 'pending' | 'syncing';
  isDeleted: boolean;            // 软删除，同步成功后硬删除
}
```

### 4.2 `images` 表

```ts
interface LocalImage {
  id: string;                    // 本地 UUID
  noteId: string | null;         // 未关联时为 null
  blob: Blob;
  mimeType: string;
  syncStatus: 'pending' | 'syncing' | 'synced';
}
```

### 4.3 `syncQueue` 表

```ts
interface SyncOperation {
  id?: number;                   // Dexie 自增
  type: 'CREATE_NOTE' | 'UPDATE_NOTE' | 'DELETE_NOTE' | 'UPLOAD_IMAGE';
  entityId: string;              // note id 或 image id
  payload: object;               // 操作所需数据
  retries: number;               // 失败重试次数
  createdAt: number;             // 入队时间戳
}
```

## 5. 同步规则

### 5.1 本地写操作

1. 用户执行新增/编辑/删除。
2. 立即写入 IndexedDB，设置 `syncStatus: 'pending'`。
3. 插入对应 `syncQueue` 记录。
4. UI 立即反映本地状态。

### 5.2 同步引擎

`syncEngine` 在以下时机触发：

- 应用启动。
- 网络从离线恢复为在线（`navigator.onLine` + `online` 事件）。
- 每次本地写操作后（如果当前在线）。

处理流程：

1. 从 `syncQueue` 按 `createdAt` 升序取出所有 `pending` 操作。
2. 标记为 `syncing`。
3. 按类型调用现有 API：
   - `CREATE_NOTE` → `POST /api/notes`
   - `UPDATE_NOTE` → `PUT /api/notes/:id`
   - `DELETE_NOTE` → `DELETE /api/notes/:id`
   - `UPLOAD_IMAGE` → 依赖对应 note 已存在；上传成功后替换 content 中的占位符，并追加 `UPDATE_NOTE`。
4. 成功后删除队列记录，更新本地 `syncStatus: 'synced'`。
5. 失败时增加 `retries`，超过 3 次后标记为失败并 toast 提示。

### 5.3 冲突策略

**本地优先**：离线期间本地的任何改动在联网后直接覆盖云端版本。

实现方式：

- 上传更新时直接调用 `PUT /api/notes/:id`，后端使用当前时间戳更新 `updatedAt`。
- 不回拉云端版本做合并。
- 其他设备在同一时间窗口的修改会被覆盖，这是设计上的取舍。

## 6. 图片离线处理

### 6.1 插入图片

1. 用户选择图片文件。
2. 生成本地 UUID，保存 blob 到 `images` 表，`syncStatus: 'pending'`。
3. 在笔记 content 中插入 `local://<uuid>` 占位符。
4. 笔记保存到本地，触发 `syncQueue`。

### 6.2 展示图片

- 渲染笔记时，解析 `local://<uuid>`。
- 从 `images` 表读取 blob，使用 `URL.createObjectURL(blob)` 生成临时 URL 显示。
- 同步完成替换为 R2 URL 后，直接显示云端地址。

### 6.3 同步图片

- 图片上传依赖 note 已存在于云端。
- `syncEngine` 保证 `CREATE_NOTE` 在对应 `UPLOAD_IMAGE` 之前执行。
- 上传成功后：
  1. 更新 `images` 表 `syncStatus: 'synced'`。
  2. 替换笔记 content 中 `local://<uuid>` 为 R2 URL。
  3. 追加 `UPDATE_NOTE` 同步内容变更。

## 7. 手机/平板布局

### 7.1 路由

| 路由 | 手机 | 平板 |
|------|------|------|
| `/` | 全屏笔记列表 | 左侧列表 + 右侧空状态 |
| `/note/new` | 全屏新建编辑器 | 左侧列表 + 右侧新建编辑器 |
| `/note/:id` | 全屏编辑详情 | 左侧列表 + 右侧编辑详情 |

### 7.2 组件拆分

- `NoteList`：可复用的列表组件，手机全屏、平板左侧固定宽度。
- `NoteEditor`：编辑器组件，复用现有 `NoteDialog` 的编辑逻辑。
- `ResponsiveLayout`：根据 `useMediaQuery('(min-width: 768px)')` 决定单栏/双栏。
- `Header`：增加“安装应用”按钮（仅 Android Chrome 且未安装时显示）。

### 7.3 交互细节

- 手机列表点击 → 跳转 `/note/:id`。
- 平板列表点击 → 在同一页替换右侧详情，URL 同步更新。
- 手机编辑器顶部显示返回按钮；平板不显示。
- 新建笔记：手机跳转 `/note/new`，平板右侧打开空编辑器。

## 8. PWA 基础

### 8.1 Manifest

文件：`frontend/public/manifest.json`

```json
{
  "name": "Zenotes",
  "short_name": "Zenotes",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" }
  ]
}
```

### 8.2 Service Worker

使用 `vite-plugin-pwa` 自动生成 SW：

- 静态资源：StaleWhileRevalidate。
- 图片：CacheFirst，回源到网络。
- API 请求：NetworkFirst，离线时回退到本地 DB（由 `syncEngine` 管理，不走 SW）。

### 8.3 安装提示

- 监听 `window.beforeinstallprompt`。
- 在 Header 显示“安装到主屏幕”按钮，点击触发 `prompt()`。
- 已安装后隐藏按钮（通过 `display-mode: standalone` 媒体查询或 `appinstalled` 事件）。

## 9. 后端改动

现有 Worker API 基本够用，可能需要：

- 确保 `GET /api/notes` 返回的字段与本地模型一致（已一致）。
- 图片上传接口 `POST /api/notes/:id/images` 已存在，复用即可。
- 如需支持批量同步，可考虑新增 `POST /api/notes/batch`，但首期按单条队列即可。

## 10. 测试计划

### 10.1 单元测试

- `syncEngine`：队列消费顺序、重试、失败处理。
- `localNoteApi`：本地读写、状态更新。
- `imageCache`：blob 存储、占位符替换。

### 10.2 E2E 测试

使用 Playwright：

1. 登录并加载笔记列表。
2. `context.setOffline(true)`。
3. 新增一条笔记并插入图片。
4. 验证列表和图片正常显示。
5. `context.setOffline(false)`。
6. 验证同步成功，刷新后云端数据存在。

### 10.3 真机测试

- Android Chrome 安装 PWA。
- 飞行模式下新增笔记、图片。
- 恢复网络后检查同步。
- 平板横竖屏双栏切换。

## 11. 上线步骤

1. 实现本地 DB + syncEngine。
2. 重构路由与布局。
3. 添加 PWA manifest 与 Service Worker。
4. 本地离线/联网测试。
5. 构建并部署 Worker。
6. 构建并部署 Pages。
7. 用户真机验证。

## 12. 风险与回退

- **风险**：IndexedDB 存储配额不足（大量图片）。
  - 缓解：定期清理已同步的本地图片 blob；提供设置项手动清理缓存。
- **风险**：Service Worker 更新后旧缓存未清理。
  - 缓解：使用 `vite-plugin-pwa` 的自动清理策略。
- **风险**：本地优先策略覆盖其他端修改。
  - 已在设计里明确接受该取舍。
