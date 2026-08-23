import { Note, NoteColor } from '@/types/note';
import { Pin, MoreVertical } from 'lucide-react';
import { parseNoteContentToNodes } from '@/lib/note-media';
import { Badge } from "@/components/ui/badge";

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
  const raw = String(note.content ?? "");
  const preview = cardPreviewContent(raw);
  const hasMedia = /(?:mynotes|zenotes):media:/i.test(preview);
  const isLongContent = preview.length > 150;
  const longTextOnlyPreview = isLongContent && !hasMedia;

  return (
    <div
      className={`
        masonry-item group relative rounded-2xl cursor-pointer
        border border-border/40 hover:border-border/80
        transition-all duration-300 ease-out hover:-translate-y-1
        ${colorClasses[note.color]}
        shadow-note hover:shadow-note-hover
        animate-scale-in overflow-hidden
      `}
      onClick={onClick}
    >
      {/* Pin indicator */}
      {note.pinned && (
        <div className="absolute top-2 right-2 z-10 w-7 h-7 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center shadow-lg animate-pop">
          <Pin className="w-3.5 h-3.5 text-primary-foreground fill-current" />
        </div>
      )}

      <div className="p-4 pb-11">
        {note.title && (
          <h3 className="font-semibold text-foreground pr-6 text-[15px] leading-snug mb-2">
            {note.title}
          </h3>
        )}
        {preview.trim() ? (
        <div
          className={`
          text-sm text-foreground/75 leading-relaxed min-h-[1.1em] break-words overflow-hidden
          ${hasMedia ? "max-h-[min(50vh,22rem)]" : ""}
          ${longTextOnlyPreview ? "max-h-[6.75rem]" : ""}
        `}
        >
          {parseNoteContentToNodes(preview, note.id, "card")}
        </div>
        ) : (
          <p className="text-xs text-muted-foreground/50">无正文</p>
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
          title={note.pinned ? 'Unpin' : 'Pin'}
        >
          <Pin className={`w-4 h-4 ${note.pinned ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-2 rounded-lg text-muted-foreground hover:bg-foreground/8 transition-all duration-200 ml-auto"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
