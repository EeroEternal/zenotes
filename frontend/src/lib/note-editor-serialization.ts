import MarkdownIt from "markdown-it";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import {
  NOTE_MEDIA_PREFIX,
  parseContentToBlocks,
  blocksToContent,
  normalizeContentBlocks,
  noteMediaUrl,
} from "@/lib/note-media";

const md = new MarkdownIt({ linkify: true, breaks: true });

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function mdAlt(s: string): string {
  return s.replace(/\]/g, "");
}

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (turndown) return turndown;
  const t = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  t.use(gfm);
  t.remove("image");
  t.addRule("noteImage", {
    filter: (node) => node.nodeName === "IMG",
    replacement(_content, node) {
      const el = node as HTMLImageElement;
      const mid = el.getAttribute("data-media-id");
      const alt = mdAlt(el.getAttribute("alt") || "image");
      if (mid && el.hasAttribute("data-note-img")) {
        return `\n\n![${alt}](${NOTE_MEDIA_PREFIX}${mid})\n\n`;
      }
      const src = el.getAttribute("src") || "";
      if (!src) return "";
      return `\n\n![${alt}](${src})\n\n`;
    },
  });
  turndown = t;
  return t;
}

/** 存储用 Markdown → TipTap 可解析的 HTML（内嵌图用 data-media-id） */
export function noteContentToTipTapHtml(content: string, noteId: string): string {
  const blocks = parseContentToBlocks(content);
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") {
      const raw = b.text;
      if (!raw.trim()) {
        parts.push("<p></p>");
      } else {
        parts.push(md.render(raw).trim());
      }
    } else {
      parts.push(
        `<img src="${escapeAttr(noteMediaUrl(noteId, b.mediaId))}" alt="${escapeAttr(b.alt)}" data-media-id="${b.mediaId}" data-note-img="1" class="note-wysiwyg-img rounded-xl max-w-full h-auto my-2" />`,
      );
    }
  }
  const joined = parts.join("");
  return joined.trim() ? joined : "<p></p>";
}

/** TipTap 文档 HTML → 存储用 Markdown */
export function tipTapHtmlToNoteContent(html: string): string {
  const raw = getTurndown()
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!raw) return "";
  const blocks = normalizeContentBlocks(parseContentToBlocks(raw));
  return blocksToContent(blocks).trim();
}
