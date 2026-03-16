from __future__ import annotations

import html
import platform
import re
import subprocess
from pathlib import Path
from typing import Any


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


INVALID_DISPLAY_CHAR_PATTERN = re.compile(r"[\u0000-\u001f\u007f-\u009f\uE000-\uF8FF\uFFF0-\uFFFF�]+")
WHITESPACE_PATTERN = re.compile(r"\s+")
CLIENT_APP_PATTERN = re.compile(r"(?:更多资讯请)?(?:下载|打开)(?:[^\s，。！？!?]{0,10})?客户端", re.IGNORECASE)
UPSTREAM_ERROR_TEXT_PATTERN = re.compile(
    r"(SecurityCompromiseError|Anonymous access to domain blocked|DDoS attack suspected|readableMessage|[\"']code[\"']\s*:\s*451|[\"']status[\"']\s*:\s*45102)",
    re.IGNORECASE,
)


def clean_text(value: Any) -> str:
    if value is None:
        return ""

    text = html.unescape(str(value))
    text = text.replace("\u3000", " ").replace("\xa0", " ").replace("&nbsp;", " ")
    text = INVALID_DISPLAY_CHAR_PATTERN.sub(" ", text)
    text = CLIENT_APP_PATTERN.sub(" ", text)
    text = WHITESPACE_PATTERN.sub(" ", text)
    return text.strip()


def looks_like_upstream_error(value: Any) -> bool:
    text = clean_text(value)
    if not text:
        return False
    return bool(UPSTREAM_ERROR_TEXT_PATTERN.search(text) and (text.startswith("{") or "SecurityCompromiseError" in text or '"code":' in text or '"status":' in text))


def dedupe_strings(items: list[str]) -> list[str]:
    results: list[str] = []
    seen: set[str] = set()
    for item in items:
        value = clean_text(item)
        key = re.sub(r"[\W_]+", "", value.lower())
        if not key or key in seen:
            continue
        seen.add(key)
        results.append(value)
    return results


def collect_business_keyword_hits(
    text: str,
    keyword_weights: dict[str, int],
    *,
    regulator_pattern: str = r"(监管|合规|治理|处罚|封号|风险)",
    growth_pattern: str = r"(获客|流量|转化|客户|成交|订单)",
    operator_pattern: str = r"(创业|企业|经营|老板)",
) -> tuple[list[str], int]:
    normalized = clean_text(text).lower()
    hits: list[str] = []
    score = 0

    for keyword, weight in keyword_weights.items():
        if keyword in normalized:
            hits.append(keyword)
            score += weight

    if re.search(regulator_pattern, normalized):
        score += 2
    if re.search(growth_pattern, normalized):
        score += 2
    if re.search(operator_pattern, normalized):
        score += 1

    return dedupe_strings(hits)[:6], score
