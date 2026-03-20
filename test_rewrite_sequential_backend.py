from __future__ import annotations

from backend.anthropic_client import AnthropicApiError
from backend.rewrite_service import analyze_copy_with_claude, refine_copy_with_claude


def test_analyze_copy_with_claude_falls_back_to_sequential_generation(monkeypatch) -> None:
    responses = iter(
        [
            AnthropicApiError("Claude proxy returned empty output"),
            "<analysis_hook>Hook</analysis_hook><analysis_contrast>Contrast</analysis_contrast><analysis_value>Value</analysis_value><analysis_trust>Trust</analysis_trust><analysis_cta>CTA</analysis_cta><analysis_target_audience>Owners</analysis_target_audience><analysis_selling_points>Efficiency</analysis_selling_points>",
            "<script_title>Script 1</script_title><script_content>This version keeps the same flow while rewriting the wording in a clearly different way.</script_content>",
            "<script_title>Script 2</script_title><script_content>This second version stays on topic and changes the wording across the whole copy.</script_content>",
        ]
    )

    def fake_generate_text_with_anthropic(**_kwargs):
        value = next(responses)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)

    result = analyze_copy_with_claude(
        original_copy="Source hook.\nSource value.\nSource close.",
        industry="AI growth",
        needs="Keep the same structure",
        user_background="We help business owners",
        api_key="test-key",
        base_url="http://proxy.example.com/back",
        model="claude-sonnet-4-6",
        timeout_seconds=20,
    )

    assert result["analysis"]["hook"] == "Hook"
    assert len(result["generatedScripts"]) >= 1


def test_refine_copy_with_claude_falls_back_to_sequential_generation(monkeypatch) -> None:
    responses = iter(
        [
            AnthropicApiError("Claude proxy returned empty output"),
            "<script_title>Refined 1</script_title><script_content>This refined version keeps the sales flow but rewrites the wording from start to end.</script_content>",
            "<script_title>Refined 2</script_title><script_content>This backup refined version stays close in structure while avoiding near-copy phrasing.</script_content>",
        ]
    )

    def fake_generate_text_with_anthropic(**_kwargs):
        value = next(responses)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)

    result = refine_copy_with_claude(
        current_result={
            "originalCopy": "Source hook.\nSource value.\nSource close.",
            "analysis": {},
            "generatedScripts": [],
        },
        user_instruction="Make it sharper",
        user_background="We help business owners",
        api_key="test-key",
        base_url="http://proxy.example.com/back",
        model="claude-sonnet-4-6",
        timeout_seconds=20,
    )

    assert len(result["generatedScripts"]) >= 1


def test_analyze_copy_with_claude_uses_staged_generation_for_long_source(monkeypatch) -> None:
    long_source = "A" * 700
    responses = iter(
        [
            "<analysis_hook>Hook</analysis_hook><analysis_contrast>Contrast</analysis_contrast><analysis_value>Value</analysis_value><analysis_trust>Trust</analysis_trust><analysis_cta>CTA</analysis_cta><analysis_target_audience>Owners</analysis_target_audience><analysis_selling_points>Efficiency</analysis_selling_points>",
            "<script_title>Script 1</script_title><script_content>Completely rewritten long-form copy that stays on topic and keeps a similar overall structure.</script_content>",
        ]
    )

    def fake_generate_text_with_anthropic(**_kwargs):
        return next(responses)

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)

    result = analyze_copy_with_claude(
        original_copy=long_source,
        industry="AI growth",
        needs="Keep the same structure",
        user_background="We help business owners",
        api_key="test-key",
        base_url="http://proxy.example.com/back",
        model="claude-sonnet-4-6",
        timeout_seconds=20,
    )

    assert result["analysis"]["hook"] == "Hook"
    assert len(result["generatedScripts"]) == 1
