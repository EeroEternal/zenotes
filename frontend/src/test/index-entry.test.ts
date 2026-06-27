import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const indexHtmlPath = path.resolve(currentDir, "../../index.html");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

describe("frontend entry lock", () => {
  it("uses the src main entry point", () => {
    expect(indexHtml).toContain("/src/main.tsx");
    expect(indexHtml).not.toContain("/assets/index-");
  });
});
