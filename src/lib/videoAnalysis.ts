/**
 * videoAnalysis.ts
 * 视频分析 API 调用层。
 * 使用 OpenAI 兼容的 vision 格式发送视频关键帧，调用图像模型进行分析。
 * 独立实现，不耦合 generateJson（后者需要 task/profile 参数，与视频分析场景无关）。
 */

import type { ApiSettings, VideoAnalysisMode, VideoAnalysisResult, VideoStructure } from "../types";
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
  const timestampsField = isDeep
    ? `
8. timestamps: 关键时间点数组，每项包含 time（格式"MM:SS"）、seconds（数字）、description（描述）。提供 5-8 个。`
    : "";

  return `你是一名短视频内容分析专家。以下是从一个短视频中按时间顺序抽取的 ${frameCount} 帧关键画面。
请仔细分析这些画面，提取视频的完整信息。

只输出合法 JSON，不要任何解释文字，不要 markdown 代码块。

JSON 字段说明：
1. summary: 视频内容摘要（中文，200字以内）
2. script: 尽可能还原视频的口播或旁白文字（中文）
3. visualFeatures: 视觉特征数组，每项含 feature（特征名）和 description（描述）
4. videoStructure: 对象，包含以下9个字段（均为中文字符串）：
   - coreProposition: 核心主张（这条视频在说什么）
   - openingType: 开场类型（如悬念型、判决型、故事型等）
   - conflictStructure: 冲突结构（视频中的矛盾和张力）
   - progressionLogic: 推进逻辑（内容如何层层递进）
   - psychologicalHook: 心理钩子（抓住观众的心理机制）
   - climaxSentence: 高潮句（最有力的一句话）
   - languageFeatures: 语言风格（口语化程度、节奏、用词特点）
   - emotionalCurve: 情绪曲线（情绪如何变化）
   - viewerReward: 观看回报（观众看完能获得什么）${timestampsField}

要求：仅使用简体中文，不使用「未知」「未提取」等占位语，信息不足时给出合理推断。`;
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
  // 去掉 markdown 代码块
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // 尝试提取第一个 { ... } 块
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
 * 发送视频关键帧到图像模型，返回结构化分析结果。
 * @param settings  ApiSettings（使用 baseUrl / apiKey / imageModel）
 * @param frames    base64 JPEG 字符串数组（不含 data: 前缀）
 * @param mode      FAST（5帧）或 DEEP（10帧）
 * @param signal    可选 AbortSignal 用于取消
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

  if (!settings.apiKey) {
    throw new Error("未配置 API Key，无法进行视频分析。");
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
      const prompt = buildAnalysisPrompt(mode, frames.length);

      const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
        { type: "text", text: prompt },
        ...frames.map((frame) => ({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${frame}`,
            detail: "low",
          },
        })),
      ];

      const response = await fetch(
        `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model: settings.imageModel || "gpt-4o",
            temperature: 0.3,
            messages: [
              {
                role: "user",
                content: contentParts,
              },
            ],
          }),
          signal: combinedSignal,
        }
      );

      const rawText = await response.text();

      if (!response.ok) {
        const errPayload = safeParseJson(rawText) as { error?: { message?: string } } | null;
        const errMsg = errPayload?.error?.message || rawText.slice(0, 200) || `请求失败（${response.status}）`;
        throw new Error(errMsg);
      }

      const payload = safeParseJson(rawText) as { choices?: Array<{ message?: { content?: string } }> } | null;
      const content = payload?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("模型未返回可解析的内容，请重试。");
      }

      const parsed = safeParseJson(content);
      if (!parsed) {
        throw new Error("模型返回的内容无法解析为 JSON，请重试。");
      }

      return normalizeResult(parsed);
    } catch (error) {
      window.clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("视频分析已取消。");
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_RETRIES) {
        // 等待后重试（第1次等1s，第2次等2s）
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
 */
export async function generateSoraPrompts(
  settings: ApiSettings,
  frames: string[],
  summary: string,
  count: number,
  signal?: AbortSignal
): Promise<import("../types").SoraPrompt[]> {
  if (!settings.useLiveApi || !settings.apiKey) {
    throw new Error("请开启实时 API 并配置 API Key。");
  }

  const prompt = `你是一位专业的 AI 视频生成提示词工程师。
基于以下视频摘要和关键帧，生成 ${count} 条高质量的 Sora / 视频生成 AI 提示词。

视频摘要：${summary}

要求：
- 每条提示词用英文撰写，描述镜头语言、画面构图、色调风格、动态效果
- 只输出合法 JSON 数组，格式：[{"title":"提示词标题（中文）","fullPrompt":"English prompt here"}]
- 不要任何解释文字，不要 markdown 代码块`;

  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    { type: "text", text: prompt },
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
      temperature: 0.7,
      max_tokens: 2000,
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
  const content = payload?.choices?.[0]?.message?.content || "";
  const parsed = safeParseJson(content);
  if (Array.isArray(parsed)) {
    return (parsed as Array<{ title?: string; fullPrompt?: string }>).map((p) => ({
      title: p.title || "Sora 提示词",
      fullPrompt: p.fullPrompt || "",
    }));
  }
  throw new Error("Sora 提示词生成失败，请重试。");
}

/**
 * 基于视频脚本生成爆款文案
 */
export async function generateViralCopies(
  settings: ApiSettings,
  script: string,
  signal?: AbortSignal
): Promise<string[]> {
  if (!settings.useLiveApi || !settings.apiKey) {
    throw new Error("请开启实时 API 并配置 API Key。");
  }

  const prompt = `你是一位短视频爆款文案专家。
基于以下视频脚本，生成 3 条不同风格的爆款短视频文案（适合抖音/小红书/视频号）。

原始脚本：
${script}

要求：
- 每条文案包含吸引眼球的开头钩子、核心价值点、明确的行动召唤
- 风格各异：情绪型、干货型、故事型
- 只输出合法 JSON 数组，格式：["文案1全文","文案2全文","文案3全文"]
- 不要任何解释，不要 markdown 代码块`;

  const response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.mainModel || "gemini-3-flash",
      temperature: 0.85,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });

  const rawText = await response.text();
  if (!response.ok) {
    const err = safeParseJson(rawText) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message || `请求失败（${response.status}）`);
  }

  const payload = safeParseJson(rawText) as { choices?: Array<{ message?: { content?: string } }> } | null;
  const content = payload?.choices?.[0]?.message?.content || "";
  const parsed = safeParseJson(content);
  if (Array.isArray(parsed)) return parsed as string[];
  throw new Error("爆款文案生成失败，请重试。");
}
