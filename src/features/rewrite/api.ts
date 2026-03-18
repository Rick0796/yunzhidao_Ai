import type { ApiSettings } from "../../types";
import { DEFAULT_GEMINI_MODEL, normalizeGeminiModel } from "../../lib/geminiModels";
import { normalizeBaseUrl } from "../../lib/http";
import type { RewriteCopyResult } from "./types";

const DEFAULT_TIMEOUT_MS = 180000;

function safeParseJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let cleaned = trimmed;
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildAbortSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortListener = () => controller.abort();
  signal?.addEventListener("abort", abortListener);

  return {
    signal: controller.signal,
    dispose() {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortListener);
    },
  };
}

function readApiError(parsed: Record<string, unknown> | null, rawText: string, fallback: string) {
  const error = parsed?.error;
  if (error && typeof error === "object" && !Array.isArray(error) && typeof (error as { message?: unknown }).message === "string") {
    return String((error as { message: string }).message);
  }
  if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
    return parsed.detail;
  }
  return rawText.slice(0, 240) || fallback;
}

function normalizeAnalysis(raw: unknown) {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    hook: typeof input.hook === "string" ? input.hook : "",
    contrast: typeof input.contrast === "string" ? input.contrast : "",
    value: typeof input.value === "string" ? input.value : "",
    trust: typeof input.trust === "string" ? input.trust : "",
    cta: typeof input.cta === "string" ? input.cta : "",
    targetAudience: typeof input.targetAudience === "string" ? input.targetAudience : "",
    sellingPoints: typeof input.sellingPoints === "string" ? input.sellingPoints : "",
  };
}

function normalizeScripts(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      title: typeof item.title === "string" && item.title.trim() ? item.title : `文案 ${index + 1}`,
      content: typeof item.content === "string" ? item.content : "",
    }))
    .filter((item) => item.content.trim());
}

function normalizeRewriteResult(parsed: Record<string, unknown>): RewriteCopyResult {
  return {
    originalCopy: typeof parsed.originalCopy === "string" ? parsed.originalCopy : "",
    analysis: normalizeAnalysis(parsed.analysis),
    generatedScripts: normalizeScripts(parsed.generatedScripts),
  };
}

async function postRewriteJson(
  settings: ApiSettings,
  path: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const { signal: requestSignal, dispose } = buildAbortSignal(signal, Math.max(30000, settings.requestTimeoutMs || DEFAULT_TIMEOUT_MS));
  try {
    const response = await fetch(`${normalizeBaseUrl(settings.baseUrl || "/api")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: requestSignal,
    });

    const rawText = await response.text();
    const parsed = safeParseJson(rawText);
    if (!response.ok) {
      throw new Error(readApiError(parsed, rawText, "请求失败。"));
    }
    if (!parsed) {
      throw new Error("返回格式异常，请重试。");
    }
    return parsed;
  } finally {
    dispose();
  }
}

export async function analyzeRewriteCopy(
  settings: ApiSettings,
  payload: {
    originalCopy: string;
    industry: string;
    needs: string;
    userBackground: string;
  },
  signal?: AbortSignal,
): Promise<RewriteCopyResult> {
  if (!settings.useLiveApi) {
    throw new Error("请先开启实时 API，再使用 Gemini 仿写。");
  }

  const parsed = await postRewriteJson(
    settings,
    "/rewrite/analyze",
    {
      ...payload,
      model: normalizeGeminiModel(settings.mainModel, DEFAULT_GEMINI_MODEL),
    },
    signal,
  );

  return normalizeRewriteResult(parsed);
}

export async function refineRewriteCopy(
  settings: ApiSettings,
  payload: {
    currentResult: RewriteCopyResult;
    userInstruction: string;
    userBackground: string;
  },
  signal?: AbortSignal,
): Promise<Pick<RewriteCopyResult, "generatedScripts">> {
  if (!settings.useLiveApi) {
    throw new Error("请先开启实时 API，再使用 Gemini 仿写。");
  }

  const parsed = await postRewriteJson(
    settings,
    "/rewrite/refine",
    {
      ...payload,
      model: normalizeGeminiModel(settings.mainModel, DEFAULT_GEMINI_MODEL),
    },
    signal,
  );

  return {
    generatedScripts: normalizeScripts(parsed.generatedScripts),
  };
}
