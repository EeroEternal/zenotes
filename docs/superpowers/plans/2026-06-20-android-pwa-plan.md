# Android PWA Offline-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 zenotes 前端改造为支持 Android 手机/平板的离线优先 PWA，实现本地新增/编辑/删除笔记、图片离线缓存、联网即时同步、手机单栏/平板双栏布局。

**Architecture:** 在 `frontend/src/offline/` 下新增 Dexie.js 本地数据库与自定义同步引擎；所有写操作先落本地并进入 `syncQueue`，`syncEngine` 在线时按 FIFO 调用现有 REST API 同步。UI 路由拆分为 `/`（列表）与 `/note/:id`（详情），通过响应式布局实现手机单栏、平板双栏。PWA 使用 `vite-plugin-pwa` 生成 Service Worker 与 manifest。

**Tech Stack:** React + Vite + TypeScript + Tailwind CSS + TanStack Query + Dexie.js + vite-plugin-pwa

---

## File Structure

| 文件 | 职责 |
|------|------|
| `frontend/src/offline/db.ts` | Dexie 数据库定义与表结构 |
| `frontend/src/offline/network.ts` | 网络状态 hook |
| `frontend/src/offline/localNoteApi.ts` | 本地笔记 CRUD，优先本地写 |
| `frontend/src/offline/imageCache.ts` | 图片本地缓存、占位符解析/替换 |
| `frontend/src/offline/syncEngine.ts` | 同步队列消费、调用 REST API |
| `frontend/src/hooks/useNotes.ts` | 改造为本地优先数据源 |
| `frontend/src/components/NoteList.tsx` | 可复用笔记列表 |
| `frontend/src/components/NoteEditor.tsx` | 路由化编辑器 |
| `frontend/src/components/ResponsiveLayout.tsx` | 单栏/双栏响应式容器 |
| `frontend/src/App.tsx` | 新增 `/note/:id` 路由 |
| `frontend/src/pages/Index.tsx` | 改为列表/双栏组合入口 |
| `frontend/src/components/Header.tsx` | 增加 PWA 安装按钮 |
| `frontend/vite.config.ts` | 集成 vite-plugin-pwa |
| `frontend/public/manifest.json` | PWA manifest |
| `frontend/public/icon.svg` / `icon-192.png` / `icon-512.png` | 安装图标 |
| `frontend/src/main.tsx` | 注册 service worker |
| `frontend/src/offline/*.test.ts` | 单元测试 |
| `frontend/e2e/offline.spec.ts` | Playwright 离线同步 E2E |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install runtime + dev dependencies**

```bash
cd /Users/xinference/github/zenotes/frontend
npm install dexie idb-keyval
npm install -D vite-plugin-pwa @vite-pwa/assets-generator
```

- [ ] **Step 2: Verify lockfile updated**

```bash
cd /Users/xinference/github/zenotes/frontend
npm install 2>&1 | tail -5
```

Expected: no errors, `package-lock.json` updated.

- [ ] **Step 3: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add dexie, idb-keyval, vite-plugin-pwa"
```

---

## Task 2: Local Database (Dexie)

**Files:**
- Create: `frontend/src/offline/db.ts`
- Test: `frontend/src/offline/db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/offline/db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { db, LocalNote, LocalImage, SyncOperation } from "./db";

describe("offline db", () => {
  it("stores and retrieves a note", async () => {
    await db.notes.clear();
    const note: LocalNote = {
      id: "n1",
      content: "hello",
      title: null,
      color: "white",
      tags: [],
      pinned: false,
      position: 1,
      createdAt: "2026-06-20T00:00:00Z",
      updatedAt: "2026-06-20T00:00:00Z",
      syncStatus: "pending",
      isDeleted: false,
    };
    await db.notes.add(note);
    const got = await db.notes.get("n1");
    expect(got?.content).toBe("hello");
  });

  it("stores a sync operation", async () => {
    await db.syncQueue.clear();
    const op: SyncOperation = {
      type: "CREATE_NOTE",
      entityId: "n1",
      payload: { content: "hello" },
      retries: 0,
      createdAt: Date.now(),
    };
    const id = await db.syncQueue.add(op);
    const got = await db.syncQueue.get(id);
    expect(got?.type).toBe("CREATE_NOTE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/db.test.ts 2>&1 | tail -20
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the database module**

Create `frontend/src/offline/db.ts`:

```ts
import Dexie, { type Table } from "dexie";

export interface LocalNote {
  id: string;
  content: string;
  title: string | null;
  color: string;
  tags: string[];
  pinned: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: "synced" | "pending" | "syncing";
  isDeleted: boolean;
}

export interface LocalImage {
  id: string;
  noteId: string | null;
  blob: Blob;
  mimeType: string;
  syncStatus: "pending" | "syncing" | "synced";
}

export interface SyncOperation {
  id?: number;
  type: "CREATE_NOTE" | "UPDATE_NOTE" | "DELETE_NOTE" | "UPLOAD_IMAGE";
  entityId: string;
  payload: Record<string, unknown>;
  retries: number;
  createdAt: number;
}

class ZenotesDb extends Dexie {
  notes!: Table<LocalNote, string>;
  images!: Table<LocalImage, string>;
  syncQueue!: Table<SyncOperation, number>;

  constructor() {
    super("zenotes-offline");
    this.version(1).stores({
      notes: "id, syncStatus, updatedAt",
      images: "id, noteId, syncStatus",
      syncQueue: "++id, type, entityId, createdAt",
    });
  }
}

export const db = new ZenotesDb();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/db.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/src/offline/db.ts frontend/src/offline/db.test.ts
git commit -m "feat(offline): add Dexie local database"
```

---

## Task 3: Network Status Hook

**Files:**
- Create: `frontend/src/offline/network.ts`
- Test: `frontend/src/offline/network.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/offline/network.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { useNetworkStatus } from "./network";
import { renderHook, act } from "@testing-library/react";

describe("useNetworkStatus", () => {
  it("returns online by default", () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it("reacts to offline/online events", () => {
    const { result } = renderHook(() => useNetworkStatus());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOnline).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.isOnline).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/network.test.ts 2>&1 | tail -20
```

Expected: FAIL module not found.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/offline/network.ts`:

```ts
import { useEffect, useState } from "react";

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { isOnline };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/network.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/src/offline/network.ts frontend/src/offline/network.test.ts
git commit -m "feat(offline): add network status hook"
```

---

## Task 4: Image Cache

**Files:**
- Create: `frontend/src/offline/imageCache.ts`
- Test: `frontend/src/offline/imageCache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/offline/imageCache.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { saveLocalImage, getLocalImageUrl, replaceLocalImageUrls, LOCAL_IMAGE_PREFIX } from "./imageCache";

describe("imageCache", () => {
  it("saves and retrieves a local image blob", async () => {
    const blob = new Blob(["pixel"], { type: "image/png" });
    const id = await saveLocalImage(blob, "image/png");
    const url = await getLocalImageUrl(id);
    expect(url.startsWith("blob:")).toBe(true);
    URL.revokeObjectURL(url);
  });

  it("replaces local placeholders with public urls", async () => {
    const html = `<img src="${LOCAL_IMAGE_PREFIX}img1">`;
    const replaced = replaceLocalImageUrls(html, { img1: "https://cdn.example.com/a.png" });
    expect(replaced).toContain("https://cdn.example.com/a.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/imageCache.test.ts 2>&1 | tail -20
```

Expected: FAIL module not found.

- [ ] **Step 3: Implement image cache**

Create `frontend/src/offline/imageCache.ts`:

```ts
import { db } from "./db";
import { nanoid } from "../lib/utils";

export const LOCAL_IMAGE_PREFIX = "local://";

export async function saveLocalImage(blob: Blob, mimeType: string, noteId: string | null = null) {
  const id = nanoid();
  await db.images.add({ id, noteId, blob, mimeType, syncStatus: "pending" });
  return id;
}

export async function getLocalImageUrl(id: string) {
  const image = await db.images.get(id);
  if (!image) return null;
  return URL.createObjectURL(image.blob);
}

export function replaceLocalImageUrls(content: string, urlMap: Record<string, string>) {
  return content.replace(new RegExp(`${LOCAL_IMAGE_PREFIX}([a-zA-Z0-9_-]+)`, "g"), (_, id) => {
    return urlMap[id] || `${LOCAL_IMAGE_PREFIX}${id}`;
  });
}

export function parseLocalImageIds(content: string): string[] {
  const matches = content.match(new RegExp(`${LOCAL_IMAGE_PREFIX}([a-zA-Z0-9_-]+)`, "g"));
  return matches ? matches.map((m) => m.replace(LOCAL_IMAGE_PREFIX, "")) : [];
}

export async function setImageNoteId(imageId: string, noteId: string) {
  await db.images.update(imageId, { noteId });
}

export async function markImageSynced(imageId: string) {
  await db.images.update(imageId, { syncStatus: "synced" });
}

export async function getPendingImagesForNote(noteId: string) {
  return db.images.where({ noteId, syncStatus: "pending" }).toArray();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/imageCache.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/src/offline/imageCache.ts frontend/src/offline/imageCache.test.ts
git commit -m "feat(offline): add local image cache"
```

---

## Task 5: Local Note API

**Files:**
- Create: `frontend/src/offline/localNoteApi.ts`
- Test: `frontend/src/offline/localNoteApi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/offline/localNoteApi.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { createLocalNote, updateLocalNote, deleteLocalNote, getLocalNotes } from "./localNoteApi";

describe("localNoteApi", () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.syncQueue.clear();
  });

  it("creates a note and adds CREATE_NOTE to sync queue", async () => {
    const note = await createLocalNote({ content: "hello" });
    expect(note.content).toBe("hello");
    expect(note.syncStatus).toBe("pending");
    const queue = await db.syncQueue.toArray();
    expect(queue[0].type).toBe("CREATE_NOTE");
    expect(queue[0].entityId).toBe(note.id);
  });

  it("updates a note and adds UPDATE_NOTE to sync queue", async () => {
    const created = await createLocalNote({ content: "hello" });
    await db.syncQueue.clear();
    const updated = await updateLocalNote(created.id, { content: "world" });
    expect(updated.content).toBe("world");
    const queue = await db.syncQueue.toArray();
    expect(queue[0].type).toBe("UPDATE_NOTE");
  });

  it("deletes a note and adds DELETE_NOTE to sync queue", async () => {
    const created = await createLocalNote({ content: "hello" });
    await db.syncQueue.clear();
    await deleteLocalNote(created.id);
    const got = await db.notes.get(created.id);
    expect(got?.isDeleted).toBe(true);
    const queue = await db.syncQueue.toArray();
    expect(queue[0].type).toBe("DELETE_NOTE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/localNoteApi.test.ts 2>&1 | tail -20
```

Expected: FAIL module not found.

- [ ] **Step 3: Implement local note API**

Create `frontend/src/offline/localNoteApi.ts`:

```ts
import { db, type LocalNote } from "./db";
import { nanoid } from "../lib/utils";

export type NoteInput = Partial<Omit<LocalNote, "id" | "syncStatus" | "isDeleted" | "createdAt" | "updatedAt">>;

export function nowIso() {
  return new Date().toISOString();
}

export async function createLocalNote(input: NoteInput = {}) {
  const ts = nowIso();
  const note: LocalNote = {
    id: nanoid(),
    content: "",
    title: null,
    color: "white",
    tags: [],
    pinned: false,
    position: 0,
    ...input,
    createdAt: ts,
    updatedAt: ts,
    syncStatus: "pending",
    isDeleted: false,
  };
  await db.notes.add(note);
  await db.syncQueue.add({
    type: "CREATE_NOTE",
    entityId: note.id,
    payload: note,
    retries: 0,
    createdAt: Date.now(),
  });
  return note;
}

export async function updateLocalNote(id: string, input: NoteInput & { content?: string }) {
  const existing = await db.notes.get(id);
  if (!existing) throw new Error(`Note not found: ${id}`);
  const updates: Partial<LocalNote> = {
    ...input,
    updatedAt: nowIso(),
    syncStatus: "pending",
  };
  await db.notes.update(id, updates);
  const updated = { ...existing, ...updates } as LocalNote;
  await db.syncQueue.add({
    type: "UPDATE_NOTE",
    entityId: id,
    payload: updated,
    retries: 0,
    createdAt: Date.now(),
  });
  return updated;
}

export async function deleteLocalNote(id: string) {
  await db.notes.update(id, { isDeleted: true, syncStatus: "pending", updatedAt: nowIso() });
  await db.syncQueue.add({
    type: "DELETE_NOTE",
    entityId: id,
    payload: {},
    retries: 0,
    createdAt: Date.now(),
  });
}

export async function getLocalNotes() {
  return db.notes.where("isDeleted").equals(0).sortBy("updatedAt");
}

export async function getLocalNote(id: string) {
  return db.notes.get(id);
}

export async function markNoteSynced(id: string, serverNote?: Partial<LocalNote>) {
  await db.notes.update(id, { syncStatus: "synced", ...serverNote });
}

export async function removeLocalNote(id: string) {
  await db.notes.delete(id);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/localNoteApi.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/src/offline/localNoteApi.ts frontend/src/offline/localNoteApi.test.ts
git commit -m "feat(offline): add local note CRUD and sync queue"
```

---

## Task 6: Sync Engine

**Files:**
- Create: `frontend/src/offline/syncEngine.ts`
- Test: `frontend/src/offline/syncEngine.test.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/offline/syncEngine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "./db";
import { createLocalNote } from "./localNoteApi";
import { processSyncQueue } from "./syncEngine";
import * as api from "../lib/api";

describe("syncEngine", () => {
  beforeEach(async () => {
    await db.notes.clear();
    await db.syncQueue.clear();
  });

  it("creates a note on the server and marks it synced", async () => {
    const note = await createLocalNote({ content: "sync me" });
    const createSpy = vi.spyOn(api, "createNote").mockResolvedValue({ ...note, syncStatus: "synced" } as any);

    await processSyncQueue();

    expect(createSpy).toHaveBeenCalledWith({ content: "sync me" });
    const queue = await db.syncQueue.toArray();
    expect(queue.length).toBe(0);
    const synced = await db.notes.get(note.id);
    expect(synced?.syncStatus).toBe("synced");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/syncEngine.test.ts 2>&1 | tail -20
```

Expected: FAIL module not found or `createNote` not found.

- [ ] **Step 3: Add missing API helpers in `lib/api.ts`**

Modify `frontend/src/lib/api.ts` by adding these functions near existing exports:

```ts
export async function createNote(body: { content: string; title?: string | null; color?: string; tags?: string[]; pinned?: boolean; position?: number }) {
  return fetchWithTimeout(`${API_BASE}/notes`, {
    ...fetchOpts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(throwIfNotOk).then(r => r.json());
}

export async function updateNote(id: string, body: Partial<{ content: string; title: string | null; color: string; tags: string[]; pinned: boolean; position: number }>) {
  return fetchWithTimeout(`${API_BASE}/notes/${id}`, {
    ...fetchOpts,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(throwIfNotOk).then(r => r.json());
}

export async function deleteNote(id: string) {
  return fetchWithTimeout(`${API_BASE}/notes/${id}`, {
    ...fetchOpts,
    method: "DELETE",
  }).then(throwIfNotOk);
}

export async function uploadImage(id: string, file: File) {
  const formData = new FormData();
  formData.append("image", file);
  return fetchWithTimeout(`${API_BASE}/notes/${id}/images`, {
    ...fetchOpts,
    method: "POST",
    body: formData,
  }).then(throwIfNotOk).then(r => r.json());
}
```

- [ ] **Step 4: Implement sync engine**

Create `frontend/src/offline/syncEngine.ts`:

```ts
import { toast } from "sonner";
import { db } from "./db";
import * as api from "../lib/api";
import { getPendingImagesForNote, markImageSynced, replaceLocalImageUrls } from "./imageCache";
import { markNoteSynced, removeLocalNote } from "./localNoteApi";

const MAX_RETRIES = 3;

export async function processSyncQueue() {
  const pending = await db.syncQueue.orderBy("createdAt").toArray();
  for (const op of pending) {
    if (!op.id) continue;
    try {
      await db.syncQueue.update(op.id, { retries: op.retries + 1 });
      await executeOperation(op);
      await db.syncQueue.delete(op.id);
    } catch (err) {
      console.error("[SyncEngine] failed", op.type, op.entityId, err);
      if (op.retries + 1 >= MAX_RETRIES) {
        toast.error(`同步失败: ${op.type}`);
      }
    }
  }
}

async function executeOperation(op: { type: string; entityId: string; payload: Record<string, unknown> }) {
  switch (op.type) {
    case "CREATE_NOTE": {
      const serverNote = await api.createNote(op.payload as any);
      await markNoteSynced(op.entityId, serverNote as any);
      await syncImagesForNote(op.entityId);
      break;
    }
    case "UPDATE_NOTE": {
      await api.updateNote(op.entityId, op.payload as any);
      await markNoteSynced(op.entityId);
      await syncImagesForNote(op.entityId);
      break;
    }
    case "DELETE_NOTE": {
      await api.deleteNote(op.entityId);
      await removeLocalNote(op.entityId);
      break;
    }
    case "UPLOAD_IMAGE": {
      // handled inside syncImagesForNote after note exists
      break;
    }
    default:
      console.warn("[SyncEngine] unknown op", op);
  }
}

async function syncImagesForNote(noteId: string) {
  const images = await getPendingImagesForNote(noteId);
  if (images.length === 0) return;
  const note = await db.notes.get(noteId);
  if (!note) return;

  const urlMap: Record<string, string> = {};
  for (const image of images) {
    const file = new File([image.blob], `${image.id}.png`, { type: image.mimeType });
    const result = (await api.uploadImage(noteId, file)) as { imageUrl: string };
    urlMap[image.id] = result.imageUrl;
    await markImageSynced(image.id);
  }

  if (Object.keys(urlMap).length > 0) {
    const newContent = replaceLocalImageUrls(note.content, urlMap);
    await db.notes.update(noteId, { content: newContent, syncStatus: "pending", updatedAt: new Date().toISOString() });
    await db.syncQueue.add({
      type: "UPDATE_NOTE",
      entityId: noteId,
      payload: { content: newContent },
      retries: 0,
      createdAt: Date.now(),
    });
    await processSyncQueue(); // recursively sync the content update
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/offline/syncEngine.test.ts 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/src/lib/api.ts frontend/src/offline/syncEngine.ts frontend/src/offline/syncEngine.test.ts
git commit -m "feat(offline): add sync engine and REST API helpers"
```

---

## Task 7: Refactor `useNotes` to Local-First

**Files:**
- Modify: `frontend/src/hooks/useNotes.ts`
- Modify: `frontend/src/pages/Index.tsx` (imports and usage)

- [ ] **Step 1: Rewrite `useNotes.ts`**

Replace `frontend/src/hooks/useNotes.ts` content with:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { useNetworkStatus } from "@/offline/network";
import { processSyncQueue } from "@/offline/syncEngine";
import {
  createLocalNote,
  updateLocalNote,
  deleteLocalNote,
  getLocalNotes,
  type NoteInput,
} from "@/offline/localNoteApi";
import { db } from "@/offline/db";
import { liveQuery } from "dexie";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 50;

export function useNotes() {
  const queryClient = useQueryClient();
  const { isOnline } = useNetworkStatus();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    if (isOnline) {
      processSyncQueue();
    }
  }, [isOnline]);

  // Seed local DB from server on mount
  useQuery({
    queryKey: ["notes", "seed"],
    queryFn: async () => {
      const data = (await api.fetchNotes(1, 1000)) as {
        notes: any[];
        pagination: { total: number };
      };
      await db.transaction("rw", db.notes, async () => {
        for (const note of data.notes) {
          const exists = await db.notes.get(note.id);
          if (!exists) {
            await db.notes.add({
              ...note,
              syncStatus: "synced",
              isDeleted: false,
            });
          }
        }
      });
      return data;
    },
    enabled: isOnline,
    staleTime: 5 * 60 * 1000,
  });

  // Live local notes
  const [localNotes, setLocalNotes] = useState<any[]>([]);
  useEffect(() => {
    const subscription = liveQuery(() => getLocalNotes()).subscribe(setLocalNotes);
    return () => subscription.unsubscribe();
  }, []);

  const filteredNotes = useMemo(() => {
    let list = localNotes;
    if (selectedTag) {
      list = list.filter((n) => n.tags.includes(selectedTag));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((n) => n.content.toLowerCase().includes(q) || (n.title ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [localNotes, searchQuery, selectedTag]);

  const total = filteredNotes.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginatedNotes = useMemo(() => filteredNotes.slice(start, start + PAGE_SIZE).reverse(), [filteredNotes, start]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    localNotes.forEach((n) => n.tags.forEach((t: string) => set.add(t)));
    return Array.from(set);
  }, [localNotes]);

  const addMutation = useMutation({
    mutationFn: createLocalNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      if (isOnline) processSyncQueue();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: NoteInput }) => updateLocalNote(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      if (isOnline) processSyncQueue();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLocalNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      toast.success("Note deleted");
      if (isOnline) processSyncQueue();
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      return updateLocalNote(id, { pinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      if (isOnline) processSyncQueue();
    },
  });

  return {
    notes: paginatedNotes,
    isLoading: false,
    page: safePage,
    setPage,
    pageSize: PAGE_SIZE,
    pagination: {
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
    },
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    allTags,
    addNote: addMutation.mutate,
    updateNote: updateMutation.mutate,
    deleteNote: deleteMutation.mutate,
    moveNote: moveMutation.mutate,
  };
}
```

- [ ] **Step 2: Update `Index.tsx` to use new hook shape**

In `frontend/src/pages/Index.tsx`, replace the destructuring of `useNotes()` with the new return fields. Keep the existing UI structure, but use:

```ts
const { notes, page, setPage, pagination, searchQuery, setSearchQuery, selectedTag, setSelectedTag, allTags, addNote, updateNote, deleteNote, moveNote } = useNotes();
```

Replace usages of `notesQuery.data?.notes` with `notes`, `addNoteMutation.mutate` with `addNote`, etc.

- [ ] **Step 3: Run existing tests**

```bash
cd /Users/xinference/github/zenotes/frontend
npx vitest run src/hooks/useNotes.test.tsx 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/src/hooks/useNotes.ts frontend/src/pages/Index.tsx
git commit -m "feat(offline): refactor useNotes to local-first"
```

---

## Task 8: Phone/Tablet Responsive Layout

**Files:**
- Create: `frontend/src/components/NoteList.tsx`
- Create: `frontend/src/components/NoteEditor.tsx`
- Create: `frontend/src/components/ResponsiveLayout.tsx`
- Create: `frontend/src/hooks/use-media-query.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Index.tsx`

- [ ] **Step 1: Create `useMediaQuery` hook**

Create `frontend/src/hooks/use-media-query.ts`:

```ts
import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}
```

- [ ] **Step 2: Create `ResponsiveLayout.tsx`**

Create `frontend/src/components/ResponsiveLayout.tsx`:

```tsx
import { Outlet } from "react-router-dom";
import { NoteList } from "./NoteList";
import { useMediaQuery } from "@/hooks/use-media-query";

export function ResponsiveLayout() {
  const isTablet = useMediaQuery("(min-width: 768px)");
  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className={`${isTablet ? "w-80 border-r" : "w-full"} h-full overflow-auto`}>
        <NoteList />
      </div>
      {isTablet && (
        <div className="flex-1 h-full overflow-auto bg-muted/30">
          <Outlet />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `NoteList.tsx`**

Create `frontend/src/components/NoteList.tsx`:

```tsx
import { useNotes } from "@/hooks/useNotes";
import { NotesGrid } from "./NotesGrid";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

export function NoteList() {
  const { notes, page, setPage, pagination, searchQuery, setSearchQuery, selectedTag, setSelectedTag, allTags } = useNotes();

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={selectedTag === null ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedTag(null)}
            >
              All
            </Badge>
            {allTags.map((tag) => (
              <Badge
                key={tag}
                variant={selectedTag === tag ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <NotesGrid notes={notes} />
      {pagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); setPage(Math.max(1, page - 1)); }}
                className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
              <PaginationItem key={p}>
                <PaginationLink
                  href="#"
                  onClick={(e) => { e.preventDefault(); setPage(p); }}
                  isActive={page === p}
                  className="cursor-pointer"
                >
                  {p}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); setPage(Math.min(pagination.totalPages, page + 1)); }}
                className={page >= pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `NoteEditor.tsx`**

Create `frontend/src/components/NoteEditor.tsx`:

```tsx
import { useParams, useNavigate } from "react-router-dom";
import { useNotes } from "@/hooks/useNotes";
import { NoteDialog } from "./NoteDialog";

export function NoteEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notes, updateNote, deleteNote } = useNotes();
  const note = id && id !== "new" ? notes.find((n) => n.id === id) : null;

  if (!note && id !== "new") {
    return <div className="p-8 text-center text-muted-foreground">Note not found</div>;
  }

  return (
    <div className="h-full">
      <NoteDialog
        note={note || null}
        open={true}
        onOpenChange={(open) => {
          if (!open) navigate("/");
        }}
        onSave={(data) => {
          if (id && id !== "new") {
            updateNote({ id, input: data });
          }
        }}
        onDelete={() => {
          if (id && id !== "new") deleteNote(id);
          navigate("/");
        }}
      />
    </div>
  );
}
```

> **Note:** Verify `NoteDialog` props in the actual codebase. Adjust `onSave` signature if it expects different arguments.

- [ ] **Step 5: Update `App.tsx` routes**

Modify `frontend/src/App.tsx`:

```tsx
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { NoteEditor } from "@/components/NoteEditor";

<Routes>
  <Route path="/" element={<ResponsiveLayout />}>
    <Route index element={<div className="flex items-center justify-center h-full text-muted-foreground">Select a note</div>} />
    <Route path="note/:id" element={<NoteEditor />} />
  </Route>
  <Route path="*" element={<NotFound />} />
</Routes>
```

- [ ] **Step 6: Simplify `Index.tsx`**

`frontend/src/pages/Index.tsx` should no longer be a route entry. Remove it from `App.tsx` route or keep it as a redirect. For this plan, remove the `Route path="/" element={<Index />}` line and rely on `ResponsiveLayout`.

- [ ] **Step 7: Build and tests**

```bash
cd /Users/xinference/github/zenotes/frontend
npm run build 2>&1 | tail -20
npx vitest run 2>&1 | tail -20
```

Expected: build succeeds, tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/src/hooks/use-media-query.ts frontend/src/components/ResponsiveLayout.tsx frontend/src/components/NoteList.tsx frontend/src/components/NoteEditor.tsx frontend/src/App.tsx frontend/src/pages/Index.tsx
git commit -m "feat(ui): add phone/tablet responsive layout"
```

---

## Task 9: PWA Manifest, Icons, and Service Worker

**Files:**
- Create: `frontend/public/manifest.json`
- Create: `frontend/public/icon.svg`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/index.html`

- [ ] **Step 1: Create manifest**

Create `frontend/public/manifest.json`:

```json
{
  "name": "Zenotes",
  "short_name": "Zenotes",
  "description": "Offline-first notes for Android",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create icon SVG**

Create `frontend/public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#f59e0b"/>
  <text x="256" y="330" font-size="260" text-anchor="middle" fill="white" font-family="serif">Z</text>
</svg>
```

- [ ] **Step 3: Generate PNG icons**

```bash
cd /Users/xinference/github/zenotes/frontend
npx pwa-asset-generator public/icon.svg public --padding 0 --background "#f59e0b" --icon-only
```

Expected: generates `icon-192.png` and `icon-512.png` in `public/`.

- [ ] **Step 4: Configure vite-plugin-pwa**

Modify `frontend/vite.config.ts`:

```ts
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // existing config
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.zenotes\.site\/api\/notes/,
            handler: "NetworkFirst",
            options: { cacheName: "api-notes" },
          },
        ],
      },
    }),
  ],
});
```

- [ ] **Step 5: Update `index.html`**

Add inside `<head>`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#ffffff" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="apple-touch-icon" href="/icon-192.png" />
```

- [ ] **Step 6: Register service worker**

Modify `frontend/src/main.tsx`:

```tsx
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });
```

- [ ] **Step 7: Build and verify**

```bash
cd /Users/xinference/github/zenotes/frontend
npm run build 2>&1 | tail -20
```

Expected: build succeeds, `dist/sw.js` exists.

- [ ] **Step 8: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/public/manifest.json frontend/public/icon.svg frontend/public/icon-192.png frontend/public/icon-512.png frontend/vite.config.ts frontend/index.html frontend/src/main.tsx
git commit -m "feat(pwa): add manifest, icons, service worker"
```

---

## Task 10: Install Prompt Button

**Files:**
- Create: `frontend/src/types/pwa.d.ts`
- Modify: `frontend/src/components/Header.tsx`

- [ ] **Step 1: Add PWA type declaration**

Create `frontend/src/types/pwa.d.ts`:

```ts
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export {};
```

- [ ] **Step 2: Add install prompt logic to Header**

In `frontend/src/components/Header.tsx`, add state and effect near top:

```tsx
const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

useEffect(() => {
  const handler = (e: BeforeInstallPromptEvent) => {
    e.preventDefault();
    setInstallPrompt(e);
  };
  window.addEventListener("beforeinstallprompt", handler as EventListener);
  return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
}, []);

const isStandalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
```

- [ ] **Step 3: Add install button**

Render a button when `installPrompt && !isStandalone`:

```tsx
{installPrompt && !isStandalone && (
  <Button
    variant="outline"
    size="sm"
    onClick={async () => {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") setInstallPrompt(null);
    }}
  >
    Install
  </Button>
)}
```

- [ ] **Step 4: Build and test**

```bash
cd /Users/xinference/github/zenotes/frontend
npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/src/types/pwa.d.ts frontend/src/components/Header.tsx
git commit -m "feat(pwa): add install prompt button"
```

---

## Task 11: E2E Offline Sync Test

**Files:**
- Create: `frontend/e2e/offline.spec.ts`

- [ ] **Step 1: Write E2E test**

Create `frontend/e2e/offline.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("offline create note and sync", async ({ page, context }) => {
  await page.goto("/");
  // assumes user is already logged in or test account seeded
  await page.getByTestId("new-note").click();
  await page.getByRole("textbox").fill("online note");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("online note")).toBeVisible();

  await context.setOffline(true);
  await page.getByTestId("new-note").click();
  await page.getByRole("textbox").fill("created offline");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("created offline")).toBeVisible();

  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText("created offline")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test (requires Playwright)**

```bash
cd /Users/xinference/github/zenotes/frontend
npx playwright test e2e/offline.spec.ts --project=chromium 2>&1 | tail -20
```

Expected: PASS after implementation.

- [ ] **Step 3: Commit**

```bash
cd /Users/xinference/github/zenotes
git add frontend/e2e/offline.spec.ts
git commit -m "test(e2e): add offline sync smoke test"
```

---

## Task 12: Build and Deploy

- [ ] **Step 1: Build frontend**

```bash
cd /Users/xinference/github/zenotes/frontend
npm run build 2>&1 | tail -10
```

Expected: `dist/` contains `index.html`, `sw.js`, `manifest.json`, icons.

- [ ] **Step 2: Deploy worker**

```bash
cd /Users/xinference/github/zenotes/worker
npx wrangler deploy 2>&1 | tail -10
```

- [ ] **Step 3: Deploy pages**

```bash
cd /Users/xinference/github/zenotes/frontend
npx wrangler pages deploy dist --project-name="zenotes" 2>&1 | tail -10
```

- [ ] **Step 4: Verify on Android**

1. Open `https://zenotes.site` in Android Chrome.
2. Tap “Install” or menu “Add to Home screen”.
3. Open installed app.
4. Enable airplane mode, create a note with text + image.
5. Disable airplane mode, refresh, verify note synced.
6. On tablet, verify landscape shows list + editor side-by-side.

---

## Self-Review Checklist

- **Spec coverage:**
  - Offline-first local writes → Task 5, 7
  - Sync engine → Task 6
  - Local priority conflict → Task 6 (PUT directly)
  - Image offline cache → Task 4, 6
  - Phone/tablet layout → Task 8
  - PWA manifest/SW → Task 9
  - Install prompt → Task 10
  - Tests → Task 11
- **Placeholder scan:** No TBD/TODO in implementation code; icon generation command is explicit.
- **Type consistency:** `LocalNote`/`LocalImage`/`SyncOperation` interfaces match across `db.ts`, `localNoteApi.ts`, `syncEngine.ts`.
