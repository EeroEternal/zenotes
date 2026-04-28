#!/usr/bin/env node
/**
 * 测试分页 API 响应
 * 用法：node scripts/test-pagination-api.mjs
 */

const BASE = process.env.ZENOTES_API_BASE || "https://api.zenotes.site/api";
const USER = process.env.ZENOTES_USER || "lipi";
const PASS = process.env.ZENOTES_PASSWORD || "";

async function main() {
  // 1. 登录
  console.log("登录中...");
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });

  if (!loginRes.ok) {
    console.error("登录失败", await loginRes.text());
    process.exit(1);
  }

  const cookie = loginRes.headers.get("set-cookie") || "";
  console.log("登录成功，Cookie:", cookie.slice(0, 50) + "...");

  // 2. 测试分页 API
  console.log("\n测试分页 API...");
  const apiUrl = `${BASE}/notes?page=1&pageSize=5`;
  console.log("API URL:", apiUrl);

  const res = await fetch(apiUrl, {
    headers: { Cookie: cookie },
  });

  console.log("状态码:", res.status);
  
  if (!res.ok) {
    console.error("API 失败:", await res.text());
    process.exit(1);
  }

  const data = await res.json();
  console.log("\nAPI 响应:");
  console.log(JSON.stringify(data, null, 2).slice(0, 500) + "...");
  
  if (data.pagination) {
    console.log("\n分页信息:");
    console.log("  总条数:", data.pagination.total);
    console.log("  每页:", data.pagination.pageSize);
    console.log("  当前页:", data.pagination.page);
    console.log("  总页数:", data.pagination.totalPages);
    console.log("  本页笔记数:", data.notes?.length || 0);
  } else {
    console.warn("\n⚠️ 响应中没有 pagination 字段！");
    console.log("响应类型:", Array.isArray(data) ? "数组（旧格式）" : typeof data);
  }
}

main().catch((e) => {
  console.error("错误:", e);
  process.exit(1);
});
