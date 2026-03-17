from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, BinaryIO

import requests

GEMINI_FILE_POLL_MAX_ATTEMPTS = 240
GEMINI_FILE_POLL_INTERVAL_SECONDS = 1.0


class GeminiVideoError(RuntimeError):
    pass


@dataclass(frozen=True)
class GeminiVideoReference:
    file_uri: str
    mime_type: str
    display_name: str


def _gemini_root_and_version(base_url: str) -> tuple[str, str]:
    normalized = (base_url or "").strip().rstrip("/")
    official_root = "https://generativelanguage.googleapis.com"

    if not normalized.startswith(("http://", "https://")):
        return official_root, "v1beta"

    if "generativelanguage.googleapis.com" not in normalized:
        return official_root, "v1beta"

    if "/v1beta/" in normalized:
        root, _ = normalized.split("/v1beta/", 1)
        return root, "v1beta"
    if "/v1/" in normalized:
        root, _ = normalized.split("/v1/", 1)
        return root, "v1"
    return normalized, "v1beta"


def _state_name(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or value.get("state") or "").upper()
    return str(value or "").upper()


def _safe_json(text: str) -> Any:
    cleaned = (text or "").strip()
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


def _raise_response_error(response: requests.Response, context: str) -> None:
    if response.ok:
        return
    payload = _safe_json(response.text)
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            message = str(error["message"])
            lowered = message.lower()
            if "api key not valid" in lowered or "please pass a valid api key" in lowered:
                raise GeminiVideoError("Gemini API Key ?????? backend/config.local.json ?? apiKey?? GEMINI_API_KEY ?????")
            raise GeminiVideoError(f"{context}: {message}")
    raise GeminiVideoError(f"{context}: HTTP {response.status_code} {response.text[:240]}")


def _upload_file_to_gemini(
    *,
    api_key: str,
    base_url: str,
    file_stream: BinaryIO,
    content_length: int,
    mime_type: str,
    display_name: str,
    timeout_seconds: int,
) -> GeminiVideoReference:
    root, version = _gemini_root_and_version(base_url)
    start_url = f"{root}/upload/{version}/files"
    start_response = requests.post(
        start_url,
        params={"key": api_key},
        headers={
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(content_length),
            "X-Goog-Upload-Header-Content-Type": mime_type,
            "Content-Type": "application/json",
        },
        json={"file": {"display_name": display_name}},
        timeout=max(30, timeout_seconds),
    )
    _raise_response_error(start_response, "Gemini file start failed")

    upload_url = start_response.headers.get("X-Goog-Upload-URL") or start_response.headers.get("x-goog-upload-url")
    if not upload_url:
        raise GeminiVideoError("Gemini file upload URL missing")

    file_stream.seek(0)
    upload_response = requests.post(
        upload_url,
        headers={
            "Content-Length": str(content_length),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
            "Content-Type": mime_type,
        },
        data=file_stream,
        timeout=max(120, timeout_seconds * 4),
    )
    _raise_response_error(upload_response, "Gemini file upload failed")

    payload = _safe_json(upload_response.text)
    file_data = payload.get("file") if isinstance(payload, dict) and isinstance(payload.get("file"), dict) else payload
    if not isinstance(file_data, dict):
        raise GeminiVideoError("Gemini file upload returned invalid metadata")

    file_name = str(file_data.get("name") or "").strip()
    file_uri = str(file_data.get("uri") or "").strip()
    if not file_name or not file_uri:
        raise GeminiVideoError("Gemini file upload succeeded but returned no file name or uri")

    poll_url = f"{root}/{version}/{file_name.lstrip('/')}"
    state = _state_name(file_data.get("state"))
    if state == "ACTIVE":
        return GeminiVideoReference(file_uri=file_uri, mime_type=mime_type, display_name=display_name)

    for _ in range(GEMINI_FILE_POLL_MAX_ATTEMPTS):
        status_response = requests.get(poll_url, params={"key": api_key}, timeout=max(30, timeout_seconds))
        _raise_response_error(status_response, "Gemini file polling failed")
        status_payload = status_response.json()
        state = _state_name(status_payload.get("state"))
        if state == "ACTIVE":
            return GeminiVideoReference(
                file_uri=str(status_payload.get("uri") or file_uri),
                mime_type=mime_type,
                display_name=display_name,
            )
        if state == "FAILED":
            raise GeminiVideoError("Gemini file processing failed")
        time.sleep(GEMINI_FILE_POLL_INTERVAL_SECONDS)

    raise GeminiVideoError("Gemini file processing timed out")


def _ensure_reference(
    *,
    api_key: str,
    base_url: str,
    timeout_seconds: int,
    existing_file_uri: str | None,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
) -> GeminiVideoReference:
    resolved_mime_type = (mime_type or "video/mp4").strip() or "video/mp4"
    resolved_display_name = (display_name or "uploaded-video").strip() or "uploaded-video"
    if existing_file_uri:
        return GeminiVideoReference(
            file_uri=existing_file_uri.strip(),
            mime_type=resolved_mime_type,
            display_name=resolved_display_name,
        )
    if file_stream is None or content_length is None or content_length <= 0:
        raise GeminiVideoError("No video file was provided")
    return _upload_file_to_gemini(
        api_key=api_key,
        base_url=base_url,
        file_stream=file_stream,
        content_length=content_length,
        mime_type=resolved_mime_type,
        display_name=resolved_display_name,
        timeout_seconds=timeout_seconds,
    )


def _extract_text(payload: dict[str, Any]) -> str:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    content = candidates[0].get("content")
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if not isinstance(parts, list):
        return ""
    texts = [str(part.get("text") or "").strip() for part in parts if isinstance(part, dict)]
    return "\n".join(item for item in texts if item).strip()


def _generate_content_json(
    *,
    api_key: str,
    base_url: str,
    model: str,
    parts: list[dict[str, Any]],
    max_output_tokens: int,
    temperature: float,
    timeout_seconds: int,
) -> Any:
    root, version = _gemini_root_and_version(base_url)
    response = requests.post(
        f"{root}/{version}/models/{model}:generateContent",
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json={
            "contents": [
                {
                    "role": "user",
                    "parts": parts,
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "maxOutputTokens": max_output_tokens,
                "temperature": temperature,
            },
        },
        timeout=max(60, timeout_seconds * 4),
    )
    _raise_response_error(response, "Gemini generateContent failed")
    payload = response.json()
    text = _extract_text(payload)
    parsed = _safe_json(text)
    if parsed is None:
        raise GeminiVideoError(f"Gemini returned non-JSON content: {text[:240]}")
    return parsed


def _normalize_string(value: Any) -> str:
    return str(value or "").strip()


def _normalize_analysis_result(parsed: Any, *, file_uri: str, mime_type: str, deep: bool) -> dict[str, Any]:
    payload = parsed if isinstance(parsed, dict) else {}
    structure_raw = payload.get("videoStructure") if isinstance(payload.get("videoStructure"), dict) else {}
    timestamps_raw = payload.get("timestamps") if isinstance(payload.get("timestamps"), list) else []
    visual_features_raw = payload.get("visualFeatures") if isinstance(payload.get("visualFeatures"), list) else []
    return {
        "summary": _normalize_string(payload.get("summary")),
        "script": _normalize_string(payload.get("script")),
        "visualFeatures": [
            {
                "feature": _normalize_string(item.get("feature")),
                "description": _normalize_string(item.get("description")),
            }
            for item in visual_features_raw
            if isinstance(item, dict) and (_normalize_string(item.get("feature")) or _normalize_string(item.get("description")))
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
        "fileUri": file_uri,
        "mimeType": mime_type,
    }


def analyze_video_with_gemini(
    *,
    api_key: str,
    base_url: str,
    model: str,
    timeout_seconds: int,
    mode: str,
    existing_file_uri: str | None,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
) -> dict[str, Any]:
    is_deep = mode.upper() == "DEEP"
    reference = _ensure_reference(
        api_key=api_key,
        base_url=base_url,
        timeout_seconds=timeout_seconds,
        existing_file_uri=existing_file_uri,
        file_stream=file_stream,
        content_length=content_length,
        mime_type=mime_type,
        display_name=display_name,
    )
    prompt = "\n".join([
        "You are a short-video analysis expert.",
        "Read the full uploaded video directly instead of analyzing extracted frames.",
        "Return valid JSON only. All string values must be Simplified Chinese.",
        "JSON shape:",
        '{"summary":"...","script":"...","visualFeatures":[{"feature":"...","description":"..."}],"videoStructure":{"coreProposition":"...","openingType":"...","conflictStructure":"...","progressionLogic":"...","psychologicalHook":"...","climaxSentence":"...","languageFeatures":"...","emotionalCurve":"...","viewerReward":"..."},"timestamps":[{"time":"00:12","seconds":12,"description":"..."}]}',
        "Requirements:",
        "1. Infer the spoken script as completely as possible from the full video content, including subtitle, audio and scene transitions.",
        "2. Do not say unknown / unable to determine / not provided.",
        "3. Keep timestamps empty in FAST mode. In DEEP mode, return 5 to 8 timestamps.",
        f"4. Current mode: {'DEEP' if is_deep else 'FAST'}.",
    ])
    parsed = _generate_content_json(
        api_key=api_key,
        base_url=base_url,
        model=model,
        parts=[
            {"file_data": {"mime_type": reference.mime_type, "file_uri": reference.file_uri}},
            {"text": prompt},
        ],
        max_output_tokens=3600 if is_deep else 2400,
        temperature=0.2,
        timeout_seconds=timeout_seconds,
    )
    return _normalize_analysis_result(parsed, file_uri=reference.file_uri, mime_type=reference.mime_type, deep=is_deep)


def generate_sora_prompts_with_gemini(
    *,
    api_key: str,
    base_url: str,
    model: str,
    timeout_seconds: int,
    count: int,
    analysis_summary: str,
    existing_file_uri: str | None,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
) -> list[dict[str, str]]:
    reference = _ensure_reference(
        api_key=api_key,
        base_url=base_url,
        timeout_seconds=timeout_seconds,
        existing_file_uri=existing_file_uri,
        file_stream=file_stream,
        content_length=content_length,
        mime_type=mime_type,
        display_name=display_name,
    )
    prompt = "\n".join([
        "You are an AIGC director.",
        f"Based on the full video, generate {max(1, count)} prompt(s) for digital-human short video production.",
        "Return a JSON array only, each item must be {\"title\":\"Prompt title\",\"fullPrompt\":\"Complete prompt\"}.",
        "All values must be Simplified Chinese.",
        "Each prompt should clearly include camera movement, subject action, scene, lighting, pace, aspect ratio and visual style.",
        "Do not output markdown.",
        f"Optional summary reference: {analysis_summary.strip() or 'None'}",
    ])
    parsed = _generate_content_json(
        api_key=api_key,
        base_url=base_url,
        model=model,
        parts=[
            {"file_data": {"mime_type": reference.mime_type, "file_uri": reference.file_uri}},
            {"text": prompt},
        ],
        max_output_tokens=2600,
        temperature=0.5,
        timeout_seconds=timeout_seconds,
    )
    items = parsed if isinstance(parsed, list) else [parsed] if isinstance(parsed, dict) else []
    results: list[dict[str, str]] = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        title = _normalize_string(item.get("title")) or f"??? {index}"
        full_prompt = _normalize_string(item.get("fullPrompt")) or _normalize_string(item.get("prompt"))
        if full_prompt:
            results.append({"title": title, "fullPrompt": full_prompt})
    if not results:
        raise GeminiVideoError("No valid Sora prompts were generated")
    return results
