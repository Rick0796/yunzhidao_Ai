import type { ApiSettings, DraftItem, GenerationSource, TaskForm } from "../types";
import { normalizeBaseUrl } from "./http";

const REWRITE_SENTINEL_ID = "rewrite-direct";
const SENTENCE_SPLIT_RE = /[^\u3002\uFF01\uFF1F!?\uFF1B;]+[\u3002\uFF01\uFF1F!?\uFF1B;]?/g;
const SENTENCE_END_RE = /[\u3002\uFF01\uFF1F!?\uFF1B;]$/;
const SENTENCE_TRIM_RE = /[\u3002\uFF01\uFF1F!?\uFF1B;]+$/g;
const SUBTITLE_RE = /([\u3002\uFF01\uFF1F])/g;
const HARD_TOKEN_RE = /20\d{2}\u5e74|\d+(?:\.\d+)?%|\u7b2c[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u53410-9]+/g;

const VARIANTS = [
  { versionName: "\u7ed3\u6784\u4fdd\u771f\u7248", prefix: "", replacements: [["\u5f88\u591a\u4eba", "\u4e0d\u5c11\u4eba"], ["\u5176\u5b9e", "\u8bf4\u767d\u4e86"], ["\u63a5\u4e0b\u6765", "\u5f80\u540e"]] },
  { versionName: "\u8868\u8fbe\u91cd\u5199\u7248", prefix: "\u6362\u53e5\u8bdd\u8bf4\uff0c", replacements: [["\u5f88\u591a\u4eba", "\u4e0d\u5c11\u4eba"], ["\u771f\u6b63", "\u8bf4\u5230\u5e95"], ["\u5982\u679c", "\u8981\u662f"]] },
  { versionName: "\u53e3\u8bed\u52a0\u5f3a\u7248", prefix: "\u8bf4\u767d\u4e86\uff0c", replacements: [["\u666e\u901a\u4eba", "\u5927\u591a\u6570\u4eba"], ["\u73b0\u5728", "\u773c\u4e0b"], ["\u5df2\u7ecf", "\u65e9\u5c31"]] },
  { versionName: "\u7ed3\u679c\u5f3a\u5316\u7248", prefix: "\u4f60\u8981\u77e5\u9053\uff0c", replacements: [["\u771f\u6b63", "\u8bf4\u5230\u5e95"], ["\u540e\u9762", "\u5f80\u540e"], ["\u5f88\u591a\u4eba", "\u4e00\u6279\u4eba"]] },
] as const;

function decodeLabel(label: string) {
  return JSON.parse(`"${label}"`) as string;
}

function splitParagraphs(text: string) {
  const normalized = (text || "").replace(/\r/g, "").trim();
  if (!normalized) return [];
  const byBlankLine = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;
  const byLine = normalized.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return byLine.length > 0 ? byLine : [normalized];
}

function splitSentences(text: string) {
  return (text.match(SENTENCE_SPLIT_RE) ?? []).map((item) => item.trim()).filter(Boolean);
}

function ensureSentence(text: string) {
  const normalized = text.trim();
  if (!normalized) return "";
  return SENTENCE_END_RE.test(normalized) ? normalized : `${normalized}\u3002`;
}

function scriptToSubtitle(script: string) {
  return script.replace(SUBTITLE_RE, "$1\n").replace(/\n{2,}/g, "\n").trim();
}

function firstSentence(text: string) {
  return splitSentences(text)[0]?.trim() || text.trim();
}

function extractHardTokens(text: string) {
  return Array.from(new Set((text.match(HARD_TOKEN_RE) ?? []).map((item) => item.trim()).filter(Boolean)));
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
    sentences[0] = ensureSentence(`${prefix}${sentences[0].replace(SENTENCE_TRIM_RE, "")}`);
    next = sentences.join("");
  }
  return next.trim() || paragraph.trim();
}

function createDraft(versionIndex: number, script: string): DraftItem {
  const variant = VARIANTS[versionIndex % VARIANTS.length];
  const versionName = decodeLabel(variant.versionName);
  const titleSeed = firstSentence(script).replace(SENTENCE_TRIM_RE, "").trim() || versionName;
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
    return [createDraft(0, "\u8bf7\u5148\u7c98\u8d34\u539f\u6587\u3002")].slice(0, count);
  }
  return Array.from({ length: count }, (_, index) => {
    const script = paragraphs.map((paragraph, paragraphIndex) => rewriteParagraph(paragraph, index, paragraphIndex)).join("\n\n");
    return createDraft(index, script);
  });
}

function isWeakRewrite(script: string, task: TaskForm) {
  const sourceParagraphs = splitParagraphs(task.sourceText || task.userNote);
  const draftParagraphs = splitParagraphs(script);
  if (!sourceParagraphs.length) return true;
  if (draftParagraphs.length !== sourceParagraphs.length) return true;
  const sourceText = sourceParagraphs.join("");
  const draftText = draftParagraphs.join("");
  const ratio = draftText.length / Math.max(1, sourceText.length);
  if (ratio < 0.72 || ratio > 1.35) return true;
  const hardTokens = extractHardTokens(sourceText);
  if (hardTokens.some((token) => !draftText.includes(token))) return true;
  return draftParagraphs.some((paragraph, index) => {
    const sourceParagraph = sourceParagraphs[index] || "";
    const sentenceDelta = Math.abs(splitSentences(paragraph).length - splitSentences(sourceParagraph).length);
    return sentenceDelta > 1 || paragraph.length < 8;
  });
}

function normalizeDrafts(items: Array<Partial<DraftItem>>, task: TaskForm, count: number) {
  const fallback = buildLocalDrafts(task, count);
  const result: DraftItem[] = [];
  const seenScripts = new Set<string>();
  items.slice(0, count).forEach((item, index) => {
    const nextScript = String(item.script || "").trim();
    if (!nextScript || isWeakRewrite(nextScript, task) || seenScripts.has(nextScript)) {
      const fallbackItem = fallback[index % fallback.length];
      if (!seenScripts.has(fallbackItem.script)) {
        result.push(fallbackItem);
        seenScripts.add(fallbackItem.script);
      }
      return;
    }
    const created = createDraft(index, splitParagraphs(nextScript).join("\n\n"));
    created.title = String(item.title || created.title).trim() || created.title;
    created.subtitleScript = String(item.subtitleScript || created.subtitleScript).trim() || created.subtitleScript;
    created.platformFit = String(item.platformFit || created.platformFit).trim() || created.platformFit;
    result.push(created);
    seenScripts.add(created.script);
  });
  for (const fallbackItem of fallback) {
    if (result.length >= count) break;
    if (!seenScripts.has(fallbackItem.script)) {
      result.push(fallbackItem);
      seenScripts.add(fallbackItem.script);
    }
  }
  return result.slice(0, count);
}

function buildPrompt(task: TaskForm, count: number, existingScripts: string[]) {
  const originalText = (task.sourceText || task.userNote || "").trim();
  const userNote = task.userNote?.trim() || "";
  return [
    `Please generate ${count} full rewrite versions in Simplified Chinese.`,
    "Do not split into hooks, skeletons, meat, or CTA blocks.",
    "The rewrite must preserve paragraph count, progression order, and core proposition in each paragraph.",
    "The key goal is rewrite and dedupe while keeping structure unchanged and total length close to the source.",
    count > 1 ? "Each version must be clearly different from the others." : "Return exactly one complete version.",
    existingScripts.length ? `Avoid repeating these existing versions:\n${existingScripts.map((item, index) => `Version ${index + 1}: ${item.slice(0, 180)}`).join("\n")}` : "",
    userNote ? `Extra requirement: ${userNote}` : "",
    "Source text:",
    originalText,
  ].filter(Boolean).join("\n\n");
}

export async function generateViralRewriteDrafts(options: {
  settings: ApiSettings;
  task: TaskForm;
  count?: number;
  existingScripts?: string[];
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
        prompt: buildPrompt(options.task, count, options.existingScripts ?? []),
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
