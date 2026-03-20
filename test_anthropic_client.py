from __future__ import annotations

from backend.anthropic_client import _collect_text_blocks, generate_text_with_anthropic


def test_collect_text_blocks_supports_anthropic_content_list() -> None:
    payload = {
        "content": [
            {"type": "text", "text": "第一段"},
            {"type": "text", "text": "第二段"},
        ]
    }

    assert _collect_text_blocks(payload) == "第一段\n第二段"


def test_collect_text_blocks_supports_openai_compatible_choices() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": "这是 OpenAI 兼容格式返回的正文。"
                }
            }
        ]
    }

    assert _collect_text_blocks(payload) == "这是 OpenAI 兼容格式返回的正文。"


def test_collect_text_blocks_supports_direct_completion_fields() -> None:
    assert _collect_text_blocks({"completion": "直接 completion"}) == "直接 completion"
    assert _collect_text_blocks({"output_text": "直接 output_text"}) == "直接 output_text"
    assert _collect_text_blocks({"text": "直接 text"}) == "直接 text"


def test_generate_text_with_anthropic_retries_on_generic_intro(monkeypatch) -> None:
    responses = iter(
        [
            "I am Claude, made by Anthropic. I'm an AI assistant designed to be helpful, harmless, and honest.",
            "<script_title>Script 1</script_title><script_content>这是修正后的正式输出。</script_content>",
        ]
    )
    captured_prompts: list[str] = []

    def fake_request_message(**kwargs):
        captured_prompts.append(kwargs["user_prompt"])
        return next(responses)

    monkeypatch.setattr("backend.anthropic_client._request_message", fake_request_message)

    text = generate_text_with_anthropic(
        base_url="http://proxy.example.com/back",
        api_key="test-key",
        model="claude-sonnet-4-6",
        system_prompt="Return only the requested output.",
        user_prompt="Return a rewrite only.",
        max_tokens=256,
        timeout_seconds=20,
        temperature=0,
        retry_count=2,
    )

    assert "正式输出" in text
    assert len(captured_prompts) == 2
    assert "do not introduce yourself" in captured_prompts[1].lower()
