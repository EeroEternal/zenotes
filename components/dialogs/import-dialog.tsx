"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  FolderOpen,
  Check,
  X,
  Upload,
  AlertCircle,
  HardDrive,
  Image,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownImporter, markdownToSlate } from "@/lib/markdown-importer";
import { createNote, saveNote, getStorageInfo } from "@/lib/storage";
import { getSettings, settingsManager } from "@/lib/settings";
import { Note } from "@/types/note";

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

interface ImportResult {
  path: string;
  title: string;
  status: "pending" | "importing" | "success" | "error";
  error?: string;
  images?: number;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [currentFile, setCurrentFile] = useState<string>("");
  const [totalImages, setTotalImages] = useState(0);
  const [storageInfo, setStorageInfo] = useState({ used: 0, available: 0 });
  const [sourcePath, setSourcePath] = useState("");

  useEffect(() => {
    if (isOpen) {
      const settings = getSettings();
      setSourcePath(settings.markdown.sourceDirectory);
      updateStorageInfo();
    }
  }, [isOpen]);

  const updateStorageInfo = () => {
    const info = getStorageInfo();
    setStorageInfo(info);
  };

  const scanMarkdownFiles = async () => {
    setIsScanning(true);
    setImportResults([]);

    try {
      const response = await fetch("/api/scan-markdown", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          directory: sourcePath,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to scan directory");
      }

      const data = await response.json();
      const files = data.files || [];

      const results: ImportResult[] = files.map((file: string) => ({
        path: file,
        title:
          file
            .split("/")
            .pop()
            ?.replace(/\.(md|markdown)$/i, "") || "Untitled",
        status: "pending" as const,
        images: 0,
      }));

      setImportResults(results);
    } catch (error) {
      console.error("Failed to scan files:", error);
      alert(
        "扫描文件失败: " +
          (error instanceof Error ? error.message : "未知错误"),
      );
    } finally {
      setIsScanning(false);
    }
  };

  const importMarkdownFiles = async () => {
    if (importResults.length === 0) {
      alert("请先扫描文件");
      return;
    }

    setIsImporting(true);
    setTotalImages(0);

    const settings = getSettings();
    const importer = new MarkdownImporter({
      sourceDir: settings.markdown.sourceDirectory,
      imageDir: settings.images.saveDirectory,
      processImages: settings.markdown.autoProcessImages,
      baseUrl: settings.images.baseUrl,
    });

    let totalImagesProcessed = 0;

    for (let i = 0; i < importResults.length; i++) {
      const result = importResults[i];

      // 更新状态为正在导入
      setImportResults((prev) => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: "importing" };
        return updated;
      });

      setCurrentFile(result.title);

      try {
        // 处理Markdown文件和图片
        const response = await fetch("/api/import-markdown", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filePath: result.path,
            processImages: settings.markdown.autoProcessImages,
            imageDir: settings.images.saveDirectory,
            baseUrl: settings.images.baseUrl,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || `Import failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // 转换Markdown为Slate格式
        const slateContent = markdownToSlate(data.content);

        // 创建并保存笔记
        const note: Note = {
          id: Date.now().toString(),
          title: result.title,
          content: slateContent,
          tags: [],
          category: "imported",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        saveNote(note);

        const processedImages = data.images || 0;
        totalImagesProcessed += processedImages;
        setTotalImages(totalImagesProcessed);

        // 更新状态为成功
        setImportResults((prev) => {
          const updated = [...prev];
          updated[i] = {
            ...updated[i],
            status: "success",
            images: processedImages,
          };
          return updated;
        });
      } catch (error) {
        console.error(`Failed to import ${result.path}:`, error);

        // 更新状态为错误
        setImportResults((prev) => {
          const updated = [...prev];
          updated[i] = {
            ...updated[i],
            status: "error",
            error: error instanceof Error ? error.message : "导入失败",
          };
          return updated;
        });
      }
    }

    setIsImporting(false);
    setCurrentFile("");
    updateStorageInfo();

    // 显示完成消息
    const successCount = importResults.filter(
      (r) => r.status === "success",
    ).length;
    const errorCount = importResults.filter((r) => r.status === "error").length;

    alert(
      `导入完成!\n` +
        `成功: ${successCount} 个文件\n` +
        `失败: ${errorCount} 个文件\n` +
        `处理图片: ${totalImagesProcessed} 张`,
    );

    onImportComplete();
  };

  const handleSelectDirectory = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        const markdownFiles = Array.from(files).filter((f) =>
          f.name.match(/\.(md|markdown)$/i),
        );

        // 获取基础目录路径
        let baseDirectory = "";
        if (markdownFiles.length > 0) {
          const firstFile = markdownFiles[0];
          const relativePath = firstFile.webkitRelativePath || firstFile.name;
          // 从相对路径中提取基础目录名
          const pathParts = relativePath.split('/');
          if (pathParts.length > 1) {
            baseDirectory = pathParts[0];
          }
        }

        const results: ImportResult[] = markdownFiles.map((file) => {
          const relativePath = file.webkitRelativePath || file.name;
          // 构建绝对路径：使用用户选择的目录路径
          let absolutePath = relativePath;
          
          // 如果有sourcePath设置，使用它作为基础路径
          if (sourcePath && baseDirectory) {
            // 移除相对路径中的基础目录部分，因为sourcePath已经包含了完整路径
            const pathWithoutBase = relativePath.replace(new RegExp(`^${baseDirectory}/`), '');
            absolutePath = `${sourcePath}/${pathWithoutBase}`;
          } else if (baseDirectory) {
            // 如果没有sourcePath，尝试使用常见的路径
            absolutePath = `/Users/mac-m4/sync/${relativePath}`;
          }
          
          return {
            path: absolutePath,
            title: file.name.replace(/\.(md|markdown)$/i, ""),
            status: "pending" as const,
            images: 0,
          };
        });

        setImportResults(results);
        
        // 如果没有设置sourcePath，自动设置为检测到的基础路径
        if (!sourcePath && baseDirectory) {
          setSourcePath(`/Users/mac-m4/sync/${baseDirectory}`);
        }
      }
    };

    input.click();
  };

  const getStorageUsagePercentage = () => {
    const total = storageInfo.used + storageInfo.available;
    if (total === 0) return 0;
    return Math.round((storageInfo.used / total) * 100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>导入 Markdown 文件</DialogTitle>
          <DialogDescription>
            从本地目录导入 Markdown 文件并自动处理图片
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {/* 源目录输入 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder="输入源目录路径"
              className="flex-1 px-3 py-2 border rounded-md"
              disabled={isImporting}
            />
            <Button
              onClick={scanMarkdownFiles}
              disabled={isImporting || isScanning || !sourcePath}
              variant="outline"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  扫描中...
                </>
              ) : (
                <>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  扫描目录
                </>
              )}
            </Button>
            <Button
              onClick={handleSelectDirectory}
              disabled={isImporting}
              variant="outline"
            >
              <Upload className="h-4 w-4 mr-2" />
              选择文件夹
            </Button>
          </div>

          {/* 存储信息 */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4" />
                <span className="text-sm font-medium">存储空间</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {getStorageUsagePercentage()}% 已使用
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${getStorageUsagePercentage()}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>
                已用: {(storageInfo.used / 1024 / 1024).toFixed(1)} MB
              </span>
              <span>
                总容量: {(settingsManager.getSettingsGroup("storage").maxCapacityMB)} MB
              </span>
            </div>
          </Card>

          {/* 文件列表 */}
          {importResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  找到 {importResults.length} 个 Markdown 文件
                </h3>
                {totalImages > 0 && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Image className="h-4 w-4" />
                    <span>{totalImages} 张图片</span>
                  </div>
                )}
              </div>

              {/* 进度条 */}
              {isImporting && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">导入进度</span>
                    <span className="text-muted-foreground">
                      {
                        importResults.filter(
                          (r) => r.status === "success" || r.status === "error",
                        ).length
                      }{" "}
                      / {importResults.length}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${(importResults.filter((r) => r.status === "success" || r.status === "error").length / importResults.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <ScrollArea className="h-[300px] w-full border rounded-lg p-2">
                <div className="space-y-2">
                  {importResults.map((result, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md",
                        result.status === "importing" &&
                          "bg-blue-50 dark:bg-blue-900/20",
                        result.status === "success" &&
                          "bg-green-50 dark:bg-green-900/20",
                        result.status === "error" &&
                          "bg-red-50 dark:bg-red-900/20",
                        result.status === "pending" &&
                          "bg-gray-50 dark:bg-gray-900/20",
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm truncate">{result.title}</span>
                        {result.images && result.images > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({result.images} 图片)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {result.status === "pending" && (
                          <span className="text-xs text-muted-foreground">
                            等待
                          </span>
                        )}
                        {result.status === "importing" && (
                          <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                        )}
                        {result.status === "success" && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                        {result.status === "error" && (
                          <div className="flex items-center gap-1">
                            <X className="h-4 w-4 text-red-600" />
                            <span className="text-xs text-red-600">
                              {result.error}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* 当前处理状态 */}
          {isImporting && currentFile && (
            <Card className="p-3 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm">正在导入: {currentFile}</span>
              </div>
            </Card>
          )}
        </div>

        {/* 操作按钮 - 固定在底部 */}
        <div className="flex justify-end gap-3 pt-4 border-t mt-auto">
          <Button onClick={onClose} variant="outline" disabled={isImporting}>
            取消
          </Button>
          <Button
            onClick={importMarkdownFiles}
            disabled={isImporting || importResults.length === 0}
          >
            {isImporting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                导入中...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                开始导入
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
