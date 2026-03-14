from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests


TELEGRAM_API_BASE = "https://api.telegram.org"
MESSAGE_LIMIT = 3800

HELP_TEXT = """可用命令：
/status - 查看机器人状态和最近任务
/current - 查看当前正在执行的任务
/whoami - 查看当前 Telegram 用户 ID
/build - 运行前后端构建检查
/test - 运行最小测试和编译检查
/deploy - 推送 main 并触发线上部署
/logs - 查看最近一次任务日志摘要
/run 任务描述 - 交给 AI 执行一个具体开发任务

也可以直接发自然语言，我会默认按 /run 处理。

示例：
/run 修复文案组合里去重没有 loading 提示的问题
"""


@dataclass(frozen=True)
class ParsedCommand:
    name: str
    argument: str


def chunk_text(text: str, limit: int = MESSAGE_LIMIT) -> list[str]:
    content = (text or "").strip()
    if not content:
        return ["(空)"]

    chunks: list[str] = []
    remaining = content
    while len(remaining) > limit:
        split_at = remaining.rfind("\n", 0, limit)
        if split_at <= 0:
            split_at = limit
        chunks.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


class TelegramClient:
    def __init__(self, token: str, timeout: int = 60) -> None:
        self.token = token
        self.timeout = timeout

    @property
    def base_url(self) -> str:
        return f"{TELEGRAM_API_BASE}/bot{self.token}"

    def get_updates(self, offset: int = 0, timeout: int = 30) -> list[dict[str, Any]]:
        response = requests.get(
            f"{self.base_url}/getUpdates",
            params={"offset": offset, "timeout": timeout},
            timeout=self.timeout + timeout,
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("ok"):
            raise RuntimeError(f"Telegram getUpdates failed: {payload}")
        return payload.get("result", [])

    def send_message(self, chat_id: str, text: str) -> None:
        for chunk in chunk_text(text):
            response = requests.post(
                f"{self.base_url}/sendMessage",
                json={"chat_id": chat_id, "text": chunk},
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
            if not payload.get("ok"):
                raise RuntimeError(f"Telegram sendMessage failed: {payload}")


def parse_command(text: str) -> ParsedCommand:
    message = (text or "").strip()
    if not message:
        return ParsedCommand(name="", argument="")

    if message.startswith("/"):
        parts = message.split(maxsplit=1)
        name = parts[0].split("@", 1)[0].lower()
        argument = parts[1].strip() if len(parts) > 1 else ""
        return ParsedCommand(name=name, argument=argument)

    return ParsedCommand(name="/run", argument=message)
