/** 在纯文本中按选区插入 Markdown 包裹符（用于笔记编辑工具栏） */

export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
): { next: string; caret: number } {
  const sel = text.slice(start, end);
  const next = text.slice(0, start) + before + sel + after + text.slice(end);
  const caret = start + before.length + sel.length + after.length;
  return { next, caret };
}

/** 对选区内每一行切换无序列表前缀 `- ` */
export function toggleBulletLines(
  text: string,
  start: number,
  end: number,
): { next: string; caretStart: number; caretEnd: number } {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  const before = text.slice(0, a);
  const mid = text.slice(a, b);
  const after = text.slice(b);
  if (mid.length === 0) {
    const ins = "- ";
    const next = before + ins + after;
    return { next, caretStart: a + ins.length, caretEnd: a + ins.length };
  }
  const lines = mid.split("\n");
  const allPrefixed = lines.every((line) => line.trim() === "" || /^\s*-\s+\S/.test(line));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    if (allPrefixed) return line.replace(/^(\s*)-\s+(.*)$/, (_, sp: string, rest: string) => `${sp}${rest}`);
    return line.replace(/^(\s*)(\S.*)$/, (_, sp: string, rest: string) => `${sp}- ${rest}`);
  });
  const nextMid = nextLines.join("\n");
  const next = before + nextMid + after;
  return { next, caretStart: a, caretEnd: a + nextMid.length };
}
