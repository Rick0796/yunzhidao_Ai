export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const LEGACY_MODEL_MAP: Record<string, string> = {
  "gemini-2.0-flash-exp": DEFAULT_GEMINI_MODEL,
  "gemini-2.0-flash-thinking-exp": DEFAULT_GEMINI_MODEL,
  "gemini-2.0-flash-thinking-exp-01-21": DEFAULT_GEMINI_MODEL,
  "gemini-exp-1206": DEFAULT_GEMINI_MODEL,
};

export function normalizeGeminiModel(model: string | null | undefined, fallback = DEFAULT_GEMINI_MODEL) {
  const cleaned = typeof model === "string" ? model.trim() : "";
  if (!cleaned) return fallback;
  return LEGACY_MODEL_MAP[cleaned.toLowerCase()] || cleaned;
}
