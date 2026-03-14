from __future__ import annotations

import pytest

from backend.devbot_store import TaskStore


def test_update_task_rejects_unknown_fields(tmp_path) -> None:
    store = TaskStore(tmp_path / "telegram_devbot.db")
    task_id = store.create_task(chat_id="1", user_id="2", kind="test", command_text="run")

    with pytest.raises(ValueError) as exc_info:
        store.update_task(task_id, hacked_column="boom")

    assert "Illegal task fields" in str(exc_info.value)


def test_update_task_allows_known_fields(tmp_path) -> None:
    store = TaskStore(tmp_path / "telegram_devbot.db")
    task_id = store.create_task(chat_id="1", user_id="2", kind="test", command_text="run")

    store.update_task(task_id, status="done", summary="ok")
    last_task = store.get_last_task()

    assert last_task is not None
    assert last_task["status"] == "done"
    assert last_task["summary"] == "ok"
