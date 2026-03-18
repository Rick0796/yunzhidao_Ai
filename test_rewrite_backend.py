from __future__ import annotations

import backend.main as backend_main
from backend.rewrite_copy import build_copy_analysis_prompt, build_copy_refine_prompt


def test_rewrite_analyze_route_uses_new_backend_module(client, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_analyze_copy_with_gemini(**kwargs):
      captured.update(kwargs)
      return {
          "originalCopy": kwargs["original_copy"],
          "analysis": {
              "hook": "钩子",
              "contrast": "反差",
              "value": "价值",
              "trust": "信任",
              "cta": "网兜",
              "targetAudience": "老板",
              "sellingPoints": "卖点",
          },
          "generatedScripts": [
              {"title": "文案 1", "content": "保持结构一致的去重改写版本"},
          ],
      }

    monkeypatch.setattr(backend_main, "analyze_copy_with_gemini", fake_analyze_copy_with_gemini)

    response = client.post(
        "/api/rewrite/analyze",
        json={
            "originalCopy": "第一段\n第二段",
            "industry": "AI 获客",
            "needs": "字数接近，结构一致",
            "userBackground": "服务实体老板",
            "model": "gemini-2.5-flash",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["originalCopy"] == "第一段\n第二段"
    assert data["generatedScripts"][0]["title"] == "文案 1"
    assert captured["industry"] == "AI 获客"
    assert captured["needs"] == "字数接近，结构一致"
    assert captured["user_background"] == "服务实体老板"
    assert captured["model"] == "gemini-2.5-flash"


def test_rewrite_refine_route_uses_new_backend_module(client, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_refine_copy_with_gemini(**kwargs):
        captured.update(kwargs)
        return {
            "generatedScripts": [
                {"title": "优化文案 1", "content": "继续保持字数接近和结构一致"},
                {"title": "优化文案 2", "content": "只做去重和改写"},
            ]
        }

    monkeypatch.setattr(backend_main, "refine_copy_with_gemini", fake_refine_copy_with_gemini)

    response = client.post(
        "/api/rewrite/refine",
        json={
            "currentResult": {
                "originalCopy": "原文内容",
                "analysis": {
                    "hook": "钩子",
                    "contrast": "反差",
                    "value": "价值",
                    "trust": "信任",
                    "cta": "网兜",
                    "targetAudience": "老板",
                    "sellingPoints": "卖点",
                },
                "generatedScripts": [],
            },
            "userInstruction": "语气更狠一点，但保持结构一致",
            "userBackground": "服务实体老板",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["generatedScripts"]) == 2
    assert captured["user_instruction"] == "语气更狠一点，但保持结构一致"
    assert captured["user_background"] == "服务实体老板"


def test_rewrite_analyze_route_normalizes_legacy_model_name(client, monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_analyze_copy_with_gemini(**kwargs):
        captured.update(kwargs)
        return {
            "originalCopy": kwargs["original_copy"],
            "analysis": {},
            "generatedScripts": [{"title": "文案 1", "content": "去重改写版本"}],
        }

    monkeypatch.setattr(backend_main, "analyze_copy_with_gemini", fake_analyze_copy_with_gemini)

    response = client.post(
        "/api/rewrite/analyze",
        json={
            "originalCopy": "原文内容",
            "industry": "AI 获客",
            "needs": "字数接近",
            "userBackground": "服务实体老板",
            "model": "gemini-2.0-flash-exp",
        },
    )

    assert response.status_code == 200
    assert captured["model"] == "gemini-2.5-flash"


def test_rewrite_prompts_lock_length_and_structure() -> None:
    original_copy = "第一段说明问题。\n第二段给出转折。\n第三段完成收口。"
    current_result = {
        "originalCopy": original_copy,
        "analysis": {},
        "generatedScripts": [],
    }

    analyze_prompt = build_copy_analysis_prompt(
        original_copy=original_copy,
        industry="AI 获客",
        needs="适配数字人口播",
        user_background="服务实体老板",
    )
    refine_prompt = build_copy_refine_prompt(
        current_result=current_result,
        user_instruction="保持字数接近",
        user_background="服务实体老板",
    )

    assert "字数必须与原始文案接近" in analyze_prompt
    assert "结构锁定" in analyze_prompt
    assert "只做去重和改写" in analyze_prompt
    assert "保持原文爆款结构一致" in refine_prompt
    assert "只做去重和改写" in refine_prompt
