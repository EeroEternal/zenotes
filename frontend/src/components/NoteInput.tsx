import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Image,
  Plus,
  Feather,
  X,
  Palette,
  Tag as TagIcon,
  Loader2,
  Paperclip,
  FolderUp,
  FileText,
  Folder,
} from 'lucide-react';
import { NoteColor } from '@/types/note';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { insertMediaMarkdown } from '@/lib/note-media';
import { cn } from '@/lib/utils';
import { useNotes } from '@/hooks/useNotes';
import { dragHasFiles, filesFromDrop } from '@/lib/drop-files';

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface NoteInputProps {
  onAddNote: (content: string, title?: string, color?: NoteColor, tags?: string[]) => void;
  isSubmitting?: boolean;
  compact?: boolean;
  className?: string;
}

export function NoteInput({ onAddNote, isSubmitting = false, compact = false, className }: NoteInputProps) {
  const queryClient = useQueryClient();
  const { createNoteWithFiles } = useNotes();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [mounted, setMounted] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; path?: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);

  const submittingRef = useRef(false);

  const addDroppedFiles = async (data: DataTransfer) => {
    const dropped = await filesFromDrop(data);
    if (dropped.length === 0) return;
    setPendingFiles((prev) => [...prev, ...dropped]);
    setIsExpanded(true);
  };

  const onFileDragEnter = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onFileDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onFileDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };

  const onFileDrop = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    void addDroppedFiles(e.dataTransfer);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); // 必须先取走：清空 value 会把 FileList 清掉
    e.target.value = '';
    if (files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...files.map((file) => ({ file, path: file.name }))]);
    setIsExpanded(true);
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); // 同上：先取走再清 value
    e.target.value = '';
    if (files.length === 0) return;
    const newItems = files.map((file) => ({
      file,
      path: (file as any).webkitRelativePath || file.name,
    }));
    setPendingFiles((prev) => [...prev, ...newItems]);
    setIsExpanded(true);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (submittingRef.current || isSubmitting || uploadingFiles) return;
    if (content.trim() || pendingFiles.length > 0) {
      submittingRef.current = true;
      const tags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (pendingFiles.length > 0) {
        setUploadingFiles(true);
        try {
          await createNoteWithFiles({
            content: content.trim() || undefined,
            tags,
            files: pendingFiles.map((p) => p.file),
            paths: pendingFiles.map((p) => p.path),
          });
          handleClose();
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : '创建笔记并上传文件失败');
        } finally {
          setUploadingFiles(false);
          submittingRef.current = false;
        }
      } else {
        onAddNote(content.trim(), undefined, undefined, tags);
        handleClose();
        queueMicrotask(() => {
          submittingRef.current = false;
        });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      void handleSubmit();
    }
  };

  const handleClose = () => {
    setContent('');
    setTagsText('');
    setPendingFiles([]);
    setIsExpanded(false);
  };

  // 拖拽文件/目录到笔记区
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const list = e.dataTransfer?.files;
    if (!list || list.length === 0) return;
    setPendingFiles((prev) => [
      ...prev,
      ...Array.from(list).map((file) => ({ file, path: (file as any).webkitRelativePath || file.name })),
    ]);
    setIsExpanded(true);
  };

  // Escape key to close when expanded
  useEffect(() => {
    if (!isExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isExpanded]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isExpanded]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={handleFolderInputChange}
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      {!isExpanded ? (
        <div className={cn("w-full", className)} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          <div
            onClick={() => setIsExpanded(true)}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onDragEnter={onFileDragEnter}
            onDragOver={onFileDragOver}
            onDragLeave={onFileDragLeave}
            onDrop={onFileDrop}
            className={cn(
              "w-full bg-card rounded-2xl border border-border/50 transition-all duration-300 cursor-text flex items-center justify-between",
              compact ? "p-4 gap-3" : "p-5 gap-4",
              isHovered ? "shadow-note-hover border-border -translate-y-0.5" : "shadow-note",
              dragOver && "border-primary ring-2 ring-primary/40",
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "rounded-xl flex items-center justify-center transition-all duration-300",
                  compact ? "w-9 h-9" : "w-10 h-10",
                  isHovered ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {isHovered ? (
                  <Feather className="w-5 h-5 animate-scale-in" />
                ) : (
                  <Plus className="w-5 h-5 animate-scale-in" />
                )}
              </div>
              <span
                className={cn(
                  "transition-colors duration-200",
                  compact ? "text-[14px]" : "text-[15px]",
                  isHovered ? "text-foreground" : "text-muted-foreground",
                )}
              >
                Take a note...
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="上传单文件或多文件"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  folderInputRef.current?.click();
                }}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="上传整个文件夹/目录"
              >
                <FolderUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={cn("w-full -mt-3", compact ? "max-w-none" : "max-w-2xl mx-auto")} />

          {mounted &&
            createPortal(
              <div
                className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6 animate-in fade-in duration-200"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation();
                  handleDrop(e);
                }}
                onClick={() => {
                  if (content.trim() || pendingFiles.length > 0) {
                    void handleSubmit();
                  } else {
                    handleClose();
                  }
                }}
              >
                <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />

                <div
                  className={cn(
                    "relative my-6 w-full max-w-xl max-h-[min(90vh,44rem)] overflow-y-auto rounded-3xl border bg-card p-6 shadow-2xl ring-1 ring-foreground/10 animate-in zoom-in-95 duration-200",
                    dragOver ? "border-primary ring-2 ring-primary/40" : "border-border/70",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onDragEnter={onFileDragEnter}
                  onDragOver={onFileDragOver}
                  onDragLeave={onFileDragLeave}
                  onDrop={onFileDrop}
                >
                  <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 p-2 rounded-xl hover:bg-foreground/8 transition-colors z-10"
                  >
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>

                  {dragOver && (
                    <p className="mb-2 text-sm font-medium text-primary">松开即可添加文件</p>
                  )}
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Take a note..."
                    rows={6}
                    autoFocus
                    className="w-full bg-transparent text-foreground/85 placeholder:text-muted-foreground focus:outline-none resize-none text-[15px] leading-relaxed pt-2"
                  />

                  {pendingFiles.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/30">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Paperclip className="w-3.5 h-3.5" />
                          待上传文件 ({pendingFiles.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles([])}
                          className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          清空
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                        {pendingFiles.map((item, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-foreground/[0.06] border border-border/40 text-xs text-foreground/90 max-w-[240px] truncate"
                          >
                            {item.path?.includes("/") ? (
                              <Folder className="w-3 h-3 text-amber-500 shrink-0" />
                            ) : (
                              <FileText className="w-3 h-3 text-blue-500 shrink-0" />
                            )}
                            <span className="truncate" title={item.path || item.file.name}>
                              {item.path || item.file.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              ({formatFileSize(item.file.size)})
                            </span>
                            <button
                              type="button"
                              onClick={() => removePendingFile(idx)}
                              className="hover:text-destructive ml-0.5 shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const tags = tagsText
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean);
                      setMediaUploading(true);
                      let createdNote: { id: string; content: string } | null = null;
                      try {
                        createdNote = await api.createNote({
                          content: content.trim(),
                          tags,
                        });
                        const { id: mediaId } = await api.uploadNoteMedia(createdNote.id, file);
                        const next = insertMediaMarkdown(createdNote.content, mediaId);
                        await api.updateNote(createdNote.id, { content: next });
                        void queryClient.invalidateQueries({ queryKey: ["notes"] });
                        toast.success("Note saved with image");
                        handleClose();
                      } catch (err) {
                        // 传图失败就删掉刚建的空笔记，否则重试一次多一条空笔记
                        if (createdNote?.id) api.deleteNote(createdNote.id).catch(() => {});
                        toast.error(
                          err instanceof ApiError ? err.message : "Save or upload failed. Try again later.",
                        );
                      } finally {
                        setMediaUploading(false);
                      }
                    }}
                  />

                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/30">
                    <div className="flex items-center gap-1">
                      <button type="button" className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors">
                        <Palette className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        type="button"
                        title="Insert image"
                        disabled={mediaUploading}
                        onClick={() => queueMicrotask(() => imageInputRef.current?.click())}
                        className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors disabled:opacity-50"
                      >
                        {mediaUploading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Image className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="上传单文件或多文件"
                        disabled={uploadingFiles}
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground disabled:opacity-50"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="上传整个文件夹/目录"
                        disabled={uploadingFiles}
                        onClick={() => folderInputRef.current?.click()}
                        className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground disabled:opacity-50"
                      >
                        <FolderUp className="w-4 h-4" />
                      </button>
                      <button type="button" className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors">
                        <TagIcon className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={isSubmitting || uploadingFiles}
                      className="px-6 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-sm disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5"
                    >
                      {uploadingFiles ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Done
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </>
      )}
    </>
  );
}
