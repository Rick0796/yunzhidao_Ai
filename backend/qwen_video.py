from __future__ import annotations

import base64
import json
import mimetypes
import os
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO

import requests

from backend.qwen_client import normalize_qwen_model_name
from backend.runtime_paths import ensure_runtime_paths, resolve_runtime_paths

DEFAULT_QWEN_VIDEO_MODEL = "qwen3-omni-flash"
QWEN_VIDEO_CACHE_SCHEME = "qwen-video://"
QWEN_VIDEO_CACHE_DIR = ensure_runtime_paths(resolve_runtime_paths()).cache_dir / "qwen_video"
QWEN_VIDEO_CACHE_TTL_SECONDS = 24 * 60 * 60
QWEN_VIDEO_MAX_BYTES = 256 * 1024 * 1024


class QwenVideoError(RuntimeError):
    pass


@dataclass(frozen=True)
class QwenVideoReference:
    cache_uri: str
    mime_type: str
    display_name: str
    file_path: Path
    content_length: int


def normalize_qwen_video_model_name(model: str | None, fallback: str = DEFAULT_QWEN_VIDEO_MODEL) -> str:
    cleaned = str(model or "").strip()
    if not cleaned:
        return fallback
    lowered = cleaned.lower()
    if "qwen" not in lowered:
        return fallback
    if "omni" not in lowered and "vl" not in lowered:
        return fallback
    return normalize_qwen_model_name(cleaned, fallback)


def _safe_json(text: str) -> Any:
    cleaned = str(text or "").strip()
    if not cleaned:
        return None
    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```json", "```", 1)
        cleaned = cleaned.strip("`").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start_object = cleaned.find("{")
        end_object = cleaned.rfind("}")
        if start_object >= 0 and end_object > start_object:
            try:
                return json.loads(cleaned[start_object:end_object + 1])
            except json.JSONDecodeError:
                pass
        start_array = cleaned.find("[")
        end_array = cleaned.rfind("]")
        if start_array >= 0 and end_array > start_array:
            try:
                return json.loads(cleaned[start_array:end_array + 1])
            except json.JSONDecodeError:
                pass
    return None


def _translate_upstream_error(message: str) -> str:
    lowered = (message or "").lower()
    if "bad gateway" in lowered or "502" in lowered:
        return "千问官方视频接口暂时不可用，请稍后重试。"
    if "timed out" in lowered or "timeout" in lowered:
        return "千问官方视频接口响应超时，请稍后重试。"
    if "rate limit" in lowered or "too many requests" in lowered:
        return "千问官方视频接口频率超限，请稍后重试。"
    if "invalid api key" in lowered or "unauthorized" in lowered or "forbidden" in lowered:
        return "千问 API Key 无效或无权限，请检查配置。"
    if "maximum context length" in lowered or "context_length_exceeded" in lowered:
        return "视频输入过大或内容过长，请换一个更短的视频再试。"
    return message or "千问视频请求失败，请稍后重试。"


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


def _is_retryable_error(message: str) -> bool:
    lowered = (message or "").lower()
    retryable_tokens = ("bad gateway", "502", "timed out", "timeout", "rate limit", "too many requests", "empty")
    return any(token in lowered for token in retryable_tokens)


def _ensure_cache_dir() -> Path:
    QWEN_VIDEO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return QWEN_VIDEO_CACHE_DIR


def _cleanup_expired_cache(now_ts: float | None = None) -> None:
    cache_dir = _ensure_cache_dir()
    current = now_ts or time.time()
    for meta_path in cache_dir.glob("*.json"):
        try:
            payload = json.loads(meta_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        created_at = float(payload.get("createdAt") or 0)
        if created_at and current - created_at < QWEN_VIDEO_CACHE_TTL_SECONDS:
            continue
        file_path = Path(str(payload.get("filePath") or ""))
        try:
            if file_path.exists():
                file_path.unlink()
        except OSError:
            pass
        try:
            meta_path.unlink()
        except OSError:
            pass


def _sanitize_filename(name: str, mime_type: str) -> str:
    raw_name = str(name or "").strip() or "uploaded-video"
    safe_name = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "-" for ch in raw_name).strip("-.")
    if not safe_name:
        safe_name = "uploaded-video"
    suffix = Path(safe_name).suffix
    if suffix:
        return safe_name
    guessed = mimetypes.guess_extension(mime_type or "video/mp4") or ".mp4"
    return f"{safe_name}{guessed}"


def _store_video_in_cache(
    *,
    file_stream: BinaryIO,
    content_length: int,
    mime_type: str,
    display_name: str,
) -> QwenVideoReference:
    if not content_length:
        raise QwenVideoError("上传的视频文件为空。")
    if content_length > QWEN_VIDEO_MAX_BYTES:
        raise QwenVideoError("千问视频版当前仅支持 256MB 以内的视频，请压缩后再试。")

    _cleanup_expired_cache()
    cache_dir = _ensure_cache_dir()
    token = uuid.uuid4().hex
    safe_name = _sanitize_filename(display_name, mime_type)
    file_path = cache_dir / f"{token}-{safe_name}"
    meta_path = cache_dir / f"{token}.json"

    file_stream.seek(0)
    with file_path.open("wb") as output:
        shutil.copyfileobj(file_stream, output)

    actual_size = file_path.stat().st_size
    payload = {
        "token": token,
        "filePath": str(file_path),
        "mimeType": mime_type,
        "displayName": display_name,
        "contentLength": actual_size,
        "createdAt": time.time(),
    }
    meta_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    return QwenVideoReference(
        cache_uri=f"{QWEN_VIDEO_CACHE_SCHEME}{token}",
        mime_type=mime_type,
        display_name=display_name,
        file_path=file_path,
        content_length=actual_size,
    )


def _load_video_from_cache(cache_uri: str) -> QwenVideoReference:
    if not cache_uri.startswith(QWEN_VIDEO_CACHE_SCHEME):
        raise QwenVideoError("这是旧版视频记录，请重新上传原视频后再使用千问视频版。")

    token = cache_uri[len(QWEN_VIDEO_CACHE_SCHEME):].strip()
    if not token:
        raise QwenVideoError("视频缓存标识无效，请重新上传视频。")

    meta_path = _ensure_cache_dir() / f"{token}.json"
    if not meta_path.exists():
        raise QwenVideoError("视频缓存已失效，请重新上传原视频。")

    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise QwenVideoError("视频缓存损坏，请重新上传原视频。") from exc

    file_path = Path(str(payload.get("filePath") or ""))
    if not file_path.exists():
        raise QwenVideoError("视频缓存文件已丢失，请重新上传原视频。")

    created_at = float(payload.get("createdAt") or 0)
    if created_at and time.time() - created_at > QWEN_VIDEO_CACHE_TTL_SECONDS:
        raise QwenVideoError("视频缓存已过期，请重新上传原视频。")

    return QwenVideoReference(
        cache_uri=f"{QWEN_VIDEO_CACHE_SCHEME}{token}",
        mime_type=str(payload.get("mimeType") or "video/mp4"),
        display_name=str(payload.get("displayName") or file_path.name),
        file_path=file_path,
        content_length=int(payload.get("contentLength") or file_path.stat().st_size),
    )


def _ensure_reference(
    *,
    existing_file_uri: str | None,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
) -> QwenVideoReference:
    resolved_mime = str(mime_type or "video/mp4").strip() or "video/mp4"
    resolved_name = str(display_name or "uploaded-video").strip() or "uploaded-video"

    if existing_file_uri:
        return _load_video_from_cache(existing_file_uri.strip())

    if file_stream is None or content_length is None or content_length <= 0:
        raise QwenVideoError("请先上传完整视频文件。")

    return _store_video_in_cache(
        file_stream=file_stream,
        content_length=content_length,
        mime_type=resolved_mime,
        display_name=resolved_name,
    )


def _encode_video_as_data_url(reference: QwenVideoReference) -> str:
    if reference.content_length > QWEN_VIDEO_MAX_BYTES:
        raise QwenVideoError("千问视频版当前仅支持 256MB 以内的视频，请压缩后再试。")
    raw = reference.file_path.read_bytes()
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:;base64,{encoded}"


def _extract_stream_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    choices = payload.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            delta = choice.get("delta")
            if isinstance(delta, dict):
                content = delta.get("content")
                if isinstance(content, str) and content:
                    return content
                if isinstance(content, list):
                    pieces: list[str] = []
                    for item in content:
                        if isinstance(item, dict) and isinstance(item.get("text"), str):
                            pieces.append(str(item["text"]))
                    if pieces:
                        return "".join(pieces)
            message = choice.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content:
                    return content
    output = payload.get("output")
    if isinstance(output, dict):
        message = output.get("message")
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            return str(message["content"])
    return ""


def _stream_chat_completion(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_parts: list[dict[str, Any]],
    max_tokens: int,
    timeout_seconds: float,
    temperature: float | None = None,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
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
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_parts},
                    ],
                    "stream": True,
                    "stream_options": {"include_usage": True},
                    "modalities": ["text"],
                    "enable_thinking": False,
                    "max_tokens": max(512, int(max_tokens or 512)),
                    **({"temperature": temperature} if temperature is not None else {}),
                },
                timeout=(20, max(90, timeout_seconds)),
                stream=True,
            )
    except requests.RequestException as exc:
        raise QwenVideoError(f"请求千问视频接口失败：{exc}") from exc

    if not response.ok:
        raise QwenVideoError(_read_error_message(response))

    chunks: list[str] = []
    saw_data = False
    for raw_line in response.iter_lines(decode_unicode=True):
        if raw_line is None:
            continue
        line = str(raw_line).strip()
        if not line or not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data:
            continue
        saw_data = True
        if data == "[DONE]":
            break
        payload = _safe_json(data)
        if payload is None:
            continue
        piece = _extract_stream_text(payload)
        if piece:
            chunks.append(piece)

    text = "".join(chunks).strip()
    if text:
        return text
    if saw_data:
        raise QwenVideoError("千问视频接口返回内容为空，请重试。")
    raise QwenVideoError("千问视频接口返回了异常响应格式。")


def _generate_text_from_video_with_qwen(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    reference: QwenVideoReference,
    max_tokens: int,
    timeout_seconds: float,
    temperature: float | None = None,
    retry_count: int = 1,
) -> str:
    last_error: QwenVideoError | None = None
    for attempt in range(max(1, retry_count)):
        try:
            return _stream_chat_completion(
                base_url=base_url,
                api_key=api_key,
                model=model,
                system_prompt=system_prompt,
                user_parts=[
                    {"type": "video_url", "video_url": {"url": _encode_video_as_data_url(reference)}},
                    {"type": "text", "text": user_prompt},
                ],
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
                temperature=temperature,
            )
        except QwenVideoError as exc:
            last_error = exc
            if attempt < max(1, retry_count) - 1 and _is_retryable_error(str(exc)):
                continue
            raise
    if last_error is not None:
        raise last_error
    raise QwenVideoError("千问视频请求失败，请稍后重试。")


def _normalize_string(value: Any) -> str:
    return str(value or "").strip()


def _normalize_analysis_result(parsed: Any, *, reference: QwenVideoReference, deep: bool) -> dict[str, Any]:
    payload = parsed if isinstance(parsed, dict) else {}
    structure_raw = payload.get("videoStructure", {})
    timestamps_raw = payload.get("timestamps", [])
    visual_features_raw = payload.get("visualFeatures", [])

    return {
        "summary": _normalize_string(payload.get("summary")),
        "script": _normalize_string(payload.get("script")),
        "visualFeatures": [
            {
                "feature": _normalize_string(item.get("feature")),
                "description": _normalize_string(item.get("description")),
            }
            for item in visual_features_raw
            if isinstance(item, dict)
        ],
        "videoStructure": {
            "coreProposition": _normalize_string(structure_raw.get("coreProposition")),
            "openingType": _normalize_string(structure_raw.get("openingType")),
            "conflictStructure": _normalize_string(structure_raw.get("conflictStructure")),
            "progressionLogic": _normalize_string(structure_raw.get("progressionLogic")),
            "psychologicalHook": _normalize_string(structure_raw.get("psychologicalHook")),
            "climaxSentence": _normalize_string(structure_raw.get("climaxSentence")),
            "languageFeatures": _normalize_string(structure_raw.get("languageFeatures")),
            "emotionalCurve": _normalize_string(structure_raw.get("emotionalCurve")),
            "viewerReward": _normalize_string(structure_raw.get("viewerReward")),
        },
        "timestamps": [
            {
                "time": _normalize_string(item.get("time")),
                "seconds": float(item.get("seconds") or 0),
                "description": _normalize_string(item.get("description")),
            }
            for item in timestamps_raw
            if deep and isinstance(item, dict)
        ],
        "fileUri": reference.cache_uri,
        "mimeType": reference.mime_type,
    }


def analyze_video_with_qwen(
    *,
    api_key: str,
    base_url: str,
    model: str | None,
    timeout_seconds: int,
    retry_count: int,
    mode: str,
    existing_file_uri: str | None,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
) -> dict[str, Any]:
    is_deep = str(mode or "FAST").upper() == "DEEP"
    reference = _ensure_reference(
        existing_file_uri=existing_file_uri,
        file_stream=file_stream,
        content_length=content_length,
        mime_type=mime_type,
        display_name=display_name,
    )

    prompt = "\n".join(
        [
            "你是短视频内容分析专家，请先完整理解视频里的画面、字幕、口播和声音信息。",
            "只输出合法 JSON，不要输出任何解释。",
            "字段要求：",
            "1. summary：中文摘要，讲清这个视频的核心观点和表达方式。",
            "2. script：尽可能完整提取视频里的口播或字幕内容，优先还原原句。",
            "3. visualFeatures：数组，每项包含 feature 和 description。",
            "4. videoStructure：对象，包含 coreProposition/openingType/conflictStructure/progressionLogic/psychologicalHook/climaxSentence/languageFeatures/emotionalCurve/viewerReward。",
            f"5. timestamps：{'返回 5 到 8 个关键时间点' if is_deep else '可返回空数组'}，每项包含 time、seconds、description。",
            "输出要求：",
            "1. 只使用简体中文。",
            "2. 信息不足时可以做谨慎推断，但不要写“未知”“未提及”。",
            "3. 保证 JSON 可以直接被程序解析。",
        ]
    )

    text = _generate_text_from_video_with_qwen(
        base_url=base_url,
        api_key=api_key,
        model=normalize_qwen_video_model_name(model, DEFAULT_QWEN_VIDEO_MODEL),
        system_prompt="你只返回 JSON，不要返回 markdown。",
        user_prompt=prompt,
        reference=reference,
        max_tokens=8192 if is_deep else 4096,
        timeout_seconds=timeout_seconds,
        temperature=0.1,
        retry_count=retry_count,
    )
    parsed = _safe_json(text)
    if not isinstance(parsed, dict):
        raise QwenVideoError("千问视频分析返回了无法解析的 JSON，请重试。")
    return _normalize_analysis_result(parsed, reference=reference, deep=is_deep)


def generate_sora_prompts_with_qwen(
    *,
    api_key: str,
    base_url: str,
    model: str | None,
    timeout_seconds: int,
    retry_count: int,
    count: int,
    analysis_summary: str,
    existing_file_uri: str | None,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
) -> list[dict[str, str]]:
    reference = _ensure_reference(
        existing_file_uri=existing_file_uri,
        file_stream=file_stream,
        content_length=content_length,
        mime_type=mime_type,
        display_name=display_name,
    )

    prompt_lines = [
        "你是专业的数字人视频导演，请结合视频内容生成适合数字人复刻的高质量提示词。",
        f"输出 {max(1, count)} 条结果，只输出 JSON 数组。",
        "每项格式：{\"title\":\"简短标题\",\"fullPrompt\":\"完整提示词\"}。",
        "fullPrompt 必须按下面 8 个模块组织：",
        "1. [规格参数]",
        "2. [风格设定]",
        "3. [主角设定]",
        "4. [场景设定]",
        "5. [分镜脚本]",
        "6. [表演要求]",
        "7. [口播内容]",
        "8. [负面限制]",
        "要求：",
        "1. 只用简体中文。",
        "2. 每条提示词细节充分，适合直接交给视频生成工具。",
        "3. 口播内容尽量贴近原视频表达，不要改命题。",
    ]
    if analysis_summary:
        prompt_lines.append(f"参考摘要：{analysis_summary}")

    text = _generate_text_from_video_with_qwen(
        base_url=base_url,
        api_key=api_key,
        model=normalize_qwen_video_model_name(model, DEFAULT_QWEN_VIDEO_MODEL),
        system_prompt="你只返回 JSON 数组，不要返回 markdown。",
        user_prompt="\n".join(prompt_lines),
        reference=reference,
        max_tokens=8192,
        timeout_seconds=timeout_seconds,
        temperature=0.7,
        retry_count=retry_count,
    )
    parsed = _safe_json(text)
    items = parsed if isinstance(parsed, list) else [parsed]
    results: list[dict[str, str]] = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        title = _normalize_string(item.get("title")) or f"提示词 {index}"
        full_prompt = (
            _normalize_string(item.get("fullPrompt"))
            or _normalize_string(item.get("prompt"))
            or _normalize_string(item.get("content"))
            or _normalize_string(item.get("description"))
        )
        if full_prompt:
            results.append({"title": title, "fullPrompt": full_prompt})
    if not results:
        cleaned_text = str(text or "").strip()
        if cleaned_text.startswith("```"):
            cleaned_text = cleaned_text.replace("```json", "```", 1).strip("`").strip()
        if cleaned_text:
            results.append({"title": "提示词 1", "fullPrompt": cleaned_text})
    if not results:
        raise QwenVideoError("未生成有效的数字人提示词，请重试。")
    return results


def generate_viral_copies_with_qwen(
    *,
    api_key: str,
    base_url: str,
    model: str | None,
    timeout_seconds: int,
    retry_count: int,
    script: str,
) -> list[str]:
    from backend.qwen_client import generate_text_with_qwen

    prompt = "\n".join(
        [
            "你是短视频文案改写专家。",
            "基于下面的脚本，生成 3 条风格接近但表达不同的爆款文案。",
            "要求：",
            "1. 只用简体中文。",
            "2. 不要照抄原文。",
            "3. 保留钩子、价值和收口。",
            "4. 只输出 JSON 数组，每项是 {\"text\":\"...\"}。",
            "原文：",
            script.strip(),
        ]
    )
    text = generate_text_with_qwen(
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt="你只返回 JSON 数组，不要返回 markdown。",
        user_prompt=prompt,
        max_tokens=3072,
        timeout_seconds=timeout_seconds,
        temperature=0.8,
        retry_count=retry_count,
    )
    parsed = _safe_json(text)
    items = parsed if isinstance(parsed, list) else []
    copies = [str(item.get("text", "") if isinstance(item, dict) else item).strip() for item in items]
    copies = [item for item in copies if item]
    if not copies:
        raise QwenVideoError("未生成有效的爆款文案，请重试。")
    return copies
