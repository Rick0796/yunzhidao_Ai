import { AnalysisMode, AnalysisResult, CopyAnalysisResult, SoraPrompt } from "../types";
import { getStoredSession } from "./authService";

const API_BASE = (process.env.API_BASE || "http://127.0.0.1:8787").replace(/\/+$/, "");
const ABORT_ERROR = "取消操作";

type ChatHistory = { role: "user" | "model"; text: string }[];

const authHeaders = () => {
  const session = getStoredSession();
  if (!session?.token) return {};
  return { Authorization: `Bearer ${session.token}` };
};

const parseError = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `请求失败（${response.status}）`);
  }
  return payload;
};

const handleAbort = (error: any): never => {
  if (error?.name === "AbortError") {
    throw new Error(ABORT_ERROR);
  }
  throw error;
};

const postJson = async (path: string, body: Record<string, any>, signal?: AbortSignal) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
    signal,
  });
  return parseError(response);
};

const postForm = async (path: string, formData: FormData, signal?: AbortSignal) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
    },
    body: formData,
    signal,
  });
  return parseError(response);
};

export const analyzeVideoContent = async (
  file: File,
  _apiKey: string,
  mode: AnalysisMode,
  onProgress?: (stage: string, percent?: number) => void,
  signal?: AbortSignal,
  cachedUri?: string
): Promise<AnalysisResult> => {
  try {
    onProgress?.("uploading", 5);

    const form = new FormData();
    if (!cachedUri && file) form.append("file", file);
    form.append("mode", mode);
    if (cachedUri) form.append("cachedUri", cachedUri);

    onProgress?.("uploading", 35);
    const data = await postForm("/api/analyze-video", form, signal);
    onProgress?.("generating", 98);
    return data as AnalysisResult;
  } catch (error: any) {
    handleAbort(error);
  }
};

export const chatWithVideo = async (
  history: ChatHistory,
  message: string,
  videoFile: File,
  _apiKey: string,
  analysisSummary?: string,
  existingFileUri?: string
) => {
  try {
    const form = new FormData();
    if (videoFile) form.append("file", videoFile);
    form.append("message", message);
    form.append("history", JSON.stringify(history || []));
    if (analysisSummary) form.append("analysisSummary", analysisSummary);
    if (existingFileUri) form.append("existingFileUri", existingFileUri);

    const data = await postForm("/api/chat-video", form);
    return data?.reply || "暂时没有可用回复，请稍后重试。";
  } catch (error: any) {
    return `Error: ${error?.message || "未知错误"}`;
  }
};

export const generateSoraPrompts = async (
  videoFile: File,
  _apiKey: string,
  existingFileUri?: string,
  count: number = 1,
  analysisSummary?: string,
  signal?: AbortSignal
): Promise<SoraPrompt[]> => {
  try {
    const form = new FormData();
    if (videoFile) form.append("file", videoFile);
    if (existingFileUri) form.append("existingFileUri", existingFileUri);
    if (analysisSummary) form.append("analysisSummary", analysisSummary);
    form.append("count", String(count));

    const data = await postForm("/api/generate-sora-prompts", form, signal);
    if (!Array.isArray(data?.prompts)) throw new Error("未生成有效的 Sora 提示词");
    return data.prompts as SoraPrompt[];
  } catch (error: any) {
    handleAbort(error);
  }
};

export const generateViralCopies = async (
  originalScript: string,
  _apiKey: string,
  count: number = 3
) => {
  const data = await postJson("/api/generate-viral-copies", { originalScript, count });
  if (!Array.isArray(data?.copies)) throw new Error("爆款文案返回格式异常");
  return data.copies as string[];
};

export const chatWithContext = async (
  context: string,
  history: ChatHistory,
  message: string,
  _apiKey: string,
  isReplacementMode: boolean = false,
  signal?: AbortSignal
) => {
  try {
    const data = await postJson(
      "/api/chat-context",
      {
        context,
        history,
        message,
        isReplacementMode,
      },
      signal
    );
    return data?.reply || "暂时没有可用回复，请稍后再试。";
  } catch (error: any) {
    if (error?.name === "AbortError") {
      return `Error: ${ABORT_ERROR}`;
    }
    return `Error: ${error?.message || "未知错误"}`;
  }
};

export const analyzeAndGenerateCopy = async (
  originalCopy: string,
  industry: string,
  needs: string,
  userBackground: string,
  _apiKey: string,
  signal?: AbortSignal
) => {
  try {
    const data = await postJson(
      "/api/analyze-copy",
      {
        originalCopy,
        industry,
        needs,
        userBackground,
      },
      signal
    );

    if (!data?.analysis || !Array.isArray(data?.generatedScripts)) {
      throw new Error("文案分析结果解析失败");
    }

    return {
      ...(data as CopyAnalysisResult),
      originalCopy,
    };
  } catch (error: any) {
    handleAbort(error);
  }
};

export const refineCopyAnalysis = async (
  currentResult: CopyAnalysisResult,
  userInstruction: string,
  userBackground: string,
  _apiKey: string,
  signal?: AbortSignal
) => {
  try {
    const data = await postJson(
      "/api/refine-copy",
      {
        currentResult,
        userInstruction,
        userBackground,
      },
      signal
    );

    if (!Array.isArray(data?.generatedScripts)) {
      throw new Error("优化结果解析失败");
    }

    return {
      generatedScripts: data.generatedScripts,
    } as Pick<CopyAnalysisResult, "generatedScripts">;
  } catch (error: any) {
    handleAbort(error);
  }
};
