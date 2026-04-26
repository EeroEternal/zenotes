/** 后端 `{ error?: string }` 等业务错误，只用于展示简短文案 */

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function fallbackMessage(status: number): string {
  if (status === 400) return "Invalid request";
  if (status === 401) return "Not signed in or wrong password";
  if (status === 403) return "Forbidden";
  if (status === 404) return "Not found";
  if (status === 409) return "Conflict with existing data";
  if (status >= 500) return "Service unavailable. Try again later.";
  return `Request failed (${status})`;
}

/**
 * 从 Response 解析可给用户看的短句；绝不返回整页 HTML 或超长 JSON。
 */
export async function messageFromResponse(res: Response): Promise<string> {
  const raw = await res.text();
  if (!raw || raw.length > 8000) {
    return fallbackMessage(res.status);
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
    return fallbackMessage(res.status);
  }
  try {
    const j = JSON.parse(raw) as { error?: unknown; message?: unknown };
    let s = "";
    if (typeof j.message === "string" && j.message.trim()) {
      s = j.message.trim();
    } else if (typeof j.error === "string" && j.error.trim()) {
      s = j.error.trim();
      if (s === "Invalid credentials") s = "Invalid username or password";
      if (s === "argon2_unavailable") {
        s =
          "This account uses a legacy Argon2 password; the free Workers tier cannot verify it. In the worker folder run: node scripts/d1-set-password-sha256.mjs YOUR_USERNAME NEW_PASSWORD, then run the printed wrangler d1 execute (after wrangler login), and sign in with the new password.";
      }
    }
    if (s.length === 0) return fallbackMessage(res.status);
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  } catch {
    // 非 JSON
  }
  const short = trimmed.replace(/\s+/g, " ").slice(0, 120);
  return short.length > 0 ? short : fallbackMessage(res.status);
}

export async function throwIfNotOk(res: Response): Promise<void> {
  if (res.ok) return;
  const msg = await messageFromResponse(res);
  throw new ApiError(msg);
}
