import { z } from "zod";

// 设置数据结构
export const SettingsSchema = z.object({
  markdown: z.object({
    sourceDirectory: z.string().default("/Users/mac-m4/sync/md"),
    importSubdirectories: z.boolean().default(true),
    autoProcessImages: z.boolean().default(true),
  }),
  images: z.object({
    saveDirectory: z.string().default("public/images"),
    baseUrl: z.string().default("/images"),
    maxWidth: z.number().default(1920),
    maxHeight: z.number().default(1080),
    quality: z.number().min(1).max(100).default(90),
    keepOriginalNames: z.boolean().default(false),
    organizeByDate: z.boolean().default(false),
  }),
  storage: z.object({
    maxCapacityMB: z.number().min(5).max(1000).default(50),
    enableAutoCleanup: z.boolean().default(true),
    cleanupThresholdPercent: z.number().min(50).max(95).default(85),
    preferredStorageType: z.enum(["localStorage", "indexedDB", "fileSystem"]).default("localStorage"),
    customStorageDirectory: z.string().default(""),
    enableCompression: z.boolean().default(true),
    maxNoteSizeKB: z.number().min(100).max(5000).default(500),
  }),
  editor: z.object({
    autoSave: z.boolean().default(true),
    autoSaveInterval: z.number().default(2000),
    defaultView: z.enum(["edit", "preview", "split"]).default("edit"),
    fontSize: z.number().min(12).max(24).default(16),
    fontFamily: z.string().default("default"),
    theme: z.enum(["light", "dark", "system"]).default("system"),
  }),
  import: z.object({
    defaultFormat: z.enum(["markdown", "html", "text"]).default("markdown"),
    preserveMetadata: z.boolean().default(true),
    cleanupHTML: z.boolean().default(true),
    convertToMarkdown: z.boolean().default(true),
  }),
  export: z.object({
    defaultFormat: z.enum(["markdown", "html", "pdf", "json"]).default("markdown"),
    includeImages: z.boolean().default(true),
    embedImages: z.boolean().default(false),
    includeMetadata: z.boolean().default(true),
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;

// 默认设置
export const DEFAULT_SETTINGS: Settings = {
  markdown: {
    sourceDirectory: "/Users/mac-m4/sync/md",
    importSubdirectories: true,
    autoProcessImages: true,
  },
  images: {
    saveDirectory: "public/images",
    baseUrl: "/images",
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 90,
    keepOriginalNames: false,
    organizeByDate: false,
  },
  storage: {
    maxCapacityMB: 50,
    enableAutoCleanup: true,
    cleanupThresholdPercent: 85,
    preferredStorageType: "localStorage",
    customStorageDirectory: "",
    enableCompression: true,
    maxNoteSizeKB: 500,
  },
  editor: {
    autoSave: true,
    autoSaveInterval: 2000,
    defaultView: "edit",
    fontSize: 16,
    fontFamily: "default",
    theme: "system",
  },
  import: {
    defaultFormat: "markdown",
    preserveMetadata: true,
    cleanupHTML: true,
    convertToMarkdown: true,
  },
  export: {
    defaultFormat: "markdown",
    includeImages: true,
    embedImages: false,
    includeMetadata: true,
  },
};

// 设置管理类
export class SettingsManager {
  private static STORAGE_KEY = "mynotes_settings";
  private static instance: SettingsManager;
  private settings: Settings;
  private listeners: Set<(settings: Settings) => void> = new Set();

  private constructor() {
    this.settings = this.loadSettings();
  }

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  // 加载设置
  private loadSettings(): Settings {
    if (typeof window === "undefined") {
      return DEFAULT_SETTINGS;
    }

    try {
      const stored = localStorage.getItem(SettingsManager.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // 验证并合并默认值
        return SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...parsed });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }

    return DEFAULT_SETTINGS;
  }

  // 保存设置
  private saveSettings(): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(
        SettingsManager.STORAGE_KEY,
        JSON.stringify(this.settings)
      );
      this.notifyListeners();
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }

  // 获取所有设置
  getSettings(): Settings {
    return { ...this.settings };
  }

  // 获取特定设置组
  getSettingsGroup<K extends keyof Settings>(group: K): Settings[K] {
    return { ...this.settings[group] };
  }

  // 获取单个设置值
  getSetting<K extends keyof Settings, F extends keyof Settings[K]>(
    group: K,
    field: F
  ): Settings[K][F] {
    return this.settings[group][field];
  }

  // 更新设置
  updateSettings(updates: Partial<Settings>): void {
    this.settings = SettingsSchema.parse({
      ...this.settings,
      ...updates,
    });
    this.saveSettings();
  }

  // 更新特定设置组
  updateSettingsGroup<K extends keyof Settings>(
    group: K,
    updates: Partial<Settings[K]>
  ): void {
    this.settings[group] = {
      ...this.settings[group],
      ...updates,
    };
    this.saveSettings();
  }

  // 更新单个设置
  updateSetting<K extends keyof Settings, F extends keyof Settings[K]>(
    group: K,
    field: F,
    value: Settings[K][F]
  ): void {
    this.settings[group][field] = value;
    this.saveSettings();
  }

  // 重置设置
  resetSettings(): void {
    this.settings = DEFAULT_SETTINGS;
    this.saveSettings();
  }

  // 重置特定设置组
  resetSettingsGroup<K extends keyof Settings>(group: K): void {
    this.settings[group] = DEFAULT_SETTINGS[group];
    this.saveSettings();
  }

  // 导出设置
  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  // 导入设置
  importSettings(json: string): void {
    try {
      const imported = JSON.parse(json);
      this.settings = SettingsSchema.parse(imported);
      this.saveSettings();
    } catch (error) {
      throw new Error("Invalid settings format");
    }
  }

  // 订阅设置变化
  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // 通知监听器
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      listener(this.getSettings());
    });
  }

  // 验证目录路径
  static validateDirectory(path: string): boolean {
    // 基本路径验证
    if (!path || path.length === 0) return false;

    // 不允许危险路径
    const dangerousPaths = [".", "..", "~", "$"];
    if (dangerousPaths.some((p) => path.includes(p))) return false;

    // 必须是绝对路径或相对于项目的路径
    if (!path.startsWith("/") && !path.startsWith("public/")) return false;

    return true;
  }

  // 验证URL
  static validateUrl(url: string): boolean {
    if (!url || url.length === 0) return false;

    // 必须以斜杠开头
    if (!url.startsWith("/")) return false;

    // 不允许双斜杠
    if (url.includes("//")) return false;

    return true;
  }
}

// 导出实例和便捷函数
export const settingsManager = SettingsManager.getInstance();

export const getSettings = () => settingsManager.getSettings();
export const updateSettings = (updates: Partial<Settings>) =>
  settingsManager.updateSettings(updates);
export const getSetting = <K extends keyof Settings, F extends keyof Settings[K]>(
  group: K,
  field: F
) => settingsManager.getSetting(group, field);
export const updateSetting = <K extends keyof Settings, F extends keyof Settings[K]>(
  group: K,
  field: F,
  value: Settings[K][F]
) => settingsManager.updateSetting(group, field, value);
export const resetSettings = () => settingsManager.resetSettings();

// React Hook
export function useSettings() {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  const [settings, setSettings] = React.useState<Settings>(getSettings());

  React.useEffect(() => {
    const unsubscribe = settingsManager.subscribe(setSettings);
    return unsubscribe;
  }, []);

  return settings;
}

// React Hook for specific setting group
export function useSettingsGroup<K extends keyof Settings>(group: K) {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS[group];
  }

  const [settings, setSettings] = React.useState<Settings[K]>(
    settingsManager.getSettingsGroup(group)
  );

  React.useEffect(() => {
    const unsubscribe = settingsManager.subscribe((newSettings) => {
      setSettings(newSettings[group]);
    });
    return unsubscribe;
  }, [group]);

  return settings;
}

// 需要React导入
import * as React from "react";
