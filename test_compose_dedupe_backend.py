from __future__ import annotations

import backend.main as backend_main

from backend.compose_dedupe_service import dedupe_compose_blocks_with_qwen


def test_compose_dedupe_route_uses_qwen_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "qwenBaseUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setitem(backend_main.CONFIG, "qwenApiKey", "test-key")

    def fake_dedupe_compose_blocks_with_qwen(**kwargs):
        captured.update(kwargs)
        blocks = kwargs["blocks"]
        updated = [{**item, "content": "Completely rewritten block content"} if item["id"] == "b1" else item for item in blocks]
        return {
            "blocks": updated,
            "changed": True,
            "warning": None,
            "comparisons": [
                {
                    "id": "b1",
                    "slotKey": "A",
                    "title": "Opening",
                    "before": "Original content",
                    "after": "Completely rewritten block content",
                    "beforeLength": 16,
                    "afterLength": 32,
                    "lengthDelta": 16,
                    "similarityScore": 2,
                    "verdict": "stable",
                    "note": "Length and hook are preserved.",
                }
            ],
        }

    monkeypatch.setattr(backend_main, "dedupe_compose_blocks_with_qwen", fake_dedupe_compose_blocks_with_qwen)

    response = client.post(
        "/api/library/compose-dedupe",
        json={
            "theme": "AI growth",
            "blocks": [
                {
                    "id": "b1",
                    "slotKey": "A",
                    "sectionType": "A",
                    "title": "Opening",
                    "content": "Original content",
                    "label": "Opening",
                    "originalId": None,
                    "materialId": None,
                    "sourceKey": None,
                    "isManual": False,
                }
            ],
            "blockIds": ["b1"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["changed"] is True
    assert payload["blocks"][0]["content"] == "Completely rewritten block content"
    assert captured["theme"] == "AI growth"
    assert captured["block_ids"] == ["b1"]


def test_compose_dedupe_service_rewrites_single_block(monkeypatch) -> None:
    original = "The real divider is not whether you have heard about AI, but whether you can use AI to produce content and get results."

    def fake_generate_text_with_qwen(**_kwargs):
        return (
            "<rewritten_content>"
            "The real gap in the next three years will not be whether you know AI exists, but whether you can make AI work for your content and outcomes."
            "</rewritten_content>"
        )

    monkeypatch.setattr("backend.compose_dedupe_service.generate_text_with_qwen", fake_generate_text_with_qwen)
    monkeypatch.setattr(
        "backend.compose_dedupe_service._evaluate_candidate",
        lambda block, candidate: {
            "accepted": True,
            "verdict": "stable",
            "note": "accepted for test",
            "beforeLength": len(block["content"]),
            "afterLength": len(candidate),
            "lengthDelta": len(candidate) - len(block["content"]),
            "similarityScore": 2,
        },
    )

    result = dedupe_compose_blocks_with_qwen(
        theme="AI growth",
        blocks=[
            {
                "id": "b1",
                "slotKey": "F",
                "sectionType": "F",
                "title": "Trend",
                "content": original,
                "label": "Trend",
                "originalId": None,
                "materialId": None,
                "sourceKey": None,
                "isManual": False,
            }
        ],
        block_ids=["b1"],
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
        timeout_seconds=20,
    )

    assert result["changed"] is True
    assert result["blocks"][0]["content"] != original
    assert result["comparisons"][0]["id"] == "b1"


def test_compose_dedupe_service_keeps_original_when_near_copy(monkeypatch) -> None:
    original = "The real divider is not whether you know AI, but whether you can use AI to get content output and results."

    def fake_generate_text_with_qwen(**_kwargs):
        return f"<rewritten_content>{original}</rewritten_content>"

    monkeypatch.setattr("backend.compose_dedupe_service.generate_text_with_qwen", fake_generate_text_with_qwen)

    result = dedupe_compose_blocks_with_qwen(
        theme="AI growth",
        blocks=[
            {
                "id": "b1",
                "slotKey": "F",
                "sectionType": "F",
                "title": "Trend",
                "content": original,
                "label": "Trend",
                "originalId": None,
                "materialId": None,
                "sourceKey": None,
                "isManual": False,
            }
        ],
        block_ids=["b1"],
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen-plus",
        timeout_seconds=20,
    )

    assert result["changed"] is False
    assert result["blocks"][0]["content"] == original
    assert isinstance(result["warning"], str) and result["warning"]
