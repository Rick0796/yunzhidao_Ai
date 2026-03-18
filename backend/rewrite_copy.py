from __future__ import annotations

import json
import re
from typing import Any

from backend.gemini_video import GeminiVideoError, generate_json_with_gemini
from backend.platform_utils import clean_text

COPY_ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "analysis": {
            "type": "OBJECT",
            "properties": {
                "hook": {"type": "STRING"},
                "contrast": {"type": "STRING"},
                "value": {"type": "STRING"},
                "trust": {"type": "STRING"},
                "cta": {"type": "STRING"},
                "targetAudience": {"type": "STRING"},
                "sellingPoints": {"type": "STRING"},
            },
            "required": ["hook", "contrast", "value", "trust", "cta", "targetAudience", "sellingPoints"],
        },
        "generatedScripts": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "content": {"type": "STRING"},
                },
                "required": ["title", "content"],
            },
        },
    },
    "required": ["analysis", "generatedScripts"],
}

COPY_REFINE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "generatedScripts": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "title": {"type": "STRING"},
                    "content": {"type": "STRING"},
                },
                "required": ["title", "content"],
            },
        },
    },
    "required": ["generatedScripts"],
}

DEFAULT_ANALYSIS_KEYS = ("hook", "contrast", "value", "trust", "cta", "targetAudience", "sellingPoints")


def _normalize_text(value: Any) -> str:
    return clean_text(value)


def normalize_multiline_text(value: Any) -> str:
    raw = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [clean_text(line) for line in raw.split("\n")]
    normalized: list[str] = []
    for line in lines:
        if line:
            normalized.append(line)
        elif normalized and normalized[-1] != "":
            normalized.append("")
    while normalized and normalized[-1] == "":
        normalized.pop()
    return "\n".join(normalized).strip()


def _estimate_length_bounds(text: str) -> tuple[int, int]:
    length = len(re.sub(r"\s+", "", clean_text(text)))
    if length <= 0:
        return (80, 160)
    min_length = max(40, int(length * 0.85))
    max_length = max(min_length + 20, int(length * 1.15))
    return (min_length, max_length)


def _count_paragraphs(text: str) -> int:
    paragraphs = [clean_text(part) for part in re.split(r"\n+", text) if clean_text(part)]
    return max(1, len(paragraphs))


def _normalize_scripts(items: Any) -> list[dict[str, str]]:
    scripts: list[dict[str, str]] = []
    if not isinstance(items, list):
        return scripts

    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        title = _normalize_text(item.get("title")) or f"文案 {index}"
        content = normalize_multiline_text(item.get("content"))
        if content:
            scripts.append({"title": title, "content": content})
    return scripts


def normalize_copy_analysis_result(parsed: Any, *, original_copy: str) -> dict[str, Any]:
    payload = parsed if isinstance(parsed, dict) else {}
    analysis_raw = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}
    analysis = {key: _normalize_text(analysis_raw.get(key)) for key in DEFAULT_ANALYSIS_KEYS}
    scripts = _normalize_scripts(payload.get("generatedScripts"))

    if not scripts:
        raise GeminiVideoError("Gemini 未返回可用的爆款脚本")

    return {
        "originalCopy": original_copy,
        "analysis": analysis,
        "generatedScripts": scripts,
    }


def normalize_copy_refine_result(parsed: Any) -> dict[str, Any]:
    payload = parsed if isinstance(parsed, dict) else {}
    scripts = _normalize_scripts(payload.get("generatedScripts"))
    if not scripts:
        raise GeminiVideoError("Gemini 未返回可用的优化脚本")
    return {"generatedScripts": scripts}


def build_copy_analysis_prompt(*, original_copy: str, industry: str, needs: str, user_background: str) -> str:
    min_length, max_length = _estimate_length_bounds(original_copy)
    paragraph_count = _count_paragraphs(original_copy)
    return f"""
你现在是一名顶级的短视频文案专家、资深营销策划专家和消费心理学专家。你拥有极强的洞察力，能够看穿爆款视频背后的底层逻辑，并能根据用户背景生成极具转化力和传播力的文案。

### 核心指令
1. 深度洞察：不要停留在表面，要分析文案背后的心理博弈、认知失调、情绪价值和信任构建。
2. 智能进化：生成的文案必须比原始文案更具网感，更符合当下短视频平台的算法推荐逻辑。
3. 细节至上：文案脚本要详实、具体，包含具体的场景描述、动作建议和语气指导。
4. 字数对齐：生成的脚本字数必须与原始文案接近，控制在 {min_length} 到 {max_length} 字之间。
5. 严禁输出乱码：确保所有文字均为标准简体中文。
6. 实质性内容：所有分析字段必须填充深度见解，严禁使用“未提取”“无”等敷衍词汇。
7. 结构锁定：生成脚本必须与原文保持相同的爆款推进结构和段落节奏，原文约 {paragraph_count} 段时，改写稿也要尽量保持相同段落数。
8. 仿写边界：只做去重和改写，不允许改命题、不允许扩写成另一套逻辑、不允许加入原文没有的新主张。

### 用户背景信息
- 个人/业务介绍：{user_background or "未提供"}
- 所属行业：{industry or "通用"}
- 核心需求：{needs or "提升转化与互动"}

### 任务 1：底层逻辑深度拆解
请对原始文案进行手术刀级拆解：
1. 【钩子】Hook：前 3 秒如何通过视觉、听觉或认知冲突瞬间锁定注意力？
2. 【反差】Contrast：如何制造认知失调或情绪波动？
3. 【价值】Value：提供了什么不可替代的干货、利益点或情绪共鸣？请用专业营销视角深度拆解。
4. 【信任】Trust：如何通过细节、数据或逻辑建立权威感？
5. 【网兜】CTA：如何巧妙地引导用户完成转化动作？
6. 【受众画像】：精准描述这篇文案打动的核心人群及其痛点。
7. 【核心卖点】：文案传递的最具杀伤力的价值点。

### 任务 2：定制化爆款文案生成
基于上述深度分析，生成 3 条全新的、不同风格的爆款脚本。

### 爆款仿写硬规则
1. 每条生成文案都必须保留原文的爆款结构、推进顺序和情绪节奏。
2. 每条生成文案都必须与原文字数接近，禁止明显变长或变短。
3. 每条生成文案都只能做去重改写，不能改变核心观点，不能另起炉灶。
4. generatedScripts 里的 content 只能放最终仿写正文本身，不要额外输出风格说明、拍摄建议、解释文字或任何标题标签。
5. 每一段都要真正重写句式和表达，不能只是替换少量近义词，不能出现大段与原文近似的连续表达。
6. 除“AI”“周老师”“直播”等必要专有词外，尽量避免和原文出现连续 8 个字以上的重复。

请只返回合法 JSON，不要输出任何解释文字。

待分析文案：
{original_copy}
""".strip()


def build_copy_refine_prompt(*, current_result: Any, user_instruction: str, user_background: str) -> str:
    current_result_json = json.dumps(current_result, ensure_ascii=False)
    original_copy = normalize_multiline_text(current_result.get("originalCopy") if isinstance(current_result, dict) else "")
    min_length, max_length = _estimate_length_bounds(original_copy)
    paragraph_count = _count_paragraphs(original_copy)
    return f"""
你现在是一名顶级的短视频文案专家和消费心理学专家。用户对之前的文案分析和生成结果提出了修改要求。

### 用户背景
{user_background or "未提供"}

### 当前结果
{current_result_json}

### 用户修改要求
“{user_instruction}”

请根据要求，重新生成 3 条深度优化后的短视频文案脚本。要求比之前更智能、更详细、更具转化力。

### 爆款仿写硬规则
1. 只做去重和改写，不允许改命题，不允许增加原文没有的新观点。
2. 保持原文爆款结构一致，推进顺序一致，段落节奏一致。原文约 {paragraph_count} 段时，改写稿也保持相近段落数。
3. 保持字数接近，控制在 {min_length} 到 {max_length} 字之间。
4. generatedScripts 里的 content 只能输出最终仿写正文，不要附加解释、标签或拍摄建议。
5. 每一段都要真正重写句式和表达，不能只改几个词，不能出现大段连续照搬。

规则：
1. 必须返回严格的 JSON 格式，不要包含任何思考过程或多余文字。
2. 确保生成的文案质量极高，展现出极强的营销逻辑和智能感。
3. 脚本内容要详实，不要过于简短。
4. 仅使用标准简体中文，严禁出现乱码。
""".strip()


def analyze_copy_with_gemini(
    *,
    original_copy: str,
    industry: str,
    needs: str,
    user_background: str,
    api_key: str,
    model: str | None = None,
) -> dict[str, Any]:
    prompt = build_copy_analysis_prompt(
        original_copy=original_copy,
        industry=industry,
        needs=needs,
        user_background=user_background,
    )
    parsed = generate_json_with_gemini(
        prompt,
        api_key=api_key,
        model=model or "gemini-2.5-flash",
        max_output_tokens=4096,
        response_schema=COPY_ANALYSIS_SCHEMA,
    )
    return normalize_copy_analysis_result(parsed, original_copy=original_copy)


def refine_copy_with_gemini(
    *,
    current_result: Any,
    user_instruction: str,
    user_background: str,
    api_key: str,
    model: str | None = None,
) -> dict[str, Any]:
    prompt = build_copy_refine_prompt(
        current_result=current_result,
        user_instruction=user_instruction,
        user_background=user_background,
    )
    parsed = generate_json_with_gemini(
        prompt,
        api_key=api_key,
        model=model or "gemini-2.5-flash",
        max_output_tokens=4096,
        response_schema=COPY_REFINE_SCHEMA,
    )
    return normalize_copy_refine_result(parsed)
