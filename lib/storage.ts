import { Note, NoteMetadata } from "@/types/note";
import { v4 as uuidv4 } from "uuid";
import {
  smartCleanup,
  emergencyCleanup,
  canSaveNote,
  estimateNoteSize,
  cleanupCorruptedData,
} from "./storage-manager";
import { settingsManager } from "@/lib/settings";

const STORAGE_KEY = "mynotes_data";
const METADATA_KEY = "mynotes_metadata";

// 获取所有笔记元数据
export function getAllNotesMetadata(): NoteMetadata[] {
  if (typeof window === "undefined") return [];

  const data = localStorage.getItem(METADATA_KEY);
  if (!data) return [];

  try {
    const metadata = JSON.parse(data);
    return metadata.map((item: any) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    }));
  } catch (error) {
    console.error("Error parsing notes metadata:", error);
    return [];
  }
}

// 获取单个笔记
export function getNote(id: string): Note | null {
  if (typeof window === "undefined") return null;

  const data = localStorage.getItem(`${STORAGE_KEY}_${id}`);
  if (!data) return null;

  try {
    const note = JSON.parse(data);
    return {
      ...note,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    };
  } catch (error) {
    console.error("Error parsing note:", error);
    return null;
  }
}

// 保存笔记
export function saveNote(note: Note): void {
  if (typeof window === "undefined") return;

  const storageSettings = settingsManager.getSettingsGroup("storage");

  try {
    // 检查当前存储使用情况
    const currentUsage = getStorageUsagePercentage();
    const storageInfo = getStorageInfo();

    console.log(`Storage status: ${currentUsage}% used (${(storageInfo.used / 1024 / 1024).toFixed(2)}MB / ${((storageInfo.used + storageInfo.available) / 1024 / 1024).toFixed(2)}MB)`);

    // 如果存储使用率超过阈值，先尝试清理
    if (currentUsage >= storageSettings.cleanupThresholdPercent) {
      console.log(`Storage usage at ${currentUsage}%, attempting cleanup...`);
      const cleanupSuccess = smartCleanup(1024 * 1024); // 尝试释放1MB
      if (cleanupSuccess) {
        console.log("Preventive cleanup successful");
      } else {
        console.log("Preventive cleanup failed");
      }
    }

    // 如果存储使用率超过95%，强制进行更激进的清理
    if (currentUsage >= 95) {
      console.log(`Storage critically full at ${currentUsage}%, forcing aggressive cleanup...`);
      const aggressiveCleanup = smartCleanup(2 * 1024 * 1024); // 尝试释放2MB
      if (!aggressiveCleanup) {
        // 如果智能清理失败，尝试紧急清理
        console.log("Smart cleanup failed, trying emergency cleanup...");
        const emergencySuccess = emergencyCleanup(2 * 1024 * 1024);
        console.log(`Emergency cleanup ${emergencySuccess ? 'succeeded' : 'failed'}`);
      } else {
        console.log("Aggressive cleanup succeeded");
      }
    }

    // 保存笔记内容
    const noteData = {
      ...note,
      createdAt:
        note.createdAt instanceof Date
          ? note.createdAt.toISOString()
          : new Date(note.createdAt).toISOString(),
      updatedAt:
        note.updatedAt instanceof Date
          ? note.updatedAt.toISOString()
          : new Date(note.updatedAt).toISOString(),
    };

    // 检查存储空间
    let dataStr = JSON.stringify(noteData);
    let dataSize = new Blob([dataStr]).size;

    // 检查单个笔记大小限制
    const maxNoteSizeBytes = storageSettings.maxNoteSizeKB * 1024;

    if (dataSize > maxNoteSizeBytes) {
      console.warn(
        `Note ${note.id} is too large: ${(dataSize / 1024).toFixed(2)}KB (max: ${storageSettings.maxNoteSizeKB}KB)`,
      );

      // 如果启用了压缩，尝试压缩内容
      if (storageSettings.enableCompression) {
        const compressedNote = {
          ...noteData,
          content: compressContent(noteData.content),
        };
        dataStr = JSON.stringify(compressedNote);
        dataSize = new Blob([dataStr]).size;

        // 检查压缩后是否仍然过大
        if (dataSize > maxNoteSizeBytes) {
          throw new Error(`笔记过大 (${(dataSize / 1024).toFixed(2)}KB)，即使压缩后仍超过限制 (${storageSettings.maxNoteSizeKB}KB)`);
        }

        localStorage.setItem(`${STORAGE_KEY}_${note.id}`, dataStr);
      } else {
        throw new Error(`笔记过大 (${(dataSize / 1024).toFixed(2)}KB)，超过限制 (${storageSettings.maxNoteSizeKB}KB)`);
      }
    } else {
      localStorage.setItem(`${STORAGE_KEY}_${note.id}`, dataStr);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      // 存储空间已满，尝试更激进的清理
      console.warn("Storage quota exceeded. Attempting aggressive cleanup...");

      try {
        // 尝试释放更多空间
        const requiredSpace = estimateNoteSize(note) + 1024 * 1024; // 需要的空间 + 1MB缓冲
        let cleanupSuccess = false;

        // 强制启用自动清理，即使用户禁用了
        console.log("Forcing aggressive cleanup due to storage full...");

        // 先尝试智能清理
        cleanupSuccess = smartCleanup(requiredSpace);

        // 如果智能清理失败，尝试更激进的清理
        if (!cleanupSuccess) {
          console.warn("Smart cleanup failed, trying aggressive cleanup...");
          const details = getStorageDetails();
          const targetFree = Math.max(requiredSpace, details.totalSize * 0.4); // 释放40%空间
          const deleted = cleanupStorage(targetFree);
          cleanupSuccess = deleted > 0;
        }

        // 如果还是失败，尝试删除最大的几个笔记
        if (!cleanupSuccess) {
          console.warn("Aggressive cleanup failed, trying emergency cleanup...");
          cleanupSuccess = emergencyCleanup(requiredSpace);
        }

        if (cleanupSuccess) {
          // 重试保存
          const noteData = {
            ...note,
            createdAt:
              note.createdAt instanceof Date
                ? note.createdAt.toISOString()
                : new Date(note.createdAt).toISOString(),
            updatedAt:
              note.updatedAt instanceof Date
                ? note.updatedAt.toISOString()
                : new Date(note.updatedAt).toISOString(),
          };

          let finalDataStr = JSON.stringify(noteData);

          // 如果启用压缩，压缩后再保存
          if (storageSettings.enableCompression) {
            const compressedNote = {
              ...noteData,
              content: compressContent(noteData.content),
            };
            finalDataStr = JSON.stringify(compressedNote);
          }

          localStorage.setItem(`${STORAGE_KEY}_${note.id}`, finalDataStr);
        } else {
          throw new Error(
            `浏览器存储空间已满 (${(getStorageInfo().used / 1024 / 1024).toFixed(1)}MB)。请在存储管理中删除一些旧笔记，或增加存储容量配置。`
          );
        }
      } catch (retryError) {
        if (retryError instanceof DOMException && retryError.name === "QuotaExceededError") {
          throw new Error(
            `浏览器存储空间已满，无法保存笔记。当前使用: ${(getStorageInfo().used / 1024 / 1024).toFixed(1)}MB。请删除一些旧笔记后重试。`
          );
        } else {
          throw retryError;
        }
      }
    } else {
      throw error;
    }
  }

  // 更新元数据
  const metadata = getAllNotesMetadata();
  const existingIndex = metadata.findIndex((m) => m.id === note.id);

  const noteMetadata: NoteMetadata = {
    id: note.id,
    title: note.title,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    tags: note.tags,
    category: note.category,
    excerpt: extractExcerpt(note.content),
  };

  if (existingIndex >= 0) {
    metadata[existingIndex] = noteMetadata;
  } else {
    metadata.push(noteMetadata);
  }

  const metadataData = metadata.map((m) => ({
    ...m,
    createdAt:
      m.createdAt instanceof Date
        ? m.createdAt.toISOString()
        : new Date(m.createdAt).toISOString(),
    updatedAt:
      m.updatedAt instanceof Date
        ? m.updatedAt.toISOString()
        : new Date(m.updatedAt).toISOString(),
  }));
  localStorage.setItem(METADATA_KEY, JSON.stringify(metadataData));
}

// 创建新笔记
export function createNote(noteData: Omit<Note, "id">): Note {
  const note: Note = {
    ...noteData,
    id: uuidv4(),
  };

  saveNote(note);
  return note;
}

// 更新笔记
export function updateNote(
  id: string,
  updates: Partial<Omit<Note, "id" | "createdAt">>,
): Note | null {
  const note = getNote(id);
  if (!note) return null;

  const updatedNote: Note = {
    ...note,
    ...updates,
    updatedAt: new Date(),
  };

  saveNote(updatedNote);
  return updatedNote;
}

// 删除笔记
export function deleteNote(id: string): boolean {
  if (typeof window === "undefined") return false;

  // 删除笔记内容
  localStorage.removeItem(`${STORAGE_KEY}_${id}`);

  // 更新元数据
  const metadata = getAllNotesMetadata();
  const filtered = metadata.filter((m) => m.id !== id);

  const metadataData = filtered.map((m) => ({
    ...m,
    createdAt:
      m.createdAt instanceof Date
        ? m.createdAt.toISOString()
        : new Date(m.createdAt).toISOString(),
    updatedAt:
      m.updatedAt instanceof Date
        ? m.updatedAt.toISOString()
        : new Date(m.updatedAt).toISOString(),
  }));
  localStorage.setItem(METADATA_KEY, JSON.stringify(metadataData));

  return true;
}

// 搜索笔记
export function searchNotes(query: string): NoteMetadata[] {
  const metadata = getAllNotesMetadata();
  const lowerQuery = query.toLowerCase();

  return metadata.filter((note) => {
    const titleMatch = note.title.toLowerCase().includes(lowerQuery);
    const tagMatch = note.tags?.some((tag) =>
      tag.toLowerCase().includes(lowerQuery),
    );
    const categoryMatch = note.category?.toLowerCase().includes(lowerQuery);
    const excerptMatch = note.excerpt?.toLowerCase().includes(lowerQuery);

    return titleMatch || tagMatch || categoryMatch || excerptMatch;
  });
}

// 按标签筛选笔记
export function getNotesByTag(tag: string): NoteMetadata[] {
  const metadata = getAllNotesMetadata();
  return metadata.filter((note) => note.tags?.includes(tag));
}

// 按分类筛选笔记
export function getNotesByCategory(category: string): NoteMetadata[] {
  const metadata = getAllNotesMetadata();
  return metadata.filter((note) => note.category === category);
}

// 获取所有标签
export function getAllTags(): string[] {
  const metadata = getAllNotesMetadata();
  const tagsSet = new Set<string>();

  metadata.forEach((note) => {
    note.tags?.forEach((tag) => tagsSet.add(tag));
  });

  return Array.from(tagsSet).sort();
}

// 获取所有分类
export function getAllCategories(): string[] {
  const metadata = getAllNotesMetadata();
  const categoriesSet = new Set<string>();

  metadata.forEach((note) => {
    if (note.category) {
      categoriesSet.add(note.category);
    }
  });

  return Array.from(categoriesSet).sort();
}

// 批量导入笔记
export function batchSaveNotes(notes: Omit<Note, "id">[]): Note[] {
  const savedNotes: Note[] = [];
  const failedNotes: { note: Omit<Note, "id">; error: string }[] = [];

  // 先清理损坏的数据
  const corruptedCleaned = cleanupCorruptedData();
  if (corruptedCleaned > 0) {
    console.log(`Cleaned ${corruptedCleaned} corrupted entries before import`);
  }

  // 检查可用存储空间
  const { used, available } = getStorageInfo();
  const remainingSpace = available - used;

  console.log(
    `Storage info: Used ${(used / 1024 / 1024).toFixed(2)}MB, Available ${(remainingSpace / 1024 / 1024).toFixed(2)}MB`,
  );

  // 按大小排序，优先导入小的笔记
  const sortedNotes = [...notes].sort((a, b) => {
    const sizeA = estimateNoteSize(a);
    const sizeB = estimateNoteSize(b);
    return sizeA - sizeB;
  });

  for (const noteData of sortedNotes) {
    try {
      // 检查是否有足够空间
      if (!canSaveNote(noteData)) {
        // 尝试智能清理
        const requiredSpace = estimateNoteSize(noteData) + 100 * 1024;
        const cleanupSuccess = smartCleanup(requiredSpace);

        if (!cleanupSuccess) {
          console.warn(
            `Skipping note "${noteData.title}" - insufficient space even after cleanup`,
          );
          failedNotes.push({
            note: noteData,
            error: "存储空间不足",
          });
          continue;
        }
      }

      const note = createNote(noteData);
      savedNotes.push(note);
    } catch (error) {
      console.error(`Failed to save note: ${noteData.title}`, error);
      failedNotes.push({
        note: noteData,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // 如果连续失败太多，停止导入
      if (failedNotes.length > 5) {
        console.error(
          `Too many failures. Successfully imported ${savedNotes.length} notes.`,
        );
        break;
      }
    }
  }

  if (failedNotes.length > 0) {
    console.warn(
      `Import complete: ${savedNotes.length} succeeded, ${failedNotes.length} failed`,
    );
  }

  if (failedNotes.length > 0 && savedNotes.length === 0) {
    throw new Error(`无法导入任何笔记。存储空间严重不足，请清理后重试。`);
  }

  return savedNotes;
}

// 导出所有笔记
export function exportAllNotes(): Note[] {
  const metadata = getAllNotesMetadata();
  const notes: Note[] = [];

  metadata.forEach((meta) => {
    const note = getNote(meta.id);
    if (note) {
      notes.push(note);
    }
  });

  return notes;
}

// 清空所有笔记
export function clearAllNotes(): void {
  if (typeof window === "undefined") return;

  const metadata = getAllNotesMetadata();
  metadata.forEach((meta) => {
    localStorage.removeItem(`${STORAGE_KEY}_${meta.id}`);
  });

  localStorage.removeItem(METADATA_KEY);
}

// 从内容中提取摘要
function extractExcerpt(content: any[]): string {
  let text = "";

  for (const node of content) {
    if (node.type === "paragraph" && node.children) {
      for (const child of node.children) {
        if (typeof child.text === "string") {
          text += child.text + " ";
        }
      }
    } else if (node.type === "heading-one" && node.children) {
      for (const child of node.children) {
        if (typeof child.text === "string") {
          text += child.text + " ";
        }
      }
    } else if (node.type === "heading-two" && node.children) {
      for (const child of node.children) {
        if (typeof child.text === "string") {
          text += child.text + " ";
        }
      }
    }

    if (text.length > 150) break;
  }

  text = text.trim();
  if (text.length > 150) {
    return text.slice(0, 147) + "...";
  }
  return text || "无内容";
}

// 检查存储空间
export function getStorageInfo(): { used: number; available: number; browserLimit: number; configuredLimit: number } {
  if (typeof window === "undefined") {
    return { used: 0, available: 0, browserLimit: 0, configuredLimit: 0 };
  }

  let used = 0;

  // 获取存储限制信息
  const storageSettings = settingsManager.getSettingsGroup("storage");
  const configuredLimit = storageSettings.maxCapacityMB * 1024 * 1024;

  // 估算浏览器实际限制
  // 统一采用保守 5MB 上限，避免 UA 误判
  const browserLimit = 5 * 1024 * 1024;

  // 使用较小的限制作为有效限制
  const effectiveLimit = Math.min(configuredLimit, browserLimit);

  try {
    for (let key in localStorage) {
      if (key.startsWith(STORAGE_KEY) || key === METADATA_KEY) {
        const value = localStorage.getItem(key);
        if (value) {
          used += new Blob([value]).size;
        }
      }
    }
  } catch (error) {
    console.error("Error calculating storage:", error);
  }

  return {
    used,
    available: effectiveLimit - used,
    browserLimit,
    configuredLimit
  };
}

// 压缩内容（简单实现，移除多余空格等）
function compressContent(content: any[]): any[] {
  return content.map((node) => {
    if (node.type === "paragraph" && node.children) {
      return {
        ...node,
        children: node.children.map((child: any) => {
          if (child.text) {
            return {
              ...child,
              text: child.text.replace(/\s+/g, " ").trim(),
            };
          }
          return child;
        }),
      };
    }
    return node;
  });
}

// 手动触发紧急清理
export function triggerEmergencyCleanup(): boolean {
  return emergencyCleanup(2 * 1024 * 1024); // 尝试释放2MB
}

// 获取存储使用百分比
export function getStorageUsagePercentage(): number {
  const { used, available } = getStorageInfo();
  const total = used + available;
  if (total === 0) return 0;
  return Math.round((used / total) * 100);
}

// 检查是否有足够空间
export function hasEnoughSpace(sizeInBytes: number = 100 * 1024): boolean {
  const { used, available } = getStorageInfo();
  return available - used > sizeInBytes;
}

// 删除单个笔记


// 删除多个笔记
export function deleteNotes(ids: string[]): boolean {
  if (typeof window === "undefined") return false;

  try {
    ids.forEach(id => {
      localStorage.removeItem(`${STORAGE_KEY}_${id}`);
    });
    
    const metadata = getAllNotesMetadata();
    const updatedMetadata = metadata.filter(m => !ids.includes(m.id));
    saveMetadata(updatedMetadata);
    
    return true;
  } catch (error) {
    console.error("Error deleting notes:", error);
    return false;
  }
}

// 清空所有笔记
export function deleteAllNotes(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const metadata = getAllNotesMetadata();
    metadata.forEach(m => {
      localStorage.removeItem(`${STORAGE_KEY}_${m.id}`);
    });
    
    localStorage.removeItem(METADATA_KEY);
    return true;
  } catch (error) {
    console.error("Error deleting all notes:", error);
    return false;
  }
}

// 获取笔记数量
export function getNotesCount(): number {
  const metadata = getAllNotesMetadata();
  return metadata.length;
}
