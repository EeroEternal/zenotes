import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Note, NoteColor } from '@/types/note';
import { Pin, MoreVertical, GripVertical } from 'lucide-react';
import { Badge } from "@/components/ui/badge";

interface SortableNoteCardProps {
  note: Note;
  onClick: () => void;
  onTogglePin: () => void;
  onTagClick?: (tag: string) => void;
  isDragging?: boolean;
}

const colorClasses: Record<NoteColor, string> = {
  white: 'bg-note-white',
  yellow: 'bg-note-yellow',
  green: 'bg-note-green',
  blue: 'bg-note-blue',
  pink: 'bg-note-pink',
  purple: 'bg-note-purple',
};

export function SortableNoteCard({ note, onClick, onTogglePin, onTagClick }: SortableNoteCardProps) {
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
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  const isLongContent = note.content.length > 150;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        masonry-item group
        ${colorClasses[note.color]}
        rounded-lg border border-border/60
        shadow-card hover:shadow-card-hover
        transition-shadow duration-200
        overflow-hidden
        ${isDragging ? 'shadow-dialog ring-2 ring-primary/30' : ''}
      `}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="
          absolute top-2 left-2 z-10
          p-1 rounded cursor-grab active:cursor-grabbing
          opacity-0 group-hover:opacity-100
          bg-card/80 backdrop-blur-sm
          text-muted-foreground hover:text-foreground
          transition-opacity
        "
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Content - clickable area */}
      <div 
        className="p-4 pt-6 cursor-pointer relative"
        onClick={onClick}
      >
        {note.title && (
          <h3 className="font-medium text-foreground mb-2 leading-snug">
            {note.title}
          </h3>
        )}
        <p className={`
          text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap
          ${isLongContent ? 'line-clamp-6' : ''}
        `}>
          {note.content}
        </p>
        {isLongContent && (
          <span className="text-xs text-muted-foreground mt-2 inline-block">
            点击查看更多...
          </span>
        )}

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
        flex items-center justify-between px-2 py-1.5
        opacity-0 group-hover:opacity-100 transition-opacity
        border-t border-border/30
      ">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`
            p-2 rounded-full transition-colors
            ${note.pinned 
              ? 'text-primary hover:bg-primary/10' 
              : 'text-muted-foreground hover:bg-muted'
            }
          `}
          title={note.pinned ? '取消固定' : '固定'}
        >
          <Pin className="w-4 h-4" fill={note.pinned ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-2 rounded-full text-muted-foreground hover:bg-muted transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
