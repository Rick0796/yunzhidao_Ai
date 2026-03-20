from __future__ import annotations

import ast
import json
import re
from typing import Any

import requests

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
ANTHROPIC_API_VERSION = "2023-06-01"
TEXT_LIKE_RESPONSE_KEYS = (
    "completion",
    "output_text",
    "text",
    "content",
    "response",
    "answer",
    "message",
    "result",
    "output",
)
IGNORED_RESPONSE_KEYS = {
    "id",
    "model",
    "role",
    "type",
    "object",
    "usage",
    "stop_reason",
    "finish_reason",
    "input_tokens",
    "output_tokens",
    "prompt",
    "system",
    "messages",
    "index",
}

MODEL_ALIAS_MAP = {
    "sonnet-4.6": DEFAULT_ANTHROPIC_MODEL,
    "claude-sonnet-4.6": DEFAULT_ANTHROPIC_MODEL,
    "anthropic/claude-sonnet-4.6": DEFAULT_ANTHROPIC_MODEL,
    "claude-sonnet-4": "claude-sonnet-4",
    "claude-sonnet-4-20250514": "claude-sonnet-4",
}


class AnthropicApiError(RuntimeError):
    pass


def normalize_anthropic_model_name(model: str | None, fallback: str = DEFAULT_ANTHROPIC_MODEL) -> str:
    cleaned = (model or "").strip()
    if not cleaned:
        return fallback
    return MODEL_ALIAS_MAP.get(cleaned.lower(), cleaned)


def _safe_json(text: str) -> Any:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def _safe_literal_eval(text: str) -> Any:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    try:
        value = ast.literal_eval(cleaned)
    except (SyntaxError, ValueError):
        return None
    return value if isinstance(value, (dict, list)) else None


def _normalize_json_candidate(text: str) -> str:
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    cleaned = cleaned.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    cleaned = re.sub(r",(\s*[}\]])", r"\1", cleaned)
    return cleaned


def _parse_json_candidate(text: str) -> Any:
    cleaned = _normalize_json_candidate(text)
    if not cleaned:
        return None

    parsed = _safe_json(cleaned)
    if parsed is not None:
        return parsed

    parsed = _safe_literal_eval(cleaned)
    if parsed is not None:
        return parsed

    return None


def _strip_code_fences(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```json", "```", 1).replace("```JSON", "```", 1)
        cleaned = cleaned.strip("`").strip()
    return cleaned


def _extract_json_payload(text: str) -> Any:
    cleaned = _strip_code_fences(text)
    parsed = _parse_json_candidate(cleaned)
    if parsed is not None:
        return parsed

    first_object = cleaned.find("{")
    last_object = cleaned.rfind("}")
    if first_object >= 0 and last_object > first_object:
        parsed = _parse_json_candidate(cleaned[first_object : last_object + 1])
        if parsed is not None:
            return parsed

    first_array = cleaned.find("[")
    last_array = cleaned.rfind("]")
    if first_array >= 0 and last_array > first_array:
        parsed = _parse_json_candidate(cleaned[first_array : last_array + 1])
        if parsed is not None:
            return parsed

    return None


def _read_error_message(response: requests.Response) -> str:
    payload = _safe_json(response.text)
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and isinstance(error.get("message"), str) and error["message"].strip():
            return _translate_upstream_error(error["message"].strip())
        if isinstance(error, str) and error.strip():
            return _translate_upstream_error(error.strip())
    return _translate_upstream_error(response.text[:240].strip() or f"HTTP {response.status_code}")


def _translate_upstream_error(message: str) -> str:
    lowered = message.lower()
    if "empty output" in lowered:
        return "\u0043laude \u4ee3\u7406\u8fd9\u6b21\u6ca1\u6709\u8fd4\u56de\u5185\u5bb9\uff0c\u8bf7\u91cd\u8bd5\u3002"
    if "rate limit" in lowered:
        return "\u0043laude \u4ee3\u7406\u9891\u7387\u8d85\u9650\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"
    if "timed out" in lowered or "timeout" in lowered:
        return "\u0043laude \u4ee3\u7406\u54cd\u5e94\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002"
    return message


def _is_retryable_proxy_error(message: str) -> bool:
    lowered = message.lower()
    retryable_tokens = ("empty output", "rate limit", "timed out", "timeout", "temporarily unavailable", "bad gateway", "invalid assistant intro")
    return any(token in lowered for token in retryable_tokens)


def _looks_like_generic_assistant_intro(text: str) -> bool:
    lowered = (text or "").strip().lower()
    intro_markers = (
        "i am claude",
        "i'm claude",
        "made by anthropic",
        "i'm an ai assistant",
        "i am an ai assistant",
    )
    return any(marker in lowered for marker in intro_markers)


def _clean_text_candidate(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    cleaned = value.strip()
    if not cleaned:
        return ""
    if cleaned.lower() in {"assistant", "user", "system", "text"}:
        return ""
    return cleaned


def _score_text_candidate(text: str) -> int:
    cleaned = _clean_text_candidate(text)
    if not cleaned:
        return -1
    score = len(cleaned)
    lowered = cleaned.lower()
    if re.search(r"[\u4e00-\u9fff]", cleaned):
        score += 20
    if "\n" in cleaned:
        score += 10
    if re.search(r"[。！？.!?]", cleaned):
        score += 5
    if cleaned.startswith("{") or cleaned.startswith("["):
        score -= 40
    if lowered.startswith("http://") or lowered.startswith("https://"):
        score -= 30
    if re.fullmatch(r"[A-Za-z0-9._:/-]+", cleaned):
        score -= 25
    return score


def _collect_recursive_text_candidates(value: Any, *, parent_key: str = "") -> list[str]:
    if isinstance(value, str):
        candidate = _clean_text_candidate(value)
        return [candidate] if candidate else []

    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            parts.extend(_collect_recursive_text_candidates(item, parent_key=parent_key))
        return parts

    if not isinstance(value, dict):
        return []

    parts: list[str] = []
    for key in TEXT_LIKE_RESPONSE_KEYS:
        if key in value:
            parts.extend(_collect_recursive_text_candidates(value[key], parent_key=key))
    for key, nested in value.items():
        lowered = str(key).lower()
        if lowered in IGNORED_RESPONSE_KEYS or lowered in TEXT_LIKE_RESPONSE_KEYS:
            continue
        parts.extend(_collect_recursive_text_candidates(nested, parent_key=lowered))
    return parts


def _collect_text_blocks(payload: Any) -> str:
    if isinstance(payload, str):
        return _clean_text_candidate(payload)
    if isinstance(payload, list):
        candidates = _collect_recursive_text_candidates(payload)
        return max(candidates, key=_score_text_candidate, default="")
    if not isinstance(payload, dict):
        return ""

    direct_text_candidates = (
        payload.get("completion"),
        payload.get("output_text"),
        payload.get("text"),
    )
    for candidate in direct_text_candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    content = payload.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()

    parts: list[str] = []
    if isinstance(content, list):
        for item in content:
            if isinstance(item, str) and item.strip():
                parts.append(item.strip())
                continue
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
                    continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
                continue
            nested_text = item.get("content")
            if isinstance(nested_text, str) and nested_text.strip():
                parts.append(nested_text.strip())
                continue
            if isinstance(nested_text, list):
                for nested_item in nested_text:
                    if isinstance(nested_item, dict):
                        nested_value = nested_item.get("text") or nested_item.get("content")
                        if isinstance(nested_value, str) and nested_value.strip():
                            parts.append(nested_value.strip())
                    elif isinstance(nested_item, str) and nested_item.strip():
                        parts.append(nested_item.strip())
    if parts:
        return "\n".join(parts).strip()

    choices = payload.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            message = choice.get("message")
            if isinstance(message, dict):
                message_content = message.get("content")
                if isinstance(message_content, str) and message_content.strip():
                    return message_content.strip()
                if isinstance(message_content, list):
                    nested_parts: list[str] = []
                    for item in message_content:
                        if isinstance(item, dict):
                            nested_value = item.get("text") or item.get("content")
                            if isinstance(nested_value, str) and nested_value.strip():
                                nested_parts.append(nested_value.strip())
                        elif isinstance(item, str) and item.strip():
                            nested_parts.append(item.strip())
                    if nested_parts:
                        return "\n".join(nested_parts).strip()
            delta = choice.get("delta")
            if isinstance(delta, dict):
                delta_content = delta.get("content")
                if isinstance(delta_content, str) and delta_content.strip():
                    return delta_content.strip()
            choice_text = choice.get("text")
            if isinstance(choice_text, str) and choice_text.strip():
                return choice_text.strip()

    candidates = _collect_recursive_text_candidates(payload)
    return max(candidates, key=_score_text_candidate, default="")


def _request_message(
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
    try:
        with requests.Session() as session:
            session.trust_env = False
            response = session.post(
                f"{base_url.rstrip('/')}/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": ANTHROPIC_API_VERSION,
                    "content-type": "application/json; charset=utf-8",
                },
                json={
                    "model": normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
                    "system": system_prompt,
                    "max_tokens": max(256, max_tokens),
                    "messages": [{"role": "user", "content": user_prompt}],
                    **({"temperature": temperature} if temperature is not None else {}),
                },
                timeout=max(15, timeout_seconds),
            )
    except requests.RequestException as exc:
        raise AnthropicApiError(f"\u8bf7\u6c42 Claude \u5931\u8d25\uff1a{exc}") from exc

    if not response.ok:
        raise AnthropicApiError(_read_error_message(response))

    try:
        payload = response.json()
    except ValueError as exc:
        plain_text = response.text.strip()
        if plain_text and not plain_text.lstrip().startswith("<"):
            return plain_text
        raise AnthropicApiError("\u0043laude \u8fd4\u56de\u4e86\u5f02\u5e38\u7684\u54cd\u5e94\u683c\u5f0f\u3002") from exc

    text = _collect_text_blocks(payload)
    if not text:
        raise AnthropicApiError("\u0043laude \u8fd4\u56de\u5185\u5bb9\u4e3a\u7a7a\uff0c\u8bf7\u91cd\u8bd5\u3002")
    return text


def generate_json_with_anthropic(
    *,
    base_url: str,
    api_key: str,
    model: str | None,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 4096,
    timeout_seconds: float = 90,
    temperature: float | None = None,
) -> Any:
    resolved_model = normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL)
    prompt = user_prompt

    for attempt in range(2):
        try:
            text = _request_message(
                base_url=base_url,
                api_key=api_key,
                model=resolved_model,
                system_prompt=system_prompt,
                user_prompt=prompt,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
                temperature=temperature,
            )
        except AnthropicApiError as exc:
            if attempt == 0 and _is_retryable_proxy_error(str(exc)):
                continue
            raise
        parsed = _extract_json_payload(text)
        if parsed is not None:
            return parsed
        if attempt == 0:
            prompt = (
                f"{user_prompt}\n\n"
                "Important correction: the previous answer was not valid JSON. "
                "Return exactly one valid JSON object only. "
                "Use standard double quotes for every key and string value. "
                "Do not include markdown, code fences, explanations, or extra text."
            )

    raise AnthropicApiError("\u0043laude \u6ca1\u6709\u8fd4\u56de\u5408\u6cd5\u7684 JSON\uff0c\u8bf7\u91cd\u8bd5\u3002")


def generate_text_with_anthropic(
    *,
    base_url: str,
    api_key: str,
    model: str | None,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 4096,
    timeout_seconds: float = 90,
    temperature: float | None = None,
    retry_count: int = 2,
) -> str:
    resolved_model = normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL)
    last_error: AnthropicApiError | None = None
    attempt_count = max(1, retry_count)
    prompt = user_prompt

    for attempt in range(attempt_count):
        try:
            text = _request_message(
                base_url=base_url,
                api_key=api_key,
                model=resolved_model,
                system_prompt=system_prompt,
                user_prompt=prompt,
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
                temperature=temperature,
            )
            if _looks_like_generic_assistant_intro(text):
                last_error = AnthropicApiError("invalid assistant intro")
                if attempt < attempt_count - 1:
                    prompt = (
                        f"{user_prompt}\n\n"
                        "Important correction: do not introduce yourself. "
                        "Do not say who you are or what you can do. "
                        "Return only the requested final output."
                    )
                    continue
                raise last_error
            return text
        except AnthropicApiError as exc:
            last_error = exc
            if attempt < attempt_count - 1 and _is_retryable_proxy_error(str(exc)):
                continue
            raise

    if last_error is not None:
        raise last_error
    raise AnthropicApiError("\u0043laude \u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002")
