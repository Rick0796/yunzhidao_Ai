import type { ApiSettings, SoraPrompt, VideoAnalysisMode, VideoAnalysisResult, VideoStructure } from "../types";
import { normalizeBaseUrl } from "./http";

const DEFAULT_TIMEOUT_MS = 240000;

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

function safeParseJson(text: string): Record<string, unknown> | Array<unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let cleaned = trimmed;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown> | Array<unknown>;
  } catch {
    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(cleaned.slice(objectStart, objectEnd + 1)) as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1)) as Array<unknown>;
      } catch {
        // ignore
      }
    }
    return null;
  }
}

function normalizeAnalysisResult(raw: Record<string, unknown>): VideoAnalysisResult {
  const structure = (raw.videoStructure && typeof raw.videoStructure === "object" ? raw.videoStructure : {}) as Partial<VideoStructure>;
  const timestamps = Array.isArray(raw.timestamps) ? raw.timestamps : [];
  const visualFeatures = Array.isArray(raw.visualFeatures) ? raw.visualFeatures : [];

  return {
    summary: typeof raw.summary === "string" ? raw.summary : "",
    script: typeof raw.script === "string" ? raw.script : "",
    visualFeatures: visualFeatures
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        feature: typeof item.feature === "string" ? item.feature : "",
        description: typeof item.description === "string" ? item.description : "",
      }))
      .filter((item) => item.feature || item.description),
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
    timestamps: timestamps
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => ({
        time: typeof item.time === "string" ? item.time : "00:00",
        seconds: typeof item.seconds === "number" ? item.seconds : 0,
        description: typeof item.description === "string" ? item.description : "",
      })),
    fileUri: typeof raw.fileUri === "string" ? raw.fileUri : undefined,
    mimeType: typeof raw.mimeType === "string" ? raw.mimeType : undefined,
  };
}

async function readTextResponse(response: Response) {
  const rawText = await response.text();
  const parsed = safeParseJson(rawText);
  return { rawText, parsed };
}

function buildAbortSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const merged = signal
    ? (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([signal, controller.signal]) ?? controller.signal
    : controller.signal;
  return {
    signal: merged,
    dispose: () => window.clearTimeout(timeoutId),
  };
}

export async function analyzeVideoFile(
  settings: ApiSettings,
  file: File,
  mode: VideoAnalysisMode,
  signal?: AbortSignal,
): Promise<VideoAnalysisResult> {
  if (!settings.useLiveApi) {
    throw new Error("未开启实时 API，无法进行视频分析。请先在设置中开启实时 API。");
  }
  if (!file) {
    throw new Error("请先上传完整视频文件。");
  }

  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  form.append("model", settings.imageModel || settings.mainModel || "gemini-2.0-flash");

  const { signal: requestSignal, dispose } = buildAbortSignal(signal);
  try {
    const response = await fetch(`${normalizeBaseUrl(settings.baseUrl || "/api")}/analyze-video`, {
      method: "POST",
      body: form,
      signal: requestSignal,
    });

    const { rawText, parsed } = await readTextResponse(response);
    if (!response.ok) {
      const message = parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof (parsed as { error?: { message?: string } }).error?.message === "string"
        ? (parsed as { error?: { message?: string } }).error!.message!
        : rawText.slice(0, 240);
      throw new Error(message || "视频分析请求失败。");
    }
    if (!parsed || Array.isArray(parsed)) {
      throw new Error("视频分析返回格式异常。");
    }
    return normalizeAnalysisResult(parsed as Record<string, unknown>);
  } finally {
    dispose();
  }
}

export async function generateSoraPrompts(
  settings: ApiSettings,
  options: {
    file?: File | null;
    existingFileUri?: string;
    mimeType?: string;
    summary: string;
    count: number;
    signal?: AbortSignal;
  },
): Promise<SoraPrompt[]> {
  if (!settings.useLiveApi) {
    throw new Error("请先开启实时 API。");
  }
  if (!options.file && !options.existingFileUri) {
    throw new Error("请先上传完整视频或先完成一次视频分析。");
  }

  const form = new FormData();
  if (options.file) {
    form.append("file", options.file);
  }
  if (options.existingFileUri) {
    form.append("existingFileUri", options.existingFileUri);
  }
  if (options.summary) {
    form.append("analysisSummary", options.summary);
  }
  if (options.mimeType) {
    form.append("mimeType", options.mimeType);
  }
  form.append("count", String(Math.max(1, options.count)));
  form.append("model", settings.imageModel || settings.mainModel || "gemini-2.0-flash");

  const { signal: requestSignal, dispose } = buildAbortSignal(options.signal);
  try {
    const response = await fetch(`${normalizeBaseUrl(settings.baseUrl || "/api")}/generate-sora-prompts`, {
      method: "POST",
      body: form,
      signal: requestSignal,
    });
    const { rawText, parsed } = await readTextResponse(response);
    if (!response.ok) {
      const message = parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof (parsed as { error?: { message?: string } }).error?.message === "string"
        ? (parsed as { error?: { message?: string } }).error!.message!
        : rawText.slice(0, 240);
      throw new Error(message || "生成 Sora 提示词失败。");
    }
    const promptList = parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as { prompts?: unknown[] }).prompts)
      ? (parsed as { prompts: Array<Record<string, unknown>> }).prompts
      : [];
    if (!promptList.length) {
      throw new Error("未生成有效的 Sora 提示词。");
    }
    return promptList.map((item, index) => ({
      title: typeof item.title === "string" && item.title.trim() ? item.title : `提示词 ${index + 1}`,
      fullPrompt: typeof item.fullPrompt === "string" ? item.fullPrompt : "",
    })).filter((item) => item.fullPrompt.trim());
  } finally {
    dispose();
  }
}

export async function generateViralCopies(
  settings: ApiSettings,
  script: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!script.trim()) {
    throw new Error("脚本内容为空，无法生成文案。");
  }

  const response = await fetch(`${normalizeBaseUrl(settings.baseUrl || "/api")}/generate-viral-copies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script,
      model: settings.mainModel || "gemini-2.0-flash",
    }),
    signal,
  });

  const { rawText, parsed } = await readTextResponse(response);
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof (parsed as { error?: { message?: string } }).error?.message === "string"
      ? (parsed as { error?: { message?: string } }).error!.message!
      : rawText.slice(0, 240);
    throw new Error(message || "生成爆款文案失败。");
  }

  if (!parsed || Array.isArray(parsed) || !Array.isArray((parsed as { copies?: unknown[] }).copies)) {
    throw new Error("爆款文案返回格式异常。");
  }

  return (parsed as { copies: unknown[] }).copies.map((item) => String(item || "").trim()).filter(Boolean);
}
