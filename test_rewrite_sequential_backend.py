from __future__ import annotations

from backend.anthropic_client import AnthropicApiError
from backend.rewrite_service import analyze_copy_with_claude, refine_copy_with_claude


def test_analyze_copy_with_claude_falls_back_to_sequential_generation(monkeypatch) -> None:
    responses = iter(
        [
            "<script_title>Script 1</script_title><script_content>This version rewrites the opening, middle, and close while staying on the same topic.</script_content>",
            "<script_title>Script 2</script_title><script_content>This second version keeps the same sales flow but changes the wording throughout.</script_content>",
        ]
    )

    def fake_generate_text_with_anthropic(**_kwargs):
        value = next(responses)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

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

    assert result["analysis"]["hook"]
    assert len(result["generatedScripts"]) == 1


def test_refine_copy_with_claude_falls_back_to_sequential_generation(monkeypatch) -> None:
    responses = iter(
        [
            "<script_title>Refined 1</script_title><script_content>This refined version keeps the same structure and fully rewrites the phrasing.</script_content>",
            "<script_title>Refined 2</script_title><script_content>This backup version stays close in structure while avoiding near-copy wording.</script_content>",
        ]
    )

    def fake_generate_text_with_anthropic(**_kwargs):
        value = next(responses)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

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

    assert len(result["generatedScripts"]) == 1


def test_analyze_copy_with_claude_uses_local_analysis_for_long_source(monkeypatch) -> None:
    long_source = "A" * 700

    def fake_generate_text_with_anthropic(**_kwargs):
        return "<script_title>Script 1</script_title><script_content>" + ("B" * 700) + "</script_content>"

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

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

    assert result["analysis"]["hook"]
    assert len(result["generatedScripts"]) == 1


def test_analyze_copy_with_claude_accepts_plain_text_fallback(monkeypatch) -> None:
    def fake_generate_text_with_anthropic(**_kwargs):
        return "This is a direct plain-text rewrite result that keeps the same topic and keeps the call to action."

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

    result = analyze_copy_with_claude(
        original_copy="March 14 to March 17. Keep the same topic and keep the CTA path.",
        industry="AI growth",
        needs="Keep the same structure",
        user_background="We help business owners",
        api_key="test-key",
        base_url="http://proxy.example.com/back",
        model="claude-sonnet-4-6",
        timeout_seconds=20,
    )

    assert len(result["generatedScripts"]) == 1
    assert result["generatedScripts"][0]["content"].startswith("This is a direct plain-text rewrite result")


def test_analyze_copy_with_claude_uses_compact_prompt_after_empty_response(monkeypatch) -> None:
    captured_prompts: list[str] = []
    responses = iter(
        [
            AnthropicApiError("Claude returned empty content, please retry."),
            "Compact fallback rewrite content with the same structure and a different wording path.",
        ]
    )

    def fake_generate_text_with_anthropic(**kwargs):
        captured_prompts.append(kwargs["user_prompt"])
        value = next(responses)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

    result = analyze_copy_with_claude(
        original_copy="March 14 to March 17. Keep the same topic and keep the CTA path.",
        industry="AI growth",
        needs="Keep the same structure",
        user_background="We help business owners",
        api_key="test-key",
        base_url="http://proxy.example.com/back",
        model="claude-sonnet-4-6",
        timeout_seconds=20,
    )

    assert len(result["generatedScripts"]) == 1
    assert len(captured_prompts) == 2
    assert "Output only:" in captured_prompts[0]
    assert "Output only:" not in captured_prompts[1]
    assert len(captured_prompts[1]) < len(captured_prompts[0])
