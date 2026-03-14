from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests


HELP_TEXT = """Telegram 开发机器人已在线。

你可以这样用：
- 直接发一句开发任务，例如：修复文案组合里去重按钮没有反馈的问题
- 或者用命令：
  /status   查看机器人和最近任务状态
  /current  查看当前正在执行的任务
  /logs     查看最近几次任务和最新输出摘要
  /build    运行前后端构建检查
  /test     运行编译检查和 pytest
  /deploy   推送 GitHub 并触发部署
  /run xxx  执行一条明确的开发任务
  /whoami   查看你的 Telegram user id 和 chat id
"""


@dataclass(frozen=True)
class ParsedCommand:
    name: str
    argument: str


class TelegramClient:
    def __init__(self, token: str) -> None:
        self.token = token.strip()
        self.base_url = f"https://api.telegram.org/bot{self.token}"

    def get_updates(self, *, offset: int = 0, timeout: int = 20) -> list[dict[str, Any]]:
        response = requests.get(
            f"{self.base_url}/getUpdates",
            params={"offset": offset, "timeout": timeout},
            timeout=timeout + 10,
        )
        response.raise_for_status()
        payload = response.json()
        if not payload.get("ok"):
            raise RuntimeError(f"Telegram getUpdates 失败：{payload}")
        result = payload.get("result")
        return result if isinstance(result, list) else []

    def send_message(self, chat_id: str, text: str) -> None:
        for chunk in chunk_text(text):
            response = requests.post(
                f"{self.base_url}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": chunk,
                    "disable_web_page_preview": True,
                },
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json()
            if not payload.get("ok"):
                raise RuntimeError(f"Telegram sendMessage 失败：{payload}")


def parse_command(text: str) -> ParsedCommand:
    raw = (text or "").strip()
    if not raw.startswith("/"):
        return ParsedCommand(name="", argument=raw)

    parts = raw.split(maxsplit=1)
    name = parts[0].strip().lower()
    argument = parts[1].strip() if len(parts) > 1 else ""
    return ParsedCommand(name=name, argument=argument)


def chunk_text(text: str, *, limit: int = 3600) -> list[str]:
    raw = (text or "").strip()
    if not raw:
        return ["(空消息)"]

    chunks: list[str] = []
    remaining = raw
    while len(remaining) > limit:
        split_at = remaining.rfind("\n", 0, limit)
        if split_at < int(limit * 0.5):
            split_at = remaining.rfind(" ", 0, limit)
        if split_at < int(limit * 0.3):
            split_at = limit
        chunks.append(remaining[:split_at].rstrip())
        remaining = remaining[split_at:].lstrip()
    if remaining:
        chunks.append(remaining)
    return chunks
