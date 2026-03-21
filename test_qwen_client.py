from __future__ import annotations

from backend.qwen_client import _collect_text, generate_text_with_qwen


def test_collect_text_supports_openai_compatible_choices() -> None:
    payload = {
        "choices": [
            {
                "message": {
                    "content": "openai compatible body",
                }
            }
        ]
    }

    assert _collect_text(payload) == "openai compatible body"


def test_collect_text_supports_nested_proxy_wrappers() -> None:
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

    assert _collect_text(payload) == "nested proxy body"


def test_collect_text_supports_direct_fields() -> None:
    assert _collect_text({"output_text": "direct output_text"}) == "direct output_text"
    assert _collect_text({"text": "direct text"}) == "direct text"
    assert _collect_text({"content": "direct content"}) == "direct content"


def test_generate_text_with_qwen_reads_request_output(monkeypatch) -> None:
    captured: list[str] = []

    def fake_request_chat_completion(**kwargs):
        captured.append(kwargs["user_prompt"])
        return "usable final output"

    monkeypatch.setattr("backend.qwen_client._request_chat_completion", fake_request_chat_completion)

    text = generate_text_with_qwen(
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="test-key",
        model="qwen-plus",
        system_prompt="Return only the requested output.",
        user_prompt="Return a rewrite only.",
        max_tokens=256,
        timeout_seconds=20,
        temperature=0,
        retry_count=1,
    )

    assert text == "usable final output"
    assert captured == ["Return a rewrite only."]
