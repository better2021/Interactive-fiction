import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const configDir = path.dirname(fileURLToPath(import.meta.url));

/** 与 Vite 一致的 .env 加载顺序；后者覆盖前者 */
function envFilePathsForMode(mode, envDir) {
  return [
    path.join(envDir, ".env"),
    path.join(envDir, ".env.local"),
    path.join(envDir, `.env.${mode}`),
    path.join(envDir, `.env.${mode}.local`),
  ];
}

/**
 * 仅从磁盘读取 DEEPSEEK_API_KEY，避免 Vite loadEnv 用「空的 process.env 同名变量」覆盖 .env。
 * @returns {string | undefined} 未找到该行时为 undefined；找到但值为空则为 ""
 */
function readDeepseekKeyRawFromEnvDir(mode, envDir) {
  let last;
  for (const fp of envFilePathsForMode(mode, envDir)) {
    if (!fs.existsSync(fp)) continue;
    const text = fs.readFileSync(fp, "utf8");
    for (const rawLine of text.split(/\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const m = line.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[1].trim();
      const hashAt = val.search(/\s+#(?=[^\s#])/);
      if (hashAt !== -1 && !val.startsWith('"')) {
        val = val.slice(0, hashAt).trim();
      }
      last = val;
    }
  }
  return last;
}

/** 去掉首尾空白与成对引号，避免 .env 里写成 KEY="sk-..." 时把引号带进 Header */
function normalizeApiKey(value) {
  if (value == null || typeof value !== "string") {
    return "";
  }
  let s = value.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export default defineConfig(({ mode }) => {
  const envMerged = {
    ...loadEnv(mode, path.join(configDir, ".."), ""),
    ...loadEnv(mode, configDir, ""),
  };
  const fromFileProject = readDeepseekKeyRawFromEnvDir(mode, configDir);
  const fromFileParent = readDeepseekKeyRawFromEnvDir(
    mode,
    path.join(configDir, "..")
  );
  const rawFromFile =
    fromFileProject !== undefined ? fromFileProject : fromFileParent;
  const deepseekKey = normalizeApiKey(
    rawFromFile !== undefined && rawFromFile !== ""
      ? rawFromFile
      : (envMerged.DEEPSEEK_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "")
  );

  if (mode === "development") {
    if (!deepseekKey) {
      console.warn(
        "\n[Interactive-fiction] DEEPSEEK_API_KEY 未设置或为空：代理不会附加 Bearer，请求 DeepSeek 会得到 401。\n" +
          "  → 在「本目录」创建 .env：`" +
          path.join(configDir, ".env") +
          "`\n" +
          "  → 内容示例：DEEPSEEK_API_KEY=sk-...\n" +
          "  → 保存后务必重新执行 npm run dev\n"
      );
    } else {
      console.info(
        `[Interactive-fiction] DeepSeek 代理已加载密钥（长度 ${deepseekKey.length}）。若仍出现 401，多为密钥无效/过期或账户权限问题，请到平台检查。`
      );
    }
  }

  return {
    envDir: configDir,
    plugins: [react()],
    server: {
      proxy: {
        "/deepseek-api": {
          target: "https://api.deepseek.com",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/deepseek-api/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.removeHeader("authorization");
              proxyReq.removeHeader("Authorization");
              if (deepseekKey) {
                proxyReq.setHeader("Authorization", `Bearer ${deepseekKey}`);
              }
            });
          },
        },
      },
    },
  };
});
