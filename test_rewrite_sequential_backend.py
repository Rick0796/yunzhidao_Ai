from __future__ import annotations

from backend.qwen_client import QwenApiError
from backend.rewrite_service import analyze_copy_with_qwen, refine_copy_with_qwen


def test_analyze_copy_with_qwen_falls_back_to_sequential_generation(monkeypatch) -> None:
    responses = iter(
        [
            "<script_title>Script 1</script_title><script_content>This version rewrites the opening, middle, and close while staying on the same topic.</script_content>",
            "<script_title>Script 2</script_title><script_content>This second version keeps the same sales flow but changes the wording throughout.</script_content>",
        ]
    )

    def fake_generate_text_with_qwen(**_kwargs):
        value = next(responses)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_qwen", fake_generate_text_with_qwen)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)
    monkeypatch.setattr("backend.rewrite_service._validate_chunk_line", lambda *_args, **_kwargs: None)

    result = analyze_copy_with_qwen(
        original_copy="Source hook.\nSource value.\nSource close.",
        industry="AI growth",
        needs="Keep the same structure",
        user_background="We help business owners",
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
        timeout_seconds=20,
    )

    assert result["analysis"]["hook"]
    assert len(result["generatedScripts"]) == 1


def test_refine_copy_with_qwen_falls_back_to_sequential_generation(monkeypatch) -> None:
    responses = iter(
        [
            "<script_title>Refined 1</script_title><script_content>This refined version keeps the same structure and fully rewrites the phrasing.</script_content>",
            "<script_title>Refined 2</script_title><script_content>This backup version stays close in structure while avoiding near-copy wording.</script_content>",
        ]
    )

    def fake_generate_text_with_qwen(**_kwargs):
        value = next(responses)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_qwen", fake_generate_text_with_qwen)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

    result = refine_copy_with_qwen(
        current_result={
            "originalCopy": "Source hook.\nSource value.\nSource close.",
            "analysis": {},
            "generatedScripts": [],
        },
        user_instruction="Make it sharper",
        user_background="We help business owners",
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
        timeout_seconds=20,
    )

    assert len(result["generatedScripts"]) == 1


def test_analyze_copy_with_qwen_uses_local_analysis_for_long_source(monkeypatch) -> None:
    long_source = "A" * 700

    def fake_generate_text_with_qwen(**_kwargs):
        return "<script_title>Script 1</script_title><script_content>" + ("B" * 700) + "</script_content>"

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_qwen", fake_generate_text_with_qwen)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)
    monkeypatch.setattr("backend.rewrite_service._validate_chunk_line", lambda *_args, **_kwargs: None)

    result = analyze_copy_with_qwen(
        original_copy=long_source,
        industry="AI growth",
        needs="Keep the same structure",
        user_background="We help business owners",
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
        timeout_seconds=20,
    )

    assert result["analysis"]["hook"]
    assert len(result["generatedScripts"]) == 1


def test_analyze_copy_with_qwen_accepts_plain_text_fallback(monkeypatch) -> None:
    def fake_generate_text_with_qwen(**_kwargs):
        return "This is a direct plain-text rewrite result that keeps the same topic and keeps the call to action."

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_qwen", fake_generate_text_with_qwen)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

    result = analyze_copy_with_qwen(
        original_copy="March 14 to March 17. Keep the same topic and keep the CTA path.",
        industry="AI growth",
        needs="Keep the same structure",
        user_background="We help business owners",
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
        timeout_seconds=20,
    )

    assert len(result["generatedScripts"]) == 1
    assert result["generatedScripts"][0]["content"].startswith("This is a direct plain-text rewrite result")


def test_analyze_copy_with_qwen_uses_compact_prompt_after_empty_response(monkeypatch) -> None:
    captured_prompts: list[str] = []
    responses = iter(
        [
            QwenApiError("Qwen returned empty content, please retry."),
            "Compact fallback rewrite content with the same structure and a different wording path.",
        ]
    )

    def fake_generate_text_with_qwen(**kwargs):
        captured_prompts.append(kwargs["user_prompt"])
        value = next(responses)
        if isinstance(value, Exception):
            raise value
        return value

    monkeypatch.setattr("backend.rewrite_service.generate_text_with_qwen", fake_generate_text_with_qwen)
    monkeypatch.setattr("backend.rewrite_service._is_usable_script", lambda *_args, **_kwargs: True)
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

    result = analyze_copy_with_qwen(
        original_copy="March 14 to March 17. Keep the same topic and keep the CTA path.",
        industry="AI growth",
        needs="Keep the same structure",
        user_background="We help business owners",
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
        timeout_seconds=20,
    )

    assert len(result["generatedScripts"]) == 1
    assert len(captured_prompts) == 2
    assert "Output only:" in captured_prompts[0]
    assert "Output only:" not in captured_prompts[1]
    assert len(captured_prompts[1]) < len(captured_prompts[0])


def test_analyze_copy_with_qwen_falls_back_to_chunk_rewrite(monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.rewrite_service._generate_scripts_sequentially",
        lambda **_kwargs: (_ for _ in ()).throw(QwenApiError("Qwen returned empty content, please retry.")),
    )
    monkeypatch.setattr(
        "backend.rewrite_service._generate_chunked_script_with_qwen",
        lambda **_kwargs: [{"title": "Script 1", "content": "3月14日到3月17日，这几天也许会有一些特别的惊喜，正悄悄朝你靠近。"}],
    )
    monkeypatch.setattr("backend.rewrite_service._filter_rewrite_scripts", lambda scripts, **_kwargs: scripts)

    result = analyze_copy_with_qwen(
        original_copy="3月14日到3月17日，这四天或许会有一些特别的惊喜悄悄来到你家。",
        industry="AI growth",
        needs="字数相近，结构一致，只做去重和改写",
        user_background="我们帮助老板做内容增长",
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
        timeout_seconds=20,
    )

    assert len(result["generatedScripts"]) == 1
    assert "3月14日到3月17日" in result["generatedScripts"][0]["content"]
