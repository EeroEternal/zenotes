import { describe, it, expect } from "vitest";
import { saveLocalImage, getLocalImageUrl, replaceLocalImageUrls, LOCAL_IMAGE_PREFIX } from "./imageCache";

if (typeof URL.createObjectURL !== "function") {
  const blobUrls = new Map<string, Blob>();
  Object.defineProperty(URL, "createObjectURL", {
    value: (blob: Blob) => {
      const id = `blob:${Math.random().toString(36).slice(2)}`;
      blobUrls.set(id, blob);
      return id;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: (url: string) => {
      blobUrls.delete(url);
    },
  });
}

describe("imageCache", () => {
  it("saves and retrieves a local image blob", async () => {
    const blob = new Blob(["pixel"], { type: "image/png" });
    const id = await saveLocalImage(blob, "image/png");
    const url = await getLocalImageUrl(id);
    expect(url.startsWith("blob:")).toBe(true);
    URL.revokeObjectURL(url);
  });

  it("replaces local placeholders with public urls", async () => {
    const html = `<img src="${LOCAL_IMAGE_PREFIX}img1">`;
    const replaced = replaceLocalImageUrls(html, { img1: "https://cdn.example.com/a.png" });
    expect(replaced).toContain("https://cdn.example.com/a.png");
  });
});
