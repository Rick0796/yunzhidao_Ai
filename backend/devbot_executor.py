from __future__ import annotations

import subprocess
from pathlib import Path

from backend.devbot_config import ROOT_DIR
from backend.devbot_store import TaskStore


def run_command(
    command: list[str],
    *,
    cwd: Path = ROOT_DIR,
    timeout: int = 900,
) -> tuple[int, str]:
    completed = subprocess.run(
        command,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
    )
    output = (completed.stdout or "") + (completed.stderr or "")
    return completed.returncode, output.strip()


def format_git_status() -> str:
    code, output = run_command(["git", "status", "--short"], timeout=60)
    if code != 0:
        return "git status 执行失败"
    return output or "工作区干净"


def execute_named_task(kind: str) -> tuple[int, str, str]:
    kind = kind.lower().strip()

    if kind == "build":
        build_code, build_output = run_command(["npm.cmd", "run", "build"], timeout=1800)
        py_code, py_output = run_command(
            [
                "python",
                "-m",
                "py_compile",
                "backend/main.py",
                "backend/script_library.py",
                "backend/telegram_devbot.py",
            ],
            timeout=300,
        )
        exit_code = 0 if build_code == 0 and py_code == 0 else 1
        summary = "build 通过" if exit_code == 0 else "build 失败"
        output = "\n\n".join(
            part for part in [f"[npm build]\n{build_output}", f"[py_compile]\n{py_output}"] if part.strip()
        )
        return exit_code, summary, output

    if kind == "test":
        py_code, py_output = run_command(
            [
                "python",
                "-m",
                "py_compile",
                "backend/main.py",
                "backend/script_library.py",
                "backend/telegram_devbot.py",
            ],
            timeout=300,
        )
        git_code, git_output = run_command(["git", "status", "--short"], timeout=60)
        exit_code = 0 if py_code == 0 and git_code == 0 else 1
        summary = "测试通过" if exit_code == 0 else "测试失败"
        output = "\n\n".join(
            part for part in [f"[py_compile]\n{py_output}", f"[git status]\n{git_output}"] if part.strip()
        )
        return exit_code, summary, output

    if kind == "deploy":
        status = format_git_status()
        if status != "工作区干净":
            return (
                1,
                "部署前检查失败",
                "当前工作区不干净，先提交或处理改动再部署。\n\n" + status,
            )
        push_code, push_output = run_command(["git", "push", "origin", "main"], timeout=1800)
        exit_code = 0 if push_code == 0 else 1
        summary = "部署推送成功" if exit_code == 0 else "部署推送失败"
        return exit_code, summary, push_output

    return 1, "未知任务", f"不支持的任务类型：{kind}"


def build_status_text(store: TaskStore) -> str:
    last_task = store.get_last_task()
    status = format_git_status()

    lines = [
        "Telegram 开发机器人在线。",
        f"当前仓库：{ROOT_DIR}",
        f"工作区状态：{status}",
    ]
    if last_task:
        lines.extend(
            [
                "",
                "最近任务：",
                f"#{last_task['id']} {last_task['kind']} [{last_task['status']}]",
                f"命令：{last_task['command_text']}",
                f"摘要：{last_task['summary'] or '无'}",
            ]
        )
    return "\n".join(lines)


def build_logs_text(store: TaskStore) -> str:
    task = store.get_last_task()
    if not task:
        return "还没有执行过任务。"

    parts = [
        f"最近任务 #{task['id']}",
        f"类型：{task['kind']}",
        f"状态：{task['status']}",
        f"命令：{task['command_text']}",
        f"摘要：{task['summary'] or '无'}",
        "",
        task["output"] or "(无输出)",
    ]
    return "\n".join(parts)
