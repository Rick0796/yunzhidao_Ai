from __future__ import annotations

import pytest

from backend.devbot_config import BotConfig, ConfigValidationError, ModelConfig, validate_bot_config, validate_model_config
from backend.runtime_paths import ensure_runtime_paths, resolve_runtime_paths


def test_validate_bot_config_requires_token_and_allowed_users(tmp_path) -> None:
    config = BotConfig(token="", allowed_user_ids=set(), db_path=tmp_path / "telegram_devbot.db", poll_interval=2.0)

    with pytest.raises(ConfigValidationError) as exc_info:
        validate_bot_config(config)

    message = str(exc_info.value)
    assert "TELEGRAM_BOT_TOKEN" in message
    assert "TELEGRAM_ALLOWED_USER_ID" in message


def test_validate_model_config_requires_base_url_and_api_key() -> None:
    config = ModelConfig(base_url="", api_key="", model="gemini-2.0-flash", timeout_seconds=90)

    with pytest.raises(ConfigValidationError) as exc_info:
        validate_model_config(config)

    message = str(exc_info.value)
    assert "base URL" in message
    assert "API Key" in message


def test_validate_model_config_rejects_known_invalid_model() -> None:
    config = ModelConfig(base_url="https://example.com", api_key="secret", model="gemini-3-flash", timeout_seconds=90)

    with pytest.raises(ConfigValidationError) as exc_info:
        validate_model_config(config)

    assert "Unsupported default model name" in str(exc_info.value)


def test_resolve_runtime_paths_supports_split_cache_and_state_dirs(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    runtime_dir = tmp_path / "runtime"
    cache_dir = tmp_path / "cache"
    state_dir = tmp_path / "state"

    monkeypatch.setenv("AI_COPY_WORKBENCH_RUNTIME_DIR", str(runtime_dir))
    monkeypatch.setenv("AI_COPY_WORKBENCH_CACHE_DIR", str(cache_dir))
    monkeypatch.setenv("AI_COPY_WORKBENCH_STATE_DIR", str(state_dir))
    monkeypatch.setenv("VERCEL", "1")

    paths = resolve_runtime_paths()

    assert paths.serverless is True
    assert paths.runtime_dir == runtime_dir.resolve()
    assert paths.cache_dir == cache_dir.resolve()
    assert paths.state_dir == state_dir.resolve()
    assert not paths.cache_dir.exists()
    assert not paths.state_dir.exists()

    ensured = ensure_runtime_paths(paths)
    assert ensured.cache_dir.exists()
    assert ensured.state_dir.exists()
