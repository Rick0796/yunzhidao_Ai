from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from typing import Any

from backend.anthropic_client import (
    AnthropicApiError,
    DEFAULT_ANTHROPIC_MODEL,
    generate_json_with_anthropic,
    normalize_anthropic_model_name,
)
from backend.platform_utils import clean_text

DEFAULT_ANALYSIS_KEYS = ("hook", "contrast", "value", "trust", "cta", "targetAudience", "sellingPoints")


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
        raise AnthropicApiError("Claude rewrites were too close to the source. Please retry.")
    if dropped_for_peer:
        raise AnthropicApiError("Claude rewrites were too similar to each other. Please retry.")
    raise AnthropicApiError("Claude did not return any usable rewrite scripts.")


def normalize_copy_analysis_result(parsed: Any, *, original_copy: str) -> dict[str, Any]:
    payload = parsed if isinstance(parsed, dict) else {}
    analysis_raw = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
    analysis = {key: _normalize_text(analysis_raw.get(key)) for key in DEFAULT_ANALYSIS_KEYS}
    scripts = _filter_rewrite_scripts(_normalize_scripts(payload.get("generatedScripts")), source_text=original_copy, min_required=2)

    if not scripts:
        raise AnthropicApiError("Claude did not return any usable rewrite scripts.")

    return {
        "originalCopy": original_copy,
        "analysis": analysis,
        "generatedScripts": scripts,
    }


def normalize_copy_refine_result(parsed: Any, *, original_copy: str = "") -> dict[str, Any]:
    payload = parsed if isinstance(parsed, dict) else {}
    source_text = normalize_multiline_text(original_copy or payload.get("originalCopy"))
    scripts = _filter_rewrite_scripts(_normalize_scripts(payload.get("generatedScripts")), source_text=source_text, min_required=2)
    if not scripts:
        raise AnthropicApiError("Claude did not return any usable refined scripts.")
    return {"generatedScripts": scripts}


def build_rewrite_system_prompt() -> str:
    return (
        "You are a short-video rewrite engine. "
        "You only analyze and rewrite viral copy. "
        "Always return a valid JSON object only. "
        "Do not use markdown, code fences, or extra commentary. "
        "All generated copy must be in Simplified Chinese."
    )


def build_copy_analysis_prompt(*, original_copy: str, industry: str, needs: str, user_background: str) -> str:
    min_length, max_length = _estimate_length_bounds(original_copy)
    paragraph_count = _count_paragraphs(original_copy)
    schema_example = {
        "analysis": {
            "hook": "Hook analysis",
            "contrast": "Contrast analysis",
            "value": "Value analysis",
            "trust": "Trust analysis",
            "cta": "CTA analysis",
            "targetAudience": "Target audience",
            "sellingPoints": "Selling points",
        },
        "generatedScripts": [
            {"title": "Script 1", "content": "Full rewritten script"},
            {"title": "Script 2", "content": "Full rewritten script"},
            {"title": "Script 3", "content": "Full rewritten script"},
        ],
    }
    return (
        "Analyze the source short-video copy and then generate 3 rewritten versions.\n\n"
        "Hard rules:\n"
        f"1. Keep the total length close to the source, between {min_length} and {max_length} Chinese characters.\n"
        f"2. Lock the viral structure: keep the same progression order, emotional rhythm, and roughly {paragraph_count} paragraphs.\n"
        "3. Rewrite only. Do not change the topic. Do not expand into a different argument. Do not add new claims that are not in the source.\n"
        "4. Every paragraph must be substantially rewritten. Do not just swap a few synonyms. Do not copy long consecutive phrases.\n"
        "5. Reject near-copy behavior: if a sentence only changes a few words, rewrite it again until it is clearly different.\n"
        "6. The three generated scripts must also be clearly different from each other, not just minor wording changes.\n"
        "7. generatedScripts.content must contain only the final rewritten copy, with no notes or labels.\n"
        "8. Fill every field under analysis with useful content.\n"
        "9. The output must be a single valid JSON object.\n"
        "10. The rewritten scripts must be in Simplified Chinese.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Industry: {industry or 'General'}\n"
        f"Specific need: {needs or 'Keep similar length and structure, rewrite only for deduplication'}\n\n"
        "Required output shape:\n"
        f"{json.dumps(schema_example, ensure_ascii=True, indent=2)}\n\n"
        "Source copy:\n"
        f"{original_copy}"
    )


def build_copy_refine_prompt(*, current_result: Any, user_instruction: str, user_background: str) -> str:
    original_copy = normalize_multiline_text(current_result.get("originalCopy") if isinstance(current_result, dict) else "")
    min_length, max_length = _estimate_length_bounds(original_copy)
    paragraph_count = _count_paragraphs(original_copy)
    current_result_json = json.dumps(current_result, ensure_ascii=True)
    schema_example = {
        "generatedScripts": [
            {"title": "Script 1", "content": "Refined rewritten script"},
            {"title": "Script 2", "content": "Refined rewritten script"},
            {"title": "Script 3", "content": "Refined rewritten script"},
        ]
    }
    return (
        "Regenerate 3 refined rewrite scripts based on the current result and the user's extra instruction.\n\n"
        "Hard rules:\n"
        "1. Rewrite only. Do not change the topic. Do not introduce new claims.\n"
        f"2. Keep the same viral structure, same progression order, and roughly {paragraph_count} paragraphs.\n"
        f"3. Keep the length close to the source, between {min_length} and {max_length} Chinese characters.\n"
        "4. Every paragraph must be substantially rewritten. Do not just replace a few words.\n"
        "5. Reject near-copy behavior: if a sentence only changes a few words, rewrite it again until it is clearly different.\n"
        "6. The three generated scripts must also be clearly different from each other.\n"
        "7. generatedScripts.content must contain only the final rewritten copy.\n"
        "8. Output must be a single valid JSON object.\n"
        "9. The rewritten scripts must be in Simplified Chinese.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Extra instruction: {user_instruction}\n\n"
        "Current result:\n"
        f"{current_result_json}\n\n"
        "Required output shape:\n"
        f"{json.dumps(schema_example, ensure_ascii=True, indent=2)}"
    )


def analyze_copy_with_claude(
    *,
    original_copy: str,
    industry: str,
    needs: str,
    user_background: str,
    api_key: str,
    base_url: str,
    model: str | None = None,
) -> dict[str, Any]:
    parsed = generate_json_with_anthropic(
        base_url=base_url,
        api_key=api_key,
        model=normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
        system_prompt=build_rewrite_system_prompt(),
        user_prompt=build_copy_analysis_prompt(
            original_copy=original_copy,
            industry=industry,
            needs=needs,
            user_background=user_background,
        ),
        max_tokens=4096,
        temperature=0,
    )
    return normalize_copy_analysis_result(parsed, original_copy=original_copy)


def refine_copy_with_claude(
    *,
    current_result: Any,
    user_instruction: str,
    user_background: str,
    api_key: str,
    base_url: str,
    model: str | None = None,
) -> dict[str, Any]:
    original_copy = normalize_multiline_text(current_result.get("originalCopy") if isinstance(current_result, dict) else "")
    parsed = generate_json_with_anthropic(
        base_url=base_url,
        api_key=api_key,
        model=normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
        system_prompt=build_rewrite_system_prompt(),
        user_prompt=build_copy_refine_prompt(
            current_result=current_result,
            user_instruction=user_instruction,
            user_background=user_background,
        ),
        max_tokens=4096,
        temperature=0,
    )
    return normalize_copy_refine_result(parsed, original_copy=original_copy)
