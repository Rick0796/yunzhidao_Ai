export const DEFAULT_QWEN_VIDEO_MODEL = "qwen3-omni-flash";

const VIDEO_MODEL_ALIASES: Record<string, string> = {
  "qwen3-omni-flash-latest": DEFAULT_QWEN_VIDEO_MODEL,
  "qwen-omni-turbo-latest": "qwen-omni-turbo",
};

export function normalizeVideoModel(model: string | null | undefined, fallback = DEFAULT_QWEN_VIDEO_MODEL): string {
  const cleaned = (model || "").trim();
  if (!cleaned) return fallback;

  const lowered = cleaned.toLowerCase();
  if (!lowered.includes("qwen")) {
    return fallback;
  }
  if (!lowered.includes("omni") && !lowered.includes("vl")) {
    return fallback;
  }
  return VIDEO_MODEL_ALIASES[lowered] || cleaned;
}
