from __future__ import annotations

from backend.anthropic_client import _collect_text_blocks, generate_text_with_anthropic


def test_collect_text_blocks_supports_anthropic_content_list() -> None:
    payload = {
        "content": [
            {"type": "text", "text": "first block"},
            {"type": "text", "text": "second block"},
        ]
    }

    assert _collect_text_blocks(payload) == "first block\nsecond block"


def test_collect_text_blocks_supports_openai_compatible_choices() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": "openai compatible body",
                }
            }
        ]
    }

    assert _collect_text_blocks(payload) == "openai compatible body"


def test_collect_text_blocks_supports_nested_proxy_wrappers() -> None:
    payload = {
        "data": {
            "result": {
                "message": {
                    "content": [
                        {"type": "output_text", "text": "nested proxy body"},
                    ]
                }
            }
        }
    }

    assert _collect_text_blocks(payload) == "nested proxy body"


def test_collect_text_blocks_supports_direct_completion_fields() -> None:
    assert _collect_text_blocks({"completion": "direct completion"}) == "direct completion"
    assert _collect_text_blocks({"output_text": "direct output_text"}) == "direct output_text"
    assert _collect_text_blocks({"text": "direct text"}) == "direct text"


def test_generate_text_with_anthropic_retries_on_generic_intro(monkeypatch) -> None:
    responses = iter(
        [
            "I am Claude, made by Anthropic. I'm an AI assistant designed to be helpful, harmless, and honest.",
            "<script_title>Script 1</script_title><script_content>usable final output</script_content>",
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

    assert "usable final output" in text
    assert len(captured_prompts) == 2
    assert "do not introduce yourself" in captured_prompts[1].lower()
