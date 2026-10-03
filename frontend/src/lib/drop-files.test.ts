import { describe, expect, it } from "vitest";
import { dragHasFiles, filesFromDrop } from "./drop-files";

describe("filesFromDrop", () => {
  it("reads plain dropped files when directory entries are unavailable", async () => {
    const file = new File(["a: 1\n"], "clash-with-tw.yaml", { type: "text/yaml" });
    const data = {
      items: [{ kind: "file", type: "" }],
      files: [file],
      types: ["Files"],
    } as unknown as DataTransfer;
    const dropped = await filesFromDrop(data);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].path).toBe("clash-with-tw.yaml");
    expect(dropped[0].file.size).toBe(file.size);
    expect(dragHasFiles(data)).toBe(true);
  });

  it("ignores a drag that is not files", async () => {
    const data = { items: [], files: [], types: ["text/plain"] } as unknown as DataTransfer;
    expect(await filesFromDrop(data)).toEqual([]);
    expect(dragHasFiles(data)).toBe(false);
  });
});
