# Vercel 部署

这个项目已经补成可以直接推到 Vercel 的代码结构：

- 前端：Vite 构建到 `dist`
- 后端：FastAPI 通过 `api/index.py` 和 `api/[...route].py` 暴露
- 默认前端 API 入口继续使用 `/api`

## 需要在 Vercel 配的环境变量

- `UPSTREAM_BASE_URL`
- `UPSTREAM_API_KEY`
- `UPSTREAM_DEFAULT_MODEL`

可选：

- `API_TIMEOUT_SECONDS`
- `API_RETRIES`
- `PROMPT_VERSION`

你本机已经整理好一份可直接抄的本地文件：

- [`.env.vercel.local`](/d:/Ai获客/.env.vercel.local)

这份文件已经加入 `.gitignore`，不会被提交到 GitHub。

## 部署步骤

1. 把仓库推到 GitHub
2. 在 Vercel 导入这个仓库
3. Framework Preset 选 `Vite`
4. Build Command 保持 `npm run build`
5. Output Directory 保持 `dist`
6. 在项目环境变量里填上上面的 `UPSTREAM_*`
7. 部署

## 说明

- 本地 `backend/config.local.json` 不需要上传到仓库
- Vercel 上后端会把运行缓存和日志写到临时目录，不依赖仓库可写目录
- UI 和现有 `/api` 调用路径不需要改
