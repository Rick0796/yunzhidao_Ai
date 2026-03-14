from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests


HELP_TEXT = """Telegram dev bot is online.

Usage:
- Send a direct development task, for example: fix the compose dedupe button feedback
- Or use commands:
  /status   show bot and recent task status
  /current  show the currently running task
  /logs     show the latest task output summary
  /build    run frontend and backend build checks
  /test     run baseline validation
  /deploy   push GitHub and trigger deploy
  /run xxx  execute a concrete development task
  /whoami   show your Telegram user id and chat id
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
            raise RuntimeError(f"Telegram getUpdates failed: {payload}")
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
                raise RuntimeError(f"Telegram sendMessage failed: {payload}")


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
        return ["(empty message)"]

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
