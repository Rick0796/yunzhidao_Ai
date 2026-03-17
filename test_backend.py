#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""???????"""

import backend.main as backend_main
from backend.gemini_video import _gemini_root_and_version
from backend.main import CONFIG


def test_backend(client) -> None:
    assert CONFIG["baseUrl"]
    assert CONFIG["defaultModel"]
    assert CONFIG["port"] > 0

    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.json()
    assert data["ok"] is True
    assert data["upstream"] == CONFIG["baseUrl"]
    assert data["defaultModel"] == CONFIG["defaultModel"]
    assert "freeData" in data
    assert "scriptLibrary" in data


def test_analyze_video_accepts_full_video_upload(client, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_analyze_video_with_gemini(**kwargs):
        captured.update(kwargs)
        return {
            "summary": "????",
            "script": "????",
            "visualFeatures": [],
            "videoStructure": {
                "coreProposition": "????",
                "openingType": "????",
                "conflictStructure": "??",
                "progressionLogic": "??",
                "psychologicalHook": "??",
                "climaxSentence": "??",
                "languageFeatures": "????",
                "emotionalCurve": "????",
                "viewerReward": "????",
            },
            "timestamps": [],
            "fileUri": "gemini://video/demo",
            "mimeType": "video/mp4",
        }

    monkeypatch.setattr(backend_main, "analyze_video_with_gemini", fake_analyze_video_with_gemini)

    response = client.post(
        "/api/analyze-video",
        data={"mode": "FAST", "model": "gemini-2.0-flash"},
        files={"file": ("demo.mp4", b"fake-video-content", "video/mp4")},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["summary"] == "????"
    assert data["fileUri"] == "gemini://video/demo"
    assert captured["mode"] == "FAST"
    assert captured["mime_type"] == "video/mp4"
    assert captured["display_name"] == "demo.mp4"
    assert captured["existing_file_uri"] is None
    assert captured["content_length"] == len(b"fake-video-content")


def test_generate_sora_prompts_reuses_existing_file_uri(client, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_generate_sora_prompts_with_gemini(**kwargs):
        captured.update(kwargs)
        return [{"title": "??? 1", "fullPrompt": "?????"}]

    monkeypatch.setattr(backend_main, "generate_sora_prompts_with_gemini", fake_generate_sora_prompts_with_gemini)

    response = client.post(
        "/api/generate-sora-prompts",
        data={
            "existingFileUri": "gemini://video/demo",
            "analysisSummary": "??",
            "count": "3",
            "model": "gemini-2.0-flash",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["prompts"][0]["title"] == "??? 1"
    assert captured["existing_file_uri"] == "gemini://video/demo"
    assert captured["analysis_summary"] == "??"
    assert captured["count"] == 3
    assert captured["file_stream"] is None


def test_gemini_root_resolution_falls_back_to_official_host() -> None:
    root, version = _gemini_root_and_version("/v1")
    assert root == "https://generativelanguage.googleapis.com"
    assert version == "v1beta"

    root, version = _gemini_root_and_version("https://llm.xiaochisaas.com/v1")
    assert root == "https://generativelanguage.googleapis.com"
    assert version == "v1beta"
