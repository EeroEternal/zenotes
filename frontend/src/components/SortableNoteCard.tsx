import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Note, NoteColor } from '@/types/note';
import { Pin, Palette, Trash2 } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

interface SortableNoteCardProps {
  note: Note;
  onClick: () => void;
  onTogglePin: () => void;
  onDelete?: () => void;
  onTagClick?: (tag: string) => void;
  isDragging?: boolean;
}

const colorClasses: Record<NoteColor, string> = {
  white: 'bg-note-default',
  yellow: 'bg-note-cream',
  green: 'bg-note-mint',
  blue: 'bg-note-sky',
  pink: 'bg-note-rose',
  purple: 'bg-note-lavender',
};

export function SortableNoteCard({ note, onClick, onTogglePin, onDelete, onTagClick }: SortableNoteCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const isLongContent = note.content.length > 150;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        masonry-item group relative rounded-2xl cursor-pointer
        border border-border/40 hover:border-border/80
        transition-all duration-300 ease-out hover:-translate-y-1 touch-manipulation
        ${colorClasses[note.color]}
        shadow-note hover:shadow-note-hover
        animate-scale-in overflow-hidden
        ${isDragging ? 'shadow-note-active opacity-90 scale-105 z-50' : ''}
      `}
    >


      {/* Pin indicator */}
      {note.pinned && (
        <div className="absolute top-2 right-2 z-10 w-7 h-7 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center shadow-lg animate-pop">
          <Pin className="w-3.5 h-3.5 text-primary-foreground fill-current" />
        </div>
      )}

      {/* Content - clickable area */}
      <div 
        className="p-4 pb-11 cursor-pointer"
        onClick={onClick}
      >
        {note.title && (
          <h3 className="font-semibold text-foreground pr-6 text-[15px] leading-snug mb-2">
            {note.title}
          </h3>
        )}
        <p className={`
          text-sm text-foreground/75 whitespace-pre-wrap leading-relaxed
           ${isLongContent ? 'line-clamp-6' : ''}
        `}>
          {note.content}
        </p>

        {note.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {note.tags.slice(0, 4).map((t) => (
              <Badge
                key={t}
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(t);
                }}
                className="cursor-pointer"
              >
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      {/* Hover Actions */}
      <div className="
        absolute bottom-2 left-2 right-2 flex items-center gap-0.5
        opacity-0 group-hover:opacity-100 transition-opacity duration-300
      ">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`
            p-2 rounded-lg hover:bg-foreground/8 transition-all duration-200
            ${note.pinned ? 'text-primary' : 'text-muted-foreground'}
          `}
          title={note.pinned ? '取消固定' : '固定'}
        >
          <Pin className={`w-4 h-4 ${note.pinned ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="p-2 rounded-lg text-muted-foreground hover:bg-foreground/8 transition-all duration-200"
          title="更改颜色"
        >
          <Palette className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 ml-auto"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
