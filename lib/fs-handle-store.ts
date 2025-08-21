// Utilities to persist and retrieve File System Access API directory handles via IndexedDB
// No external deps; uses low-level IndexedDB. Modern Chromium supports structured clone for handles.

const DB_NAME = "mynotes-fs";
const STORE_NAME = "handles";
const KEY_ROOT = "root-dir";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open IDB"));
  });
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IDB tx error"));
    const store = tx.objectStore(STORE_NAME);
    store.put(handle as any, KEY_ROOT);
  });
}

export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error || new Error("IDB tx error"));
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY_ROOT);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
    req.onerror = () => reject(req.error || new Error("IDB get error"));
  });
}

export async function clearDirectoryHandle(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IDB tx error"));
    const store = tx.objectStore(STORE_NAME);
    store.delete(KEY_ROOT);
  });
}

export async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    // @ts-ignore: queryPermission/writePermission exist in FS handles
    const perm = await (handle as any).queryPermission?.({ mode: "readwrite" });
    if (perm === "granted") return true;
    // @ts-ignore
    const req = await (handle as any).requestPermission?.({ mode: "readwrite" });
    return req === "granted";
  } catch {
    return false;
  }
}

