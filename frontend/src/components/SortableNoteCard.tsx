import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Note, NoteColor } from '@/types/note';
import { Pin, Palette, Trash2, Share2 } from 'lucide-react';
import { ShareDialog } from './ShareDialog';
import { NoteCardContent } from './NoteCardContent';

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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });

  const style = {
    transform: isDragging ? CSS.Transform.toString(transform) : undefined,
    transition: isDragging ? transition : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  const raw = String(note.content ?? "");

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`
          masonry-item group relative rounded-2xl cursor-pointer
          border border-border/40 hover:border-border/80
          hover:-translate-y-0.5 touch-manipulation
          ${colorClasses[note.color]}
          shadow-note hover:shadow-note-hover
          overflow-hidden h-fit
          ${isDragging ? 'shadow-note-active opacity-90 z-50' : ''}
        `}
      >
        {/* Pin indicator (click to unpin) */}
        {note.pinned && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            title="取消置顶 (Unpin)"
            className="absolute top-2 right-2 z-20 w-7 h-7 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center shadow-lg animate-pop hover:scale-110 active:scale-95 transition-transform cursor-pointer"
          >
            <Pin className="w-3.5 h-3.5 text-primary-foreground fill-current" />
          </button>
        )}

        {/* Content - clickable area */}
        <div
          className="p-4 pb-11 cursor-pointer"
          {...attributes}
          {...listeners}
          onClick={onClick}
        >
          <NoteCardContent note={note} text={raw} onTagClick={onTagClick} />
        </div>
        
        {/* 底栏：小屏/触摸无 hover，始终显示；桌面端可悬停再显 */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="
            absolute bottom-2 left-2 right-2 z-10 flex items-center gap-0.5
            opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300
          "
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`
              p-2 rounded-lg hover:bg-foreground/8 transition-all duration-200
              ${note.pinned ? 'text-primary' : 'text-muted-foreground'}
            `}
            title={note.pinned ? '取消置顶 (Unpin)' : '置顶 (Pin)'}
          >
            <Pin className={`w-4 h-4 ${note.pinned ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShareDialogOpen(true);
            }}
            className={`
              p-2 rounded-lg hover:bg-foreground/8 transition-all duration-200
              ${note.share?.isPublic ? 'text-primary font-semibold' : 'text-muted-foreground'}
            `}
            title="公开分享与下载链接"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="p-2 rounded-lg text-muted-foreground hover:bg-foreground/8 transition-all duration-200"
            title="Change color"
          >
            <Palette className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200 ml-auto"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ShareDialog
        note={note}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />
    </>
  );
}
