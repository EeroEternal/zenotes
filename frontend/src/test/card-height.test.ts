import { describe, it, expect } from "vitest";
import { cardPreviewContent, truncatePreview } from "@/lib/card-preview";

describe("card preview", () => {
  it("keeps short notes as-is and truncates long ones", () => {
    expect(cardPreviewContent("短笔记")).toBe("短笔记");
    const long = "长".repeat(1000);
    const preview = cardPreviewContent(long);
    expect(preview.length).toBeLessThanOrEqual(401);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("drops a half-cut image markdown", () => {
    const withImage = `前面文字\n![图片](zenotes:media:12345678-1234-1234-1234-123456789abc)`;
    const cut = truncatePreview(withImage, 10);
    expect(cut).not.toContain("![图片]");
  });
});
