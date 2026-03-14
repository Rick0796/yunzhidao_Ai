from __future__ import annotations

from backend.devbot_executor import build_logs_text
from backend.devbot_store import TaskStore
from backend.telegram_devbot import _looks_like_plain_greeting, _looks_like_progress_query


def test_progress_query_recognizes_chinese_variants() -> None:
    assert _looks_like_progress_query("目前的任务进度") is True
    assert _looks_like_progress_query("当前任务") is True
    assert _looks_like_progress_query("progress") is True


def test_greeting_recognizes_chinese_variants() -> None:
    assert _looks_like_plain_greeting("你好") is True
    assert _looks_like_plain_greeting("在吗") is True
    assert _looks_like_plain_greeting("hello") is True


def test_build_logs_text_lists_recent_tasks(tmp_path) -> None:
    store = TaskStore(tmp_path / "telegram_devbot.db")
    first = store.create_task(chat_id="1", user_id="2", kind="ai_run", command_text="older task", status="done")
    store.update_task(first, summary="older summary", output="older output")
    second = store.create_task(chat_id="1", user_id="2", kind="build", command_text="newer task", status="done")
    store.update_task(second, summary="newer summary", output="newer output")

    logs = build_logs_text(store)

    assert "#2 build [done]" in logs
    assert "older task" in logs
    assert "newer task" in logs
    assert "newer output" in logs
