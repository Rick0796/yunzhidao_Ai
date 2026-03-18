import type { ApiSettings, DraftItem, GenerationSource, TaskForm } from "../types";
import { normalizeBaseUrl } from "./http";
import { ensureSentence, firstSentence, normalizeRewriteDrafts, scriptToSubtitle, splitParagraphs, splitSentences } from "./rewriteConstraints";

const REWRITE_SENTINEL_ID = "rewrite-direct";

const VARIANTS = [
  { versionName: "?????", prefix: "", replacements: [["???", "???"], ["??", "???"], ["???", "??"]] },
  { versionName: "?????", prefix: "?????", replacements: [["???", "???"], ["??", "???"], ["??", "??"]] },
  { versionName: "?????", prefix: "????", replacements: [["???", "????"], ["??", "??"], ["??", "??"]] },
  { versionName: "?????", prefix: "?????", replacements: [["??", "???"], ["??", "??"], ["???", "???"]] },
] as const;

function rewriteParagraph(paragraph: string, variantIndex: number, paragraphIndex: number) {
  const variant = VARIANTS[variantIndex % VARIANTS.length];
  let next = paragraph.trim();
  for (const [from, to] of variant.replacements) {
    if (next.includes(from)) next = next.replace(from, to);
  }
  const sentences = splitSentences(next);
  if (paragraphIndex === 0 && variant.prefix && sentences[0] && !sentences[0].startsWith(variant.prefix)) {
    const baseSentence = sentences[0].replace(/[\u3002\uFF01\uFF1F!?\uFF1B;]+$/g, "");
    sentences[0] = ensureSentence(`${variant.prefix}${baseSentence}`);
    next = sentences.join("");
  }
  return next.trim() || paragraph.trim();
}

function createDraft(versionIndex: number, script: string): DraftItem {
  const variant = VARIANTS[versionIndex % VARIANTS.length];
  const titleSeed = firstSentence(script).replace(/[\u3002\uFF01\uFF1F!?\uFF1B;]+$/g, "").trim() || variant.versionName;
  return {
    id: `${REWRITE_SENTINEL_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` ,
    versionName: variant.versionName,
    title: titleSeed.slice(0, 24) || variant.versionName,
    coverLine: titleSeed.slice(0, 32) || variant.versionName,
    script,
    subtitleScript: scriptToSubtitle(script),
    selectedHookId: REWRITE_SENTINEL_ID,
    selectedSkeletonId: REWRITE_SENTINEL_ID,
    selectedMeatId: null,
    selectedCtaId: REWRITE_SENTINEL_ID,
    platformFit: "?????",
  };
}

function buildLocalDrafts(task: TaskForm, count: number): DraftItem[] {
  const sourceText = task.sourceText || task.userNote || "";
  const paragraphs = splitParagraphs(sourceText);
  if (!paragraphs.length) return [createDraft(0, "???????")].slice(0, count);
  return Array.from({ length: count }, (_, index) => {
    const script = paragraphs.map((paragraph, paragraphIndex) => rewriteParagraph(paragraph, index, paragraphIndex)).join("\n\n");
    return createDraft(index, script);
  });
}

function buildPrompt(task: TaskForm, count: number, existingScripts: string[], refineNote?: string) {
  const originalText = (task.sourceText || task.userNote || "").trim();
  const mergedNote = [task.userNote?.trim() || "", refineNote?.trim() || ""].filter(Boolean).join("?");
  return [
    `????? ${count} ??????????`,
    "??????????????????????",
    "?????????????????????????",
    "????????????????????????",
    count > 1 ? "????????????????????" : "??????????????????????",
    existingScripts.length ? `?????????????????????\n${existingScripts.map((item, index) => `??${index + 1}?${item.slice(0, 180)}`).join("\n")}` : "",
    mergedNote ? `?????${mergedNote}` : "",
    "???",
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
  if (!options.settings.useLiveApi) return { data: { items: fallback }, source: "local" };
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
    const sourceItems = Array.isArray(parsed.result?.items) ? parsed.result.items : Array.isArray(parsed.result) ? parsed.result : [];
    if (!sourceItems.length) return { data: { items: fallback }, source: "local" };
    return {
      data: { items: normalizeRewriteDrafts(sourceItems, options.task, count, fallback) },
      source: "api",
    };
  } catch {
    return { data: { items: fallback }, source: "local" };
  }
}
