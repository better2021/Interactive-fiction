/**
 * EdgeOne Pages Cloud Function — DeepSeek API 代理
 *
 * 路由路径：/deepseek-api/v1/chat/completions（POST）
 * 文件路径：cloud-functions/deepseek-api/v1/chat/completions.js
 *
 * 将浏览器端发来的 POST 请求转发到 https://api.deepseek.com/v1/chat/completions，
 * 并在服务端注入 Authorization: Bearer <API Key>，避免密钥暴露到客户端。
 *
 * 环境变量（在 EdgeOne 控制台 → 项目设置 → 环境变量 中配置）：
 *   名称：DEEPSEEK_API_KEY
 *   值：  sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */

/** 移除外层引号：.env 中 VITE 惯用 KEY="sk-xxx" 写法 */
function normalizeKey(value) {
  if (!value || typeof value !== "string") return "";
  let s = value.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── 获取 API Key ──
  const apiKey = normalizeKey(env.DEEPSEEK_API_KEY || "");
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: {
          message:
            "DEEPSEEK_API_KEY 未配置，请在 EdgeOne 控制台 → 项目设置 → 环境变量 中添加",
        },
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }

  // ── 构造目标 URL ──
  const targetUrl = "https://api.deepseek.com/v1/chat/completions";

  // ── 复制并设置请求头 ──
  const headers = new Headers(request.headers);
  headers.set("Authorization", "Bearer " + apiKey);
  // 清除可能干扰转发的头部
  headers.delete("X-Forwarded-For");
  headers.delete("X-Real-IP");

  // ── 转发请求到 DeepSeek ──
  const proxyRequest = new Request(targetUrl, {
    method: "POST",
    headers,
    body: request.body,
  });

  try {
    const response = await fetch(proxyRequest);

    // 添加 CORS 头确保浏览器正常接收
    const respHeaders = new Headers(response.headers);
    respHeaders.set("access-control-allow-origin", "*");
    respHeaders.set(
      "access-control-allow-headers",
      "Content-Type, Authorization"
    );
    respHeaders.set("access-control-allow-methods", "POST, OPTIONS");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: { message: "代理请求 DeepSeek API 失败: " + err.message },
      }),
      {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }
}
