from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.runtime_paths import ROOT_DIR, resolve_runtime_paths


RUNTIME_PATHS = resolve_runtime_paths()
DEFAULT_ENV_PATH = ROOT_DIR / ".env.telegram.local"
DEFAULT_DB_PATH = RUNTIME_PATHS.state_dir / "telegram_devbot.db"
DEFAULT_POLL_INTERVAL = 2.0
DEFAULT_MODEL = "gemini-2.0-flash"
DEFAULT_MODEL_TIMEOUT_SECONDS = 90
INVALID_MODEL_NAMES = {
    "gemini-3-flash",
    "your-model",
    "example-model",
    "placeholder-model",
}

CONFIG_PATHS = (
    ROOT_DIR / "backend" / "config.local.json",
    ROOT_DIR / "server" / "config.local.json",
    ROOT_DIR / "backend" / "config.example.json",
    ROOT_DIR / "server" / "config.example.json",
)


class ConfigValidationError(RuntimeError):
    pass


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

    placeholders = ("your_", "example", "placeholder", "replace_me")
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


def _to_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize_allowed_users(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {item.strip() for item in raw.split(",") if item.strip()}


def resolve_bot_db_path(raw_path: str | None) -> Path:
    candidate = Path(raw_path).expanduser() if raw_path else DEFAULT_DB_PATH
    if not candidate.is_absolute():
        candidate = (ROOT_DIR / candidate).resolve()
    candidate.parent.mkdir(parents=True, exist_ok=True)
    return candidate


def load_bot_config() -> BotConfig:
    load_env_file()
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    allowed_user_ids = normalize_allowed_users(os.getenv("TELEGRAM_ALLOWED_USER_ID"))
    db_path = resolve_bot_db_path(os.getenv("TELEGRAM_TASK_DB"))
    poll_interval = _to_float(os.getenv("TELEGRAM_POLL_INTERVAL"), DEFAULT_POLL_INTERVAL)
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
    timeout_seconds = _to_int(
        os.getenv("TELEGRAM_MODEL_TIMEOUT_SECONDS")
        or config.get("timeoutSeconds"),
        DEFAULT_MODEL_TIMEOUT_SECONDS,
    )

    return ModelConfig(
        base_url=base_url,
        api_key=api_key,
        model=model,
        timeout_seconds=max(30, timeout_seconds),
    )


def validate_bot_config(config: BotConfig) -> BotConfig:
    errors: list[str] = []
    if not config.token:
        errors.append("Missing TELEGRAM_BOT_TOKEN in .env.telegram.local.")
    if not config.allowed_user_ids:
        errors.append("Missing TELEGRAM_ALLOWED_USER_ID; configure at least one operator.")
    if config.poll_interval <= 0:
        errors.append("TELEGRAM_POLL_INTERVAL must be greater than 0.")
    if errors:
        raise ConfigValidationError("\n".join(errors))
    return config


def validate_model_config(config: ModelConfig) -> ModelConfig:
    errors: list[str] = []
    if not config.base_url:
        errors.append("Missing model base URL; check UPSTREAM_BASE_URL / OPENAI_BASE_URL / config.local.json.")
    elif not config.base_url.startswith(("http://", "https://")):
        errors.append("Model base URL must start with http:// or https://.")
    if not config.api_key:
        errors.append("Missing model API Key; check UPSTREAM_API_KEY / OPENAI_API_KEY / config.local.json.")
    normalized_model = config.model.strip().lower()
    if not normalized_model:
        errors.append("Missing default model name; check UPSTREAM_DEFAULT_MODEL / OPENAI_MODEL / config.local.json.")
    elif normalized_model in INVALID_MODEL_NAMES:
        errors.append(f"Unsupported default model name: {config.model}.")
    if config.timeout_seconds < 30:
        errors.append("TELEGRAM_MODEL_TIMEOUT_SECONDS must be at least 30 seconds.")
    if errors:
        raise ConfigValidationError("\n".join(errors))
    return config


def load_validated_bot_config() -> BotConfig:
    return validate_bot_config(load_bot_config())


def load_validated_model_config() -> ModelConfig:
    return validate_model_config(load_model_config())
