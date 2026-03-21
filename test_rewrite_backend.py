from __future__ import annotations

import backend.main as backend_main
import pytest

from backend.qwen_client import QwenApiError
from backend.rewrite_service import (
    build_copy_analysis_prompt,
    build_copy_refine_prompt,
    normalize_copy_analysis_result,
    normalize_copy_refine_result,
)


def test_rewrite_analyze_route_uses_qwen_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "qwenBaseUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setitem(backend_main.CONFIG, "qwenApiKey", "test-key")

    def fake_analyze_copy_with_qwen(**kwargs):
        captured.update(kwargs)
        return {
            "originalCopy": kwargs["original_copy"],
            "analysis": {
                "hook": "Strong opening hook",
                "contrast": "Break old assumptions before offering a new view",
                "value": "Explain why the viewer should act now",
                "trust": "Build confidence with a clear trend judgment",
                "cta": "Guide the viewer to leave a keyword",
                "targetAudience": "Business owners who want content growth",
                "sellingPoints": "AI leverage and efficiency",
            },
            "generatedScripts": [
                {"title": "Script 1", "content": "A rewritten script with the same structure"},
            ],
        }

    monkeypatch.setattr(backend_main, "analyze_copy_with_qwen", fake_analyze_copy_with_qwen)

    response = client.post(
        "/api/rewrite/analyze",
        json={
            "originalCopy": "Paragraph one.\nParagraph two.",
            "industry": "AI growth",
            "needs": "Keep the length close and the structure locked.",
            "userBackground": "We help local business owners",
            "model": "qwen-plus",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["originalCopy"] == "Paragraph one.\nParagraph two."
    assert data["generatedScripts"][0]["title"] == "Script 1"
    assert captured["industry"] == "AI growth"
    assert captured["needs"] == "Keep the length close and the structure locked."
    assert captured["user_background"] == "We help local business owners"
    assert captured["model"] == "qwen-plus"


def test_rewrite_refine_route_uses_qwen_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "qwenBaseUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setitem(backend_main.CONFIG, "qwenApiKey", "test-key")

    def fake_refine_copy_with_qwen(**kwargs):
        captured.update(kwargs)
        return {
            "generatedScripts": [
                {"title": "Refined Script 1", "content": "Keep the same structure and a close length."},
                {"title": "Refined Script 2", "content": "Rewrite only for deduplication."},
            ]
        }

    monkeypatch.setattr(backend_main, "refine_copy_with_qwen", fake_refine_copy_with_qwen)

    response = client.post(
        "/api/rewrite/refine",
        json={
            "currentResult": {
                "originalCopy": "Source copy content",
                "analysis": {
                    "hook": "Hook",
                    "contrast": "Contrast",
                    "value": "Value",
                    "trust": "Trust",
                    "cta": "CTA",
                    "targetAudience": "Owners",
                    "sellingPoints": "Selling points",
                },
                "generatedScripts": [],
            },
            "userInstruction": "Make the tone stronger but keep the same structure.",
            "userBackground": "We help local business owners",
            "model": "qwen-plus",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["generatedScripts"]) == 2
    assert captured["user_instruction"] == "Make the tone stronger but keep the same structure."
    assert captured["user_background"] == "We help local business owners"
    assert captured["model"] == "qwen-plus"


def test_rewrite_prompts_lock_length_and_structure() -> None:
    original_copy = "Paragraph one explains the problem.\nParagraph two turns the argument.\nParagraph three closes the pitch."
    current_result = {
        "originalCopy": original_copy,
        "analysis": {},
        "generatedScripts": [],
    }

    analyze_prompt = build_copy_analysis_prompt(
        original_copy=original_copy,
        industry="AI growth",
        needs="Fit for avatar video delivery",
        user_background="We help local business owners",
    )
    refine_prompt = build_copy_refine_prompt(
        current_result=current_result,
        user_instruction="Keep the length close",
        user_background="We help local business owners",
    )

    assert "Keep the total length close to the source" in analyze_prompt
    assert "Lock the viral structure" in analyze_prompt
    assert "Rewrite only" in analyze_prompt
    assert "The rewritten scripts must be in Simplified Chinese." in analyze_prompt
    assert "Keep the same viral structure" in refine_prompt
    assert "Rewrite only" in refine_prompt


def test_rewrite_validation_rejects_near_copy_output() -> None:
    original_copy = "Will you use AI to do the content work, or will you still stay in the old path?"

    with pytest.raises(QwenApiError):
        normalize_copy_analysis_result(
            {
                "analysis": {},
                "generatedScripts": [
                    {"title": "Script 1", "content": original_copy},
                    {"title": "Script 2", "content": original_copy + " Right now."},
                ],
            },
            original_copy=original_copy,
        )


def test_rewrite_validation_keeps_first_when_peer_duplicates_exist(monkeypatch) -> None:
    original_copy = "This is the source copy about AI leverage and faster content output."
    monkeypatch.setattr("backend.rewrite_service._validate_candidate_against_source", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("backend.rewrite_service._too_close_to_source", lambda *_args, **_kwargs: False)
    result = normalize_copy_refine_result(
        {
            "generatedScripts": [
                {"title": "Script 1", "content": "AI leverage is the real divider, not whether you have only heard about AI."},
                {"title": "Script 2", "content": "AI leverage is the real divider, not whether you have only heard about AI tools."},
            ],
        },
        original_copy=original_copy,
    )

    assert len(result["generatedScripts"]) == 1
    assert result["generatedScripts"][0]["title"] == "Script 1"
