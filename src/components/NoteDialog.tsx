import { useState, useEffect } from 'react';
import { Note, NoteColor } from '@/types/note';
import { X, Pin, Trash2, Palette } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogOverlay,
} from '@/components/ui/dialog';

interface NoteDialogProps {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, updates: Partial<Omit<Note, 'id' | 'createdAt'>>) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

const colorOptions: { color: NoteColor; label: string; className: string }[] = [
  { color: 'white', label: '白色', className: 'bg-note-white' },
  { color: 'yellow', label: '黄色', className: 'bg-note-yellow' },
  { color: 'green', label: '绿色', className: 'bg-note-green' },
  { color: 'blue', label: '蓝色', className: 'bg-note-blue' },
  { color: 'pink', label: '粉色', className: 'bg-note-pink' },
  { color: 'purple', label: '紫色', className: 'bg-note-purple' },
];

const colorClasses: Record<NoteColor, string> = {
  white: 'bg-note-white',
  yellow: 'bg-note-yellow',
  green: 'bg-note-green',
  blue: 'bg-note-blue',
  pink: 'bg-note-pink',
  purple: 'bg-note-purple',
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

  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content);
    }
  }, [note]);

  const handleSave = () => {
    if (note) {
      onUpdate(note.id, {
        title: title.trim() || undefined,
        content: content.trim(),
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
      <DialogOverlay className="bg-foreground/20 backdrop-blur-sm" />
      <DialogContent 
        className={`
          ${colorClasses[note.color]}
          max-w-lg p-0 gap-0 border-border
          shadow-dialog rounded-xl overflow-hidden
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border/30">
          <button
            onClick={() => onTogglePin(note.id)}
            className={`
              p-2 rounded-full transition-colors
              ${note.pinned 
                ? 'text-primary hover:bg-primary/10' 
                : 'text-muted-foreground hover:bg-muted'
              }
            `}
          >
            <Pin className="w-5 h-5" fill={note.pinned ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          <input
            type="text"
            placeholder="标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="
              w-full bg-transparent text-lg font-medium
              text-foreground placeholder:text-muted-foreground
              outline-none mb-3
            "
          />
          <textarea
            placeholder="添加笔记..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="
              w-full bg-transparent text-foreground text-sm
              leading-relaxed placeholder:text-muted-foreground
              outline-none resize-none
            "
          />
        </div>

        {/* Color Picker */}
        {showColorPicker && (
          <div className="px-5 pb-3 animate-fade-in">
            <div className="flex items-center gap-2">
              {colorOptions.map((option) => (
                <button
                  key={option.color}
                  onClick={() => {
                    onUpdate(note.id, { color: option.color });
                    setShowColorPicker(false);
                  }}
                  className={`
                    w-8 h-8 rounded-full ${option.className}
                    border-2 transition-all
                    ${note.color === option.color 
                      ? 'border-primary scale-110' 
                      : 'border-border hover:border-muted-foreground'
                    }
                  `}
                  title={option.label}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/30">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors"
              title="更改颜色"
            >
              <Palette className="w-5 h-5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="删除"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              编辑于 {note.updatedAt.toLocaleDateString('zh-CN')}
            </span>
            <button
              onClick={handleSave}
              className="
                px-4 py-1.5 rounded-md text-sm font-medium
                bg-primary text-primary-foreground
                hover:bg-primary/90 transition-colors
              "
            >
              保存
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
