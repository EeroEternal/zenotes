import { useEffect, useRef, useState } from 'react';
import { Note } from '@/types/note';
import { Paperclip, Globe } from 'lucide-react';
import { parseNoteContentToNodes } from '@/lib/note-media';
import { Badge } from '@/components/ui/badge';

/** 正文越长，卡片上限越矮：短笔记自然展示，长笔记裁剪，避免瀑布流里出现超长卡片 */
export function cardBodyMaxHeightClass(text: string): string {
  const len = text.trim().length;
  if (len <= 200) return 'max-h-[22rem]';
  if (len <= 600) return 'max-h-[16rem]';
  return 'max-h-[12rem]';
}

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
          ${cardBodyMaxHeightClass(text)}
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
