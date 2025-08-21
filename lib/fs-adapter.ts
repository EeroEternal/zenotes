// Minimal File System Access API helper to pick a folder and remember it
// This does not change storage backend yet; it only manages the selected directory handle.

import { saveDirectoryHandle, getDirectoryHandle, clearDirectoryHandle, verifyPermission } from "./fs-handle-store";

export interface PickResult {
  handle: FileSystemDirectoryHandle | null;
  granted: boolean;
  name: string | null;
  error?: string;
}

export async function pickDirectoryWithDefault(defaultFolderName = "Mynotes"): Promise<PickResult> {
  if (typeof window === "undefined" || !(window as any).showDirectoryPicker) {
    return { handle: null, granted: false, name: null, error: "当前浏览器不支持文件系统访问 API (仅 Chrome/Edge)。" };
  }

  try {
    // Let user pick a folder; we cannot auto-create outside picker for security reasons
    const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: "mynotes-root" });
    const ok = await verifyPermission(handle);

    // Ensure our default subfolder exists inside the chosen folder
    let target: FileSystemDirectoryHandle = handle;
    if (defaultFolderName) {
      target = await handle.getDirectoryHandle(defaultFolderName, { create: true });
    }

    if (ok) {
      await saveDirectoryHandle(target);
    }
    return { handle: target, granted: ok, name: (target as any).name ?? defaultFolderName };
  } catch (e) {
    return { handle: null, granted: false, name: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getSavedDirectory(): Promise<{ handle: FileSystemDirectoryHandle | null; granted: boolean; name: string | null; }>{
  try {
    const handle = await getDirectoryHandle();
    if (!handle) return { handle: null, granted: false, name: null };
    const ok = await verifyPermission(handle);
    return { handle: ok ? handle : null, granted: ok, name: (handle as any).name ?? null };
  } catch {
    return { handle: null, granted: false, name: null };
  }
}

export async function clearSavedDirectory(): Promise<void> {
  await clearDirectoryHandle();
}

