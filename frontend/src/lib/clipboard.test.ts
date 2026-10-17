import { describe, it, expect, vi } from "vitest";
import { copyText, imagesFromClipboard } from "./clipboard";

describe("copyText", () => {
  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await copyText("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when navigator.clipboard rejects or is missing", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as typeof document.execCommand;

    await copyText("fallback");

    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("throws when no clipboard mechanism works", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = (() => false) as typeof document.execCommand;

    await expect(copyText("x")).rejects.toThrow();
  });
});

describe("imagesFromClipboard", () => {
  it("keeps only image files", () => {
    const png = new File(["x"], "shot.png", { type: "image/png" });
    const txt = new File(["x"], "a.txt", { type: "text/plain" });
    const data = { files: [png, txt] } as unknown as DataTransfer;
    expect(imagesFromClipboard(data)).toEqual([png]);
  });

  it("returns nothing when clipboard data is missing", () => {
    expect(imagesFromClipboard(null)).toEqual([]);
  });
});
