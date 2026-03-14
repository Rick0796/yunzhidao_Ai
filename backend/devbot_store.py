from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ALLOWED_TASK_UPDATE_FIELDS = {
    "status",
    "started_at",
    "finished_at",
    "exit_code",
    "summary",
    "output",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TaskStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS bot_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS telegram_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    command_text TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    exit_code INTEGER,
                    summary TEXT,
                    output TEXT
                );
                """
            )

    def get_offset(self) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value FROM bot_meta WHERE key = 'telegram_offset'"
            ).fetchone()
        return int(row["value"]) if row else 0

    def set_offset(self, offset: int) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO bot_meta(key, value)
                VALUES('telegram_offset', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (str(offset),),
            )

    def create_task(
        self,
        *,
        chat_id: str,
        user_id: str,
        kind: str,
        command_text: str,
        status: str = "queued",
    ) -> int:
        with self._connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO telegram_tasks(
                    chat_id, user_id, kind, command_text, status, created_at
                )
                VALUES(?, ?, ?, ?, ?, ?)
                """,
                (chat_id, user_id, kind, command_text, status, utc_now()),
            )
            return int(cursor.lastrowid)

    def update_task(self, task_id: int, **fields: Any) -> None:
        if not fields:
            return

        invalid_fields = set(fields) - ALLOWED_TASK_UPDATE_FIELDS
        if invalid_fields:
            raise ValueError(f"Illegal task fields: {sorted(invalid_fields)}")

        assignments = ", ".join(f"{key} = ?" for key in fields)
        values = list(fields.values()) + [task_id]
        with self._connect() as conn:
            conn.execute(
                f"UPDATE telegram_tasks SET {assignments} WHERE id = ?",
                values,
            )

    def list_recent_tasks(self, limit: int = 5) -> list[sqlite3.Row]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM telegram_tasks
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return rows

    def get_last_task(self) -> sqlite3.Row | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM telegram_tasks
                ORDER BY id DESC
                LIMIT 1
                """
            ).fetchone()
        return row

    def get_running_task(self) -> sqlite3.Row | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM telegram_tasks
                WHERE status = 'running'
                ORDER BY id DESC
                LIMIT 1
                """
            ).fetchone()
        return row

    def mark_running_tasks_interrupted(self, summary: str) -> int:
        with self._connect() as conn:
            cursor = conn.execute(
                """
                UPDATE telegram_tasks
                SET status = 'failed',
                    finished_at = ?,
                    exit_code = 1,
                    summary = ?,
                    output = COALESCE(output, '')
                WHERE status = 'running'
                """,
                (utc_now(), summary),
            )
            return int(cursor.rowcount or 0)
