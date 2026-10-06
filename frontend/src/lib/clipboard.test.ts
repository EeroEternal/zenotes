import { describe, it, expect, vi } from "vitest";
import { copyText } from "./clipboard";

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
