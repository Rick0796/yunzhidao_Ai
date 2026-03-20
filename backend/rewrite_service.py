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
ACTION_TERMS = (
    "\u8bc4\u8bba\u533a",
    "\u8bc4\u8bba",
    "\u7559\u8a00",
    "\u5173\u952e\u8bcd",
    "\u4e3b\u9875",
    "\u76f4\u64ad",
    "\u516c\u5f00\u8bfe",
    "\u8bad\u7ec3\u8425",
    "\u5165\u53e3",
    "\u53d1\u9001\u79c1\u4fe1",
    "\u79c1\u4fe1",
    "\u5934\u50cf",
    "\u5173\u6ce8",
    "\u5c0f\u7ea2\u5fc3",
    "\u70b9\u4e2a\u5c0f\u7ea2\u5fc3",
    "\u6211\u8981\u770b\u76f4\u64ad",
)
CORE_TERMS = (
    "\u0041\u0049\u65f6\u4ee3",
    "\u0041\u0049",
    "\u5468\u8001\u5e08",
    "\u666e\u901a\u4eba",
    "\u5b9e\u4f53\u8001\u677f",
    "\u4e2d\u5c0f\u4f01\u4e1a",
    "\u521b\u4e1a\u8005",
    "\u8bad\u7ec3\u8425",
    "\u76f4\u64ad\u95f4",
    "\u76f4\u64ad\u5165\u53e3",
)
DATE_TOKEN_PATTERN = re.compile(r"\d{1,2}\u6708\d{1,2}\u65e5(?:\u5230\d{1,2}\u6708\d{1,2}\u65e5)?")
NAME_TOKEN_PATTERN = re.compile(r"[\u4e00-\u9fff]{1,4}(?:\u8001\u5e08|\u603b|\u4e3b\u4efb|\u9662\u957f|\u6821\u957f|\u535a\u58eb|\u6559\u6388)")
STAGE_TOKEN_PATTERN = re.compile(r"\u7b2c[一二三四五六七八九十0-9]+(?:\u5929|\u6b65|\u6761|\u8bfe)")
HARD_TOKEN_PATTERN = re.compile(
    r"(?:\d{4}\u5e74|\d+(?:\.\d+)?%?|\d+(?:\.\d+)?(?:\u4e07|\u4ebf|\u5143|\u5757|\u500d|\u5929|\u4e2a\u6708|\u6708|\u5e74|\u5c0f\u65f6|\u5206\u949f)|[一二三四五六七八九十百千万两零半]+(?:\u5e74|\u4e2a\u6708|\u6708|\u5929|\u6b21|\u4e2a|\u6761|\u500d|\u4e07|\u4ebf|\u5143|\u5757|\u5c0f\u65f6|\u5206\u949f|\u6210|%))"
)
ENGLISH_TOKEN_PATTERN = re.compile(r"\b[A-Za-z]{2,}(?:[-_][A-Za-z0-9]+)*\b")


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


def _split_sentences(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"(?<=[\u3002\uff01\uff1f!?；;])|\n+", normalize_multiline_text(text)) if item.strip()]


def _clip_text(text: str, max_chars: int = 56) -> str:
    normalized = normalize_multiline_text(text)
    if len(normalized) <= max_chars:
        return normalized
    return normalized[: max(10, max_chars - 1)].rstrip() + "\u2026"


def _extract_present_terms(text: str, terms: tuple[str, ...]) -> list[str]:
    normalized = normalize_multiline_text(text).lower()
    return [term for term in terms if term.lower() in normalized]


def _collect_unique_tokens(groups: list[list[str]], *, limit: int = 16) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for token in group:
            cleaned = normalize_multiline_text(token)
            key = _comparison_text(cleaned)
            if not key or key in seen:
                continue
            seen.add(key)
            ordered.append(cleaned)
            if len(ordered) >= limit:
                return ordered
    return ordered


def _extract_required_tokens(text: str) -> list[str]:
    raw_text = normalize_multiline_text(text)
    return _collect_unique_tokens(
        [
            DATE_TOKEN_PATTERN.findall(raw_text),
            NAME_TOKEN_PATTERN.findall(raw_text),
            STAGE_TOKEN_PATTERN.findall(raw_text),
            _extract_present_terms(raw_text, ACTION_TERMS),
            _extract_present_terms(raw_text, CORE_TERMS),
            HARD_TOKEN_PATTERN.findall(raw_text),
            ENGLISH_TOKEN_PATTERN.findall(raw_text),
        ],
        limit=12,
    )


def _select_sentence_by_keywords(sentences: list[str], keyword_groups: tuple[tuple[str, ...], ...]) -> str:
    lowered_sentences = [(sentence, normalize_multiline_text(sentence).lower()) for sentence in sentences]
    for keywords in keyword_groups:
        for sentence, lowered in lowered_sentences:
            if all(keyword.lower() in lowered for keyword in keywords):
                return sentence
    for keywords in keyword_groups:
        for sentence, lowered in lowered_sentences:
            if any(keyword.lower() in lowered for keyword in keywords):
                return sentence
    return ""


def _infer_target_audience(text: str) -> str:
    hits = _extract_present_terms(
        text,
        (
            "\u666e\u901a\u4eba",
            "\u5b9e\u4f53\u8001\u677f",
            "\u4e2d\u5c0f\u4f01\u4e1a",
            "\u521b\u4e1a\u8005",
            "\u8001\u677f",
            "\u884c\u52a8\u6d3e",
            "\u6b63\u5728\u627e\u673a\u4f1a\u7684\u4eba",
        ),
    )
    if hits:
        return "\u76f8\u5173\u53d7\u4f17\u662f\uff1a" + "\u3001".join(hits[:5]) + "\u3002"
    return "\u53d7\u4f17\u662f\u60f3\u6293\u4f4f\u673a\u4f1a\u3001\u60f3\u9760 AI \u6539\u53d8\u6536\u5165\u7684\u666e\u901a\u4eba\u548c\u521b\u4e1a\u8005\u3002"


def _infer_selling_points(text: str) -> str:
    day_markers = [token for token in _extract_required_tokens(text) if token.startswith("\u7b2c")]
    selling_terms = _extract_present_terms(
        text,
        (
            "\u8d5a\u94b1\u8d5b\u9053",
            "\u6279\u91cf\u751f\u4ea7\u5185\u5bb9",
            "\u83b7\u53d6\u6d41\u91cf",
            "\u0041\u0049\u667a\u80fd\u52a9\u624b",
            "\u6570\u5b57\u5316",
            "\u7ec8\u8eab\u8d44\u4ea7",
            "\u5b9e\u6218\u8bad\u7ec3\u8425",
        ),
    )
    parts: list[str] = []
    if day_markers:
        parts.append("\u8bfe\u7a0b\u4fdd\u7559\u201c" + "\u3001".join(day_markers[:4]) + "\u201d\u7684\u9010\u5929\u63a8\u8fdb\u7ed3\u6784")
    if selling_terms:
        parts.append("\u6838\u5fc3\u5356\u70b9\u662f\uff1a" + "\u3001".join(selling_terms[:5]))
    if parts:
        return "\uff1b".join(parts) + "\u3002"
    return "\u5356\u70b9\u96c6\u4e2d\u5728 AI \u53d8\u73b0\u8def\u5f84\u3001\u5185\u5bb9\u6548\u7387\u63d0\u5347\u548c\u6570\u5b57\u8d44\u4ea7\u79ef\u7d2f\u3002"


def _build_local_analysis(original_copy: str) -> dict[str, str]:
    sentences = _split_sentences(original_copy)
    if not sentences:
        return _empty_analysis()

    hook_sentence = _clip_text("".join(sentences[:2]), 64)
    contrast_sentence = _clip_text(
        _select_sentence_by_keywords(
            sentences,
            (
                ("\u4e0d\u662f", "\u800c\u662f"),
                ("\u4f1a\u7528AI", "\u4e0d\u4f1a\u7528"),
                ("\u5929\u58e4\u4e4b\u522b",),
            ),
        )
        or sentences[min(1, len(sentences) - 1)],
        64,
    )
    value_sentence = _clip_text(
        _select_sentence_by_keywords(
            sentences,
            (
                ("\u6700\u9ad8\u6548", "\u8def\u5f84"),
                ("\u8d5a\u94b1", "\u0041\u0049"),
                ("\u8bad\u7ec3\u8425",),
                ("\u6559\u4f60",),
            ),
        )
        or sentences[min(2, len(sentences) - 1)],
        72,
    )
    trust_sentence = _clip_text(
        _select_sentence_by_keywords(
            sentences,
            (
                ("\u5468\u8001\u5e08",),
                ("\u89c2\u5bdf",),
                ("\u5b9e\u6218",),
                ("\u96f6\u57fa\u7840",),
            ),
        )
        or sentences[min(3, len(sentences) - 1)],
        72,
    )
    cta_sentence = _clip_text(
        _select_sentence_by_keywords(
            list(reversed(sentences)),
            (
                ("\u79c1\u4fe1",),
                ("\u6211\u8981\u770b\u76f4\u64ad",),
                ("\u70b9", "\u5c0f\u7ea2\u5fc3"),
                ("\u70b9\u51fb", "\u5934\u50cf"),
                ("\u5173\u6ce8",),
            ),
        )
        or sentences[-1],
        72,
    )

    return {
        "hook": f"\u5f00\u5934\u5148\u7528\u65e5\u671f + \u60ca\u559c/\u795d\u798f\u611f\u505a\u6293\u505c\uff0c\u6838\u5fc3\u53e5\u662f\uff1a{hook_sentence}",
        "contrast": f"\u53cd\u5dee\u6838\u5fc3\u662f\u628a\u201c\u4f1a\u4e0d\u4f1a\u7528 AI\u201d\u7684\u7ed3\u679c\u5dee\u8ddd\u62c9\u5f00\uff0c\u91cd\u70b9\u53e5\u662f\uff1a{contrast_sentence}",
        "value": f"\u4ef7\u503c\u627f\u8bfa\u805a\u7126\u5728 AI \u7ffb\u8eab\u8def\u5f84 + \u5b9e\u6218\u65b9\u6cd5\uff0c\u91cd\u70b9\u53e5\u662f\uff1a{value_sentence}",
        "trust": f"\u4fe1\u4efb\u611f\u4e3b\u8981\u9760\u201c\u89c2\u5bdf\u5df2\u4e45 + \u5468\u8001\u5e08 + \u56db\u5929\u5b9e\u6218\u8bad\u7ec3\u8425\u201d\u6765\u652f\u6491\uff0c\u91cd\u70b9\u53e5\u662f\uff1a{trust_sentence}",
        "cta": f"\u6536\u53e3 CTA \u662f\u201c\u70b9\u5c0f\u7ea2\u5fc3 / \u5173\u6ce8 / \u79c1\u4fe1\u6211\u8981\u770b\u76f4\u64ad\u201d\uff0c\u91cd\u70b9\u53e5\u662f\uff1a{cta_sentence}",
        "targetAudience": _infer_target_audience(original_copy),
        "sellingPoints": _infer_selling_points(original_copy),
    }


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
    return 1


def _target_max_tokens(text: str, script_count: int) -> int:
    length = _rewrite_char_length(text)
    estimated = 320 + (length * max(1, script_count)) + 240
    return max(700, min(2200, estimated))


def _staged_timeout_seconds(timeout_seconds: float) -> float:
    return max(20, min(timeout_seconds, 30))


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


def _parse_single_script_response(raw_text: str) -> dict[str, str]:
    title = _extract_tag_content(raw_text, "script_title") or "Script"
    content = _extract_tag_content(raw_text, "script_content")
    if not content:
        fallback = normalize_multiline_text(raw_text)
        lowered = fallback.lower()
        if fallback and "<script_" not in lowered and "i'm claude" not in lowered and "i am claude" not in lowered:
            content = fallback
    return {"title": title, "content": content}


def _candidate_length_is_close(candidate: str, source: str) -> bool:
    min_length, max_length = _estimate_length_bounds(source)
    candidate_length = len(re.sub(r"\s+", "", normalize_multiline_text(candidate)))
    return min_length <= candidate_length <= max_length


def _missing_required_tokens(candidate: str, source: str) -> list[str]:
    candidate_compare = _comparison_text(candidate)
    missing: list[str] = []
    for token in _extract_required_tokens(source):
        token_compare = _comparison_text(token)
        if token_compare and token_compare not in candidate_compare:
            missing.append(token)
    return missing


def _validate_candidate_against_source(candidate: str, source: str) -> str | None:
    if not _candidate_length_is_close(candidate, source):
        return "\u4eff\u5199\u7ed3\u679c\u7684\u5b57\u6570\u548c\u539f\u6587\u504f\u5dee\u8fc7\u5927\u3002"
    missing_tokens = _missing_required_tokens(candidate, source)
    if missing_tokens:
        return "\u4eff\u5199\u7ed3\u679c\u4e22\u6389\u4e86\u539f\u6587\u91cc\u7684\u5173\u952e\u951a\u70b9\uff1a" + "\u3001".join(missing_tokens[:4]) + "\u3002"
    if re.search(r"[\uff1f?]", source) and not re.search(r"[\uff1f?]", candidate):
        return "\u539f\u6587\u5f00\u5934\u6709\u63d0\u95ee\u6293\u505c\uff0c\u4eff\u5199\u540e\u4e0d\u80fd\u628a\u95ee\u611f\u6d17\u6389\u3002"
    return None


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
    dropped_for_guard = 0
    guard_reason = ""

    for script in scripts:
        candidate_text = normalize_multiline_text(script.get("content"))
        guard_message = _validate_candidate_against_source(candidate_text, source_text)
        if guard_message:
            dropped_for_guard += 1
            guard_reason = guard_message
            continue
        candidate_compare = _comparison_text(candidate_text)
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
    if dropped_for_guard:
        raise AnthropicApiError(guard_reason or "\u4eff\u5199\u7ed3\u679c\u6ca1\u6709\u4fdd\u4f4f\u539f\u6587\u7684\u5173\u952e\u7ed3\u6784\u548c\u951a\u70b9\u3002")
    if dropped_for_source:
        raise AnthropicApiError("\u4eff\u5199\u7ed3\u679c\u4e0e\u539f\u6587\u8fc7\u4e8e\u63a5\u8fd1\uff0c\u8bf7\u91cd\u8bd5\u3002")
    if dropped_for_peer:
        raise AnthropicApiError("\u591a\u6761\u4eff\u5199\u7ed3\u679c\u4e4b\u95f4\u8fc7\u4e8e\u76f8\u4f3c\uff0c\u8bf7\u91cd\u8bd5\u3002")
    raise AnthropicApiError("\u0043laude \u6ca1\u6709\u8fd4\u56de\u53ef\u7528\u7684\u4eff\u5199\u7a3f\u3002")


def _is_usable_script(candidate: dict[str, str], source_text: str, existing_scripts: list[dict[str, str]]) -> bool:
    candidate_text = normalize_multiline_text(candidate.get("content"))
    if _validate_candidate_against_source(candidate_text, source_text):
        return False
    candidate_compare = _comparison_text(candidate_text)
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
    required_count = 1 if target_count > 1 else target_count
    scripts = _filter_rewrite_scripts(_normalize_scripts(payload.get("generatedScripts")), source_text=original_copy, min_required=required_count)

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
    required_count = 1 if target_count > 1 else target_count
    scripts = _filter_rewrite_scripts(_normalize_scripts(payload.get("generatedScripts")), source_text=source_text, min_required=required_count)
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
        "6. If multiple scripts are requested, they must also be clearly different from each other, not just minor wording changes.\n"
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
        "6. If multiple scripts are requested, they must also be clearly different from each other.\n"
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
    existing_notes = _build_existing_script_notes(existing_scripts)
    required_tokens = _extract_required_tokens(original_copy)
    required_tokens_line = " / ".join(required_tokens[:12]) if required_tokens else "Keep all explicit dates, names, numbers, and action paths from the source."
    analysis_line = " | ".join(
        part
        for part in [
            f"hook={analysis.get('hook', '')}",
            f"value={analysis.get('value', '')}",
            f"trust={analysis.get('trust', '')}",
            f"cta={analysis.get('cta', '')}",
        ]
        if part.split("=", 1)[1]
    )
    existing_section = f"Existing scripts to avoid repeating:\n{existing_notes}\n\n" if existing_scripts else ""
    return (
        f"Rewrite script {script_index}.\n\n"
        "Output only:\n"
        "<script_title>...</script_title>\n<script_content>...</script_content>\n\n"
        "Hard rules:\n"
        f"- Length between {min_length} and {max_length} Chinese characters.\n"
        f"- Keep about {paragraph_count} paragraphs and the same progression order.\n"
        "- Rewrite deeply. Do not only swap a few words.\n"
        "- Keep the same topic. Do not add new claims.\n"
        "- Keep all dates, names, stage markers, important numbers, and CTA path.\n"
        "- Keep the same hook function and closing function.\n"
        "- Use Simplified Chinese only.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Industry: {industry or 'General'}\n"
        f"Specific need: {needs or 'Keep similar length and structure, rewrite only for deduplication'}\n"
        f"Required anchors to preserve: {required_tokens_line}\n"
        f"Analysis reference: {analysis_line or 'Keep the original hook, value, trust, and CTA functions.'}\n\n"
        f"{existing_section}"
        "Source copy:\n"
        f"{original_copy}"
    )


def build_compact_single_script_prompt(
    *,
    original_copy: str,
    needs: str,
    script_index: int,
    existing_scripts: list[dict[str, str]],
) -> str:
    min_length, max_length = _estimate_length_bounds(original_copy)
    required_tokens = _extract_required_tokens(original_copy)
    required_tokens_line = " / ".join(required_tokens[:10]) if required_tokens else "保留原文中的日期、人名、数字和动作路径。"
    existing_notes = _build_existing_script_notes(existing_scripts)
    existing_section = f"\n避免和已有仿写重复：\n{existing_notes}\n" if existing_scripts else "\n"
    return (
        f"第{script_index}条仿写。\n"
        "只输出最终文案正文，不要标题，不要解释，不要标签。\n"
        "要求：\n"
        f"1. 字数控制在{min_length}-{max_length}字。\n"
        "2. 只做去重改写，不换主题，不新增结论。\n"
        "3. 保持原文的大体段落顺序、钩子作用和收口动作。\n"
        f"4. 必须保留这些锚点：{required_tokens_line}\n"
        "5. 每一段都要重写，不能只改几个词。\n"
        "6. 只用简体中文。\n"
        f"补充需求：{needs or '字数接近，结构一致，只做去重改写。'}\n"
        f"{existing_section}"
        "原文：\n"
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
    required_tokens = _extract_required_tokens(original_copy)
    required_tokens_line = " / ".join(required_tokens[:12]) if required_tokens else "Keep all explicit dates, names, numbers, and action paths from the source."
    existing_section = f"Existing scripts to avoid repeating:\n{existing_notes}\n\n" if existing_scripts else ""
    return (
        f"Refine rewrite script {script_index}.\n\n"
        "Output only:\n"
        "<script_title>...</script_title>\n<script_content>...</script_content>\n\n"
        "Hard rules:\n"
        "- Rewrite only. Do not change the topic or add new claims.\n"
        f"- Keep about {paragraph_count} paragraphs and the same progression order.\n"
        f"- Length between {min_length} and {max_length} Chinese characters.\n"
        "- Keep all dates, names, stage markers, important numbers, and CTA path.\n"
        "- Rewrite deeply. Do not only swap a few words.\n"
        "- Use Simplified Chinese only.\n\n"
        f"User background: {user_background or 'Not provided'}\n"
        f"Extra instruction: {user_instruction}\n"
        f"Required anchors to preserve: {required_tokens_line}\n"
        f"{existing_section}"
        "Source copy:\n"
        f"{original_copy}"
    )


def build_compact_single_refine_script_prompt(
    *,
    original_copy: str,
    user_instruction: str,
    script_index: int,
    existing_scripts: list[dict[str, str]],
) -> str:
    min_length, max_length = _estimate_length_bounds(original_copy)
    required_tokens = _extract_required_tokens(original_copy)
    required_tokens_line = " / ".join(required_tokens[:10]) if required_tokens else "保留原文中的日期、人名、数字和动作路径。"
    existing_notes = _build_existing_script_notes(existing_scripts)
    existing_section = f"\n避免和已有仿写重复：\n{existing_notes}\n" if existing_scripts else "\n"
    return (
        f"第{script_index}条优化仿写。\n"
        "只输出最终文案正文，不要标题，不要解释，不要标签。\n"
        "要求：\n"
        f"1. 字数控制在{min_length}-{max_length}字。\n"
        "2. 只做去重改写，不换主题，不新增结论。\n"
        "3. 保持原文的大体段落顺序和收口动作。\n"
        f"4. 必须保留这些锚点：{required_tokens_line}\n"
        "5. 每一段都要重写，不能只改几个词。\n"
        "6. 只用简体中文。\n"
        f"补充优化要求：{user_instruction}\n"
        f"{existing_section}"
        "原文：\n"
        f"{original_copy}"
    )


def _generate_scripts_sequentially(
    *,
    source_text: str,
    target_count: int,
    prompt_builder: Callable[[int, list[dict[str, str]]], str],
    compact_prompt_builder: Callable[[int, list[dict[str, str]]], str] | None,
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
    request_retry_count = 1
    attempt_limit = 2 if target_count <= 1 else max(2, min(3, target_count + 1))

    for attempt_index in range(attempt_limit):
        if len(scripts) >= target_count:
            break
        use_compact_prompt = compact_prompt_builder is not None and attempt_index > 0
        try:
            raw_text = generate_text_with_anthropic(
                base_url=base_url,
                api_key=api_key,
                model=normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
                system_prompt=build_rewrite_system_prompt(),
                user_prompt=(compact_prompt_builder if use_compact_prompt else prompt_builder)(len(scripts) + 1, [*existing_scripts, *scripts]),
                max_tokens=max(640, min(max_tokens, 1400)) if use_compact_prompt else max_tokens,
                timeout_seconds=_staged_timeout_seconds(timeout_seconds),
                temperature=0,
                retry_count=request_retry_count,
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
    local_analysis = _build_local_analysis(original_copy)
    scripts = _generate_scripts_sequentially(
        source_text=original_copy,
        target_count=script_count,
        prompt_builder=lambda script_index, existing_scripts: build_single_script_prompt(
            original_copy=original_copy,
            industry=industry,
            needs=needs,
            user_background=user_background,
            analysis=local_analysis,
            script_index=script_index,
            existing_scripts=existing_scripts,
        ),
        compact_prompt_builder=lambda script_index, existing_scripts: build_compact_single_script_prompt(
            original_copy=original_copy,
            needs=needs,
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
            "analysis": local_analysis,
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
        compact_prompt_builder=lambda script_index, existing_scripts: build_compact_single_refine_script_prompt(
            original_copy=original_copy,
            user_instruction=user_instruction,
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
