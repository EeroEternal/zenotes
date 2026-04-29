import { useState, useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Note, NoteColor } from '@/types/note';
import { X, Pin, Palette, Image, Tag as TagIcon, Loader2, Bold, Italic, List, Trash2 } from 'lucide-react';
import { noteContentToTipTapHtml, tipTapHtmlToNoteContent } from '@/lib/note-editor-serialization';
import { createNoteEditorExtensions } from '@/lib/note-tiptap-extensions';
import { noteMediaUrl } from '@/lib/note-media';
import * as api from '@/lib/api';
import { ApiError } from '@/lib/api-error';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

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
  const [title, setTitle] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [tagsText, setTagsText] = useState('');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [mediaUploading, setMediaUploading] = useState(false);
  const editorWrapRef = useRef<HTMLDivElement>(null);

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
    setTitle(note.title || '');
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
    const nextTitle = title.trim() || undefined;
    const nextContent = editor ? tipTapHtmlToNoteContent(editor.getHTML()) : note.content ?? '';

    const titleChanged = nextTitle !== (note.title || undefined);
    const contentChanged = nextContent !== (note.content ?? '');
    const tagsChanged = !arraysEqual(tags, note.tags ?? []);
    if (!titleChanged && !contentChanged && !tagsChanged) return;

    onUpdate(note.id, {
      title: nextTitle,
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

  const showTagsRow = Boolean(tagsText) || Boolean(editor && !editor.isEmpty);

  if (!note) return null;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange} modal={false}>
      <DialogContent
        overlayClassName="bg-black/55 backdrop-blur-[2px]"
        className={`
          ${colorClasses[note.color]}
          w-full max-w-4xl rounded-3xl border border-border/70 p-6 shadow-2xl ring-1 ring-foreground/10
          gap-0 max-h-[92vh] overflow-y-auto outline-none sm:rounded-3xl
        `}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => {
            editor?.commands.focus('end');
          });
        }}
      >
        <DialogTitle className="sr-only">Edit note</DialogTitle>

        <button
          type="button"
          onClick={() => handleDialogOpenChange(false)}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-foreground/8 transition-colors z-10"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none pr-10 mb-3"
        />

        <div
          className="mb-2 flex max-w-3xl mx-auto flex-wrap items-center gap-0.5 rounded-xl border border-border/35 bg-foreground/[0.04] px-1.5 py-1"
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            title="Bold"
            className={`rounded-lg p-2 hover:bg-foreground/10 ${
              editor?.isActive('bold') ? 'text-foreground bg-foreground/10' : 'text-muted-foreground'
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Italic"
            className={`rounded-lg p-2 hover:bg-foreground/10 ${
              editor?.isActive('italic') ? 'text-foreground bg-foreground/10' : 'text-muted-foreground'
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Bullet list"
            className={`rounded-lg p-2 hover:bg-foreground/10 ${
              editor?.isActive('bulletList') ? 'text-foreground bg-foreground/10' : 'text-muted-foreground'
            }`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        <div ref={editorWrapRef} data-note-dialog-editor className={editorShellClass}>
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
          <div className="flex items-center gap-1">
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

          <button
            type="button"
            disabled={mediaUploading}
            onClick={() => queueMicrotask(() => imageInputRef.current?.click())}
            className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground disabled:opacity-50"
            title="Insert image"
          >
            {mediaUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
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
      </DialogContent>
    </Dialog>
  );
}
