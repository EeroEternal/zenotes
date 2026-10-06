import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setAuthToken, uploadNoteMedia, uploadNoteFiles } from "@/lib/api";

describe("media upload auth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends Authorization header on media upload (not cookie-only)", async () => {
    setAuthToken("42");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "m1" }), { status: 201 }));

    // 小文件不触发 shrinkImage，测试无需 canvas
    const file = new File([new Uint8Array(10)], "a.png", { type: "image/png" });
    const res = await uploadNoteMedia("note-1", file);

    expect(res).toEqual({ id: "m1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/notes/note-1/media");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer 42");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("image/png");
  });

  it("uploads files one request per file (worker subrequest limit per request)", async () => {
    setAuthToken("42");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ files: [{ id: "f1" }] }), { status: 201 })),
      );

    const files = [
      new File([new Uint8Array(5)], "a.txt", { type: "text/plain" }),
      new File([new Uint8Array(5)], "b.txt", { type: "text/plain" }),
    ];
    const res = await uploadNoteFiles("note-1", files, ["dir/a.txt", "dir/b.txt"]);

    expect(fetchMock.mock.calls.length).toBe(2);
    expect(res.files.length).toBe(2);
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get("Authorization")).toBe("Bearer 42");
  });
});
