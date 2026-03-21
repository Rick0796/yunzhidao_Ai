from __future__ import annotations

import json
from typing import Any

import requests

DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_QWEN_MODEL = "qwen-plus"

MODEL_ALIAS_MAP = {
    "qwen-plus-latest": DEFAULT_QWEN_MODEL,
    "qwen-max": "qwen-max",
    "qwen3.5-plus": "qwen3.5-plus",
    "qwen-3.5-plus": "qwen3.5-plus",
    "qwen3.5-flash": "qwen3.5-flash",
    "qwen-3.5-flash": "qwen3.5-flash",
}


class QwenApiError(RuntimeError):
    pass


def normalize_qwen_model_name(model: str | None, fallback: str = DEFAULT_QWEN_MODEL) -> str:
    cleaned = str(model or "").strip()
    if not cleaned:
        return fallback
    return MODEL_ALIAS_MAP.get(cleaned.lower(), cleaned)


def _safe_json(text: str) -> Any:
    cleaned = str(text or "").strip()
    if not cleaned:
        return None
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def _translate_upstream_error(message: str) -> str:
    lowered = (message or "").lower()
    if "bad gateway" in lowered or "502" in lowered:
        return "千问官方网关暂时不可用，请稍后重试。"
    if "timed out" in lowered or "timeout" in lowered:
        return "千问官方接口响应超时，请稍后重试。"
    if "rate limit" in lowered or "too many requests" in lowered:
        return "千问官方接口频率超限，请稍后重试。"
    if "invalid api key" in lowered or "unauthorized" in lowered or "forbidden" in lowered:
        return "千问 API Key 无效或无权限，请检查配置。"
    return message or "千问请求失败，请稍后重试。"


def _is_retryable_error(message: str) -> bool:
    lowered = (message or "").lower()
    retryable_tokens = ("bad gateway", "502", "timed out", "timeout", "rate limit", "too many requests", "empty")
    return any(token in lowered for token in retryable_tokens)


def _extract_message_content(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                parts.append(item.strip())
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return "\n".join(parts).strip()
    if isinstance(value, dict):
        nested = value.get("content") or value.get("text")
        return _extract_message_content(nested)
    return ""


def _collect_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload.strip()
    if not isinstance(payload, dict):
        return ""

    direct_candidates = (
        payload.get("output_text"),
        payload.get("completion"),
        payload.get("text"),
        payload.get("content"),
        payload.get("message"),
    )
    for candidate in direct_candidates:
        text = _extract_message_content(candidate)
        if text:
            return text

    choices = payload.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            text = _extract_message_content(choice.get("message"))
            if text:
                return text
            text = _extract_message_content(choice.get("delta"))
            if text:
                return text
            text = _extract_message_content(choice.get("text"))
            if text:
                return text

    data = payload.get("data")
    if data:
        text = _collect_text(data)
        if text:
            return text

    result = payload.get("result")
    if result:
        text = _collect_text(result)
        if text:
            return text

    return ""


def _read_error_message(response: requests.Response) -> str:
    payload = _safe_json(response.text)
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message") or error.get("code")
            if isinstance(message, str) and message.strip():
                return _translate_upstream_error(message.strip())
        if isinstance(error, str) and error.strip():
            return _translate_upstream_error(error.strip())
        message = payload.get("message")
        if isinstance(message, str) and message.strip():
            return _translate_upstream_error(message.strip())
    raw = response.text[:240].strip()
    return _translate_upstream_error(raw or f"HTTP {response.status_code}")


def _request_chat_completion(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    timeout_seconds: float = 90,
    temperature: float | None = None,
) -> str:
    url = f"{(base_url or DEFAULT_QWEN_BASE_URL).rstrip('/')}/chat/completions"
    try:
        with requests.Session() as session:
            session.trust_env = False
            response = session.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json; charset=utf-8",
                },
                json={
                    "model": normalize_qwen_model_name(model, DEFAULT_QWEN_MODEL),
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": max(256, int(max_tokens or 256)),
                    "enable_thinking": False,
                    **({"temperature": temperature} if temperature is not None else {}),
                },
                timeout=max(15, timeout_seconds),
            )
    except requests.RequestException as exc:
        raise QwenApiError(f"请求千问失败：{exc}") from exc

    if not response.ok:
        raise QwenApiError(_read_error_message(response))

    try:
        payload = response.json()
    except ValueError as exc:
        plain_text = response.text.strip()
        if plain_text and not plain_text.lstrip().startswith("<"):
            return plain_text
        raise QwenApiError("千问返回了异常的响应格式。") from exc

    text = _collect_text(payload)
    if not text:
        raise QwenApiError("千问返回内容为空，请重试。")
    return text


def generate_text_with_qwen(
    *,
    base_url: str,
    api_key: str,
    model: str | None,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 4096,
    timeout_seconds: float = 90,
    temperature: float | None = None,
    retry_count: int = 1,
) -> str:
    resolved_model = normalize_qwen_model_name(model, DEFAULT_QWEN_MODEL)
    last_error: QwenApiError | None = None
    for attempt in range(max(1, retry_count)):
        try:
            return _request_chat_completion(
                base_url=base_url or DEFAULT_QWEN_BASE_URL,
                api_key=api_key,
                model=resolved_model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
                temperature=temperature,
            )
        except QwenApiError as exc:
            last_error = exc
            if attempt < max(1, retry_count) - 1 and _is_retryable_error(str(exc)):
                continue
            raise

    if last_error is not None:
        raise last_error
    raise QwenApiError("千问请求失败，请稍后重试。")
