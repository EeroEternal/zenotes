/** 后端 `{ error?: string }` 等业务错误，只用于展示简短文案 */

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function fallbackMessage(status: number): string {
  if (status === 400) return "请求参数不正确";
  if (status === 401) return "未登录或密码错误";
  if (status === 403) return "没有权限";
  if (status === 404) return "资源不存在";
  if (status === 409) return "与已有数据冲突";
  if (status >= 500) return "服务暂时不可用，请稍后重试";
  return `请求失败（${status}）`;
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
      if (s === "Invalid credentials") s = "用户名或密码错误";
      if (s === "argon2_unavailable") {
        s =
          "免费 Worker 无法完成旧版 Argon2 密码校验。请在本地进入 worker 目录执行：node scripts/d1-set-password-sha256.mjs 你的用户名 新密码，按输出执行 wrangler d1 execute（需已 wrangler login），再用新密码登录。";
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
