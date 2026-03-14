from __future__ import annotations

import platform
import subprocess
from pathlib import Path


def get_npm_command() -> str:
    return "npm.cmd" if platform.system() == "Windows" else "npm"


def get_python_command() -> str:
    return "python"


def run_command_cross_platform(
    command: list[str],
    *,
    cwd: Path | None = None,
    timeout: int = 900,
) -> tuple[int, str]:
    normalized = [get_npm_command(), *command[1:]] if command and command[0] == "npm.cmd" else command
    completed = subprocess.run(
        normalized,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    output = ((completed.stdout or "") + (completed.stderr or "")).strip()
    return completed.returncode, output
