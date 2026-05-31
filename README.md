# Interactive-fiction

基于 React 的文字冒险小游戏：选择题材后，由大模型生成场景描述与选项，玩家通过点击选项推进剧情。

## 文件说明

- `text_adventure.jsx`：主界面与游戏逻辑，默认导出 React 组件 `TextAdventure`。
- `src/App.jsx`：挂载上述组件。
- `vite.config.js`：开发服务器将 `/deepseek-api` 代理到 `https://api.deepseek.com`，并在服务端注入 `Authorization: Bearer <DEEPSEEK_API_KEY>`（密钥不出现在前端代码中，但仍勿将 `.env` 提交到仓库）。

## 依赖

- **Node.js**（建议 LTS）
- **React 19**、**Vite 6**、**@vitejs/plugin-react**（见 `package.json`）
- **DeepSeek API**（[官方文档](https://api-docs.deepseek.com/)，OpenAI 兼容的 `POST /v1/chat/completions`）：本地开发在仓库根目录配置 `DEEPSEEK_API_KEY`（见下方）

## 如何运行

```bash
cd Interactive-fiction
npm install
```

复制环境变量模板，在 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key 并填入：

```bash
copy .env.example .env
```

编辑 `.env`：

```env
DEEPSEEK_API_KEY=sk-...
```

可选：在 `.env` 中设置 `VITE_DEEPSEEK_MODEL=deepseek-reasoner` 等覆盖默认模型 `deepseek-chat`。

启动开发服务器：

```bash
npm run dev
```

浏览器打开终端中显示的本地地址（一般为 `http://localhost:5173`；若端口被占用可能是 `5174` 等）。**必须在 `Interactive-fiction` 目录下执行 `npm run dev`**，且 **`.env` 与本项目的 `vite.config.js` 在同一目录**，否则代理读不到 `DEEPSEEK_API_KEY`，会出现 **401 Authorization Required**。修改 `.env` 后需重启 dev。

未配置有效密钥时，开始游戏后接口会失败并在页面上显示错误信息；终端里也会打印 `[Interactive-fiction] DEEPSEEK_API_KEY 未设置或为空` 的提示。

### 若出现 HTTP 401（Authorization Required）

开发环境下请求会先打到本机 Vite，再由代理转发到 DeepSeek。**401 几乎总是鉴权失败**：未带上 Bearer、密钥错误/已作废、或账户无权调用接口。

1. 启动 `npm run dev` 后看终端：若出现 **`DeepSeek 代理已加载密钥（长度 …）`** 仍 401，请到 [DeepSeek 开放平台](https://platform.deepseek.com/) 核对密钥与余额并重置密钥再试。  
2. 若出现 **`DEEPSEEK_API_KEY 未设置或为空`**，说明当前进程没读到密钥：确认 **`.env` 路径** 为 `Interactive-fiction/.env`（与 `vite.config.js` 同目录），内容为 `DEEPSEEK_API_KEY=sk-...`（一般不要外层引号），保存后**重启** dev。  
3. Windows 下请确认文件名为 **`.env`** 而不是 `.env.txt`（资源管理器「隐藏已知文件类型的扩展名」易导致误命名）。  
4. 若系统环境变量里存在 **空的 `DEEPSEEK_API_KEY`**，可能干扰工具链；本项目已优先读取 `Interactive-fiction/.env` 文件中的密钥，仍异常时可检查系统环境变量。

### 若出现 HTTP 403

403 表示服务端拒绝本次请求，常见原因包括密钥错误、余额/计费限制、或网络策略。请查看开始页或游戏顶栏中的具体 `error.message`，并对照 [DeepSeek 错误码说明](https://api-docs.deepseek.com/quick_start/error_codes)。

### 生产构建

`npm run build` 后，前端默认请求同源路径 `/deepseek-api/v1/chat/completions`。静态托管环境需自行配置反向代理到 DeepSeek，或在构建前设置 `VITE_CHAT_COMPLETIONS_URL` 指向你的后端网关（由网关转发并保管密钥）。

## 题材

内置四种题材：奇幻冒险、星际探索、克苏鲁恐怖、民国悬疑（见组件内 `GENRES` 配置）。
