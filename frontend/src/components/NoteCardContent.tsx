import { useEffect, useRef, useState } from 'react';
import { Note } from '@/types/note';
import { Paperclip, Globe } from 'lucide-react';
import { parseNoteContentToNodes } from '@/lib/note-media';
import { Badge } from '@/components/ui/badge';

/**
 * 卡片正文高度上限：只是安全网（预览文本已截断，正常不会触发）；
 * 超长时裁剪并渐隐，保留瀑布流里参差的自然高度。
 */
export const CARD_BODY_MAX_HEIGHT_CLASS = 'max-h-[20rem]';

interface NoteCardContentProps {
  note: Note;
  /** 卡片里展示的正文（已按卡片规则裁剪过的预览文本） */
  text: string;
  onTagClick?: (tag: string) => void;
}

export function NoteCardContent({ note, text, onTagClick }: NoteCardContentProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, note.id]);

  return (
    <>
      <div
        ref={bodyRef}
        className={`
          text-sm text-foreground/75 leading-relaxed break-words overflow-hidden
          ${CARD_BODY_MAX_HEIGHT_CLASS}
          ${clamped ? 'card-body-fade' : ''}
        `}
      >
        {text.trim() ? (
          parseNoteContentToNodes(text, note.id, 'card')
        ) : (
          <p className="text-xs text-muted-foreground/50">无正文</p>
        )}
      </div>

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
    </>
  );
}
