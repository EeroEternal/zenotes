/** 卡片预览：只显示开头一段，避免卡片过长；完整内容在弹窗里看。 */
const PREVIEW_MAX_CHARS = 280;

/** 截断预览文本；尽量在换行/空格处断开，并避免切出半个图片 Markdown */
export function truncatePreview(text: string, max = PREVIEW_MAX_CHARS): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const br = cut.lastIndexOf("\n");
  if (br > max * 0.5) cut = cut.slice(0, br);
  const halfImage = cut.match(/!\[[^\]]*\]\([^)]*$/);
  const danglingImage = halfImage ? null : cut.match(/!\[[^\]]*\]?$/);
  const partialImage = halfImage ?? danglingImage;
  if (partialImage?.index !== undefined) cut = cut.slice(0, partialImage.index);
  return `${cut.trimEnd()}…`;
}

/** 卡片预览内容：去掉 HTML 注释标记；只保留图片 + 简短的 AI 总结。 */
export function cardPreviewContent(raw: string): string {
  let s = raw.replace(/<!--\s*zenotes:ai-summary\s*-->/gi, "").trim();
  const aiIdx = s.search(/^##\s*AI\s*总结\s*$/m);
  if (aiIdx !== -1) {
    const before = s.slice(0, aiIdx).trimEnd();
    let after = s.slice(aiIdx).replace(/^##\s*AI\s*总结\s*/m, "").trim();
    // Drop legacy OCR dump if still present in older notes
    after = after.replace(/\n###\s*OCR\s*原文[\s\S]*$/i, "").trim();
    if (after.length > 280) after = `${after.slice(0, 280).trimEnd()}…`;
    s = [before, after].filter(Boolean).join("\n\n");
  }
  return truncatePreview(s);
}
