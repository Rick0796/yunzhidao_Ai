from __future__ import annotations

from typing import Callable, Final

ProgressCallback = Callable[[str, str], None]

TASK_STATUS_QUEUED: Final[str] = "queued"
TASK_STATUS_RUNNING: Final[str] = "running"
TASK_STATUS_DONE: Final[str] = "done"
TASK_STATUS_FAILED: Final[str] = "failed"
TASK_STATUS_INTERRUPTED: Final[str] = "interrupted"

TASK_KIND_BUILD: Final[str] = "build"
TASK_KIND_TEST: Final[str] = "test"
TASK_KIND_DEPLOY: Final[str] = "deploy"
TASK_KIND_AI_RUN: Final[str] = "ai_run"
