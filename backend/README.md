# FastAPI 本地后端

这个目录提供一套可替换当前 Node 代理的 Python + FastAPI 后端。

目标：
- 保持前端仍然请求 `/api`
- 增加日志、失败重试、提示词版本记录
- 后续便于继续拆成 workflow / agent 结构

## 启动前准备

1. 安装依赖

```bash
pip install -r backend/requirements.txt
```

2. 配置密钥

优先读取：

- `backend/config.local.json`
- 如果不存在，则回退到 `server/config.local.json`

3. 启动

```bash
python backend/main.py
```

默认地址：

- `http://127.0.0.1:8788`

## 主要接口

- `GET /api/health`
- `POST /api/chat/completions`
- `GET /api/logs/recent`

## 日志

日志写入：

- `runtime/api_requests.jsonl`

每条日志会记录：

- 请求时间
- 模型名
- 入口类型
- 提示词版本
- 状态码
- 耗时
- 错误摘要
