"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  HardDrive,
  Trash2,
  Download,
  AlertTriangle,
  FileText,
  Check,
  X,
} from "lucide-react";
import {
  getStorageStats,
  cleanupStorage,
  smartCleanup,
  emergencyCleanup,
  cleanupCorruptedData,
  getStorageDetails,
} from "@/lib/storage-manager";
import { exportAllNotes, clearAllNotes } from "@/lib/storage";
import { settingsManager } from "@/lib/settings";
import { cn } from "@/lib/utils";

interface StorageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onStorageCleared: () => void;
}

export const StorageDialog: React.FC<StorageDialogProps> = ({
  isOpen,
  onClose,
  onStorageCleared,
}) => {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "warning">("success");

  useEffect(() => {
    if (isOpen) {
      loadStats();
    }
  }, [isOpen]);

  const loadStats = () => {
    const storageStats = getStorageStats();
    const storageSettings = settingsManager.getSettingsGroup("storage");
    setStats({
      ...storageStats,
      settings: storageSettings,
    });
  };

  const showMessage = (msg: string, type: "success" | "error" | "warning" = "success") => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(""), 5000);
  };

  const handleSmartCleanup = async () => {
    setIsLoading(true);
    try {
      // 清理 1MB 空间
      const success = smartCleanup(1024 * 1024);
      if (success) {
        showMessage("智能清理完成，已删除旧笔记释放空间", "success");
        loadStats();
        onStorageCleared();
      } else {
        showMessage("没有可以安全删除的笔记", "warning");
      }
    } catch (error) {
      showMessage("清理失败：" + (error as Error).message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanupCorrupted = async () => {
    setIsLoading(true);
    try {
      const cleaned = cleanupCorruptedData();
      if (cleaned > 0) {
        showMessage(`已清理 ${cleaned} 个损坏的数据项`, "success");
        loadStats();
        onStorageCleared();
      } else {
        showMessage("没有发现损坏的数据", "success");
      }
    } catch (error) {
      showMessage("清理失败：" + (error as Error).message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportAll = async () => {
    setIsLoading(true);
    try {
      const notes = exportAllNotes();
      const exportData = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        notesCount: notes.length,
        notes: notes,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mynotes-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showMessage(`已导出 ${notes.length} 个笔记`, "success");
    } catch (error) {
      showMessage("导出失败：" + (error as Error).message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (
      window.confirm(
        "⚠️ 警告：这将删除所有笔记！\n\n建议先导出备份。确定要继续吗？"
      )
    ) {
      if (window.confirm("再次确认：真的要删除所有笔记吗？此操作不可恢复！")) {
        setIsLoading(true);
        try {
          clearAllNotes();
          showMessage("已清空所有笔记", "success");
          loadStats();
          onStorageCleared();
        } catch (error) {
          showMessage("清空失败：" + (error as Error).message, "error");
        } finally {
          setIsLoading(false);
        }
      }
    }
  };

  const handleAggressiveCleanup = async () => {
    if (window.confirm("这将删除最旧的50%笔记以释放空间。确定要继续吗？")) {
      setIsLoading(true);
      try {
        const details = getStorageDetails();
        const targetFree = details.totalSize * 0.5; // 释放50%空间
        const deleted = cleanupStorage(targetFree);
        showMessage(`已删除 ${deleted} 个旧笔记`, "success");
        loadStats();
        onStorageCleared();
      } catch (error) {
        showMessage("清理失败：" + (error as Error).message, "error");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleEmergencyCleanup = async () => {
    if (window.confirm("紧急清理：这将删除最大的几个笔记以立即释放空间。确定要继续吗？")) {
      setIsLoading(true);
      try {
        const success = emergencyCleanup(2 * 1024 * 1024); // 尝试释放2MB
        if (success) {
          showMessage("紧急清理完成，已释放存储空间", "success");
          loadStats();
          onStorageCleared();
        } else {
          showMessage("紧急清理失败，可能没有足够的笔记可删除", "error");
        }
      } catch (error) {
        showMessage("紧急清理失败：" + (error as Error).message, "error");
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            存储空间管理
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            查看和管理笔记存储空间
          </p>
        </div>

        <ScrollArea className="flex-1 p-6">
          {stats && (
            <div className="space-y-6">
              {/* 存储概览 */}
              <div className="space-y-3">
                <h3 className="font-medium flex items-center gap-2">
                  存储概览
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <div className="text-2xl font-bold">{stats.totalNotes}</div>
                    <div className="text-sm text-muted-foreground">总笔记数</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-2xl font-bold">{stats.totalSizeMB} MB</div>
                    <div className="text-sm text-muted-foreground">已用空间</div>
                  </Card>
                </div>

                {/* 存储条 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>存储使用率</span>
                    <span className={cn(
                      stats.usedPercentage > 90 ? "text-destructive" :
                      stats.usedPercentage > 70 ? "text-yellow-600" :
                      "text-muted-foreground"
                    )}>
                      {stats.usedPercentage}%
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-3">
                    <div
                      className={cn(
                        "h-3 rounded-full transition-all",
                        stats.usedPercentage > 90 ? "bg-destructive" :
                        stats.usedPercentage > 70 ? "bg-yellow-600" :
                        "bg-primary"
                      )}
                      style={{ width: `${stats.usedPercentage}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>已用: {stats.totalSizeMB} MB</span>
                    <span>可用: {stats.availableSpaceMB} MB</span>
                  </div>
                </div>

                {/* 平均大小 */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-sm">平均笔记大小</span>
                  <span className="text-sm font-medium">{stats.averageNoteSizeKB} KB</span>
                </div>
              </div>

              {/* 最大的笔记 */}
              {stats.largestNotes && stats.largestNotes.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium">占用空间最大的笔记</h3>
                  <div className="space-y-2">
                    {stats.largestNotes.map((note: any, index: number) => (
                      <div
                        key={note.id}
                        className="flex items-center justify-between p-2 bg-muted rounded-md"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate max-w-[300px]">
                            {note.title}
                          </span>
                        </div>
                        <span className="text-sm font-medium">{note.sizeKB} KB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 存储配置 */}
              {stats.settings && (
                <div className="space-y-3">
                  <h3 className="font-medium">存储配置</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground">配置容量</span>
                      <div className="font-medium">{stats.settings.maxCapacityMB} MB</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">浏览器限制</span>
                      <div className="font-medium">
                        {stats.browserLimit ? `${(stats.browserLimit / 1024 / 1024).toFixed(0)} MB` : '未知'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">单笔记限制</span>
                      <div className="font-medium">{stats.settings.maxNoteSizeKB} KB</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">清理阈值</span>
                      <div className="font-medium">{stats.settings.cleanupThresholdPercent}%</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">自动清理</span>
                      <div className="font-medium">
                        {stats.settings.enableAutoCleanup ? "已启用" : "已禁用"}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">压缩</span>
                      <div className="font-medium">
                        {stats.settings.enableCompression ? "已启用" : "已禁用"}
                      </div>
                    </div>
                  </div>

                  {/* 存储限制警告 */}
                  {stats.browserLimit && stats.settings.maxCapacityMB * 1024 * 1024 > stats.browserLimit && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                        <div className="text-sm">
                          <div className="font-medium text-yellow-800">配置容量超过浏览器限制</div>
                          <div className="text-yellow-700 mt-1">
                            您配置的 {stats.settings.maxCapacityMB}MB 超过了浏览器的 {(stats.browserLimit / 1024 / 1024).toFixed(0)}MB 限制。
                            实际可用空间将受到浏览器限制。
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    可在设置中修改存储配置
                  </div>
                </div>
              )}

              {/* 清理选项 */}
              <div className="space-y-3">
                <h3 className="font-medium">清理选项</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleSmartCleanup}
                    disabled={isLoading}
                  >
                    <HardDrive className="h-4 w-4 mr-2" />
                    智能清理（删除旧的大文件）
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleCleanupCorrupted}
                    disabled={isLoading}
                  >
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    清理损坏的数据
                  </Button>

                  {stats.usedPercentage > 95 && (
                    <Button
                      variant="outline"
                      className="w-full justify-start text-red-600 border-red-600"
                      onClick={handleEmergencyCleanup}
                      disabled={isLoading}
                    >
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      紧急清理（删除最大笔记）
                    </Button>
                  )}

                  {stats.usedPercentage > 70 && (
                    <Button
                      variant="outline"
                      className="w-full justify-start text-yellow-600 border-yellow-600"
                      onClick={handleAggressiveCleanup}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      激进清理（删除50%旧笔记）
                    </Button>
                  )}

                  <Button
                    variant="destructive"
                    className="w-full justify-start"
                    onClick={handleClearAll}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4 mr-2" />
                    清空所有笔记
                  </Button>
                </div>
              </div>

              {/* 备份选项 */}
              <div className="space-y-3">
                <h3 className="font-medium">备份</h3>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleExportAll}
                  disabled={isLoading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  导出所有笔记为 JSON
                </Button>
              </div>

              {/* 消息提示 */}
              {message && (
                <div
                  className={cn(
                    "p-3 rounded-md flex items-center gap-2",
                    messageType === "success" && "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200",
                    messageType === "error" && "bg-destructive/10 text-destructive",
                    messageType === "warning" && "bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
                  )}
                >
                  {messageType === "success" && <Check className="h-4 w-4" />}
                  {messageType === "error" && <X className="h-4 w-4" />}
                  {messageType === "warning" && <AlertTriangle className="h-4 w-4" />}
                  <span className="text-sm">{message}</span>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t flex justify-end">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            关闭
          </Button>
        </div>
      </Card>
    </div>
  );
};
