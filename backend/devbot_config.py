from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
RUNTIME_DIR = ROOT_DIR / "runtime"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_ENV_PATH = ROOT_DIR / ".env.telegram.local"
DEFAULT_DB_PATH = RUNTIME_DIR / "telegram_devbot.db"
DEFAULT_POLL_INTERVAL = 2.0
DEFAULT_MODEL = "gemini-3-flash"
DEFAULT_MODEL_TIMEOUT_SECONDS = 90

CONFIG_PATHS = (
    ROOT_DIR / "backend" / "config.local.json",
    ROOT_DIR / "server" / "config.local.json",
    ROOT_DIR / "backend" / "config.example.json",
    ROOT_DIR / "server" / "config.example.json",
)


@dataclass(frozen=True)
class BotConfig:
    token: str
    allowed_user_ids: set[str]
    db_path: Path
    poll_interval: float


@dataclass(frozen=True)
class ModelConfig:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: int


def load_env_file(path: Path = DEFAULT_ENV_PATH) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _clean_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    placeholders = ("请替换", "your_", "example", "placeholder", "replace_me")
    if any(marker.lower() in text.lower() for marker in placeholders):
        return ""
    return text


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None


def _load_project_config() -> dict[str, Any]:
    for path in CONFIG_PATHS:
        config = _read_json(path)
        if config:
            return config
    return {}


def normalize_allowed_users(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {item.strip() for item in raw.split(",") if item.strip()}


def load_bot_config() -> BotConfig:
    load_env_file()
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    allowed_user_ids = normalize_allowed_users(os.getenv("TELEGRAM_ALLOWED_USER_ID"))
    db_path = Path(os.getenv("TELEGRAM_TASK_DB") or DEFAULT_DB_PATH)
    poll_interval = float(os.getenv("TELEGRAM_POLL_INTERVAL") or DEFAULT_POLL_INTERVAL)
    return BotConfig(
        token=token,
        allowed_user_ids=allowed_user_ids,
        db_path=db_path,
        poll_interval=poll_interval,
    )


def load_model_config() -> ModelConfig:
    load_env_file()
    config = _load_project_config()
    base_url = (
        _clean_text(os.getenv("UPSTREAM_BASE_URL"))
        or _clean_text(os.getenv("OPENAI_BASE_URL"))
        or _clean_text(config.get("baseUrl"))
    ).rstrip("/")
    api_key = (
        _clean_text(os.getenv("UPSTREAM_API_KEY"))
        or _clean_text(os.getenv("OPENAI_API_KEY"))
        or _clean_text(config.get("apiKey"))
    )
    model = (
        _clean_text(os.getenv("UPSTREAM_DEFAULT_MODEL"))
        or _clean_text(os.getenv("OPENAI_MODEL"))
        or _clean_text(config.get("defaultModel"))
        or DEFAULT_MODEL
    )
    timeout_seconds = int(
        os.getenv("TELEGRAM_MODEL_TIMEOUT_SECONDS")
        or config.get("timeoutSeconds")
        or DEFAULT_MODEL_TIMEOUT_SECONDS
    )

    return ModelConfig(
        base_url=base_url,
        api_key=api_key,
        model=model,
        timeout_seconds=max(30, timeout_seconds),
    )
