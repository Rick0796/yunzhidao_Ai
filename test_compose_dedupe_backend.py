from __future__ import annotations

import backend.main as backend_main

from backend.compose_dedupe_service import dedupe_compose_blocks_with_claude


def test_compose_dedupe_route_uses_claude_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "anthropicBaseUrl", "http://proxy.example.com/back")
    monkeypatch.setitem(backend_main.CONFIG, "anthropicApiKey", "test-key")

    def fake_dedupe_compose_blocks_with_claude(**kwargs):
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

    monkeypatch.setattr(backend_main, "dedupe_compose_blocks_with_claude", fake_dedupe_compose_blocks_with_claude)

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
    def fake_generate_text_with_anthropic(**_kwargs):
        return (
            "<rewritten_content>"
            "未来三年，真正把普通人差距拉开的，不在于你听没听过AI，"
            "而在于你能不能让AI替你做内容、替你拿结果。"
            "</rewritten_content>"
        )

    monkeypatch.setattr("backend.compose_dedupe_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)

    result = dedupe_compose_blocks_with_claude(
        theme="AI growth",
        blocks=[
            {
                "id": "b1",
                "slotKey": "F",
                "sectionType": "F",
                "title": "Trend",
                "content": "未来三年，普通人真正拉开差距的关键，不是你懂不懂AI，而是你会不会用AI帮你做内容拿结果。",
                "label": "Trend",
                "originalId": None,
                "materialId": None,
                "sourceKey": None,
                "isManual": False,
            }
        ],
        block_ids=["b1"],
        api_key="test-key",
        base_url="http://proxy.example.com/back",
        model="claude-sonnet-4-6",
        timeout_seconds=20,
    )

    assert result["changed"] is True
    assert result["blocks"][0]["content"] != "未来三年，普通人真正拉开差距的关键，不是你懂不懂AI，而是你会不会用AI帮你做内容拿结果。"
    assert result["comparisons"][0]["id"] == "b1"


def test_compose_dedupe_service_keeps_original_when_near_copy(monkeypatch) -> None:
    original = "现在真正拉开差距的，不是你懂不懂AI，而是你会不会用AI帮你做内容拿结果。"

    def fake_generate_text_with_anthropic(**_kwargs):
        return f"<rewritten_content>{original}</rewritten_content>"

    monkeypatch.setattr("backend.compose_dedupe_service.generate_text_with_anthropic", fake_generate_text_with_anthropic)

    result = dedupe_compose_blocks_with_claude(
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
        base_url="http://proxy.example.com/back",
        model="claude-sonnet-4-6",
        timeout_seconds=20,
    )

    assert result["changed"] is False
    assert result["blocks"][0]["content"] == original
    assert isinstance(result["warning"], str) and result["warning"]
