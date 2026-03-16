/**
 * videoAnalysis.ts
 * 视频分析 API 调用层。
 * 使用 OpenAI 兼容的 vision 格式发送视频关键帧，调用图像模型进行分析。
 * 独立实现，不耦合 generateJson（后者需要 task/profile 参数，与视频分析场景无关）。
 */

import type { ApiSettings, SoraPrompt, VideoAnalysisMode, VideoAnalysisResult, VideoStructure } from "../types";
import { normalizeBaseUrl } from "./http";

const DEFAULT_TIMEOUT_MS = 120000;

export const DEFAULT_VIDEO_STRUCTURE: VideoStructure = {
  coreProposition: "",
  openingType: "",
  conflictStructure: "",
  progressionLogic: "",
  psychologicalHook: "",
  climaxSentence: "",
  languageFeatures: "",
  emotionalCurve: "",
  viewerReward: "",
};

function buildAnalysisPrompt(mode: VideoAnalysisMode, frameCount: number): string {
  const isDeep = mode === "DEEP";
  const deepPart = isDeep
    ? "\n额外要求（深度模式）：\n1. 必须返回 5-8 个 timestamps（time格式MM:SS, seconds数字, description描述）。\n2. 对视频结构给出完整营销拆解。"
    : "";

  return [
    "你是一名短视频内容分析专家，请只输出 JSON，不要输出任何解释文字。",
    `以下是从视频中按时间顺序抽取的 ${frameCount} 帧关键画面，请根据画面内容进行分析。`,
    "",
    "字段要求：",
    "1. summary: 视频摘要（中文）。",
    "2. script: 根据画面中出现的文字、字幕、人物口型和动作，尽可能完整推断还原视频口播或旁白内容（中文）。不要说无法确定，要根据画面主题和风格给出合理推断，至少200字。",
    "3. visualFeatures: 数组，每项包含 feature 和 description。",
    "4. videoStructure: 对象，包含 coreProposition/openingType/conflictStructure/progressionLogic/psychologicalHook/climaxSentence/languageFeatures/emotionalCurve/viewerReward。",
    isDeep ? "5. timestamps: 关键时间点数组。" : "5. timestamps 可省略。",
    "",
    "输出质量要求：",
    "1. 仅使用简体中文。",
    "2. 不要使用未提取、未知等占位语，信息不足时给出合理推断。",
    "3. 结果必须是合法 JSON。",
    deepPart,
  ].join("\n");
}

function normalizeResult(raw: Record<string, unknown>): VideoAnalysisResult {
  const structure = (raw.videoStructure && typeof raw.videoStructure === "object"
    ? raw.videoStructure
    : {}) as Partial<VideoStructure>;

  return {
    summary: typeof raw.summary === "string" ? raw.summary : "未能提取摘要。",
    script: typeof raw.script === "string" ? raw.script : "",
    visualFeatures: Array.isArray(raw.visualFeatures)
      ? (raw.visualFeatures as Array<Record<string, string>>).map((item) => ({
          feature: item.feature || "视觉特征",
          description: item.description || "",
        }))
      : [],
    videoStructure: {
      coreProposition: structure.coreProposition || DEFAULT_VIDEO_STRUCTURE.coreProposition,
      openingType: structure.openingType || DEFAULT_VIDEO_STRUCTURE.openingType,
      conflictStructure: structure.conflictStructure || DEFAULT_VIDEO_STRUCTURE.conflictStructure,
      progressionLogic: structure.progressionLogic || DEFAULT_VIDEO_STRUCTURE.progressionLogic,
      psychologicalHook: structure.psychologicalHook || DEFAULT_VIDEO_STRUCTURE.psychologicalHook,
      climaxSentence: structure.climaxSentence || DEFAULT_VIDEO_STRUCTURE.climaxSentence,
      languageFeatures: structure.languageFeatures || DEFAULT_VIDEO_STRUCTURE.languageFeatures,
      emotionalCurve: structure.emotionalCurve || DEFAULT_VIDEO_STRUCTURE.emotionalCurve,
      viewerReward: structure.viewerReward || DEFAULT_VIDEO_STRUCTURE.viewerReward,
    },
    timestamps: Array.isArray(raw.timestamps)
      ? (raw.timestamps as Array<Record<string, unknown>>).map((item) => ({
          time: typeof item.time === "string" ? item.time : "00:00",
          seconds: typeof item.seconds === "number" ? item.seconds : 0,
          description: typeof item.description === "string" ? item.description : "",
        }))
      : [],
  };
}

function safeParseJson(text: string): Record<string, unknown> | null {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 发送视频关键帧到后端 /api/analyze-video，由服务端调用视觉模型并稳健解析 JSON。
 */
export async function analyzeVideoFrames(
  settings: ApiSettings,
  frames: string[],
  mode: VideoAnalysisMode,
  signal?: AbortSignal
): Promise<VideoAnalysisResult> {
  if (!settings.useLiveApi) {
    throw new Error("未开启实时 API，无法进行视频分析。请在设置中开启实时 API 并配置 API Key。");
  }

  if (frames.length === 0) {
    throw new Error("未能提取到视频帧，请确认视频文件格式正确。");
  }

  const MAX_RETRIES = 2;
  let lastError: Error = new Error("未知错误");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new Error("视频分析已取消。");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const combinedSignal = signal
      ? (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any?.([signal, controller.signal]) ?? controller.signal
      : controller.signal;

    try {
      // 优先走后端端点，服务端负责 JSON 解析和归一化
      const response = await fetch("/api/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frames,
          mode,
          model: settings.imageModel || "gpt-4o",
        }),
        signal: combinedSignal,
      });

      const rawText = await response.text();

      if (!response.ok) {
        const errPayload = safeParseJson(rawText) as { error?: { message?: string } } | null;
        const errMsg = errPayload?.error?.message || rawText.slice(0, 200) || `请求失败（${response.status}）`;
        throw new Error(errMsg);
      }

      const parsed = safeParseJson(rawText);
      if (!parsed) {
        throw new Error("服务端返回内容无法解析，请重试。");
      }

      return normalizeResult(parsed);
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("视频分析已取消。");
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

/**
 * 生成 Sora 视频提示词（基于视频关键帧 + 摘要）
 * 1:1 复制凡哥方案：全中文，明确镜头、人物动作、场景、光线、节奏、画面比例
 */
export async function generateSoraPrompts(
  settings: ApiSettings,
  frames: string[],
  summary: string,
  count: number,
  signal?: AbortSignal
): Promise<SoraPrompt[]> {
  if (!settings.useLiveApi || !settings.apiKey) {
    throw new Error("请开启实时 API 并配置 API Key。");
  }

  const promptLines = [
    `你是一名顶级 AIGC 商业短视频导演，擅长为数字人口播视频撰写专业级 Sora/可灵/即梦 视频生成提示词。`,
    `请基于以下视频内容，创作 ${count} 条完整的视频生成提示词。`,
    "",
    "【格式要求】",
    "每条提示词必须严格包含以下8个模块，每个模块用【】标注：",
    "【规格参数】比例（如9:16竖屏）、时长（秒）、分辨率（4K超高清）、帧率（60fps）、景深效果",
    "【风格设定】整体视觉风格、色调对比、光影质感、氛围定位",
    "【主角设定】年龄、外貌特征、发型、服装（品牌级别/颜色/材质）、配饰、眼神气场",
    "【场景设定】具体场景（室内/室外/车内等）、背景细节、道具、环境氛围",
    "【分镜头脚本】按时间段（如0-3s/3-7s/7-11s）描述镜头运动、主角动作和视觉重点",
    "【表演要求】口播节奏、手势幅度、眼神方向、情绪变化",
    "【口播内容】根据视频主题创作一段20-40字的示例口播台词",
    "【负面限制】列出严禁出现的元素（如文字水印、卡通质感、画面抖动等）",
    "",
    "【内容要求】",
    "1. 仅使用简体中文，专业术语可保留英文（如Bokeh、4K等）。",
    "2. 每条提示词字数不少于400字，细节越丰富越好。",
    "3. 不同条数之间风格必须明显差异化（如：豪华商务车内 vs 高档办公室 vs 城市夜景户外）。",
    "4. 不要输出 markdown 代码块。",
    "",
    "【输出格式】JSON数组：",
    '[{"title":"提示词标题","fullPrompt":"完整8模块提示词内容"}]',
    "",
    summary ? `参考视频摘要（用于理解主题和人物风格）：${summary}` : "",
  ].filter(Boolean).join("\n");

  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    { type: "text", text: promptLines },
    ...frames.slice(0, 3).map((frame) => ({
      type: "image_url" as const,
      image_url: { url: `data:image/jpeg;base64,${frame}`, detail: "low" },
    })),
  ];

  const response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.imageModel || "gpt-4o",
      temperature: 0.8,
      max_tokens: 6000,
      messages: [{ role: "user", content: contentParts }],
    }),
    signal,
  });

  const rawText = await response.text();
  if (!response.ok) {
    const err = safeParseJson(rawText) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message || `请求失败（${response.status}）`);
  }

  const payload = safeParseJson(rawText) as { choices?: Array<{ message?: { content?: string } }> } | null;
  const content = (payload?.choices?.[0]?.message?.content || "").trim();

  // Try to parse array from content
  let jsonText = content;
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  const firstBracket = jsonText.indexOf("[");
  const lastBracket = jsonText.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    jsonText = jsonText.slice(firstBracket, lastBracket + 1);
  }

  try {
    const parsed = JSON.parse(jsonText) as Array<{ title?: string; fullPrompt?: string }>;
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((p, idx) => ({
        title: p.title || `提示词 ${idx + 1}`,
        fullPrompt: p.fullPrompt || "",
      }));
    }
  } catch {
    // ignore
  }
  throw new Error("Sora 提示词生成失败，请重试。");
}

/**
 * 基于视频脚本生成爆款文案
 * 1:1 复制凡哥方案
 */
export async function generateViralCopies(
  settings: ApiSettings,
  script: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!script.trim()) throw new Error("脚本内容为空，无法生成文案。");

  const response = await fetch("/api/generate-viral-copies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script,
      model: settings.mainModel || "gemini-3-flash",
    }),
    signal,
  });

  const rawText = await response.text();
  if (!response.ok) {
    const err = safeParseJson(rawText) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message || `请求失败（${response.status}）`);
  }

  const payload = safeParseJson(rawText) as { copies?: string[] } | null;
  if (!payload?.copies?.length) throw new Error("爆款文案生成失败，请重试。");
  return payload.copies;
}
