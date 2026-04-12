import { useState, useEffect, useRef } from 'react';
import { Note, NoteColor } from '@/types/note';
import { X, Pin, Trash2, Palette, Image, Tag as TagIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogTitle,
} from '@/components/ui/dialog';

interface NoteDialogProps {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: Partial<Omit<Note, 'id'>>) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

const colorOptions: { color: NoteColor; label: string; className: string }[] = [
  { color: 'white', label: '默认', className: 'bg-note-default' },
  { color: 'yellow', label: '奶酪', className: 'bg-note-cream' },
  { color: 'green', label: '薄荷', className: 'bg-note-mint' },
  { color: 'blue', label: '天空', className: 'bg-note-sky' },
  { color: 'pink', label: '玫瑰', className: 'bg-note-rose' },
  { color: 'purple', label: '薰衣草', className: 'bg-note-lavender' },
];

const colorClasses: Record<NoteColor, string> = {
  white: 'bg-note-default',
  yellow: 'bg-note-cream',
  green: 'bg-note-mint',
  blue: 'bg-note-sky',
  pink: 'bg-note-rose',
  purple: 'bg-note-lavender',
};

export function NoteDialog({
  note,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onTogglePin,
}: NoteDialogProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [tagsText, setTagsText] = useState("");
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content);
      setTagsText((note.tags || []).join(", "));
    }
  }, [note]);

  const handleSave = () => {
    if (note) {
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      onUpdate(note.id, {
        title: title.trim() || undefined,
        content: content.trim(),
        tags,
      });
    }
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (note) {
      onDelete(note.id);
    }
    onOpenChange(false);
  };

  if (!note) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogOverlay className="bg-foreground/5 backdrop-blur-sm" />
      <DialogContent 
        className={`
          ${colorClasses[note.color]}
          w-full max-w-xl rounded-3xl border border-border/50 p-6 shadow-note-active
          gap-0 overflow-hidden outline-none sm:rounded-3xl
        `}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          setTimeout(() => contentRef.current?.focus(), 0);
        }}
      >
        {/* Accessibility: hidden title for screen readers */}
        <DialogTitle className="sr-only">编辑笔记</DialogTitle>

        {/* Close Button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-foreground/8 transition-colors z-10"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Title input */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full bg-transparent text-xl font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none pr-10 mb-4"
        />

        {/* Content textarea */}
        <textarea
          ref={contentRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Take a note..."
          rows={6}
          className="w-full bg-transparent text-foreground/85 placeholder:text-muted-foreground focus:outline-none resize-none text-[15px] leading-relaxed"
        />

        {/* Tags string field */}
        {tagsText || content ? (
          <input
            type="text"
            placeholder="添加标签 (用逗号分隔)"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="w-full mt-2 text-sm bg-transparent text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
        ) : null}

        {/* Color Picker Float */}
        {showColorPicker && (
          <div className="absolute bottom-20 left-14 animate-in fade-in zoom-in-95 duration-200 bg-popover border border-border shadow-lg rounded-xl p-2 flex items-center gap-1">
            {colorOptions.map((option) => (
              <button
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

        {/* Actions Row */}
        <div className="flex items-center gap-1 mt-6 pt-4 border-t border-border/30">
          <button
            onClick={() => onTogglePin(note.id)}
            className={`
              p-2.5 rounded-xl hover:bg-foreground/8 transition-all duration-200
              ${note.pinned ? 'text-primary' : 'text-muted-foreground'}
            `}
            title={note.pinned ? '取消固定' : '固定'}
          >
            <Pin className={`w-4 h-4 ${note.pinned ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className={`
              p-2.5 rounded-xl hover:bg-foreground/8 transition-all duration-200
              ${showColorPicker ? 'bg-foreground/8 text-foreground' : 'text-muted-foreground'}
            `}
            title="更改颜色"
          >
            <Palette className="w-4 h-4" />
          </button>
          
          <button className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground">
            <Image className="w-4 h-4" />
          </button>
          <button className="p-2.5 rounded-xl hover:bg-foreground/8 transition-colors text-muted-foreground">
            <TagIcon className="w-4 h-4" />
          </button>

          <button
            onClick={handleSave}
            className="ml-auto px-6 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 shadow-sm"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
