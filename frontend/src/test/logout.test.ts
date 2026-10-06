import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAuthMe, logout, setAuthToken, setSavedGlobalToken, getSavedGlobalToken, isSignedOut } from "@/lib/api";
import { mergeServerNotesIntoLocal } from "@/offline/notesSeed";
import { db } from "@/offline/db";

describe("logout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("signs out locally even when the server call fails (cookie survives)", async () => {
    setAuthToken("tok");
    setSavedGlobalToken("master");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(logout()).resolves.toBeUndefined(); // 网络失败不抛错

    expect(localStorage.getItem("zenotes_auth_token")).toBeNull();
    expect(getSavedGlobalToken()).toBe(""); // /global 页的全局 token 一并作废
    expect(isSignedOut()).toBe(true);

    // 刷新后即便服务端 Cookie 还活着，也不再当作已登录
    expect(await fetchAuthMe()).toBeNull();
  });

  it("clears the signed-out flag on next sign-in", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await logout();
    expect(isSignedOut()).toBe(true);
    setAuthToken("new-token");
    expect(isSignedOut()).toBe(false);
  });

  it("in-flight seed does not resurrect notes after sign-out", async () => {
    localStorage.setItem("zenotes_signed_out", "1");
    await mergeServerNotesIntoLocal([{ id: "n-resurrected", content: "x" }] as any);
    expect(await db.notes.get("n-resurrected")).toBeUndefined();
  });
});
