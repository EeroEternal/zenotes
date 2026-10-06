import { useState, useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Note, NoteColor } from '@/types/note';
import {
  X,
  Pin,
  Palette,
  Image,
  Tag as TagIcon,
  Loader2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Copy,
  Check,
  Trash2,
  Sparkles,
  Paperclip,
  FolderUp,
  Share2,
  Download,
  FileText,
  Folder,
  Archive,
} from 'lucide-react';
import { noteContentToTipTapHtml, tipTapHtmlToNoteContent } from '@/lib/note-editor-serialization';
import { copyText } from '@/lib/clipboard';
import { createNoteEditorExtensions } from '@/lib/note-tiptap-extensions';
import { noteMediaUrl } from '@/lib/note-media';
import { dragHasFiles, filesFromDrop } from '@/lib/drop-files';
import { cn } from '@/lib/utils';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ShareDialog } from './ShareDialog';
import { useNotes } from '@/hooks/useNotes';
import JSZip from 'jszip';

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface NoteDialogProps {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: Partial<Omit<Note, 'id'>>) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

const colorOptions: { color: NoteColor; label: string; className: string }[] = [
  { color: 'white', label: 'Default', className: 'bg-note-default' },
  { color: 'yellow', label: 'Cream', className: 'bg-note-cream' },
  { color: 'green', label: 'Mint', className: 'bg-note-mint' },
  { color: 'blue', label: 'Sky', className: 'bg-note-sky' },
  { color: 'pink', label: 'Rose', className: 'bg-note-rose' },
  { color: 'purple', label: 'Lavender', className: 'bg-note-lavender' },
];

const colorClasses: Record<NoteColor, string> = {
  white: 'bg-note-default',
  yellow: 'bg-note-cream',
  green: 'bg-note-mint',
  blue: 'bg-note-sky',
  pink: 'bg-note-rose',
  purple: 'bg-note-lavender',
};

const editorShellClass = `
  min-h-[12rem] w-full max-w-3xl mx-auto rounded-2xl border border-border/50 bg-foreground/[0.05] px-3 py-2
  prose prose-sm dark:prose-invert max-w-none text-[15px] leading-relaxed text-foreground/90
  [&_ul]:my-1 [&_ol]:my-1 [&_blockquote]:border-border
  [&_code]:rounded [&_code]:bg-foreground/8 [&_code]:px-0.5 [&_code]:text-[0.9em]
  focus-within:outline-none
`;

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

export function NoteDialog({
  note,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onTogglePin,
}: NoteDialogProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [tagsText, setTagsText] = useState('');
  const [copiedContent, setCopiedContent] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [filesUploading, setFilesUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const editorWrapRef = useRef<HTMLDivElement>(null);

  const { uploadFiles, deleteFile } = useNotes();

  const handleCopyContent = async () => {
    if (!editor && !note) return;
    const contentToCopy = editor ? tipTapHtmlToNoteContent(editor.getHTML()) : note?.content || '';
    if (!contentToCopy.trim()) {
      toast.info('笔记内容为空');
      return;
    }
    try {
      await copyText(contentToCopy);
      setCopiedContent(true);
      toast.success('已复制全部内容');
      setTimeout(() => setCopiedContent(false), 2000);
    } catch {
      toast.error('复制失败');
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !note) return;
    setFilesUploading(true);
    try {
      await uploadFiles(note.id, files);
      toast.success(`已上传 ${files.length} 个文件`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '文件上传失败');
    } finally {
      setFilesUploading(false);
    }
  };

  const handleFolderInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !note) return;
    const paths = files.map((f) => (f as any).webkitRelativePath || f.name);
    setFilesUploading(true);
    try {
      await uploadFiles(note.id, files, paths);
      toast.success(`已上传目录中的 ${files.length} 个文件`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '目录上传失败');
    } finally {
      setFilesUploading(false);
    }
  };

  const uploadDroppedFiles = async (data: DataTransfer) => {
    if (!note || filesUploading) return;
    const dropped = await filesFromDrop(data);
    if (dropped.length === 0) return;
    setFilesUploading(true);
    try {
      await uploadFiles(
        note.id,
        dropped.map((item) => item.file),
        dropped.map((item) => item.path),
      );
      toast.success(`已上传 ${dropped.length} 个文件`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '文件上传失败');
    } finally {
      setFilesUploading(false);
    }
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
    void uploadDroppedFiles(e.dataTransfer);
  };

  const handleDownloadAllZip = async () => {
    if (!note?.files || note.files.length === 0) return;
    setDownloadingZip(true);
    try {
      const zip = new JSZip();
      for (const f of note.files) {
        const downloadUrl = api.getNoteFileDownloadUrl(note.id, f.id);
        const res = await api.fetchNoteFileRaw(downloadUrl);
        if (!res.ok) throw new Error(`下载失败: ${f.filename}`);
        const blob = await res.blob();
        const zipPath = f.path ? f.path : f.filename;
        zip.file(zipPath, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(note.title || 'note').replace(/[\\/:*?"<>|]/g, '_')}-files.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('ZIP 打包下载完成');
    } catch {
      toast.error('打包下载失败，请稍后重试');
    } finally {
      setDownloadingZip(false);
    }
  };

  const extensions = useMemo(() => createNoteEditorExtensions('Take a note...'), []);

  const editor = useEditor({
    extensions,
    content: '<p></p>',
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none min-h-[10rem]',
      },
    },
  });

  useEffect(() => {
    if (!open || !note) return;
    setTagsText((note.tags || []).join(', '));
  }, [open, note?.id]);

  useEffect(() => {
    if (!editor || !open || !note) return;
    const html = noteContentToTipTapHtml(note.content ?? '', note.id);
    editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, open, note?.id, note?.content]);

  const persistChanges = () => {
    if (!note) return;

    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const nextContent = editor ? tipTapHtmlToNoteContent(editor.getHTML()) : note.content ?? '';

    const contentChanged = nextContent !== (note.content ?? '');
    const tagsChanged = !arraysEqual(tags, note.tags ?? []);
    if (!contentChanged && !tagsChanged) return;

    onUpdate(note.id, {
      content: nextContent,
      tags,
    });
  };

  const handleSave = () => {
    persistChanges();
    onOpenChange(false);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) persistChanges();
    onOpenChange(nextOpen);
  };

  const handleDelete = () => {
    if (!note) return;
    if (!window.confirm('删除这条笔记？此操作无法撤销。')) return;
    onDelete(note.id);
    onOpenChange(false);
  };

  const handleAnalyze = async () => {
    if (!note || analyzing) return;
    // Persist local edits first so server analyzes the latest body.
    persistChanges();
    setAnalyzing(true);
    try {
      const result = await api.analyzeNote(note.id, { append: true, lang: 'zh' });
      if (result.note) {
        onUpdate(note.id, {
          content: result.note.content,
          updatedAt: result.note.updatedAt,
        });
        if (editor) {
          const html = noteContentToTipTapHtml(result.note.content ?? '', note.id);
          editor.commands.setContent(html, { emitUpdate: false });
        }
      }
      const warn =
        result.ocrErrors?.length > 0
          ? `（${result.ocrErrors.length} 张图 OCR 有警告）`
          : '';
      toast.success(`已生成 AI 总结${warn}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '分析失败，请稍后重试');
    } finally {
      setAnalyzing(false);
    }
  };

  const showTagsRow = Boolean(tagsText) || Boolean(editor && !editor.isEmpty);

  if (!note) return null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange} modal={false}>
      <DialogContent
        overlayClassName="bg-black/55 backdrop-blur-[2px]"
        className={cn(
          colorClasses[note.color],
          "w-full max-w-4xl rounded-3xl border p-6 shadow-2xl ring-1 ring-foreground/10 gap-0 max-h-[92vh] overflow-y-auto outline-none sm:rounded-3xl",
          dragOver ? "border-primary ring-2 ring-primary/40" : "border-border/70",
        )}
        onDragEnter={onFileDragEnter}
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onFileDrop}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => {
            editor?.commands.focus('end');
          });
        }}
      >
        <DialogTitle className="sr-only">Edit note</DialogTitle>

        <div className="absolute top-4 right-4 flex items-center gap-1 z-10">
          <button
            type="button"
            onClick={handleCopyContent}
            className="p-2 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground hover:text-foreground"
            title="复制全部内容"
          >
            {copiedContent ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => handleDialogOpenChange(false)}
            className="p-2 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground hover:text-foreground"
            title="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={editorWrapRef} data-note-dialog-editor className={`${editorShellClass} mt-6 relative`}>
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
              松开即可上传文件
            </div>
          )}
          <EditorContent editor={editor} />
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || !note || !editor) return;
            setMediaUploading(true);
            try {
              const { id } = await api.uploadNoteMedia(note.id, file);
              editor
                .chain()
                .focus()
                .setImage({
                  src: noteMediaUrl(note.id, id),
                  alt: 'image',
                  mediaId: id,
                } as { src: string; alt?: string; mediaId: string })
                .run();
              queueMicrotask(() => {
                const content = tipTapHtmlToNoteContent(editor.getHTML());
                onUpdate(note.id, { content });
              });
            } catch (err) {
              toast.error(
                err instanceof ApiError ? err.message : 'Image upload failed. Try again later.',
              );
            } finally {
              setMediaUploading(false);
            }
          }}
        />

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

        {/* Attachments Section */}
        {((note.files && note.files.length > 0) || filesUploading) && (
          <div className="mt-4 pt-3 border-t border-border/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                附件 ({note.files?.length || 0})
              </span>
              {note.files && note.files.length > 1 && (
                <button
                  type="button"
                  disabled={downloadingZip}
                  onClick={handleDownloadAllZip}
                  className="text-xs flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
                >
                  {downloadingZip ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Archive className="w-3 h-3" />
                  )}
                  打包下载 ZIP
                </button>
              )}
            </div>

            {filesUploading && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-foreground/[0.03] border border-border/40 text-xs text-muted-foreground mb-2 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>正在上传文件...</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {note.files?.map((f) => {
                const isFolderItem = Boolean(f.path && f.path.includes('/'));
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-foreground/[0.04] border border-border/40 hover:bg-foreground/[0.07] transition-colors group text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                      {isFolderItem ? (
                        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate" title={f.path || f.filename}>
                          {f.path || f.filename}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatFileSize(f.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          api.downloadNoteFile(note.id, f.id, f.filename).catch((e: unknown) =>
                            toast.error(e instanceof ApiError ? e.message : '下载失败，请稍后重试'),
                          );
                        }}
                        className="p-1.5 rounded-lg hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors"
                        title="下载文件"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm(`确定删除附件 "${f.filename}" 吗？`)) {
                            await deleteFile(note.id, f.id);
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="删除附件"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showTagsRow ? (
          <input
            type="text"
            placeholder="Add tags (comma-separated)"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="w-full mt-3 text-sm bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
        ) : null}

        {showColorPicker && (
          <div className="absolute bottom-20 left-14 animate-in fade-in zoom-in-95 duration-200 bg-popover border border-border shadow-lg rounded-xl p-2 flex items-center gap-1">
            {colorOptions.map((option) => (
              <button
                type="button"
                key={option.color}
                onClick={() => {
                  onUpdate(note.id, { color: option.color });
                  setShowColorPicker(false);
                }}
                className={`
                  w-7 h-7 rounded-full ${option.className}
                  border-2 transition-transform hover:scale-110
                  ${note.color === option.color ? 'border-primary' : 'border-transparent'}
                `}
                title={option.label}
              />
            ))}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-border/30">
          <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => onTogglePin(note.id)}
            className={`
              p-2.5 rounded-xl hover:bg-foreground/8 transition-all duration-200
              ${note.pinned ? 'text-primary' : 'text-muted-foreground'}
            `}
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            <Pin className={`w-4 h-4 ${note.pinned ? 'fill-current' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            className={`
              p-2.5 rounded-xl hover:bg-foreground/8 transition-all duration-200
              ${showColorPicker ? 'bg-foreground/8 text-foreground' : 'text-muted-foreground'}
            `}
            title="Change color"
          >
            <Palette className="w-4 h-4" />
          </button>

          <div className="h-5 w-[1px] bg-border/60 mx-0.5" />

          <button
            type="button"
            title="加粗"
            className={`p-2.5 rounded-xl hover:bg-foreground/8 transition-colors ${
              editor?.isActive('bold') ? 'text-foreground bg-foreground/10 font-bold' : 'text-muted-foreground'
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </button>

          <button
            type="button"
            title="斜体"
            className={`p-2.5 rounded-xl hover:bg-foreground/8 transition-colors ${
              editor?.isActive('italic') ? 'text-foreground bg-foreground/10 italic' : 'text-muted-foreground'
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </button>

          <button
            type="button"
            title="无序列表"
            className={`p-2.5 rounded-xl hover:bg-foreground/8 transition-colors ${
              editor?.isActive('bulletList') ? 'text-foreground bg-foreground/10' : 'text-muted-foreground'
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="w-4 h-4" />
          </button>

          <button
            type="button"
            title="有序列表"
            className={`p-2.5 rounded-xl hover:bg-foreground/8 transition-colors ${
              editor?.isActive('orderedList') ? 'text-foreground bg-foreground/10' : 'text-muted-foreground'
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          <div className="h-5 w-[1px] bg-border/60 mx-0.5" />

          <button
            type="button"
            disabled={mediaUploading}
            onClick={() => queueMicrotask(() => imageInputRef.current?.click())}
            className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground disabled:opacity-50"
            title="Insert image"
          >
            {mediaUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
          </button>

          <button
            type="button"
            disabled={filesUploading}
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground disabled:opacity-50"
            title="上传单文件或多文件"
          >
            {filesUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>

          <button
            type="button"
            disabled={filesUploading}
            onClick={() => folderInputRef.current?.click()}
            className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground disabled:opacity-50"
            title="上传整个文件夹/目录"
          >
            <FolderUp className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShareDialogOpen(true)}
            className={`p-2.5 rounded-xl hover:bg-foreground/8 transition-colors ${
              note.share?.isPublic ? 'text-primary' : 'text-muted-foreground'
            }`}
            title="公开分享与下载链接"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={analyzing}
            onClick={() => void handleAnalyze()}
            className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground disabled:opacity-50"
            title="OCR + AI 总结（OpenRouter）"
          >
            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </button>
          <button type="button" className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground">
            <TagIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="p-2.5 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Delete note"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="ml-auto px-6 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-sm"
          >
            Done
          </button>
          </div>
        </div>

        <ShareDialog
          note={note}
          open={shareDialogOpen}
          onOpenChange={setShareDialogOpen}
        />
      </DialogContent>
    </Dialog>
  );
}
