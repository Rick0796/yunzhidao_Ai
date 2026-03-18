import type { ApiSettings, DraftItem, GenerationSource, TaskForm } from "../types";
import { normalizeBaseUrl } from "./http";
import {
  ensureSentence,
  firstSentence,
  isWeakRewrite,
  normalizeRewriteDrafts,
  scriptToSubtitle,
  splitParagraphs,
  splitSentences,
} from "./rewriteConstraints";

const REWRITE_SENTINEL_ID = "rewrite-direct";

const VARIANTS = [
  { versionName: "结构保真版", prefix: "", replacements: [["很多人", "不少人"], ["其实", "说白了"], ["接下来", "往后"]] },
  { versionName: "表达重写版", prefix: "换句话说，", replacements: [["很多人", "不少人"], ["真正", "说到底"], ["如果", "要是"]] },
  { versionName: "口语加强版", prefix: "说白了，", replacements: [["普通人", "大多数人"], ["现在", "眼下"], ["已经", "早就"]] },
  { versionName: "结果强化版", prefix: "你要知道，", replacements: [["真正", "说到底"], ["后面", "往后"], ["很多人", "一批人"]] },
] as const;

function decodeLabel(label: string) {
  return JSON.parse(`"${label}"`) as string;
}

function rewriteParagraph(paragraph: string, variantIndex: number, paragraphIndex: number) {
  const variant = VARIANTS[variantIndex % VARIANTS.length];
  let next = paragraph.trim();
  for (const [fromRaw, toRaw] of variant.replacements) {
    const from = decodeLabel(fromRaw);
    const to = decodeLabel(toRaw);
    if (next.includes(from)) {
      next = next.replace(from, to);
    }
  }
  const sentences = splitSentences(next);
  const prefix = decodeLabel(variant.prefix);
  if (paragraphIndex === 0 && prefix && sentences[0] && !sentences[0].startsWith(prefix)) {
    const baseSentence = sentences[0].replace(/[\u3002\uFF01\uFF1F!?\uFF1B;]+$/g, "");
    sentences[0] = ensureSentence(`${prefix}${baseSentence}`);
    next = sentences.join("");
  }
  return next.trim() || paragraph.trim();
}

function createDraft(versionIndex: number, script: string): DraftItem {
  const variant = VARIANTS[versionIndex % VARIANTS.length];
  const versionName = decodeLabel(variant.versionName);
  const titleSeed = firstSentence(script).replace(/[\u3002\uFF01\uFF1F!?\uFF1B;]+$/g, "").trim() || versionName;
  return {
    id: `${REWRITE_SENTINEL_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` ,
    versionName,
    title: titleSeed.slice(0, 24) || versionName,
    coverLine: titleSeed.slice(0, 32) || versionName,
    script,
    subtitleScript: scriptToSubtitle(script),
    selectedHookId: REWRITE_SENTINEL_ID,
    selectedSkeletonId: REWRITE_SENTINEL_ID,
    selectedMeatId: null,
    selectedCtaId: REWRITE_SENTINEL_ID,
    platformFit: "\u89c6\u9891\u53f7\u4f18\u5148",
  };
}

function buildLocalDrafts(task: TaskForm, count: number): DraftItem[] {
  const paragraphs = splitParagraphs(task.sourceText || task.userNote);
  if (!paragraphs.length) {
    return [createDraft(0, "请先粘贴原文。")].slice(0, count);
  }
  return Array.from({ length: count }, (_, index) => {
    const script = paragraphs.map((paragraph, paragraphIndex) => rewriteParagraph(paragraph, index, paragraphIndex)).join("\n\n");
    return createDraft(index, script);
  });
}

function normalizeDrafts(items: Array<Partial<DraftItem>>, task: TaskForm, count: number) {
  const fallback = buildLocalDrafts(task, count);
  return normalizeRewriteDrafts(items, task, count, fallback);
}

function buildPrompt(task: TaskForm, count: number, existingScripts: string[], refineNote?: string) {
  const originalText = (task.sourceText || task.userNote || "").trim();
  const baseNote = task.userNote?.trim() || "";
  const refineHint = refineNote?.trim() || "";
  const mergedNote = [baseNote, refineHint].filter(Boolean).join("；");
  return [
    `Please generate ${count} full rewrite versions in Simplified Chinese.`,
    "Do not split into hooks, skeletons, meat, or CTA blocks.",
    "The rewrite must preserve paragraph count, progression order, and core proposition in each paragraph.",
    "The key goal is rewrite and dedupe while keeping structure unchanged and total length close to the source.",
    count > 1 ? "Each version must be clearly different from the others." : "Return exactly one complete version.",
    existingScripts.length ? `Avoid repeating these existing versions:\n${existingScripts.map((item, index) => `Version ${index + 1}: ${item.slice(0, 180)}`).join("\n")}` : "",
    mergedNote ? `Extra requirement: ${mergedNote}` : "",
    "Source text:",
    originalText,
  ].filter(Boolean).join("\n\n");
}

export async function generateViralRewriteDrafts(options: {
  settings: ApiSettings;
  task: TaskForm;
  count?: number;
  existingScripts?: string[];
  refineNote?: string;
}): Promise<GenerationSource<{ items: DraftItem[] }>> {
  const count = Math.max(1, Math.min(options.count ?? 1, 3));
  const fallback = buildLocalDrafts(options.task, count);
  if (!options.settings.useLiveApi) {
    return { data: { items: fallback }, source: "local" };
  }
  try {
    const response = await fetch(`${normalizeBaseUrl(options.settings.baseUrl || "/api")}/generate-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(options.task, count, options.existingScripts ?? [], options.refineNote),
        model: options.settings.batchModel || options.settings.mainModel,
        max_tokens: count === 1 ? 5000 : 9000,
      }),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(raw);
    const parsed = JSON.parse(raw);
    if (parsed.error) throw new Error(parsed.error.message || "API returned an error");
    const sourceItems = Array.isArray(parsed.result?.items)
      ? parsed.result.items
      : Array.isArray(parsed.result)
        ? parsed.result
        : [];
    return {
      data: { items: normalizeDrafts(sourceItems, options.task, count) },
      source: "api",
    };
  } catch {
    return { data: { items: fallback }, source: "local" };
  }
}
