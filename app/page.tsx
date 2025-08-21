"use client";

import React, { useState, useEffect } from "react";
import { NoteList } from "@/components/sidebar/note-list";
import SlateEditor from "@/components/editor/slate-editor";
import { ImportDialog } from "@/components/dialogs/import-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Note } from "@/types/note";
import {
  getNote,
  createNote,
  updateNote,
  saveNote,
  deleteNote,
  deleteAllNotes,
  getNotesCount,
} from "@/lib/storage";
import { Descendant } from "slate";
import {
  Save,
  FileText,
  Settings,
  Tag,
  Folder,
  Calendar,
  Edit,
  Eye,
  Download,
  Trash2,
  Image as ImageIcon,
  FolderCog,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ImageGallery from "@/components/image-gallery";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import SettingsPanel from "@/components/settings-panel";
import { triggerEmergencyCleanup, getStorageInfo, getStorageUsagePercentage } from "@/lib/storage";
import NotesManager from "@/components/notes-manager";
export default function HomePage() {
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotesManager, setShowNotesManager] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [noteCategory, setNoteCategory] = useState("");
  const [showMetadata, setShowMetadata] = useState(false);
  const [showBatchManager, setShowBatchManager] = useState(false);
  const [storageError, setStorageError] = useState<string>("");
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  // 加载笔记
  const loadNote = (id: string) => {
    const note = getNote(id);
    if (note) {
      // 确保内容是有效的 Slate 格式
      if (
        !note.content ||
        !Array.isArray(note.content) ||
        note.content.length === 0
      ) {
        note.content = [
          {
            type: "paragraph",
            children: [{ text: "" }],
          },
        ] as Descendant[];
      }
      setCurrentNote(note);
      setSelectedNoteId(id);
      setNoteTitle(note.title);
      setNoteTags(note.tags || []);
      setNoteCategory(note.category || "");
      setHasUnsavedChanges(false);
      setIsEditing(true);

      // 如果标题为空，聚焦到标题输入框
      if (!note.title) {
        setTimeout(() => {
          titleInputRef.current?.focus();
        }, 100);
      }
    }
  };

  // 创建新笔记
  const handleCreateNote = () => {
    try {
      const newNote = createNote({
        title: "",
        content: [
          {
            type: "paragraph",
            children: [{ text: "" }],
          },
        ] as Descendant[],
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
        category: "",
      });

      setCurrentNote(newNote);
      setSelectedNoteId(newNote.id);
      setNoteTitle("");
      setNoteTags([]);
      setNoteCategory("");
      setIsEditing(true);
      setHasUnsavedChanges(false);
      setStorageError("");

      // 自动聚焦到标题输入框
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStorageError(msg);
      alert(msg + "\n\n可以尝试点击上面的 Test Emergency Cleanup 按钮释放空间。");
    }
  };

  // 删除当前笔记
  const handleDeleteNote = () => {
    if (!currentNote) return;

    const confirmDelete = window.confirm(
      `确定要删除笔记 "${currentNote.title || "无标题"}" 吗？此操作不可恢复。`,
    );

    if (confirmDelete) {
      const success = deleteNote(currentNote.id);
      if (success) {
        setCurrentNote(null);
        setSelectedNoteId("");
        setNoteTitle("");
        setNoteTags([]);
        setNoteCategory("");
        // 笔记列表会自动刷新
      } else {
        alert("删除笔记失败");
      }
    }
  };

  // 清空所有笔记
  const handleDeleteAllNotes = () => {
    const notesCount = getNotesCount();
    if (notesCount === 0) {
      alert("没有笔记需要删除");
      return;
    }

    const confirmDelete = window.confirm(
      `确定要删除所有 ${notesCount} 个笔记吗？此操作不可恢复！\n\n请再次确认：输入 "DELETE" 继续`,
    );

    if (confirmDelete) {
      const userInput = window.prompt(
        `您即将删除所有 ${notesCount} 个笔记。\n请输入 "DELETE" 确认删除：`,
      );

      if (userInput === "DELETE") {
        const success = deleteAllNotes();
        if (success) {
          setCurrentNote(null);
          setSelectedNoteId("");
          setNoteTitle("");
          setNoteTags([]);
          setNoteCategory("");
          alert("所有笔记已删除");
        } else {
          alert("删除失败");
        }
      } else if (userInput !== null) {
        alert("输入不正确，取消删除");
      }
    }
  };

  // 保存笔记
  const handleSaveNote = async () => {
    if (!currentNote) return;

    setIsSaving(true);

    const updatedNote: Note = {
      ...currentNote,
      title: noteTitle || "",
      tags: noteTags,
      category: noteCategory,
      updatedAt: new Date(),
    };

    saveNote(updatedNote);
    setCurrentNote(updatedNote);
    setHasUnsavedChanges(false);

    setTimeout(() => {
      setIsSaving(false);
    }, 500);
  };

  // 内容变更
  const handleContentChange = (content: Descendant[]) => {
    if (!currentNote) return;

    setCurrentNote({
      ...currentNote,
      content,
    });
    setHasUnsavedChanges(true);
  };

  // 处理标签输入
  const handleTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const input = e.currentTarget;
      const tag = input.value.trim();
      if (tag && !noteTags.includes(tag)) {
        setNoteTags([...noteTags, tag]);
        setHasUnsavedChanges(true);
      }
      input.value = "";
    }
  };

  // 删除标签
  const removeTag = (tagToRemove: string) => {
    setNoteTags(noteTags.filter((tag) => tag !== tagToRemove));
    setHasUnsavedChanges(true);
  };

  // 加载笔记列表（用于刷新）
  const loadNotes = () => {
    // 触发 NoteList 组件的刷新
    // 由于 NoteList 有自己的定时器，这里只需要重新渲染即可
    window.location.reload();
  };

  // 导出笔记
  const handleExportNote = () => {
    if (!currentNote) return;

    const markdown = slateToMarkdown(currentNote.content);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentNote.title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Slate 转 Markdown（简单实现）
  const slateToMarkdown = (nodes: Descendant[]): string => {
    let markdown = "";
    nodes.forEach((node: any) => {
      if (node.type === "heading-one") {
        markdown += `# ${node.children[0].text}\n\n`;
      } else if (node.type === "heading-two") {
        markdown += `## ${node.children[0].text}\n\n`;
      } else if (node.type === "heading-three") {
        markdown += `### ${node.children[0].text}\n\n`;
      } else if (node.type === "paragraph") {
        markdown += `${node.children.map((child: any) => child.text).join("")}\n\n`;
      } else if (node.type === "block-quote") {
        markdown += `> ${node.children[0].text}\n\n`;
      } else if (node.type === "code-block") {
        markdown += `\`\`\`\n${node.children[0].text}\n\`\`\`\n\n`;
      }
    });
    return markdown;
  };

  // 自动保存
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasUnsavedChanges) {
        handleSaveNote();
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [hasUnsavedChanges, currentNote, noteTitle, noteTags, noteCategory]);

  // 初始化
  useEffect(() => {
    try {
      handleCreateNote();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStorageError(msg);
    }
  }, []);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 侧边栏 */}
      <div className="w-80 flex-shrink-0 overflow-hidden">
        <NoteList
          selectedNoteId={selectedNoteId}
          onSelectNote={loadNote}
          onCreateNote={handleCreateNote}
          onImportNotes={() => setShowImportDialog(true)}
          onManageNotes={() => setShowNotesManager(true)}
        />
      </div>
      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {currentNote ? (
          <>
            {/* 工具栏 */}
            <div className="border-b p-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-3 gap-4">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={noteTitle}
                  onChange={(e) => {
                    setNoteTitle(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="text-2xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 flex-1"
                  placeholder="请输入标题"
                />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowMetadata(!showMetadata)}
                    title="标签和分类"
                  >
                    <Tag className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsEditing(!isEditing)}
                    title={isEditing ? "预览模式" : "编辑模式"}
                  >
                    {isEditing ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <Edit className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleExportNote}
                    title="导出笔记"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="删除选项"
                        className="text-destructive hover:text-destructive group"
                      >
                        <div className="flex items-center gap-0.5">
                          <Trash2 className="h-4 w-4" />
                          <ChevronDown className="h-3 w-3" />
                        </div>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleDeleteNote}>
                        删除当前笔记
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleDeleteAllNotes}
                        className="text-destructive focus:text-destructive"
                      >
                        删除所有笔记
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowBatchManager(true)}
                    title="批量管理"
                  >
                    <FolderCog className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowImageGallery(true)}
                    title="图片管理器"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSettings(true)}
                    title="设置"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  {hasUnsavedChanges && (
                    <Button
                      onClick={handleSaveNote}
                      disabled={isSaving}
                      size="sm"
                    >
                      {isSaving ? (
                        <>
                          <div className="h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          保存中
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          保存
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* 临时测试按钮和存储信息 */}
              <div className="mb-4 p-4 bg-gray-100 rounded">
                <div className="mb-2">
                  <strong>Storage Status:</strong> {getStorageUsagePercentage()}% used
                  ({(getStorageInfo().used / 1024 / 1024).toFixed(2)}MB /
                  {((getStorageInfo().used + getStorageInfo().available) / 1024 / 1024).toFixed(2)}MB)
                  {storageError && (
                    <div className="mt-2 text-red-600">{storageError}</div>
                  )}
                </div>
                <button
                  onClick={() => {
                    console.log("Triggering emergency cleanup...");
                    const success = triggerEmergencyCleanup();
                    alert(success ? "Emergency cleanup successful!" : "Emergency cleanup failed!");
                    window.location.reload(); // Refresh to see updated storage
                  }}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 mr-2"
                >
                  Test Emergency Cleanup
                </button>
                <button
                  onClick={() => {
                    const info = getStorageInfo();
                    const usage = getStorageUsagePercentage();
                    console.log("Storage Info:", info);
                    console.log("Usage:", usage + "%");
                  }}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Log Storage Info
                </button>
              </div>

              {/* 元数据区域 */}
              {showMetadata && (
                <div className="space-y-3 pt-3 border-t">
                  {/* 标签 */}
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 flex flex-wrap gap-1">
                      {noteTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-sm"
                        >
                          {tag}
                          <button
                            onClick={() => removeTag(tag)}
                            className="hover:text-destructive"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder="添加标签..."
                        onKeyDown={handleTagInput}
                        className="px-2 py-1 bg-transparent border rounded-md text-sm outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* 分类 */}
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={noteCategory}
                      onChange={(e) => {
                        setNoteCategory(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="设置分类..."
                      className="flex-1 px-2 py-1 bg-transparent border rounded-md text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* 时间信息 */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        创建于 {currentNote.createdAt.toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        更新于 {currentNote.updatedAt.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 编辑器 */}
            <div className="flex-1 p-6 min-w-0 flex flex-col">
              <SlateEditor
                key={currentNote.id}
                initialValue={
                  currentNote.content || [
                    { type: "paragraph", children: [{ text: "" }] },
                  ]
                }
                onChange={handleContentChange}
                readOnly={!isEditing}
                placeholder="开始输入..."
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Card className="p-8 text-center">
              <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">选择或创建笔记</h2>
              <p className="text-muted-foreground mb-4">
                从左侧列表中选择一个笔记，或创建新笔记开始编辑
              </p>
              <Button onClick={handleCreateNote}>创建新笔记</Button>
            </Card>
          </div>
        )}
      </div>
      {/* 导入对话框 */}
      <ImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportComplete={() => {
          // 刷新笔记列表会自动发生，因为 NoteList 组件有定时器
        }}
      />
      {/* 图片管理器对话框 */}
      <Dialog open={showImageGallery} onOpenChange={setShowImageGallery}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>图片管理器</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[calc(90vh-100px)]">
            <ImageGallery />
          </div>
        </DialogContent>
      </Dialog>
      {/* 笔记管理器对话框 */}
      <Dialog open={showNotesManager} onOpenChange={setShowNotesManager}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>笔记管理</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[calc(90vh-100px)]">
            <NotesManager
              onClose={() => setShowNotesManager(false)}
              onNotesDeleted={() => {
                setCurrentNote(null);
                setSelectedNoteId("");
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
      {/* 设置对话框 */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>应用设置</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[calc(90vh-100px)]">
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        </DialogContent>
      </Dialog>
      {/* 笔记管理器对话框 */}
      <Dialog open={showNotesManager} onOpenChange={setShowNotesManager}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>笔记管理</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[calc(90vh-100px)]">
            <NotesManager
              onClose={() => setShowNotesManager(false)}
              onNotesDeleted={() => {
                setCurrentNote(null);
                setSelectedNoteId("");
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
      {/* 批量管理对话框 */}
      <Dialog open={showBatchManager} onOpenChange={setShowBatchManager}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>批量管理笔记</DialogTitle>
          </DialogHeader>
          <div className="mt-4 overflow-auto max-h-[70vh]">
            <NotesManager
              onClose={() => setShowBatchManager(false)}
              onNotesDeleted={() => {
                loadNotes();
                setShowBatchManager(false);
                if (currentNote) {
                  const noteStillExists = getNote(currentNote.id);
                  if (!noteStillExists) {
                    setCurrentNote(null);
                    setSelectedNoteId("");
                  }
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
