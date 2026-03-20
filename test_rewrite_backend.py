from __future__ import annotations

import backend.main as backend_main
import pytest

from backend.anthropic_client import AnthropicApiError
from backend.rewrite_service import (
    build_copy_analysis_prompt,
    build_copy_refine_prompt,
    normalize_copy_analysis_result,
    normalize_copy_refine_result,
)


def test_rewrite_analyze_route_uses_claude_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "anthropicBaseUrl", "http://proxy.example.com/back")
    monkeypatch.setitem(backend_main.CONFIG, "anthropicApiKey", "test-key")

    def fake_analyze_copy_with_claude(**kwargs):
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

    monkeypatch.setattr(backend_main, "analyze_copy_with_claude", fake_analyze_copy_with_claude)

    response = client.post(
        "/api/rewrite/analyze",
        json={
            "originalCopy": "Paragraph one.\nParagraph two.",
            "industry": "AI growth",
            "needs": "Keep the length close and the structure locked.",
            "userBackground": "We help local business owners",
            "model": "claude-sonnet-4-6",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["originalCopy"] == "Paragraph one.\nParagraph two."
    assert data["generatedScripts"][0]["title"] == "Script 1"
    assert captured["industry"] == "AI growth"
    assert captured["needs"] == "Keep the length close and the structure locked."
    assert captured["user_background"] == "We help local business owners"
    assert captured["model"] == "claude-sonnet-4-6"


def test_rewrite_refine_route_uses_claude_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "anthropicBaseUrl", "http://proxy.example.com/back")
    monkeypatch.setitem(backend_main.CONFIG, "anthropicApiKey", "test-key")

    def fake_refine_copy_with_claude(**kwargs):
        captured.update(kwargs)
        return {
            "generatedScripts": [
                {"title": "Refined Script 1", "content": "Keep the same structure and a close length."},
                {"title": "Refined Script 2", "content": "Rewrite only for deduplication."},
            ]
        }

    monkeypatch.setattr(backend_main, "refine_copy_with_claude", fake_refine_copy_with_claude)

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
            "model": "sonnet-4.6",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["generatedScripts"]) == 2
    assert captured["user_instruction"] == "Make the tone stronger but keep the same structure."
    assert captured["user_background"] == "We help local business owners"
    assert captured["model"] == "claude-sonnet-4-6"


def test_rewrite_route_normalizes_sonnet_alias(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "anthropicBaseUrl", "http://proxy.example.com/back")
    monkeypatch.setitem(backend_main.CONFIG, "anthropicApiKey", "test-key")

    def fake_analyze_copy_with_claude(**kwargs):
        captured.update(kwargs)
        return {
            "originalCopy": kwargs["original_copy"],
            "analysis": {},
            "generatedScripts": [{"title": "Script 1", "content": "Rewrite only output"}],
        }

    monkeypatch.setattr(backend_main, "analyze_copy_with_claude", fake_analyze_copy_with_claude)

    response = client.post(
        "/api/rewrite/analyze",
        json={
            "originalCopy": "Source copy content",
            "industry": "AI growth",
            "needs": "Keep the length close",
            "userBackground": "We help local business owners",
            "model": "claude-sonnet-4.6",
        },
    )

    assert response.status_code == 200
    assert captured["model"] == "claude-sonnet-4-6"


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
    original_copy = "现在真正拉开差距的，不是你懂不懂AI，而是你会不会用AI帮你做内容拿结果。"
    with pytest.raises(AnthropicApiError):
        normalize_copy_analysis_result(
            {
                "analysis": {},
                "generatedScripts": [
                    {"title": "Script 1", "content": "现在真正拉开差距的，不是你懂不懂AI，而是你会不会用AI帮你做内容拿结果。"},
                    {"title": "Script 2", "content": "现在真正拉开差距的，不是你懂不懂AI，而是你会不会用AI帮你做内容并拿到结果。"},
                ],
            },
            original_copy=original_copy,
        )


def test_rewrite_validation_keeps_first_when_peer_duplicates_exist(monkeypatch) -> None:
    original_copy = "现在真正拉开差距的，不是你懂不懂AI，而是你会不会用AI帮你做内容拿结果。"
    monkeypatch.setattr("backend.rewrite_service._validate_candidate_against_source", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("backend.rewrite_service._too_close_to_source", lambda *_args, **_kwargs: False)
    result = normalize_copy_refine_result(
        {
            "generatedScripts": [
                {"title": "Script 1", "content": "真正拉开差距的，不是你知不知道AI，而是你敢不敢让AI替你做内容并拿结果。"},
                {"title": "Script 2", "content": "真正拉开差距的，不是你知不知道AI，而是你敢不敢让AI替你做内容并持续拿结果。"},
            ],
        },
        original_copy=original_copy,
    )

    assert len(result["generatedScripts"]) == 1
    assert result["generatedScripts"][0]["title"] == "Script 1"
