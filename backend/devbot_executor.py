from __future__ import annotations

import subprocess
from pathlib import Path

from backend.devbot_config import ROOT_DIR
from backend.devbot_store import TaskStore
from backend.platform_utils import get_npm_command
from backend.shared_types import ProgressCallback


BACKEND_COMPILE_TARGETS = [
    "backend/main.py",
    "backend/runtime_paths.py",
    "backend/script_library.py",
    "backend/devbot_config.py",
    "backend/devbot_store.py",
    "backend/devbot_telegram.py",
    "backend/devbot_executor.py",
    "backend/devbot_ai.py",
    "backend/platform_utils.py",
    "backend/shared_types.py",
    "backend/telegram_devbot.py",
]


def run_command(
    command: list[str],
    *,
    cwd: Path = ROOT_DIR,
    timeout: int = 900,
) -> tuple[int, str]:
    normalized = [get_npm_command(), *command[1:]] if command and command[0] == "npm.cmd" else command
    completed = subprocess.run(
        normalized,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    output = ((completed.stdout or "") + (completed.stderr or "")).strip()
    return completed.returncode, output


def format_git_status() -> str:
    code, output = run_command(["git", "status", "--short"], timeout=60)
    if code != 0:
        return "git status failed"
    return output or "working tree clean"


def execute_named_task(
    kind: str,
    *,
    progress_callback: ProgressCallback | None = None,
) -> tuple[int, str, str]:
    task_kind = kind.lower().strip()

    if task_kind == "build":
        if progress_callback:
            progress_callback("build_frontend", "Running frontend build")
        build_code, build_output = run_command(["npm.cmd", "run", "build"], timeout=1800)

        if progress_callback:
            progress_callback("compile_backend", "Running backend compile checks")
        py_code, py_output = run_command(["python", "-m", "py_compile", *BACKEND_COMPILE_TARGETS], timeout=300)

        exit_code = 0 if build_code == 0 and py_code == 0 else 1
        summary = "build passed" if exit_code == 0 else "build failed"
        output = "\n\n".join(
            part
            for part in [
                f"[npm build]\\n{build_output or '(no output)'}",
                f"[py_compile]\\n{py_output or '(no output)'}",
            ]
            if part.strip()
        )
        return exit_code, summary, output

    if task_kind == "test":
        if progress_callback:
            progress_callback("compile_backend", "Running backend compile checks")
        py_code, py_output = run_command(["python", "-m", "py_compile", *BACKEND_COMPILE_TARGETS], timeout=300)

        if progress_callback:
            progress_callback("git_status", "Checking working tree state")
        git_code, git_output = run_command(["git", "status", "--short"], timeout=60)

        exit_code = 0 if py_code == 0 and git_code == 0 else 1
        summary = "tests passed" if exit_code == 0 else "tests failed"
        output = "\n\n".join(
            part
            for part in [
                f"[py_compile]\\n{py_output or '(no output)'}",
                f"[git status]\\n{git_output or '(no output)'}",
            ]
            if part.strip()
        )
        return exit_code, summary, output

    if task_kind == "deploy":
        if progress_callback:
            progress_callback("git_status", "Checking working tree before deploy")
        status = format_git_status()
        if status != "working tree clean":
            return 1, "deploy precheck failed", "Working tree is not clean. Commit or resolve changes before deploy.\n\n" + status

        if progress_callback:
            progress_callback("deploy", "Pushing to GitHub")
        push_code, push_output = run_command(["git", "push", "origin", "main"], timeout=1800)
        exit_code = 0 if push_code == 0 else 1
        summary = "deploy push succeeded" if exit_code == 0 else "deploy push failed"
        return exit_code, summary, push_output or "(no output)"

    return 1, "unknown task", f"Unsupported task kind: {kind}"


def build_status_text(store: TaskStore) -> str:
    last_task = store.get_last_task()
    status = format_git_status()

    lines = [
        "Telegram dev bot is online.",
        f"Repository: {ROOT_DIR}",
        f"Working tree: {status}",
    ]
    if last_task:
        lines.extend(
            [
                "",
                "Latest task:",
                f"#{last_task['id']} {last_task['kind']} [{last_task['status']}]",
                f"Command: {last_task['command_text']}",
                f"Summary: {last_task['summary'] or 'none'}",
            ]
        )
    return "\n".join(lines)


def build_logs_text(store: TaskStore) -> str:
    task = store.get_last_task()
    if not task:
        return "No task has been executed yet."

    parts = [
        f"Latest task #{task['id']}",
        f"Kind: {task['kind']}",
        f"Status: {task['status']}",
        f"Command: {task['command_text']}",
        f"Summary: {task['summary'] or 'none'}",
        "",
        task["output"] or "(no output)",
    ]
    return "\n".join(parts)


def build_current_text(store: TaskStore) -> str:
    task = store.get_running_task()
    if not task:
        return "There is no running task right now."

    return "\n".join(
        [
            f"Current task #{task['id']}",
            f"Kind: {task['kind']}",
            f"Status: {task['status']}",
            f"Command: {task['command_text']}",
            f"Progress: {task['summary'] or 'no progress yet'}",
            f"Started at: {task['started_at'] or task['created_at']}",
        ]
    )
