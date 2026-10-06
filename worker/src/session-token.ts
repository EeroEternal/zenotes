/**
 * 会话 token：`<userId>.<过期毫秒时间戳>.<HMAC-SHA256 签名>`。
 * 无状态：不占数据库、多设备互不挤掉、自带过期。
 * 旧实现直接把用户 id 当 token（`Bearer 1` 即可冒充任何人），已废弃。
 */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function issueSessionToken(userId: number, secret: string, now = Date.now()): Promise<string> {
  const exp = now + TOKEN_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

/** 校验并返回 userId；伪造、被篡改、已过期一律返回 null */
export async function verifySessionToken(raw: string, secret: string, now = Date.now()): Promise<number | null> {
  const parts = raw.trim().split(".");
  if (parts.length !== 3) return null;
  const [uidStr, expStr, sig] = parts as [string, string, string];
  if (!/^\d+$/.test(uidStr) || !/^\d+$/.test(expStr)) return null;
  const userId = Number(uidStr);
  const exp = Number(expStr);
  if (!Number.isSafeInteger(userId) || userId <= 0 || now > exp) return null;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlDecode(sig),
    new TextEncoder().encode(`${uidStr}.${expStr}`),
  );
  return ok ? userId : null;
}
