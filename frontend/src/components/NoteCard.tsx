import { useState } from 'react';
import { Note, NoteColor } from '@/types/note';
import { Pin, MoreVertical, Share2 } from 'lucide-react';
import { ShareDialog } from './ShareDialog';
import { NoteCardContent } from './NoteCardContent';

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onTogglePin: () => void;
  onTagClick?: (tag: string) => void;
}

const colorClasses: Record<NoteColor, string> = {
  white: 'bg-note-default',
  yellow: 'bg-note-cream',
  green: 'bg-note-mint',
  blue: 'bg-note-sky',
  pink: 'bg-note-rose',
  purple: 'bg-note-lavender',
};

/** Card preview: drop HTML comment markers; keep image + short AI caption only. */
function cardPreviewContent(raw: string): string {
  let s = raw.replace(/<!--\s*zenotes:ai-summary\s*-->/gi, "").trim();
  const aiIdx = s.search(/^##\s*AI\s*总结\s*$/m);
  if (aiIdx !== -1) {
    const before = s.slice(0, aiIdx).trimEnd();
    let after = s.slice(aiIdx).replace(/^##\s*AI\s*总结\s*/m, "").trim();
    // Drop legacy OCR dump if still present in older notes
    after = after.replace(/\n###\s*OCR\s*原文[\s\S]*$/i, "").trim();
    if (after.length > 280) after = `${after.slice(0, 280).trimEnd()}…`;
    return [before, after].filter(Boolean).join("\n\n");
  }
  return s;
}

export function NoteCard({ note, onClick, onTogglePin, onTagClick }: NoteCardProps) {
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const raw = String(note.content ?? "");
  const preview = cardPreviewContent(raw);

  return (
    <>
      <div
        className={`
          masonry-item group relative rounded-2xl cursor-pointer
          border border-border/40 hover:border-border/80
          hover:-translate-y-0.5
          ${colorClasses[note.color]}
          shadow-note hover:shadow-note-hover
          overflow-hidden h-fit
        `}
        onClick={onClick}
      >
        {/* Pin indicator (click to unpin) */}
        {note.pinned && (
          <button
            type="button"
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

        <div className="p-4 pb-11">
          <NoteCardContent note={note} text={preview} onTagClick={onTagClick} />
        </div>
        
        {/* Hover Actions */}
        <div className="
          absolute bottom-2 left-2 right-2 z-10 flex items-center gap-0.5
          opacity-0 group-hover:opacity-100 transition-opacity duration-300
        ">
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
            onClick={(e) => e.stopPropagation()}
            className="p-2 rounded-lg text-muted-foreground hover:bg-foreground/8 transition-all duration-200 ml-auto"
          >
            <MoreVertical className="w-4 h-4" />
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
