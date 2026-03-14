# Telegram 开发机器人

这套机器人用于远程下达开发任务，适合你在 Telegram 里直接发指令，让本地执行器去：

- 改代码
- 跑构建
- 跑编译检查
- 推送部署
- 返回结果

它不是业务文案机器人，而是开发控制台。

## 运行方式

机器人通过 **long polling** 拉取 Telegram 消息，所以：

- 不需要公网 webhook
- 适合直接跑在你的开发电脑上
- 电脑保持开机时，Telegram 指令才能随时响应

## 你需要准备什么

在项目根目录新建文件：

`.env.telegram.local`

内容示例：

```env
TELEGRAM_BOT_TOKEN=你的_bot_token
TELEGRAM_ALLOWED_USER_ID=你的_telegram_user_id

UPSTREAM_BASE_URL=https://你的模型网关地址/v1
UPSTREAM_API_KEY=你的模型key
UPSTREAM_DEFAULT_MODEL=gemini-3-flash

TELEGRAM_POLL_INTERVAL=2
TELEGRAM_MODEL_TIMEOUT_SECONDS=90
```

## 如何获取 Telegram 用户 ID

最简单的方法：

1. 先在 `.env.telegram.local` 里临时填一个占位值
2. 启动机器人
3. 用自己的 Telegram 给机器人发：

```text
/whoami
```

4. 机器人会直接把你的 `user_id` 和 `chat_id` 发回来
5. 把真正的 `user_id` 填回 `TELEGRAM_ALLOWED_USER_ID`

## 启动

方式一：

```powershell
python backend/telegram_devbot.py
```

方式二：

双击：

`start_telegram_devbot.bat`

## 当前支持命令

- `/status`
  查看机器人状态、工作区状态、最近任务

- `/whoami`
  查看你当前的 Telegram `user_id` 和 `chat_id`

- `/build`
  运行前端构建和后端编译检查

- `/test`
  运行最小测试链路

- `/deploy`
  推送 `main` 并触发线上部署  
  注意：工作区必须干净

- `/logs`
  查看最近一次任务的摘要和日志

- `/run 任务描述`
  交给 AI 执行一个具体开发任务

## 使用示例

```text
/status
/build
/run 修复文案组合里去重按钮没有反馈的问题
/logs
/deploy
```

## `/run` 当前能力边界

第一版已经是“真正的 AI 开发执行链”，但仍然是可控版：

- 会先让模型给出修改计划
- 再从仓库里选候选文件
- 再让模型生成精确的 `search/replace`
- 只有当 `search` 在文件里精确匹配 1 次时才会真正写入
- 写完后自动跑验证步骤

这意味着它比较适合：

- 小到中等规模的明确修复
- 规则收口
- 文案系统小模块调整
- UI 交互修复

不太适合第一版就丢给它：

- 特别大的重构
- 跨很多文件的抽象升级
- 模糊不清的大目标

这类任务最好写得更具体。

## 推荐的任务描述方式

尽量写成这种：

```text
/run 修复文案组合里“选中去重”没有 loading 提示的问题，并跑 build
```

而不是：

```text
/run 把系统整体优化一下
```

## 你接下来要做什么

1. 用 `@BotFather` 创建一个 Bot，拿到 `BOT_TOKEN`
2. 在 `.env.telegram.local` 填上：
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_ALLOWED_USER_ID`
   - 模型配置
3. 启动机器人
4. 在 Telegram 里给机器人发：
   - `/whoami`
5. 把返回的 `user_id` 填进 `.env.telegram.local`
6. 重启机器人
7. 再试：
   - `/status`
   - `/build`
   - `/run 修复文案组合里开头重复的问题`

## 注意事项

- 电脑关机时，机器人无法执行开发任务
- `/deploy` 前工作区必须干净
- 如果模型配置缺失，`/run` 会直接报错提示
- 机器人目前只允许白名单用户操作
