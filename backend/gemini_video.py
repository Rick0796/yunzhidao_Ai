"""Gemini video analysis using official Google GenAI SDK."""
from __future__ import annotations

import json
import os
import tempfile
import time
from typing import Any, BinaryIO

from google import genai
from google.genai import types

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


def _safe_json(text: str) -> Any:
    """Parse JSON from text, handling markdown code blocks."""
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


def _normalize_string(value: Any) -> str:
    return str(value or "").strip()


def _upload_file_to_gemini(
    client: genai.Client,
    file_stream: BinaryIO,
    mime_type: str,
    display_name: str,
) -> str:
    """Upload file to Gemini and wait for processing."""
    # Write stream to temp file for SDK upload
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        tmp.write(file_stream.read())
        tmp_path = tmp.name

    try:
        file_data = client.files.upload(
            file=tmp_path,
            config=types.UploadFileConfig(
                display_name=display_name,
                mime_type=mime_type or "video/mp4",
            ),
        )

        if not file_data.name or not file_data.uri:
            raise GeminiVideoError("文件上传成功但未返回可用的文件标识")

        # Poll for processing completion
        state = file_data.state
        attempts = 0
        while state == "PROCESSING":
            attempts += 1
            if attempts > GEMINI_FILE_POLL_MAX_ATTEMPTS:
                raise GeminiVideoError("视频在 Gemini 文件服务中处理超时")
            time.sleep(GEMINI_FILE_POLL_INTERVAL_SECONDS)
            status = client.files.get(name=file_data.name)
            state = status.state
            if state == "FAILED":
                raise GeminiVideoError("Gemini 文件处理失败")

        if state != "ACTIVE":
            raise GeminiVideoError(f"Gemini 文件状态异常：{state or 'UNKNOWN'}")

        return file_data.uri
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _resolve_video_part(
    client: genai.Client,
    file_stream: BinaryIO | None,
    content_length: int | None,
    mime_type: str | None,
    display_name: str | None,
    existing_file_uri: str | None,
) -> tuple[str | None, types.Part]:
    """Resolve video to a Part for Gemini API."""
    resolved_mime = (mime_type or "video/mp4").strip() or "video/mp4"
    resolved_name = (display_name or "uploaded-video").strip() or "uploaded-video"

    if existing_file_uri:
        return existing_file_uri, types.Part.from_uri(
            file_uri=existing_file_uri.strip(),
            mime_type=resolved_mime,
        )

    if file_stream is None or content_length is None or content_length <= 0:
        raise GeminiVideoError("未提供视频文件")

    file_uri = _upload_file_to_gemini(client, file_stream, resolved_mime, resolved_name)
    return file_uri, types.Part.from_uri(file_uri=file_uri, mime_type=resolved_mime)


def _normalize_analysis_result(parsed: Any, *, file_uri: str | None, mime_type: str, deep: bool) -> dict[str, Any]:
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
        "fileUri": file_uri or "",
        "mimeType": mime_type,
    }


def analyze_video_with_gemini(
    *,
    api_key: str | None = None,
    base_url: str | None = None,  # ignored, kept for compatibility
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
    client = genai.Client(api_key=key)
    is_deep = mode.upper() == "DEEP"

    file_uri, video_part = _resolve_video_part(
        client, file_stream, content_length, mime_type, display_name, existing_file_uri
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

    response = client.models.generate_content(
        model=model or "gemini-2.5-flash",
        contents=[video_part, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            max_output_tokens=8192 if is_deep else 4096,
        ),
    )

    parsed = _safe_json(response.text or "")
    if not parsed:
        raise GeminiVideoError("AI 返回内容无法解析为 JSON")

    return _normalize_analysis_result(
        parsed,
        file_uri=file_uri,
        mime_type=(mime_type or "video/mp4").strip() or "video/mp4",
        deep=is_deep,
    )


def generate_sora_prompts_with_gemini(
    *,
    api_key: str | None = None,
    base_url: str | None = None,  # ignored, kept for compatibility
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
    client = genai.Client(api_key=key)

    file_uri, video_part = _resolve_video_part(
        client, file_stream, content_length, mime_type, display_name, existing_file_uri
    )

    prompt = f"""你是一名 AIGC 导演，请基于视频内容输出 {max(1, count)} 条可直接用于生成数字人短视频的提示词。
输出 JSON 数组，每项格式为：
{{"title":"提示词标题","fullPrompt":"完整提示词"}}
要求：
1. 仅使用简体中文。
2. 明确镜头、人物动作、场景、光线、节奏、画面比例。
3. 不要输出 markdown。
{f"参考视频摘要：{analysis_summary}" if analysis_summary else ""}"""

    response = client.models.generate_content(
        model=model or "gemini-2.5-flash",
        contents=[video_part, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            max_output_tokens=4096,
        ),
    )

    parsed = _safe_json(response.text or "")
    items = parsed if isinstance(parsed, list) else [parsed] if isinstance(parsed, dict) else []

    results: list[dict[str, str]] = []
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
