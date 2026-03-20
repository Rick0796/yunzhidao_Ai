from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from typing import Any, Callable

from backend.anthropic_client import (
    AnthropicApiError,
    DEFAULT_ANTHROPIC_MODEL,
    generate_text_with_anthropic,
    normalize_anthropic_model_name,
)
from backend.platform_utils import clean_text

DEFAULT_ANALYSIS_KEYS = ("hook", "contrast", "value", "trust", "cta", "targetAudience", "sellingPoints")
ANALYSIS_TAG_MAP = {
    "hook": "analysis_hook",
    "contrast": "analysis_contrast",
    "value": "analysis_value",
    "trust": "analysis_trust",
    "cta": "analysis_cta",
    "targetAudience": "analysis_target_audience",
    "sellingPoints": "analysis_selling_points",
}


def _normalize_text(value: Any) -> str:
    return clean_text(value)


def normalize_multiline_text(value: Any) -> str:
    raw = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [clean_text(line) for line in raw.split("\n")]
    normalized: list[str] = []
    for line in lines:
        if line:
            normalized.append(line)
        elif normalized and normalized[-1] != "":
            normalized.append("")
    while normalized and normalized[-1] == "":
        normalized.pop()
    return "\n".join(normalized).strip()


def _estimate_length_bounds(text: str) -> tuple[int, int]:
    length = len(re.sub(r"\s+", "", clean_text(text)))
    if length <= 0:
        return (80, 160)
    min_length = max(40, int(length * 0.85))
    max_length = max(min_length + 20, int(length * 1.15))
    return (min_length, max_length)


def _count_paragraphs(text: str) -> int:
    paragraphs = [clean_text(part) for part in re.split(r"\n+", text) if clean_text(part)]
    return max(1, len(paragraphs))


def _rewrite_char_length(text: str) -> int:
    return len(_comparison_text(text))


def _target_script_count(text: str) -> int:
    length = _rewrite_char_length(text)
    if length >= 650:
        return 1
    return 2


def _target_max_tokens(text: str, script_count: int) -> int:
    length = _rewrite_char_length(text)
    estimated = 600 + (length * max(1, script_count)) + 500
    return max(1400, min(3200, estimated))


def _should_use_staged_generation(text: str, script_count: int) -> bool:
    return script_count <= 1 or _rewrite_char_length(text) >= 650


def _staged_timeout_seconds(timeout_seconds: float) -> float:
    return max(15, min(timeout_seconds, 25))


def _empty_analysis() -> dict[str, str]:
    return {key: "" for key in DEFAULT_ANALYSIS_KEYS}


def _comparison_text(value: Any) -> str:
    text = normalize_multiline_text(value).lower()
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", text)


def _ngram_set(text: str, size: int = 4) -> set[str]:
    if not text:
        return set()
    if len(text) <= size:
        return {text}
    return {text[index : index + size] for index in range(0, len(text) - size + 1)}


def _jaccard_similarity(left: str, right: str, size: int = 4) -> float:
    left_set = _ngram_set(left, size)
    right_set = _ngram_set(right, size)
    if not left_set and not right_set:
        return 1.0
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / len(left_set | right_set)


def _longest_common_block(left: str, right: str) -> int:
    if not left or not right:
        return 0
    matcher = SequenceMatcher(None, left, right)
    return max((block.size for block in matcher.get_matching_blocks()), default=0)


def _length_ratio(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    return min(len(left), len(right)) / max(len(left), len(right))


def _similarity_metrics(left: str, right: str) -> dict[str, float]:
    if not left or not right:
        return {
            "sequence_ratio": 0.0,
            "jaccard_ratio": 0.0,
            "longest_block_ratio": 0.0,
            "length_ratio": 0.0,
        }

    matcher = SequenceMatcher(None, left, right)
    longest_block = _longest_common_block(left, right)
    shortest = max(1, min(len(left), len(right)))
    return {
        "sequence_ratio": matcher.ratio(),
        "jaccard_ratio": _jaccard_similarity(left, right, 4),
        "longest_block_ratio": longest_block / shortest,
        "length_ratio": _length_ratio(left, right),
    }


def _too_close_to_source(candidate: str, source: str) -> bool:
    if not candidate or not source:
        return False
    if candidate == source or candidate in source or source in candidate:
        return True

    metrics = _similarity_metrics(candidate, source)
    if metrics["sequence_ratio"] >= 0.88:
        return True
    if metrics["jaccard_ratio"] >= 0.68:
        return True
    if metrics["longest_block_ratio"] >= 0.36:
        return True
    if metrics["sequence_ratio"] >= 0.8 and metrics["longest_block_ratio"] >= 0.3:
        return True
    return False


def _too_close_to_peer(candidate: str, peer: str) -> bool:
    if not candidate or not peer:
        return False
    if candidate == peer or candidate in peer or peer in candidate:
        return True

    metrics = _similarity_metrics(candidate, peer)
    if metrics["sequence_ratio"] >= 0.9:
        return True
    if metrics["jaccard_ratio"] >= 0.72:
        return True
    if metrics["longest_block_ratio"] >= 0.42:
        return True
    if metrics["sequence_ratio"] >= 0.84 and metrics["longest_block_ratio"] >= 0.34:
        return True
    return False


def _normalize_scripts(items: Any) -> list[dict[str, str]]:
    scripts: list[dict[str, str]] = []
    if not isinstance(items, list):
        return scripts

    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        title = _normalize_text(item.get("title") or item.get("name")) or f"Script {index}"
        content = normalize_multiline_text(item.get("content") or item.get("copy") or item.get("script"))
        if content:
            scripts.append({"title": title, "content": content})
    return scripts


def _extract_tag_content(text: str, tag: str) -> str:
    match = re.search(rf"<{tag}>\s*(.*?)\s*</{tag}>", text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    return normalize_multiline_text(match.group(1))


def _parse_analysis_tag_response(raw_text: str, *, script_count: int) -> dict[str, Any]:
    analysis = {key: _extract_tag_content(raw_text, tag) for key, tag in ANALYSIS_TAG_MAP.items()}
    scripts: list[dict[str, str]] = []
    for index in range(1, script_count + 1):
        title = _extract_tag_content(raw_text, f"script_{index}_title") or f"Script {index}"
        content = _extract_tag_content(raw_text, f"script_{index}_content")
        if content:
            scripts.append({"title": title, "content": content})

    return {
        "analysis": analysis,
        "generatedScripts": scripts,
    }


def _parse_refine_tag_response(raw_text: str, *, script_count: int) -> dict[str, Any]:
    scripts: list[dict[str, str]] = []
    for index in range(1, script_count + 1):
        title = _extract_tag_content(raw_text, f"script_{index}_title") or f"Script {index}"
        content = _extract_tag_content(raw_text, f"script_{index}_content")
        if content:
            scripts.append({"title": title, "content": content})
    return {"generatedScripts": scripts}


def _parse_single_script_response(raw_text: str) -> dict[str, str]:
    title = _extract_tag_content(raw_text, "script_title") or "Script"
    content = _extract_tag_content(raw_text, "script_content")
    return {"title": title, "content": content}


def _parse_analysis_only_response(raw_text: str) -> dict[str, str]:
    return {key: _extract_tag_content(raw_text, tag) for key, tag in ANALYSIS_TAG_MAP.items()}


def _filter_rewrite_scripts(
    scripts: list[dict[str, str]],
    *,
    source_text: str,
    min_required: int,
) -> list[dict[str, str]]:
    source_compare = _comparison_text(source_text)
    kept: list[dict[str, str]] = []
    kept_compare: list[str] = []
    dropped_for_source = 0
    dropped_for_peer = 0

    for script in scripts:
        candidate_compare = _comparison_text(script.get("content"))
        if not candidate_compare:
            continue
        if _too_close_to_source(candidate_compare, source_compare):
            dropped_for_source += 1
            continue
        if any(_too_close_to_peer(candidate_compare, existing) for existing in kept_compare):
            dropped_for_peer += 1
            continue
        kept.append(script)
        kept_compare.append(candidate_compare)

    if len(kept) >= min_required:
        return kept
    if dropped_for_source:
        raise AnthropicApiError("\u4eff\u5199\u7ed3\u679c\u4e0e\u539f\u6587\u8fc7\u4e8e\u63a5\u8fd1\uff0c\u8bf7\u91cd\u8bd5\u3002")
    if dropped_for_peer:
        raise AnthropicApiError("\u591a\u6761\u4eff\u5199\u7ed3\u679c\u4e4b\u95f4\u8fc7\u4e8e\u76f8\u4f3c\uff0c\u8bf7\u91cd\u8bd5\u3002")
    raise AnthropicApiError("\u0043laude \u6ca1\u6709\u8fd4\u56de\u53ef\u7528\u7684\u4eff\u5199\u7a3f\u3002")


def _is_usable_script(candidate: dict[str, str], source_text: str, existing_scripts: list[dict[str, str]]) -> bool:
    candidate_compare = _comparison_text(candidate.get("content"))
    if not candidate_compare:
        return False
    source_compare = _comparison_text(source_text)
    if _too_close_to_source(candidate_compare, source_compare):
        return False
    for existing in existing_scripts:
        if _too_close_to_peer(candidate_compare, _comparison_text(existing.get("content"))):
            return False
    return True


def normalize_copy_analysis_result(parsed: Any, *, original_copy: str, script_count: int | None = None) -> dict[str, Any]:
    payload = parsed if isinstance(parsed, dict) else {}
    analysis_raw = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
    analysis = {key: _normalize_text(analysis_raw.get(key)) for key in DEFAULT_ANALYSIS_KEYS}
    target_count = max(1, script_count or _target_script_count(original_copy))
    scripts = _filter_rewrite_scripts(_normalize_scripts(payload.get("generatedScripts")), source_text=original_copy, min_required=target_count)

    if not scripts:
        raise AnthropicApiError("\u0043laude \u6ca1\u6709\u8fd4\u56de\u53ef\u7528\u7684\u4eff\u5199\u7a3f\u3002")

    return {
        "originalCopy": original_copy,
        "analysis": analysis,
        "generatedScripts": scripts,
    }


def normalize_copy_refine_result(parsed: Any, *, original_copy: str = "", script_count: int | None = None) -> dict[str, Any]:
    payload = parsed if isinstance(parsed, dict) else {}
    source_text = normalize_multiline_text(original_copy or payload.get("originalCopy"))
    target_count = max(1, script_count or _target_script_count(source_text))
    scripts = _filter_rewrite_scripts(_normalize_scripts(payload.get("generatedScripts")), source_text=source_text, min_required=target_count)
    if not scripts:
        raise AnthropicApiError("\u0043laude \u6ca1\u6709\u8fd4\u56de\u53ef\u7528\u7684\u4f18\u5316\u7a3f\u3002")
    return {"generatedScripts": scripts}


def build_rewrite_system_prompt() -> str:
    return (
        "You are a short-video rewrite engine. "
        "You only analyze and rewrite viral copy. "
        "Return plain text only using the exact tags requested by the user prompt. "
        "Do not use markdown, code fences, JSON, or extra commentary. "
        "All generated copy must be in Simplified Chinese."
    )


def build_copy_analysis_prompt(*, original_copy: str, industry: str, needs: str, user_background: str, script_count: int | None = None) -> str:
    min_length, max_length = _estimate_length_bounds(original_copy)
    paragraph_count = _count_paragraphs(original_copy)
    target_count = max(1, script_count or _target_script_count(original_copy))
    schema_example = {
        "tags": [
            "<analysis_hook>...</analysis_hook>",
            "<analysis_contrast>...</analysis_contrast>",
            "<analysis_value>...</analysis_value>",
            "<analysis_trust>...</analysis_trust>",
            "<analysis_cta>...</analysis_cta>",
            "<analysis_target_audience>...</analysis_target_audience>",
            "<analysis_selling_points>...</analysis_selling_points>",
            *[
                f"<script_{index}_title>...</script_{index}_title>\n<script_{index}_content>...</script_{index}_content>"
                for index in range(1, target_count + 1)
            ],
        ]
    }
    return (
        f"Analyze the source short-video copy and then generate {target_count} rewritten versions.\n\n"
        "Hard rules:\n"
        f"1. Keep the total length close to the source, between {min_length} and {max_length} Chinese characters.\n"
        f"2. Lock the viral structure: keep the same progression order, emotional rhythm, and roughly {paragraph_count} paragraphs.\n"
        "3. Rewrite only. Do not change the topic. Do not expand into a different argument. Do not add new claims that are not in the source.\n"
        "4. Every paragraph must be substantially rewritten. Do not just swap a few synonyms. Do not copy long consecutive phrases.\n"
        "5. Reject near-copy behavior: if a sentence only changes a few words, rewrite it again until it is clearly different.\n"
        "6. The three generated scripts must also be clearly different from each other, not just minor wording changes.\n"
        "7. Every script content block must contain only the final rewritten copy, with no notes or labels.\n"
        "8. Fill every analysis tag with useful content.\n"
        "9. Output only the requested XML-like tags, and nothing else.\n"
        "10. The rewritten scripts must be in Simplified Chinese.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Industry: {industry or 'General'}\n"
        f"Specific need: {needs or 'Keep similar length and structure, rewrite only for deduplication'}\n\n"
        "Required output tags:\n"
        f"{json.dumps(schema_example, ensure_ascii=True, indent=2)}\n\n"
        "Source copy:\n"
        f"{original_copy}"
    )


def build_copy_refine_prompt(*, current_result: Any, user_instruction: str, user_background: str, script_count: int | None = None) -> str:
    original_copy = normalize_multiline_text(current_result.get("originalCopy") if isinstance(current_result, dict) else "")
    min_length, max_length = _estimate_length_bounds(original_copy)
    paragraph_count = _count_paragraphs(original_copy)
    target_count = max(1, script_count or _target_script_count(original_copy))
    current_result_json = json.dumps(current_result, ensure_ascii=True)
    schema_example = {
        "tags": [
            *[
                f"<script_{index}_title>...</script_{index}_title>\n<script_{index}_content>...</script_{index}_content>"
                for index in range(1, target_count + 1)
            ]
        ]
    }
    return (
        f"Regenerate {target_count} refined rewrite scripts based on the current result and the user's extra instruction.\n\n"
        "Hard rules:\n"
        "1. Rewrite only. Do not change the topic. Do not introduce new claims.\n"
        f"2. Keep the same viral structure, same progression order, and roughly {paragraph_count} paragraphs.\n"
        f"3. Keep the length close to the source, between {min_length} and {max_length} Chinese characters.\n"
        "4. Every paragraph must be substantially rewritten. Do not just replace a few words.\n"
        "5. Reject near-copy behavior: if a sentence only changes a few words, rewrite it again until it is clearly different.\n"
        "6. The three generated scripts must also be clearly different from each other.\n"
        "7. Every script content block must contain only the final rewritten copy.\n"
        "8. Output only the requested XML-like tags, and nothing else.\n"
        "9. The rewritten scripts must be in Simplified Chinese.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Extra instruction: {user_instruction}\n\n"
        "Current result:\n"
        f"{current_result_json}\n\n"
        "Required output tags:\n"
        f"{json.dumps(schema_example, ensure_ascii=True, indent=2)}"
    )


def build_analysis_only_prompt(*, original_copy: str, industry: str, needs: str, user_background: str) -> str:
    tag_lines = "\n".join(f"<{tag}>...</{tag}>" for tag in ANALYSIS_TAG_MAP.values())
    return (
        "Analyze the source short-video copy only.\n\n"
        "Rules:\n"
        "1. Fill every requested tag in Simplified Chinese.\n"
        "2. Keep each tag concise and useful.\n"
        "3. Output only the requested tags, and nothing else.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Industry: {industry or 'General'}\n"
        f"Specific need: {needs or 'Keep similar length and structure, rewrite only for deduplication'}\n\n"
        "Required tags:\n"
        f"{tag_lines}\n\n"
        "Source copy:\n"
        f"{original_copy}"
    )


def _build_existing_script_notes(existing_scripts: list[dict[str, str]]) -> str:
    if not existing_scripts:
        return "None"
    lines: list[str] = []
    for index, item in enumerate(existing_scripts, start=1):
        preview = normalize_multiline_text(item.get("content"))[:120]
        lines.append(f"{index}. {preview}")
    return "\n".join(lines)


def build_single_script_prompt(
    *,
    original_copy: str,
    industry: str,
    needs: str,
    user_background: str,
    analysis: dict[str, str],
    script_index: int,
    existing_scripts: list[dict[str, str]],
) -> str:
    min_length, max_length = _estimate_length_bounds(original_copy)
    paragraph_count = _count_paragraphs(original_copy)
    analysis_json = json.dumps(analysis, ensure_ascii=True)
    existing_notes = _build_existing_script_notes(existing_scripts)
    return (
        f"Generate rewrite script {script_index} only.\n\n"
        "Rules:\n"
        f"1. Keep the total length close to the source, between {min_length} and {max_length} Chinese characters.\n"
        f"2. Keep the same viral structure, same progression order, and roughly {paragraph_count} paragraphs.\n"
        "3. Rewrite only. Do not change the topic. Do not add new claims.\n"
        "4. Every paragraph must be clearly rewritten. Do not just replace a few words.\n"
        "5. The new script must be clearly different from the source and from any existing scripts.\n"
        "6. Output only <script_title> and <script_content> tags.\n"
        "7. script_content must contain only the final rewritten copy in Simplified Chinese.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Industry: {industry or 'General'}\n"
        f"Specific need: {needs or 'Keep similar length and structure, rewrite only for deduplication'}\n"
        f"Analysis reference: {analysis_json}\n"
        f"Existing scripts to avoid repeating:\n{existing_notes}\n\n"
        "Required tags:\n"
        "<script_title>...</script_title>\n<script_content>...</script_content>\n\n"
        "Source copy:\n"
        f"{original_copy}"
    )


def build_single_refine_script_prompt(
    *,
    original_copy: str,
    user_instruction: str,
    user_background: str,
    script_index: int,
    existing_scripts: list[dict[str, str]],
) -> str:
    min_length, max_length = _estimate_length_bounds(original_copy)
    paragraph_count = _count_paragraphs(original_copy)
    existing_notes = _build_existing_script_notes(existing_scripts)
    return (
        f"Generate refined rewrite script {script_index} only.\n\n"
        "Rules:\n"
        "1. Rewrite only. Do not change the topic. Do not introduce new claims.\n"
        f"2. Keep the same viral structure, same progression order, and roughly {paragraph_count} paragraphs.\n"
        f"3. Keep the total length close to the source, between {min_length} and {max_length} Chinese characters.\n"
        "4. Every paragraph must be clearly rewritten. Do not just replace a few words.\n"
        "5. The new script must be clearly different from the source and from any existing scripts.\n"
        "6. Output only <script_title> and <script_content> tags.\n"
        "7. script_content must contain only the final rewritten copy in Simplified Chinese.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Extra instruction: {user_instruction}\n"
        f"Existing scripts to avoid repeating:\n{existing_notes}\n\n"
        "Required tags:\n"
        "<script_title>...</script_title>\n<script_content>...</script_content>\n\n"
        "Source copy:\n"
        f"{original_copy}"
    )


def _generate_analysis_only(
    *,
    original_copy: str,
    industry: str,
    needs: str,
    user_background: str,
    api_key: str,
    base_url: str,
    model: str | None,
    timeout_seconds: float,
) -> dict[str, str]:
    try:
        raw_text = generate_text_with_anthropic(
            base_url=base_url,
            api_key=api_key,
            model=normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
            system_prompt=build_rewrite_system_prompt(),
            user_prompt=build_analysis_only_prompt(
                original_copy=original_copy,
                industry=industry,
                needs=needs,
                user_background=user_background,
            ),
            max_tokens=1200,
            timeout_seconds=_staged_timeout_seconds(timeout_seconds),
            temperature=0,
        )
        analysis = _parse_analysis_only_response(raw_text)
        return analysis if any(value for value in analysis.values()) else _empty_analysis()
    except AnthropicApiError:
        return _empty_analysis()


def _generate_scripts_sequentially(
    *,
    source_text: str,
    target_count: int,
    prompt_builder: Callable[[int, list[dict[str, str]]], str],
    api_key: str,
    base_url: str,
    model: str | None,
    timeout_seconds: float,
    max_tokens: int,
    blocked_scripts: list[dict[str, str]] | None = None,
) -> list[dict[str, str]]:
    scripts: list[dict[str, str]] = []
    existing_scripts = list(blocked_scripts or [])
    last_error: AnthropicApiError | None = None
    attempt_limit = max(4, target_count * 4)

    for _attempt in range(attempt_limit):
        if len(scripts) >= target_count:
            break
        try:
            raw_text = generate_text_with_anthropic(
                base_url=base_url,
                api_key=api_key,
                model=normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
                system_prompt=build_rewrite_system_prompt(),
                user_prompt=prompt_builder(len(scripts) + 1, [*existing_scripts, *scripts]),
                max_tokens=max_tokens,
                timeout_seconds=_staged_timeout_seconds(timeout_seconds),
                temperature=0,
            )
        except AnthropicApiError as exc:
            last_error = exc
            continue

        candidate = _parse_single_script_response(raw_text)
        if _is_usable_script(candidate, source_text, [*existing_scripts, *scripts]):
            if not candidate["title"]:
                candidate["title"] = f"Script {len(scripts) + 1}"
            scripts.append(candidate)

    if scripts:
        return scripts
    if last_error is not None:
        raise last_error
    raise AnthropicApiError("\u0043laude \u4ee3\u7406\u8fd9\u6b21\u6ca1\u6709\u8fd4\u56de\u53ef\u7528\u5185\u5bb9\uff0c\u8bf7\u91cd\u8bd5\u3002")


def analyze_copy_with_claude(
    *,
    original_copy: str,
    industry: str,
    needs: str,
    user_background: str,
    api_key: str,
    base_url: str,
    model: str | None = None,
    timeout_seconds: float = 90,
) -> dict[str, Any]:
    original_copy = normalize_multiline_text(original_copy)
    script_count = _target_script_count(original_copy)
    if not _should_use_staged_generation(original_copy, script_count):
        max_tokens = _target_max_tokens(original_copy, script_count)
        try:
            raw_text = generate_text_with_anthropic(
                base_url=base_url,
                api_key=api_key,
                model=normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
                system_prompt=build_rewrite_system_prompt(),
                user_prompt=build_copy_analysis_prompt(
                    original_copy=original_copy,
                    industry=industry,
                    needs=needs,
                    user_background=user_background,
                    script_count=script_count,
                ),
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
                temperature=0,
            )
            parsed = _parse_analysis_tag_response(raw_text, script_count=script_count)
            return normalize_copy_analysis_result(parsed, original_copy=original_copy, script_count=script_count)
        except AnthropicApiError:
            pass

    analysis = _generate_analysis_only(
        original_copy=original_copy,
        industry=industry,
        needs=needs,
        user_background=user_background,
        api_key=api_key,
        base_url=base_url,
        model=model,
        timeout_seconds=timeout_seconds,
    )
    scripts = _generate_scripts_sequentially(
        source_text=original_copy,
        target_count=script_count,
        prompt_builder=lambda script_index, existing_scripts: build_single_script_prompt(
            original_copy=original_copy,
            industry=industry,
            needs=needs,
            user_background=user_background,
            analysis=analysis,
            script_index=script_index,
            existing_scripts=existing_scripts,
        ),
        api_key=api_key,
        base_url=base_url,
        model=model,
        timeout_seconds=timeout_seconds,
        max_tokens=_target_max_tokens(original_copy, 1),
    )
    return normalize_copy_analysis_result(
        {
            "analysis": analysis,
            "generatedScripts": scripts,
        },
        original_copy=original_copy,
        script_count=script_count,
    )


def refine_copy_with_claude(
    *,
    current_result: Any,
    user_instruction: str,
    user_background: str,
    api_key: str,
    base_url: str,
    model: str | None = None,
    timeout_seconds: float = 90,
) -> dict[str, Any]:
    original_copy = normalize_multiline_text(current_result.get("originalCopy") if isinstance(current_result, dict) else "")
    script_count = _target_script_count(original_copy)
    if not _should_use_staged_generation(original_copy, script_count):
        max_tokens = _target_max_tokens(original_copy, script_count)
        try:
            raw_text = generate_text_with_anthropic(
                base_url=base_url,
                api_key=api_key,
                model=normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
                system_prompt=build_rewrite_system_prompt(),
                user_prompt=build_copy_refine_prompt(
                    current_result=current_result,
                    user_instruction=user_instruction,
                    user_background=user_background,
                    script_count=script_count,
                ),
                max_tokens=max_tokens,
                timeout_seconds=timeout_seconds,
                temperature=0,
            )
            parsed = _parse_refine_tag_response(raw_text, script_count=script_count)
            return normalize_copy_refine_result(parsed, original_copy=original_copy, script_count=script_count)
        except AnthropicApiError:
            pass

    blocked_scripts = _normalize_scripts(current_result.get("generatedScripts") if isinstance(current_result, dict) else [])
    scripts = _generate_scripts_sequentially(
        source_text=original_copy,
        target_count=script_count,
        prompt_builder=lambda script_index, existing_scripts: build_single_refine_script_prompt(
            original_copy=original_copy,
            user_instruction=user_instruction,
            user_background=user_background,
            script_index=script_index,
            existing_scripts=existing_scripts,
        ),
        api_key=api_key,
        base_url=base_url,
        model=model,
        timeout_seconds=timeout_seconds,
        max_tokens=_target_max_tokens(original_copy, 1),
        blocked_scripts=blocked_scripts,
    )
    return normalize_copy_refine_result(
        {
            "generatedScripts": scripts,
        },
        original_copy=original_copy,
        script_count=script_count,
    )
