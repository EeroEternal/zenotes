import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Note, NoteColor } from '@/types/note';
import { Pin, Palette, Trash2, Paperclip, Share2, Globe } from 'lucide-react';
import { parseNoteContentToNodes } from '@/lib/note-media';
import { Badge } from "@/components/ui/badge";
import { ShareDialog } from './ShareDialog';

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
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const raw = String(note.content ?? "");
  const hasMedia = /(?:mynotes|zenotes):media:/i.test(raw);
  const isLongContent = raw.length > 150;
  /** 不用 line-clamp 套在多个子块上（纯文字在部分 WebKit 下会整块高度为 0） */
  const longTextOnlyPreview = isLongContent && !hasMedia;

  return (
    <>
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
          {raw.trim() ? (
            <div
              className={`
              text-sm text-foreground/75 leading-relaxed min-h-[1.1em] break-words
              ${hasMedia ? 'max-h-[min(70vh,28rem)] overflow-y-auto' : ''}
              ${longTextOnlyPreview ? 'max-h-[6.75rem] overflow-hidden' : ''}
            `}
            >
              {parseNoteContentToNodes(raw, note.id, 'card')}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50">无正文</p>
          )}

          {/* Attachments and Share status badges */}
          {((note.files && note.files.length > 0) || note.share?.isPublic) && (
            <div className="mt-3 flex flex-wrap gap-1.5 items-center">
              {note.files && note.files.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80 bg-foreground/[0.06] border border-border/40 px-2 py-0.5 rounded-lg">
                  <Paperclip className="w-3 h-3 text-muted-foreground" />
                  {note.files.length} 个附件
                </span>
              )}
              {note.share?.isPublic && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg">
                  <Globe className="w-3 h-3" />
                  已公开
                </span>
              )}
            </div>
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
        
        {/* 底栏：小屏/触摸无 hover，始终显示；桌面端可悬停再显 */}
        <div className="
          absolute bottom-2 left-2 right-2 flex items-center gap-0.5
          opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300
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
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            <Pin className={`w-4 h-4 ${note.pinned ? 'fill-current' : ''}`} />
          </button>
          <button
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
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="p-2 rounded-lg text-muted-foreground hover:bg-foreground/8 transition-all duration-200"
            title="Change color"
          >
            <Palette className="w-4 h-4" />
          </button>
          <button
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
