import type { ReactNode } from "react";
import { NoteEmbeddedImage } from "@/components/NoteEmbeddedImage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

/** 正文里插入的图片占位（与 Worker 约定一致）；旧数据可能仍为 `mynotes:media:`，解析时二者皆支持 */
export const NOTE_MEDIA_PREFIX = "zenotes:media:";

const NOTE_MEDIA_IN_BODY =
  /!\[([^\]]*)\]\((?:mynotes|zenotes):media:([0-9a-f-]{36})\)/gi;

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; alt: string; mediaId: string };

const MEDIA_LINE_RE = NOTE_MEDIA_IN_BODY;

/**
 * 保证：首块不是孤立的图、末块不是孤立的图、相邻图片之间有可编辑文字。
 * 避免「整篇只有一张图」时没有任何 textarea。
 */
export function ensureEditableTextAroundImages(blocks: ContentBlock[]): ContentBlock[] {
  if (blocks.length === 0) {
    return [{ type: "text", text: "" }];
  }
  const out: ContentBlock[] = [];
  for (const cur of blocks) {
    if (cur.type === "image" && out.length > 0 && out[out.length - 1]!.type === "image") {
      out.push({ type: "text", text: "\n\n" });
    }
    out.push(cur);
  }
  let r = out;
  if (r[0]!.type === "image") {
    r = [{ type: "text", text: "" }, ...r];
  }
  if (r[r.length - 1]!.type === "image") {
    r = [...r, { type: "text", text: "" }];
  }
  return r;
}

/** 将正文拆成「文字 / 图片」交替块，用于编辑区按顺序渲染 */
export function parseContentToBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MEDIA_LINE_RE.source, MEDIA_LINE_RE.flags);
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      blocks.push({ type: "text", text: content.slice(last, m.index) });
    }
    blocks.push({ type: "image", alt: (m[1] && m[1].trim()) || "image", mediaId: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    blocks.push({ type: "text", text: content.slice(last) });
  }
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: content });
  }
  return ensureEditableTextAroundImages(blocks);
}

export function blocksToContent(blocks: ContentBlock[]): string {
  return blocks
    .map((b) =>
      b.type === "text" ? b.text : `![${b.alt}](${NOTE_MEDIA_PREFIX}${b.mediaId})`,
    )
    .join("");
}

/** 把正文里误贴在文字块中的图片 Markdown 等重新拆成图文块 */
export function normalizeContentBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return parseContentToBlocks(blocksToContent(blocks));
}

function NoteTextChunkMarkdown({
  text,
  noteId,
  layout,
}: {
  text: string;
  noteId: string;
  layout: NoteMediaLayout;
}) {
  if (!text.trim()) {
    return text.length > 0 ? <span className="whitespace-pre-wrap" /> : null;
  }
  return (
    <div
      className={`
        max-w-none text-foreground/90
        prose prose-sm dark:prose-invert
        [&_a]:text-primary [&_a]:no-underline hover:[&_a]:underline
        [&_code]:text-[0.9em] [&_code]:rounded [&_code]:px-0.5 [&_code]:bg-foreground/8
        [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:bg-foreground/6
        [&_blockquote]:border-border [&_ul]:my-1 [&_ol]:my-1
        ${layout === "card" ? "[&_p]:my-0.5 [&_p]:first:mt-0" : "[&_p]:my-1.5"}
      `}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary">
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            if (typeof src === "string") {
              const m = /^(?:mynotes|zenotes):media:([0-9a-f-]{36})$/i.exec(src);
              if (m) {
                const mediaId = m[1]!;
                return (
                  <NoteEmbeddedImage
                    src={noteMediaUrl(noteId, mediaId)}
                    alt={typeof alt === "string" ? alt : "image"}
                    variant={layout}
                  />
                );
              }
            }
            if (src)
              return <img src={src} alt={alt} className="max-w-full rounded-lg" loading="lazy" />;
            return null;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function noteMediaUrl(noteId: string, mediaId: string): string {
  return `${API_BASE}/notes/${noteId}/media/${mediaId}`;
}

const MEDIA_TOKEN_RE = NOTE_MEDIA_IN_BODY;

/** 列表卡片 / 编辑弹窗 内嵌图展示（实际尺寸由 NoteEmbeddedImage 控制） */
export type NoteMediaLayout = "card" | "dialog";

export function parseNoteContentToNodes(
  content: string,
  noteId: string,
  layout: NoteMediaLayout = "card",
): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MEDIA_TOKEN_RE.source, MEDIA_TOKEN_RE.flags);
  let key = 0;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      parts.push(
        <NoteTextChunkMarkdown
          key={`t-${key++}`}
          text={content.slice(last, m.index)}
          noteId={noteId}
          layout={layout}
        />,
      );
    }
    const alt = m[1] || "image";
    const mediaId = m[2];
    parts.push(
      <NoteEmbeddedImage
        key={`img-${key++}`}
        src={noteMediaUrl(noteId, mediaId)}
        alt={alt}
        variant={layout}
      />,
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    parts.push(
      <NoteTextChunkMarkdown
        key={`t-${key++}`}
        text={content.slice(last)}
        noteId={noteId}
        layout={layout}
      />,
    );
  }
  if (parts.length === 0 && content.trim()) {
    return [
      <NoteTextChunkMarkdown key="t-fallback" text={content} noteId={noteId} layout={layout} />,
    ];
  }
  return parts.length ? parts : [];
}

export function insertMediaMarkdown(content: string, mediaId: string, alt = "image"): string {
  const line = `![${alt}](${NOTE_MEDIA_PREFIX}${mediaId})`;
  if (!content.trim()) return line;
  return `${content.replace(/\s*$/, "")}\n\n${line}`;
}

