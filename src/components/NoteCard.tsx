import { Note, NoteColor } from '@/types/note';
import { Pin, MoreVertical } from 'lucide-react';

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onTogglePin: () => void;
}

const colorClasses: Record<NoteColor, string> = {
  white: 'bg-note-white',
  yellow: 'bg-note-yellow',
  green: 'bg-note-green',
  blue: 'bg-note-blue',
  pink: 'bg-note-pink',
  purple: 'bg-note-purple',
};

export function NoteCard({ note, onClick, onTogglePin }: NoteCardProps) {
  const isLongContent = note.content.length > 150;

  return (
    <div
      className={`
        masonry-item group cursor-pointer
        ${colorClasses[note.color]}
        rounded-lg border border-border/60
        shadow-card hover:shadow-card-hover
        transition-all duration-200
        overflow-hidden
        animate-fade-in
      `}
      onClick={onClick}
    >
      <div className="p-4">
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
