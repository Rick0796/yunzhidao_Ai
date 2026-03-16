# 云智道 AI 工作台

## 当前状态
- 前端 UI 已回到原始设计风格（首页布局、上传区、特效、结果区保持原样）。
- 已增加可用的登录/注册弹窗（右上角“登录”按钮）。
- Gemini API Key 已改为后端托管，前端不再手动输入 Key。

## 本地运行
1. 安装依赖
```bash
npm install
```
2. 配置环境变量（可复制 `.env.example`）
- 前端：`VITE_BACKEND_API_BASE=http://127.0.0.1:8787`
- 后端：`GEMINI_API_KEY=你的GeminiKey`
- 后端：`ADMIN_SECRET=你自定义管理员密钥`

3. 启动后端
```bash
npm run server
```

4. 启动前端
```bash
npm run dev
```

## 登录与账号持久化
- 登录/注册接口：
  - `POST /auth/register`
  - `POST /auth/login`
- 账号和会话保存位置：`server/data/db.json`
- 密码保存方式：`bcrypt` 哈希（不保存明文）。
- 前端保存的是会话 token（`localStorage`），服务端会校验 token 哈希和过期时间。

## API Key 安全与可修改
- 生产推荐：仅在后端环境变量中设置 `GEMINI_API_KEY`。
- 可动态更新 Key（无需改前端）：
  - `POST /admin/gemini-key`
  - Header: `x-admin-secret: <ADMIN_SECRET>`
  - Body: `{ "apiKey": "新的key" }`
- 本地一键更新（推荐）：
```bash
npm run set:key -- 你的新GeminiKey
```

`ADMIN_SECRET` 是管理员密钥，用于保护 `/admin/gemini-key` 接口。
它不是 Gemini API Key。请设置为一段足够长的随机字符串，不要泄露给他人。

## 接口安全
- 所有 AI 接口需要登录 token（Bearer）。
- 后端启用了基础安全头（Helmet）和跨域控制（CORS）。

## 构建检查
```bash
npm run lint
npm run build
```

## 国内服务器部署（简版）
1. 后端部署 Node 服务（端口如 `8787`），配置好 `GEMINI_API_KEY`。
2. 前端执行 `npm run build`，将 `dist/` 放到 Nginx 静态目录。
3. Nginx 反代：
- `/` -> 前端静态
- `/auth`、`/api`、`/admin` -> Node 后端
4. 开启 HTTPS，限制 `ADMIN_SECRET` 仅内部使用。
