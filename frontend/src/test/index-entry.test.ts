import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const indexHtmlPath = path.resolve(currentDir, "../../index.html");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

describe("frontend entry lock", () => {
  it("keeps lovable bundled entry and not switch to src entry", () => {
    expect(indexHtml).toContain("/assets/index-");
    expect(indexHtml).toContain('.js"></script>');
    expect(indexHtml).toContain("/assets/index-");
    expect(indexHtml).toContain('.css">');
    expect(indexHtml).not.toContain("/src/main.tsx");
  });
});
