"""Gemini video analysis using direct API calls."""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Any, BinaryIO

import requests

GEMINI_FILE_POLL_MAX_ATTEMPTS = 240
GEMINI_FILE_POLL_INTERVAL_SECONDS = 1.0


class GeminiVideoError(RuntimeError):
    pass


def _get_api_key() -> str:
    """Get API key from environment variable."""
    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("API_KEY") or "").strip()
    if not key:
        raise GeminiVideoError("未配置 GEMINI_API_KEY 环境变量")
    return key


@dataclass(frozen=True)
class GeminiVideoReference:
    file_uri: str
    mime_type: str
    display_name: str


def _safe_json(text: str) -> Any:
    """Parse JSON from text, handling markdown code blocks."""
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.replace("```json", "```", 1)
        cleaned = cleaned.strip("`").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find JSON object
        start_object = cleaned.find("{")
        end_object = cleaned.rfind("}")
        if start_object >= 0 and end_object > start_object:
            try:
                return json.loads(cleaned[start_object:end_object + 1])
            except json.JSONDecodeError:
                pass
        # Try to find JSON array
        start_array = cleaned.find("[")
        end_array = cleaned.rfind("]")
        if start_array >= 0 and end_array > start_array:
            try:
                return json.loads(cleaned[start_array:end_array + 1])
            except json.JSONDecodeError:
                pass
    return None


def _raise_response_error(response: requests.Response, context: str) -> None:
    """Raise error from failed API response."""
    if response.ok:
        return
    payload = _safe_json(response.text)
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            raise GeminiVideoError(f"{context}: {error['message']}")
    raise GeminiVideoError(f"{context}: HTTP {response.status_code} {response.text[:240]}")


def _upload_file_to_gemini(
    api_key: str,
    file_stream: BinaryIO,
    content_length: int,
    mime_type: str,
    display_name: str,
    timeout_seconds: int,
) -> GeminiVideoReference:
    """Upload file to Gemini API using resumable upload protocol."""
    base_url = "https://generativelanguage.googleapis.com"

    # Step 1: Initiate upload
    start_url = f"{base_url}/upload/v1beta/files"
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

    # Step 2: Get upload URL
    upload_url = start_response.headers.get("X-Goog-Upload-URL")
    if not upload_url:
        raise GeminiVideoError("Gemini file upload URL missing")

    # Step 3: Upload file content
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

    # Step 4: Parse response
    payload = _safe_json(upload_response.text)
    file_data = payload.get("file") if isinstance(payload, dict) else payload
    if not isinstance(file_data, dict):
        raise GeminiVideoError("Gemini file upload returned invalid metadata")

    file_name = file_data.get("name", "").strip()
    file_uri = file_data.get("uri", "").strip()
    if not file_name or not file_uri:
        raise GeminiVideoError("Gemini file upload succeeded but returned no file name or uri")

    # Step 5: Poll for processing completion
    state = file_data.get("state", "").upper()
    if state == "ACTIVE":
        return GeminiVideoReference(file_uri=file_uri, mime_type=mime_type, display_name=display_name)

    poll_url = f"{base_url}/v1beta/{file_name}"
    for _ in range(GEMINI_FILE_POLL_MAX_ATTEMPTS):
        status_response = requests.get(poll_url, params={"key": api_key}, timeout=max(30, timeout_seconds))
        _raise_response_error(status_response, "Gemini file polling failed")
        status_payload = status_response.json()
        state = status_payload.get("state", "").upper()
        if state == "ACTIVE":
            return GeminiVideoReference(
                file_uri=status_payload.get("uri") or file_uri,
                mime_type=mime_type,
                display_name=display_name,
            )
        if state == "FAILED":
            raise GeminiVideoError("Gemini file processing failed")
        time.sleep(GEMINI_FILE_POLL_INTERVAL_SECONDS)

    raise GeminiVideoError("Gemini file processing timed out")


def _ensure_reference(
    api_key: str,
    existing_file_uri: str | None,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
    timeout_seconds: int,
) -> GeminiVideoReference:
    """Ensure we have a valid file reference."""
    resolved_mime = (mime_type or "video/mp4").strip() or "video/mp4"
    resolved_name = (display_name or "uploaded-video").strip() or "uploaded-video"

    if existing_file_uri:
        return GeminiVideoReference(
            file_uri=existing_file_uri.strip(),
            mime_type=resolved_mime,
            display_name=resolved_name,
        )

    if file_stream is None or content_length is None or content_length <= 0:
        raise GeminiVideoError("未提供视频文件")

    return _upload_file_to_gemini(
        api_key=api_key,
        file_stream=file_stream,
        content_length=content_length,
        mime_type=resolved_mime,
        display_name=resolved_name,
        timeout_seconds=timeout_seconds,
    )


def _generate_content(
    api_key: str,
    model: str,
    parts: list[dict[str, Any]],
    max_output_tokens: int,
    response_mime_type: str = "application/json",
) -> Any:
    """Call Gemini generateContent API."""
    base_url = "https://generativelanguage.googleapis.com"
    url = f"{base_url}/v1beta/models/{model}:generateContent"

    response = requests.post(
        url,
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json={
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "responseMimeType": response_mime_type,
                "maxOutputTokens": max_output_tokens,
            },
        },
        timeout=180,  # Increased timeout for longer generations
    )
    _raise_response_error(response, "Gemini generateContent failed")

    payload = response.json()
    candidates = payload.get("candidates", [])
    if not candidates:
        raise GeminiVideoError("Gemini 返回空响应")

    candidate = candidates[0]
    finish_reason = candidate.get("finishReason", "")

    # Check if output was truncated
    if finish_reason == "MAX_TOKENS":
        raise GeminiVideoError("Gemini 输出被截断（超出 token 限制），请减少输入内容或增加 max_tokens")

    content = candidate.get("content", {})
    parts_result = content.get("parts", [])
    if not parts_result:
        raise GeminiVideoError("Gemini 返回空内容")

    text = parts_result[0].get("text", "")
    if response_mime_type == "application/json":
        parsed = _safe_json(text)
        if not parsed:
            raise GeminiVideoError(f"Gemini 返回非JSON内容: {text[:200]}")
        return parsed
    return text


def generate_json_with_gemini(
    prompt: str,
    *,
    api_key: str | None = None,
    model: str | None = None,
    max_output_tokens: int = 4096,
) -> Any:
    """Generate JSON content using Gemini API - for general text generation tasks."""
    key = api_key or _get_api_key()
    return _generate_content(
        api_key=key,
        model=model or "gemini-2.5-flash",
        parts=[{"text": prompt}],
        max_output_tokens=max_output_tokens,
        response_mime_type="application/json",
    )


def _normalize_string(value: Any) -> str:
    return str(value or "").strip()


def _normalize_analysis_result(parsed: Any, *, file_uri: str | None, mime_type: str, deep: bool) -> dict[str, Any]:
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
        "fileUri": file_uri or "",
        "mimeType": mime_type,
    }


def analyze_video_with_gemini(
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str,
    timeout_seconds: int,
    mode: str,
    existing_file_uri: str | None,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
) -> dict[str, Any]:
    """Analyze video using Gemini API."""
    key = api_key or _get_api_key()
    is_deep = mode.upper() == "DEEP"

    reference = _ensure_reference(
        api_key=key,
        existing_file_uri=existing_file_uri,
        file_stream=file_stream,
        content_length=content_length,
        mime_type=mime_type,
        display_name=display_name,
        timeout_seconds=timeout_seconds,
    )

    prompt = """你是一名短视频内容分析专家，请只输出 JSON，不要输出任何解释文字。

字段要求：
1. summary: 视频摘要（中文）。
2. script: 尽可能完整提取视频口播或旁白内容（中文）。
3. visualFeatures: 数组，每项包含 feature 和 description。
4. videoStructure: 对象，包含 coreProposition/openingType/conflictStructure/progressionLogic/psychologicalHook/climaxSentence/languageFeatures/emotionalCurve/viewerReward。
5. """ + ("timestamps: 关键时间点数组，返回 5-8 个。" if is_deep else "timestamps 可省略。") + """

输出质量要求：
1. 仅使用简体中文。
2. 不要使用"未提取""未知"等占位语，信息不足时给出合理推断。
3. 结果必须是合法 JSON。"""

    parsed = _generate_content(
        api_key=key,
        model=model or "gemini-2.5-flash",
        parts=[
            {"file_data": {"mime_type": reference.mime_type, "file_uri": reference.file_uri}},
            {"text": prompt},
        ],
        max_output_tokens=8192 if is_deep else 4096,
    )

    return _normalize_analysis_result(
        parsed,
        file_uri=reference.file_uri,
        mime_type=mime_type or "video/mp4",
        deep=is_deep,
    )


def generate_sora_prompts_with_gemini(
    *,
    api_key: str | None = None,
    base_url: str | None = None,
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
    """Generate Sora prompts from video using Gemini API."""
    key = api_key or _get_api_key()

    reference = _ensure_reference(
        api_key=key,
        existing_file_uri=existing_file_uri,
        file_stream=file_stream,
        content_length=content_length,
        mime_type=mime_type,
        display_name=display_name,
        timeout_seconds=timeout_seconds,
    )

    prompt = f"""你是一名专业的 AIGC 数字人视频导演，请基于视频内容输出 {max(1, count)} 条高质量的数字人短视频提示词。

每条提示词必须包含以下 8 个模块，按顺序输出：

1. [规格参数]：画面比例（9:16竖屏）、时长、分辨率（4K超清）、景深效果、画面质感细节（皮肤纹理、服装材质等）。

2. [风格设定]：整体视觉风格、色调搭配（冷暖对比）、氛围营造、专业感与信任背书。

3. [主角设定]：年龄、性别、面部特征、发型、眼神气质、心理状态、穿着打扮（具体到品牌风格、颜色、配饰如领夹麦克风等）。

4. [场景设定]：具体场景描述（如豪车内饰、办公室、户外等）、环境细节（座椅材质、灯光效果、背景元素）、氛围渲染。

5. [分镜头脚本]：3-4 个镜头切换，包含景别（特写/中景/远景）、机位角度、镜头运动、画面过渡。

6. [表演要求]：口播节奏、手势幅度、眼神方向、情绪表达、互动感营造。

7. [口播内容]：完整的口播文案，保持原视频的核心信息和情感张力。

8. [负面限制]：明确禁止的元素（如卡通感、科幻背景、文字乱码、手指异常、神态呆滞、字幕生成等）。

输出 JSON 数组，每项格式为：
{{"title":"提示词标题（简短概括主题）","fullPrompt":"完整提示词（包含上述8个模块，每个模块用方括号标注）"}}

要求：
1. 仅使用简体中文。
2. 提示词总长度 400 字以上，确保细节丰富。
3. 不要输出 markdown，只输出纯 JSON。
4. 从视频中提取真实的口播内容，不要编造。
{f"参考视频摘要：{analysis_summary}" if analysis_summary else ""}"""

    parsed = _generate_content(
        api_key=key,
        model=model or "gemini-2.5-flash",
        parts=[
            {"file_data": {"mime_type": reference.mime_type, "file_uri": reference.file_uri}},
            {"text": prompt},
        ],
        max_output_tokens=8192,
    )

    items = parsed if isinstance(parsed, list) else [parsed]
    results = []
    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        title = _normalize_string(item.get("title")) or f"提示词 {index}"
        full_prompt = _normalize_string(item.get("fullPrompt")) or _normalize_string(item.get("prompt"))
        if full_prompt:
            results.append({"title": title, "fullPrompt": full_prompt})

    if not results:
        raise GeminiVideoError("未生成有效的 Sora 提示词")
    return results
