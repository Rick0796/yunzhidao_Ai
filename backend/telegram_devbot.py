from __future__ import annotations

import sys
import time
import traceback
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.devbot_ai import execute_ai_task
from backend.devbot_config import load_bot_config, load_model_config
from backend.devbot_executor import build_logs_text, build_status_text, execute_named_task
from backend.devbot_store import TaskStore, utc_now
from backend.devbot_telegram import HELP_TEXT, ParsedCommand, TelegramClient, parse_command


def _message_text(update: dict[str, Any]) -> tuple[str, str, str]:
    message = update.get("message") or {}
    chat = message.get("chat") or {}
    user = message.get("from") or {}
    return (
        str(chat.get("id", "")),
        str(user.get("id", "")),
        str(message.get("text", "") or ""),
    )


def _send_task_result(
    client: TelegramClient,
    chat_id: str,
    *,
    task_id: int,
    summary: str,
    output: str,
    success: bool,
) -> None:
    title = "任务完成" if success else "任务失败"
    message = f"{title} #{task_id}\n{summary or '无摘要'}"
    if output.strip():
        message += f"\n\n{output}"
    client.send_message(chat_id, message)


def _run_named_task(
    client: TelegramClient,
    store: TaskStore,
    *,
    chat_id: str,
    user_id: str,
    kind: str,
    command_text: str,
) -> None:
    task_id = store.create_task(
        chat_id=chat_id,
        user_id=user_id,
        kind=kind,
        command_text=command_text,
        status="running",
    )
    store.update_task(task_id, started_at=utc_now(), summary="任务开始执行")
    client.send_message(chat_id, f"已收到任务 #{task_id}，正在执行 {kind}。")

    exit_code, summary, output = execute_named_task(kind)
    store.update_task(
        task_id,
        status="done" if exit_code == 0 else "failed",
        finished_at=utc_now(),
        exit_code=exit_code,
        summary=summary,
        output=output,
    )
    _send_task_result(
        client,
        chat_id,
        task_id=task_id,
        summary=summary,
        output=output,
        success=exit_code == 0,
    )


def _run_ai_task(
    client: TelegramClient,
    store: TaskStore,
    *,
    chat_id: str,
    user_id: str,
    task_text: str,
) -> None:
    task_id = store.create_task(
        chat_id=chat_id,
        user_id=user_id,
        kind="ai_run",
        command_text=task_text,
        status="running",
    )
    store.update_task(task_id, started_at=utc_now(), summary="AI 任务开始执行")
    client.send_message(chat_id, f"已收到 AI 任务 #{task_id}，正在分析并执行。")

    try:
        exit_code, summary, output = execute_ai_task(task_text, load_model_config())
    except Exception as exc:  # noqa: BLE001
        exit_code = 1
        summary = "AI 任务执行异常"
        output = f"{exc}\n\n{traceback.format_exc()}"

    store.update_task(
        task_id,
        status="done" if exit_code == 0 else "failed",
        finished_at=utc_now(),
        exit_code=exit_code,
        summary=summary,
        output=output,
    )
    _send_task_result(
        client,
        chat_id,
        task_id=task_id,
        summary=summary,
        output=output,
        success=exit_code == 0,
    )


def handle_message(
    client: TelegramClient,
    store: TaskStore,
    *,
    chat_id: str,
    user_id: str,
    text: str,
) -> None:
    command: ParsedCommand = parse_command(text)

    if command.name in {"", "/start", "/help"}:
        client.send_message(chat_id, HELP_TEXT)
        return

    if command.name == "/status":
        client.send_message(chat_id, build_status_text(store))
        return

    if command.name == "/whoami":
        client.send_message(
            chat_id,
            f"你的 Telegram user id 是：{user_id}\nchat id 是：{chat_id}",
        )
        return

    if command.name == "/logs":
        client.send_message(chat_id, build_logs_text(store))
        return

    if command.name == "/build":
        _run_named_task(
            client,
            store,
            chat_id=chat_id,
            user_id=user_id,
            kind="build",
            command_text=text,
        )
        return

    if command.name == "/test":
        _run_named_task(
            client,
            store,
            chat_id=chat_id,
            user_id=user_id,
            kind="test",
            command_text=text,
        )
        return

    if command.name == "/deploy":
        _run_named_task(
            client,
            store,
            chat_id=chat_id,
            user_id=user_id,
            kind="deploy",
            command_text=text,
        )
        return

    if command.name == "/run":
        if not command.argument:
            client.send_message(chat_id, "请在 /run 后面附上明确任务，例如：/run 修复去重按钮无反应")
            return
        _run_ai_task(
            client,
            store,
            chat_id=chat_id,
            user_id=user_id,
            task_text=command.argument,
        )
        return

    client.send_message(chat_id, "暂不支持这条命令，发送 /help 查看可用命令。")


def main() -> None:
    bot_config = load_bot_config()
    if not bot_config.token:
        raise RuntimeError("缺少 TELEGRAM_BOT_TOKEN，请先配置 .env.telegram.local")
    if not bot_config.allowed_user_ids:
        raise RuntimeError("缺少 TELEGRAM_ALLOWED_USER_ID，请先配置允许操作的 Telegram 用户")

    store = TaskStore(bot_config.db_path)
    client = TelegramClient(bot_config.token)
    offset = store.get_offset()

    print("Telegram 开发机器人已启动。")

    while True:
        try:
            updates = client.get_updates(offset=offset, timeout=20)
            for update in updates:
                offset = int(update["update_id"]) + 1
                store.set_offset(offset)

                chat_id, user_id, text = _message_text(update)
                if not chat_id or not user_id or not text:
                    continue
                command = parse_command(text)
                if user_id not in bot_config.allowed_user_ids and command.name not in {
                    "/start",
                    "/help",
                    "/whoami",
                }:
                    client.send_message(chat_id, "当前账号没有操作权限。")
                    continue

                handle_message(
                    client,
                    store,
                    chat_id=chat_id,
                    user_id=user_id,
                    text=text,
                )
        except KeyboardInterrupt:
            print("Telegram 开发机器人已停止。")
            break
        except Exception as exc:  # noqa: BLE001
            print(f"轮询异常：{exc}")
            time.sleep(bot_config.poll_interval)


if __name__ == "__main__":
    main()
