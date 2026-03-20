from __future__ import annotations

import re
from typing import Any

from backend.anthropic_client import (
    AnthropicApiError,
    DEFAULT_ANTHROPIC_MODEL,
    generate_text_with_anthropic,
    normalize_anthropic_model_name,
)
from backend.platform_utils import clean_text
from backend.rewrite_service import normalize_multiline_text

BUSINESS_TERMS = (
    "\u0041\u0049\u83b7\u5ba2",
    "\u6570\u5b57\u8d44\u4ea7",
    "\u6570\u5b57\u4eba",
    "\u79c1\u57df",
    "\u6d41\u91cf",
    "\u83b7\u5ba2",
    "\u5185\u5bb9\u589e\u957f",
    "\u4f01\u4e1a\u589e\u957f",
    "\u8001\u677f\u589e\u957f",
)
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
    "\u53d1\u6d88\u606f",
    "\u70b9\u5f00",
)
HARD_TOKEN_PATTERN = re.compile(
    r"(?:\d{4}\u5e74|\d+(?:\.\d+)?%?|\d+(?:\.\d+)?(?:\u4e07|\u4ebf|\u5143|\u5757|\u500d|\u5929|\u4e2a\u6708|\u6708|\u5e74|\u5c0f\u65f6|\u5206\u949f)|[一二三四五六七八九十百千万两零半]+(?:\u5e74|\u4e2a\u6708|\u6708|\u5929|\u6b21|\u4e2a|\u6761|\u500d|\u4e07|\u4ebf|\u5143|\u5757|\u5c0f\u65f6|\u5206\u949f|\u6210|%))"
)
ENGLISH_TOKEN_PATTERN = re.compile(r"\b[A-Za-z]{2,}(?:[-_][A-Za-z0-9]+)*\b")
BASELINE_PUNCT_PATTERN = re.compile(r"[\u3002\uff0c\uff1f\uff01!?\uff1b;\u3001,:\uff1a\"'\u201c\u201d\u2018\u2019()\uff08\uff09\u3010\u3011\u300a\u300b<>]")


def _normalized_term_text(value: Any) -> str:
    return normalize_multiline_text(value).lower()


def _normalize_baseline(text: str) -> str:
    return BASELINE_PUNCT_PATTERN.sub("", _normalized_term_text(text))


def _count_sentences(text: str) -> int:
    parts = re.split(r"[\u3002\uff01\uff1f!?;\uff1b\n]", normalize_multiline_text(text))
    return len([item for item in parts if item.strip()])


def _extract_protected_tokens(text: str) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for token in [*(HARD_TOKEN_PATTERN.findall(text or "")), *(ENGLISH_TOKEN_PATTERN.findall(text or ""))]:
        cleaned = str(token or "").strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        ordered.append(cleaned)
    return ordered


def _extract_present_terms(text: str, terms: tuple[str, ...]) -> list[str]:
    normalized = _normalized_term_text(text)
    return [term for term in terms if term.lower() in normalized]


def _extract_keywords(text: str) -> list[str]:
    return [item for item in re.split(r"[^a-z0-9\u4e00-\u9fff]+", _normalized_term_text(text)) if len(item) >= 2]


def _overlap_score(left: str, right: str) -> int:
    left_set = set(_extract_keywords(left))
    right_set = set(_extract_keywords(right))
    if not left_set or not right_set:
        return 0
    return sum(1 for item in left_set if item in right_set)


def _get_length_bounds(section_type: str, before_length: int) -> tuple[int, int]:
    tight_block = section_type in {"A", "B", "C", "K", "L"}
    ratio_min = 0.84 if tight_block else 0.76
    ratio_max = 1.16 if tight_block else 1.24
    min_length = max(8, int(before_length * ratio_min))
    max_length = max(min_length + 2, int(before_length * ratio_max))
    return (min_length, max_length)


def _block_guard_rule(block: dict[str, Any]) -> str:
    section_type = str(block.get("sectionType") or "")
    if section_type == "A":
        return "\u5fc5\u987b\u4fdd\u4f4f\u5f00\u5934\u7206\u70b9\u548c\u6293\u505c\u529b\uff0c\u4e0d\u80fd\u628a\u53e5\u5b50\u6d17\u8f6f\u3002"
    if section_type in {"K", "L"}:
        return "\u53ea\u5141\u8bb8\u53bb\u91cd\u8868\u8fbe\uff0c\u52a8\u4f5c\u65b9\u5f0f\u3001\u627f\u63a5\u8def\u5f84\u548c\u5165\u53e3\u4e0d\u80fd\u6539\u3002"
    if section_type in {"B", "C"}:
        return "\u4fdd\u4f4f\u94a9\u5b50\u6216\u52a8\u4f5c\u529f\u80fd\uff0c\u4e0d\u80fd\u6539\u6210\u522b\u7684\u7ed3\u6784\u4f4d\u3002"
    return "\u4fdd\u7559\u6838\u5fc3\u547d\u9898\u3001\u4e8b\u5b9e\u3001\u6570\u5b57\u548c\u903b\u8f91\u987a\u5e8f\uff0c\u53ea\u964d\u4f4e\u91cd\u590d\u5ea6\u3002"


def _build_constraint_lines(block: dict[str, Any]) -> list[str]:
    before = normalize_multiline_text(block.get("content"))
    protected_tokens = _extract_protected_tokens(before)[:8]
    lines = [
        f"Original length: about {len(before)} Chinese characters.",
        f"Original sentence count: about {_count_sentences(before)}.",
        f"Guard rule: {_block_guard_rule(block)}",
    ]
    if protected_tokens:
        lines.append(f"Required tokens to preserve: {' / '.join(protected_tokens)}")
    action_terms = _extract_present_terms(before, ACTION_TERMS)
    if action_terms:
        lines.append(f"Action terms that must stay: {' / '.join(action_terms)}")
    return lines


def _extract_tag_content(text: str, tag: str) -> str:
    match = re.search(rf"<{tag}>\s*(.*?)\s*</{tag}>", text or "", flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    return normalize_multiline_text(match.group(1))


def _max_tokens_for_block(text: str) -> int:
    length = max(1, len(normalize_multiline_text(text)))
    return max(420, min(1600, 220 + length * 2))


def _request_timeout_seconds(timeout_seconds: float) -> float:
    return max(15, min(timeout_seconds, 16))


def _build_single_block_prompt(theme: str, block: dict[str, Any], rejection_note: str = "") -> str:
    content = normalize_multiline_text(block.get("content"))
    section_type = str(block.get("sectionType") or "")
    title = clean_text(block.get("title"))
    min_length, max_length = _get_length_bounds(section_type, len(content))
    sentence_count = _count_sentences(content)
    lines = [
        "Rewrite exactly one short-video compose block for deduplication.",
        "",
        "Hard rules:",
        "1. Keep the same topic, facts, numbers, names, platform names, and action path.",
        "2. Keep the same block function and the same progression purpose.",
        f"3. Keep the length close to the source, between {min_length} and {max_length} Chinese characters.",
        f"4. Keep the sentence count close to the source, around {sentence_count}.",
        "5. Every sentence must be substantially rewritten. Do not just replace a few words.",
        "6. Do not add new business offers, new promises, or new action entrances.",
        "7. Use Simplified Chinese only.",
        "8. Output only <rewritten_content>...</rewritten_content>.",
        "",
        f"Theme: {theme or 'General'}",
        f"Slot key: {block.get('slotKey') or ''}",
        f"Section type: {section_type}",
        f"Title: {title or 'Compose block'}",
        *_build_constraint_lines(block),
    ]
    if rejection_note:
        lines.extend(["", f"Previous draft was rejected because: {rejection_note}", "Rewrite it again and fix that issue."])
    lines.extend(["", "Source block:", content, "", "Required output:", "<rewritten_content>...</rewritten_content>"])
    return "\n".join(lines)


def _evaluate_candidate(block: dict[str, Any], candidate: str) -> dict[str, Any]:
    before = normalize_multiline_text(block.get("content"))
    after = normalize_multiline_text(candidate)
    before_length = len(before)
    after_length = len(after)
    length_delta = after_length - before_length
    similarity_score = _overlap_score(before, after)
    section_type = str(block.get("sectionType") or "")

    if not after:
        return {
            "accepted": False,
            "verdict": "watch",
            "note": "\u53bb\u91cd\u7ed3\u679c\u4e3a\u7a7a\uff0c\u5df2\u4fdd\u7559\u539f\u6587\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    if _normalize_baseline(before) == _normalize_baseline(after):
        return {
            "accepted": False,
            "verdict": "watch",
            "note": "\u6539\u5199\u548c\u539f\u6587\u51e0\u4e4e\u4e00\u6837\uff0c\u7b49\u4e8e\u6ca1\u53bb\u91cd\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    min_length, max_length = _get_length_bounds(section_type, before_length)
    if after_length < int(min_length * 0.7) or after_length > int(max_length * 1.4):
        return {
            "accepted": False,
            "verdict": "watch",
            "note": f"\u5b57\u6570\u53d8\u5316\u8fc7\u5927\uff0c\u539f\u6587\u7ea6 {before_length} \u5b57\uff0c\u5f53\u524d\u7ea6 {after_length} \u5b57\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    after_normalized = _normalized_term_text(after)
    missing_hard_tokens = [token for token in _extract_protected_tokens(before) if _normalized_term_text(token) not in after_normalized]
    if missing_hard_tokens:
        joined_tokens = "\u3001".join(missing_hard_tokens[:3])
        return {
            "accepted": False,
            "verdict": "watch",
            "note": f"\u5173\u952e\u6570\u5b57\u6216\u786c\u4fe1\u606f\u4e22\u4e86\uff1a{joined_tokens}\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    before_business_terms = _extract_present_terms(before, BUSINESS_TERMS)
    after_business_terms = _extract_present_terms(after, BUSINESS_TERMS)
    injected_business_terms = [term for term in after_business_terms if term not in before_business_terms]
    if not before_business_terms and injected_business_terms:
        joined_terms = "\u3001".join(injected_business_terms[:3])
        return {
            "accepted": False,
            "verdict": "watch",
            "note": f"\u6539\u5199\u91cc\u65b0\u585e\u8fdb\u4e86\u4e1a\u52a1\u8bcd\uff1a{joined_terms}\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    before_action_terms = _extract_present_terms(before, ACTION_TERMS)
    missing_action_terms = [term for term in before_action_terms if term.lower() not in after_normalized]
    if section_type in {"K", "L"} and missing_action_terms:
        joined_actions = "\u3001".join(missing_action_terms[:3])
        return {
            "accepted": False,
            "verdict": "watch",
            "note": f"\u5173\u952e\u52a8\u4f5c\u6216\u5165\u53e3\u4e22\u4e86\uff1a{joined_actions}\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    before_sentence_count = _count_sentences(before)
    after_sentence_count = _count_sentences(after)
    max_sentence_delta = 1 if section_type in {"A", "B", "C", "K", "L"} else 2
    if abs(before_sentence_count - after_sentence_count) > max_sentence_delta:
        return {
            "accepted": False,
            "verdict": "watch",
            "note": f"\u53e5\u6570\u53d8\u5316\u592a\u5927\uff0c\u539f\u6587\u7ea6 {before_sentence_count} \u53e5\uff0c\u5f53\u524d\u7ea6 {after_sentence_count} \u53e5\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    if re.search(r"[\uff1f?]", before) and not re.search(r"[\uff1f?]", after) and section_type in {"A", "B", "C"}:
        return {
            "accepted": False,
            "verdict": "watch",
            "note": "\u539f\u6587\u662f\u7591\u95ee\u5f0f\u6293\u505c\uff0c\u6539\u5199\u540e\u628a\u95ee\u611f\u6d17\u6389\u4e86\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    min_overlap = 1 if before_length >= 48 else 0
    if similarity_score < min_overlap:
        return {
            "accepted": False,
            "verdict": "watch",
            "note": "\u6539\u5199\u504f\u79bb\u539f\u6587\u8fc7\u5927\uff0c\u6838\u5fc3\u7206\u70b9\u6216\u8bba\u8bc1\u65b9\u5411\u4e0d\u591f\u50cf\u3002",
            "beforeLength": before_length,
            "afterLength": after_length,
            "lengthDelta": length_delta,
            "similarityScore": similarity_score,
        }

    stable = abs(length_delta) <= max(4, round(before_length * 0.08)) and abs(before_sentence_count - after_sentence_count) <= 1
    return {
        "accepted": True,
        "verdict": "stable" if stable else "watch",
        "note": (
            "\u6838\u5fc3\u7206\u70b9\u3001\u957f\u5ea6\u611f\u548c\u53e5\u5f0f\u8282\u594f\u57fa\u672c\u4fdd\u4f4f\u4e86\u3002"
            if stable
            else "\u6838\u5fc3\u70b9\u8fd8\u5728\uff0c\u4f46\u5b57\u6570\u6216\u53e5\u5f0f\u53d8\u5316\u7a0d\u5927\uff0c\u5efa\u8bae\u5bf9\u7167\u539f\u6587\u590d\u6838\u3002"
        ),
        "beforeLength": before_length,
        "afterLength": after_length,
        "lengthDelta": length_delta,
        "similarityScore": similarity_score,
    }


def _build_comparison_item(block: dict[str, Any], next_content: str, audit: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(block.get("id") or ""),
        "slotKey": str(block.get("slotKey") or ""),
        "title": clean_text(block.get("title")) or "\u6587\u6848\u7247\u6bb5",
        "before": normalize_multiline_text(block.get("content")),
        "after": next_content,
        "beforeLength": int(audit.get("beforeLength") or 0),
        "afterLength": int(audit.get("afterLength") or 0),
        "lengthDelta": int(audit.get("lengthDelta") or 0),
        "similarityScore": int(audit.get("similarityScore") or 0),
        "verdict": str(audit.get("verdict") or "watch"),
        "note": str(audit.get("note") or ""),
    }


def _normalize_block_payload(block: Any) -> dict[str, Any]:
    if not isinstance(block, dict):
        raise ValueError("compose block must be an object")
    block_id = clean_text(block.get("id"))
    content = normalize_multiline_text(block.get("content"))
    if not block_id:
        raise ValueError("compose block id is required")
    if not content:
        raise ValueError("compose block content is required")
    return {
        **block,
        "id": block_id,
        "slotKey": clean_text(block.get("slotKey")),
        "sectionType": clean_text(block.get("sectionType")).upper(),
        "title": clean_text(block.get("title")),
        "content": content,
    }


def _dedupe_single_block_with_claude(
    *,
    theme: str,
    block: dict[str, Any],
    api_key: str,
    base_url: str,
    model: str | None,
    timeout_seconds: float,
    max_attempts: int = 1,
) -> dict[str, Any]:
    rejection_note = ""
    last_error: AnthropicApiError | None = None

    for _attempt in range(max(1, max_attempts)):
        try:
            raw_text = generate_text_with_anthropic(
                base_url=base_url,
                api_key=api_key,
                model=normalize_anthropic_model_name(model, DEFAULT_ANTHROPIC_MODEL),
                system_prompt=(
                    "You are a short-video compose-block rewrite engine. "
                    "Rewrite exactly one block. "
                    "Return plain text only with the exact tag requested by the user. "
                    "Do not explain. Do not introduce yourself. "
                    "Use Simplified Chinese only unless the source already contains English tokens."
                ),
                user_prompt=_build_single_block_prompt(theme, block, rejection_note),
                max_tokens=_max_tokens_for_block(str(block.get("content") or "")),
                timeout_seconds=_request_timeout_seconds(timeout_seconds),
                temperature=0,
                retry_count=1,
            )
        except AnthropicApiError as exc:
            last_error = exc
            rejection_note = str(exc)
            continue

        candidate = _extract_tag_content(raw_text, "rewritten_content") or normalize_multiline_text(raw_text)
        audit = _evaluate_candidate(block, candidate)
        if audit["accepted"] and candidate != normalize_multiline_text(block.get("content")):
            return {
                "block": {**block, "content": candidate},
                "changed": True,
                "comparison": _build_comparison_item(block, candidate, audit),
            }
        rejection_note = str(audit["note"])

    if last_error is not None and not rejection_note:
        rejection_note = str(last_error)
    return {
        "block": block,
        "changed": False,
        "comparison": None,
        "note": rejection_note or "\u53bb\u91cd\u7ed3\u679c\u4e0d\u53ef\u7528\uff0c\u5df2\u4fdd\u7559\u539f\u6587\u3002",
        "apiError": str(last_error) if last_error is not None else "",
    }


def _build_result_warning(*, changed_count: int, guarded_count: int, error_count: int) -> str | None:
    if error_count > 0 and changed_count > 0:
        return f"\u5176\u4e2d {error_count} \u6bb5 Claude \u8fd4\u56de\u4e0d\u7a33\u5b9a\uff0c\u5df2\u4fdd\u7559\u539f\u6587\u3002"
    if guarded_count > 0 and changed_count > 0:
        return f"\u5176\u4e2d {guarded_count} \u6bb5\u672a\u901a\u8fc7\u4fdd\u771f\u6821\u9a8c\uff0c\u5df2\u4fdd\u7559\u539f\u6587\u3002"
    if error_count > 0:
        return "\u0043laude \u672c\u6b21\u6ca1\u6709\u8fd4\u56de\u53ef\u7528\u7684\u53bb\u91cd\u7ed3\u679c\uff0c\u8bf7\u91cd\u8bd5\u3002"
    if guarded_count > 0:
        return "\u53bb\u91cd\u7ed3\u679c\u548c\u539f\u6587\u8fc7\u4e8e\u63a5\u8fd1\u6216\u504f\u79bb\u8fc7\u5927\uff0c\u5df2\u4fdd\u7559\u539f\u6587\u3002"
    return None


def dedupe_compose_blocks_with_claude(
    *,
    theme: str,
    blocks: list[Any],
    block_ids: list[Any],
    api_key: str,
    base_url: str,
    model: str | None = None,
    timeout_seconds: float = 60,
) -> dict[str, Any]:
    normalized_blocks = [_normalize_block_payload(item) for item in blocks]
    selected_ids = {clean_text(item) for item in block_ids if clean_text(item)}
    if not selected_ids:
        return {
            "blocks": normalized_blocks,
            "changed": False,
            "warning": "\u6ca1\u6709\u9009\u4e2d\u53ef\u53bb\u91cd\u7684\u677f\u5757\u3002",
            "comparisons": [],
        }

    next_blocks = [dict(item) for item in normalized_blocks]
    comparisons: list[dict[str, Any]] = []
    changed_count = 0
    guarded_count = 0
    error_count = 0
    last_api_error = ""
    selected_count = sum(1 for item in normalized_blocks if item["id"] in selected_ids)
    per_block_timeout = 16 if selected_count <= 1 else 15
    max_attempts = 2 if selected_count <= 1 else 1

    for index, block in enumerate(normalized_blocks):
        if block["id"] not in selected_ids:
            continue
        resolved = _dedupe_single_block_with_claude(
            theme=theme,
            block=block,
            api_key=api_key,
            base_url=base_url,
            model=model,
            timeout_seconds=min(timeout_seconds, per_block_timeout),
            max_attempts=max_attempts,
        )
        next_blocks[index] = resolved["block"]
        if resolved.get("changed"):
            changed_count += 1
            comparison = resolved.get("comparison")
            if isinstance(comparison, dict):
                comparisons.append(comparison)
            continue
        if resolved.get("apiError"):
            error_count += 1
            last_api_error = str(resolved.get("apiError") or last_api_error)
        else:
            guarded_count += 1

    if changed_count == 0 and error_count > 0 and guarded_count == 0 and last_api_error:
        raise AnthropicApiError(last_api_error)

    return {
        "blocks": next_blocks,
        "changed": changed_count > 0,
        "warning": _build_result_warning(changed_count=changed_count, guarded_count=guarded_count, error_count=error_count),
        "comparisons": comparisons,
    }
