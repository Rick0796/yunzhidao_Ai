from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from backend.devbot_config import ModelConfig, ROOT_DIR
from backend.devbot_executor import run_command


ALLOWED_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".bat", ".css"}
MAX_FILE_COUNT = 4
MAX_FILE_CHARS = 12000
MAX_EDIT_COUNT = 8
VALIDATION_COMMANDS = {
    "build_frontend": ["npm.cmd", "run", "build"],
    "compile_backend": [
        "python",
        "-m",
        "py_compile",
        "backend/main.py",
        "backend/script_library.py",
        "backend/telegram_devbot.py",
    ],
    "git_status": ["git", "status", "--short"],
}


@dataclass(frozen=True)
class PlanResult:
    summary: str
    file_candidates: list[str]
    search_terms: list[str]
    validation_steps: list[str]


@dataclass(frozen=True)
class EditInstruction:
    path: str
    search: str
    replace: str
    reason: str


@dataclass(frozen=True)
class EditPlan:
    summary: str
    edits: list[EditInstruction]
    validation_steps: list[str]


class ModelClient:
    def __init__(self, config: ModelConfig) -> None:
        self.config = config

    def _request_json(self, *, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        if not self.config.base_url or not self.config.api_key:
            raise RuntimeError("缺少模型配置，请检查 .env.telegram.local 或 config.local.json")

        response = requests.post(
            f"{self.config.base_url.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.config.model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            },
            timeout=self.config.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        return json.loads(content)

    def create_plan(self, task_text: str, repo_snapshot: str) -> PlanResult:
        system_prompt = (
            "你是一个谨慎的开发代理。请根据任务描述和代码库摘要，"
            "输出 JSON，字段只能包含 summary, file_candidates, search_terms, validation_steps。"
            "file_candidates 是最可能修改的相对路径数组；search_terms 是适合 ripgrep 的关键字；"
            "validation_steps 只能从 build_frontend, compile_backend, git_status 中选择。"
        )
        user_prompt = f"任务：{task_text}\n\n代码库摘要：\n{repo_snapshot}"
        payload = self._request_json(system_prompt=system_prompt, user_prompt=user_prompt)
        return PlanResult(
            summary=str(payload.get("summary", "")).strip(),
            file_candidates=[
                str(item).strip() for item in payload.get("file_candidates", []) if str(item).strip()
            ],
            search_terms=[
                str(item).strip() for item in payload.get("search_terms", []) if str(item).strip()
            ],
            validation_steps=[
                step
                for step in payload.get("validation_steps", [])
                if step in VALIDATION_COMMANDS
            ],
        )

    def create_edit_plan(self, task_text: str, repo_snapshot: str, file_payload: str) -> EditPlan:
        system_prompt = (
            "你是一个谨慎的开发代理。基于任务、代码库摘要和候选文件内容，"
            "输出 JSON，字段只能包含 summary, edits, validation_steps。"
            "edits 是数组，每项包含 path, search, replace, reason。"
            "要求：只做少量、精确、可落地的修改；search 必须是文件中能精确找到的一段原文；"
            "不要输出解释性文字，不要输出 markdown。"
        )
        user_prompt = (
            f"任务：{task_text}\n\n代码库摘要：\n{repo_snapshot}\n\n"
            f"候选文件内容：\n{file_payload}"
        )
        payload = self._request_json(system_prompt=system_prompt, user_prompt=user_prompt)
        edits: list[EditInstruction] = []
        for item in payload.get("edits", [])[:MAX_EDIT_COUNT]:
            path = str(item.get("path", "")).strip()
            search = str(item.get("search", ""))
            replace = str(item.get("replace", ""))
            reason = str(item.get("reason", "")).strip()
            if path and search:
                edits.append(EditInstruction(path=path, search=search, replace=replace, reason=reason))

        validation_steps = [
            step for step in payload.get("validation_steps", []) if step in VALIDATION_COMMANDS
        ]
        return EditPlan(
            summary=str(payload.get("summary", "")).strip(),
            edits=edits,
            validation_steps=validation_steps,
        )


def _safe_relative_path(raw_path: str) -> Path | None:
    path = (ROOT_DIR / raw_path).resolve()
    try:
        path.relative_to(ROOT_DIR)
    except ValueError:
        return None
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        return None
    if not path.exists() or not path.is_file():
        return None
    return path


def _collect_repo_files() -> list[str]:
    code, output = run_command(["rg", "--files"], timeout=120)
    if code != 0:
        return []
    files: list[str] = []
    for raw in output.splitlines():
        path = raw.strip()
        if not path:
            continue
        safe = _safe_relative_path(path)
        if safe:
            files.append(path.replace("\\", "/"))
    return files


def _score_file(path: str, task_text: str, search_terms: list[str]) -> int:
    haystack = path.lower()
    score = 0
    for token in task_text.lower().split():
        if token and token in haystack:
            score += 2
    for term in search_terms:
        if term and term.lower() in haystack:
            score += 4
    if "telegram" in haystack:
        score += 3
    if "devbot" in haystack:
        score += 3
    return score


def select_candidate_files(
    task_text: str,
    file_candidates: list[str],
    search_terms: list[str],
) -> list[str]:
    files = _collect_repo_files()
    preferred: list[str] = []
    seen: set[str] = set()

    for raw in file_candidates:
        safe = _safe_relative_path(raw)
        if safe:
            normalized = str(safe.relative_to(ROOT_DIR)).replace("\\", "/")
            if normalized not in seen:
                preferred.append(normalized)
                seen.add(normalized)

    ranked = sorted(
        (path for path in files if path not in seen),
        key=lambda item: _score_file(item, task_text, search_terms),
        reverse=True,
    )
    combined = preferred + ranked
    return combined[:MAX_FILE_COUNT]


def build_repo_snapshot(task_text: str) -> str:
    branch_code, branch_output = run_command(["git", "branch", "--show-current"], timeout=60)
    commit_code, commit_output = run_command(["git", "rev-parse", "--short", "HEAD"], timeout=60)
    status_code, status_output = run_command(["git", "status", "--short"], timeout=60)
    files = _collect_repo_files()[:200]

    parts = [
        f"任务：{task_text}",
        f"当前分支：{branch_output if branch_code == 0 else '未知'}",
        f"当前提交：{commit_output if commit_code == 0 else '未知'}",
        f"工作区状态：{status_output if status_code == 0 and status_output else '干净'}",
        "仓库文件（前 200 项）：",
        "\n".join(files),
    ]
    return "\n\n".join(parts)


def build_file_payload(paths: list[str]) -> str:
    payloads: list[str] = []
    for raw_path in paths:
        safe = _safe_relative_path(raw_path)
        if not safe:
            continue
        text = safe.read_text(encoding="utf-8", errors="replace")
        payloads.append(
            f"FILE: {safe.relative_to(ROOT_DIR).as_posix()}\n{text[:MAX_FILE_CHARS]}"
        )
    return "\n\n".join(payloads)


def apply_edit_plan(plan: EditPlan) -> tuple[int, str]:
    if not plan.edits:
        return 1, "模型没有给出可执行的修改。"

    applied_logs: list[str] = []
    for edit in plan.edits:
        safe_path = _safe_relative_path(edit.path)
        if not safe_path:
            return 1, f"非法或不存在的路径：{edit.path}"

        original = safe_path.read_text(encoding="utf-8", errors="replace")
        occurrences = original.count(edit.search)
        if occurrences != 1:
            return (
                1,
                f"{edit.path} 中 search 片段匹配次数为 {occurrences}，需要精确等于 1 才能自动修改。",
            )

        updated = original.replace(edit.search, edit.replace, 1)
        safe_path.write_text(updated, encoding="utf-8")
        applied_logs.append(f"[已修改] {edit.path} - {edit.reason or '无说明'}")

    return 0, "\n".join(applied_logs)


def run_validation_steps(steps: list[str]) -> tuple[int, str]:
    outputs: list[str] = []
    exit_code = 0

    for step in steps:
        command = VALIDATION_COMMANDS.get(step)
        if not command:
            continue
        code, output = run_command(command, timeout=1800 if step == "build_frontend" else 300)
        outputs.append(f"[{step}]\n{output or '(无输出)'}")
        if code != 0:
            exit_code = 1

    return exit_code, "\n\n".join(outputs)


def execute_ai_task(task_text: str, model_config: ModelConfig) -> tuple[int, str, str]:
    client = ModelClient(model_config)
    repo_snapshot = build_repo_snapshot(task_text)
    plan = client.create_plan(task_text, repo_snapshot)
    candidate_files = select_candidate_files(task_text, plan.file_candidates, plan.search_terms)
    file_payload = build_file_payload(candidate_files)
    edit_plan = client.create_edit_plan(task_text, repo_snapshot, file_payload)

    apply_code, apply_output = apply_edit_plan(edit_plan)
    if apply_code != 0:
        return apply_code, edit_plan.summary or plan.summary or "AI 执行失败", apply_output

    validation_steps = edit_plan.validation_steps or plan.validation_steps or ["compile_backend", "git_status"]
    validation_code, validation_output = run_validation_steps(validation_steps)
    exit_code = 0 if validation_code == 0 else 1
    summary = edit_plan.summary or plan.summary or "AI 任务已执行"
    output = "\n\n".join(part for part in [apply_output, validation_output] if part.strip())
    return exit_code, summary, output
