import { describe, it, expect } from "vitest";
import { issueSessionToken, verifySessionToken } from "../../../worker/src/session-token";

const SECRET = "test-secret";

describe("session token", () => {
  it("round-trips a valid token", async () => {
    const t = await issueSessionToken(7, SECRET);
    expect(await verifySessionToken(t, SECRET)).toBe(7);
  });

  it("rejects the old user-id token, tampering, expiry and wrong secret", async () => {
    // 旧实现把用户 id 当 token，必须拒收
    expect(await verifySessionToken("7", SECRET)).toBeNull();

    const t = await issueSessionToken(7, SECRET);
    expect(await verifySessionToken(`${t}x`, SECRET)).toBeNull(); // 签名被改
    expect(await verifySessionToken(t.replace(/^7/, "8"), SECRET)).toBeNull(); // 用户被改
    expect(await verifySessionToken(t, "other-secret")).toBeNull(); // 换密钥

    const expired = await issueSessionToken(7, SECRET, Date.now() - 31 * 24 * 3600 * 1000);
    expect(await verifySessionToken(expired, SECRET)).toBeNull(); // 过期
    expect(await verifySessionToken("garbage", SECRET)).toBeNull();
    expect(await verifySessionToken("", SECRET)).toBeNull();
  });
});
