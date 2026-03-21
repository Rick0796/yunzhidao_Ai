from __future__ import annotations

import backend.main as backend_main

from backend.qwen_video import QwenVideoReference, _extract_stream_text, generate_sora_prompts_with_qwen, normalize_qwen_video_model_name


def test_normalize_qwen_video_model_name_falls_back_from_stale_gemini() -> None:
    assert normalize_qwen_video_model_name("gemini-2.5-flash") == "qwen3-omni-flash"
    assert normalize_qwen_video_model_name("qwen-plus") == "qwen3-omni-flash"
    assert normalize_qwen_video_model_name("qwen3-omni-flash-latest") == "qwen3-omni-flash"


def test_extract_stream_text_reads_stream_delta() -> None:
    payload = {
        "choices": [
            {
                "delta": {
                    "content": [
                        {"type": "output_text", "text": "第一段"},
                        {"type": "output_text", "text": "第二段"},
                    ]
                }
            }
        ]
    }

    assert _extract_stream_text(payload) == "第一段第二段"


def test_analyze_video_route_uses_qwen_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "qwenBaseUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setitem(backend_main.CONFIG, "qwenApiKey", "test-key")
    monkeypatch.setitem(backend_main.CONFIG, "qwenVideoModel", "qwen3-omni-flash")

    def fake_analyze_video_with_qwen(**kwargs):
        captured.update(kwargs)
        return {
            "summary": "视频摘要",
            "script": "视频脚本",
            "visualFeatures": [],
            "videoStructure": {
                "coreProposition": "核心观点",
                "openingType": "悬念开头",
                "conflictStructure": "反差推进",
                "progressionLogic": "逐步展开",
                "psychologicalHook": "中段钩子",
                "climaxSentence": "高点句子",
                "languageFeatures": "口语化",
                "emotionalCurve": "先压后扬",
                "viewerReward": "拿走结论",
            },
            "timestamps": [],
            "fileUri": "qwen-video://abc",
            "mimeType": "video/mp4",
        }

    monkeypatch.setattr(backend_main, "analyze_video_with_qwen", fake_analyze_video_with_qwen)

    response = client.post(
        "/api/analyze-video",
        data={"mode": "FAST", "model": "gemini-2.5-flash"},
        files={"file": ("sample.mp4", b"fake-video", "video/mp4")},
    )

    assert response.status_code == 200
    assert response.json()["summary"] == "视频摘要"
    assert captured["model"] == "qwen3-omni-flash"
    assert captured["mime_type"] == "video/mp4"


def test_generate_sora_prompts_route_uses_qwen_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "qwenBaseUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setitem(backend_main.CONFIG, "qwenApiKey", "test-key")
    monkeypatch.setitem(backend_main.CONFIG, "qwenVideoModel", "qwen3-omni-flash")

    def fake_generate_sora_prompts_with_qwen(**kwargs):
        captured.update(kwargs)
        return [{"title": "提示词 1", "fullPrompt": "完整提示词"}]

    monkeypatch.setattr(backend_main, "generate_sora_prompts_with_qwen", fake_generate_sora_prompts_with_qwen)

    response = client.post(
        "/api/generate-sora-prompts",
        data={
            "existingFileUri": "qwen-video://abc",
            "analysisSummary": "视频摘要",
            "count": "1",
            "model": "gemini-2.5-flash",
        },
    )

    assert response.status_code == 200
    assert response.json()["prompts"][0]["title"] == "提示词 1"
    assert captured["existing_file_uri"] == "qwen-video://abc"
    assert captured["model"] == "qwen3-omni-flash"


def test_generate_viral_copies_route_uses_qwen_service(client, monkeypatch) -> None:
    captured: dict[str, object] = {}
    monkeypatch.setitem(backend_main.CONFIG, "qwenBaseUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    monkeypatch.setitem(backend_main.CONFIG, "qwenApiKey", "test-key")
    monkeypatch.setitem(backend_main.CONFIG, "qwenModel", "qwen-plus")

    def fake_generate_viral_copies_with_qwen(**kwargs):
        captured.update(kwargs)
        return ["改写文案 1", "改写文案 2"]

    monkeypatch.setattr(backend_main, "generate_viral_copies_with_qwen", fake_generate_viral_copies_with_qwen)

    response = client.post(
        "/api/generate-viral-copies",
        json={"script": "原始脚本", "model": "gemini-2.5-flash"},
    )

    assert response.status_code == 200
    assert response.json()["copies"] == ["改写文案 1", "改写文案 2"]
    assert captured["model"] == "qwen-plus"


def test_generate_sora_prompts_keeps_plain_text_fallback(monkeypatch, tmp_path) -> None:
    reference = QwenVideoReference(
        cache_uri="qwen-video://demo",
        mime_type="video/mp4",
        display_name="demo.mp4",
        file_path=tmp_path / "demo.mp4",
        content_length=128,
    )
    reference.file_path.write_bytes(b"demo")

    monkeypatch.setattr("backend.qwen_video._ensure_reference", lambda **_kwargs: reference)
    monkeypatch.setattr(
        "backend.qwen_video._generate_text_from_video_with_qwen",
        lambda **_kwargs: "一位春日少女站在现代街景中，保持轻松自然的口播状态。",
    )

    prompts = generate_sora_prompts_with_qwen(
        api_key="test-key",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model="qwen3-omni-flash",
        timeout_seconds=30,
        retry_count=1,
        count=1,
        analysis_summary="测试摘要",
        existing_file_uri="qwen-video://demo",
        file_stream=None,
        content_length=None,
        mime_type="video/mp4",
        display_name="demo.mp4",
    )

    assert len(prompts) == 1
    assert prompts[0]["title"] == "提示词 1"
    assert "春日少女" in prompts[0]["fullPrompt"]
