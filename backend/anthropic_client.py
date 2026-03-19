from __future__ import annotations

import ast
import json
import re
from typing import Any

import requests

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
ANTHROPIC_API_VERSION = "2023-06-01"

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
            return error["message"].strip()
        if isinstance(error, str) and error.strip():
            return error.strip()
    return response.text[:240].strip() or f"HTTP {response.status_code}"


def _collect_text_blocks(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    content = payload.get("content")
    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "text":
            continue
        text = item.get("text")
        if isinstance(text, str) and text.strip():
            parts.append(text.strip())
    return "\n".join(parts).strip()


def _request_message(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    temperature: float | None = None,
) -> str:
    try:
        response = requests.post(
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
            timeout=180,
        )
    except requests.RequestException as exc:
        raise AnthropicApiError(f"Claude request failed: {exc}") from exc

    if not response.ok:
        raise AnthropicApiError(_read_error_message(response))

    try:
        payload = response.json()
    except ValueError as exc:
        raise AnthropicApiError("Claude returned an invalid response envelope.") from exc

    text = _collect_text_blocks(payload)
    if not text:
        raise AnthropicApiError("Claude returned empty content. Please retry.")
    return text


def generate_json_with_anthropic(
    *,
    base_url: str,
    api_key: str,
    model: str | None,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 4096,
    temperature: float | None = None,
) -> Any:
    resolved_model = normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL)
    prompt = user_prompt

    for attempt in range(2):
        text = _request_message(
            base_url=base_url,
            api_key=api_key,
            model=resolved_model,
            system_prompt=system_prompt,
            user_prompt=prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
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

    raise AnthropicApiError("Claude did not return valid JSON. Please retry.")
