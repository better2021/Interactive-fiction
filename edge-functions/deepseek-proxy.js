/**
 * EdgeOne 边缘函数 — DeepSeek API 代理
 *
 * 部署配置：
 *   触发规则：https://<你的域名>/deepseek-api/*
 *   执行方式：所有请求匹配该路径时触发
 *
 * 环境变量（在 EdgeOne 控制台 → 边缘函数 → 环境变量 中配置）：
 *   变量名：DEEPSEEK_API_KEY
 *   值：    sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * 流程：
 *   浏览器 POST /deepseek-api/v1/chat/completions
 *     → 边缘函数拦截
 *     → 转发到 https://api.deepseek.com/v1/chat/completions（注入 Authorization Header）
 *     → 返回响应给浏览器
 *
 * 非 /deepseek-api/* 的请求，返回 undefined 放行，由 EdgeOne 静态文件服务处理。
 *
 * ─── 部署方式 ───
 * 方式一（在 EdgeOne 控制台粘贴）：
 *   1. 打开 EdgeOne 控制台 → 边缘函数 → 新建函数
 *   2. 将本文件内容粘贴到代码编辑器
 *   3. 触发规则配置为：https://<你的域名>/deepseek-api/*
 *   4. 在环境变量中添加 DEEPSEEK_API_KEY
 *
 * 方式二（通过 OpenAPI / CLI 部署）：
 *   根据 EdgeOne OpenAPI 文档上传函数代码并绑定域名规则。
 */

/**
 * 核心代理逻辑。
 * @param {Request} request - 原始请求
 * @param {{ DEEPSEEK_API_KEY?: string }} env - 环境变量（可选）
 * @returns {Response|undefined} undefined 表示放行给静态文件服务
 */
async function handleRequest(request, env) {
  const url = new URL(request.url);

  // ── 只拦截 /deepseek-api/* ──
  if (!url.pathname.startsWith("/deepseek-api/")) {
    return undefined; // 放行，由 EdgeOne 静态文件服务处理
  }

  // ── 获取 API Key ──
  // 优先级：env 参数 > 全局变量 > process.env
  const apiKey =
    (env && env.DEEPSEEK_API_KEY) ||
    (typeof DEEPSEEK_API_KEY !== "undefined" ? DEEPSEEK_API_KEY : "") ||
    "";

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: {
          message:
            "DEEPSEEK_API_KEY 未配置，请在 EdgeOne 控制台 → 边缘函数 → 环境变量中添加",
        },
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }

  // ── 构造目标 URL ──
  // 把 /deepseek-api/v1/chat/completions → /v1/chat/completions
  const targetPath = url.pathname.replace(/^\/deepseek-api/, "");
  const targetUrl = "https://api.deepseek.com" + targetPath + url.search;

  // ── 复制并修改请求头 ──
  const headers = new Headers(request.headers);
  headers.set("Authorization", "Bearer " + apiKey);
  // 移除可能干扰转发的请求头
  headers.delete("X-Forwarded-For");
  headers.delete("X-Real-IP");
  headers.delete("CF-Connecting-IP");

  // ── 转发请求 ──
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
  });

  try {
    const response = await fetch(proxyRequest);

    // 添加 CORS 头确保浏览器端正常接收
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

// ── 入口 ──
// 根据 EdgeOne 控制台使用的运行时版本，选择以下一种模式：

// 模式 A：ESM 导出（推荐，较新的 EdgeOne 版本）
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};

// 模式 B：ServiceWorker 模式（如果模式 A 部署不生效，改为取消下面注释并删除模式 A）
// addEventListener("fetch", (event) => {
//   event.respondWith(handleRequest(event.request));
// });
