import type { DraftItem, TaskForm } from "../types";

const SENTENCE_SPLIT_RE = /[^\u3002\uFF01\uFF1F!?\uFF1B;]+[\u3002\uFF01\uFF1F!?\uFF1B;]?/g;
const SENTENCE_END_RE = /[\u3002\uFF01\uFF1F!?\uFF1B;]$/;
const SENTENCE_TRIM_RE = /[\u3002\uFF01\uFF1F!?\uFF1B;]+$/g;
const HARD_TOKEN_RE = /20\d{2}\u5e74|\d+(?:\.\d+)?%|\u7b2c[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u53410-9]+/g;

export interface RewriteConstraintSummary {
  paragraphCountMatch: boolean;
  lengthRatio: number;
  lengthRatioOk: boolean;
  hardTokenRetention: boolean;
  maxSentenceDelta: number;
}

export function splitParagraphs(text: string) {
  const normalized = (text || "").replace(/\r/g, "").trim();
  if (!normalized) return [];
  const byBlankLine = normalized.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;
  const byLine = normalized.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return byLine.length > 0 ? byLine : [normalized];
}

export function splitSentences(text: string) {
  return (text.match(SENTENCE_SPLIT_RE) ?? []).map((item) => item.trim()).filter(Boolean);
}

export function ensureSentence(text: string) {
  const normalized = text.trim();
  if (!normalized) return "";
  return SENTENCE_END_RE.test(normalized) ? normalized : `${normalized}。`;
}

export function scriptToSubtitle(script: string) {
  return script.replace(/([\u3002\uFF01\uFF1F])/g, "$1\n").replace(/\n{2,}/g, "\n").trim();
}

export function firstSentence(text: string) {
  return splitSentences(text)[0]?.trim() || text.trim();
}

export function extractHardTokens(text: string) {
  return Array.from(new Set((text.match(HARD_TOKEN_RE) ?? []).map((item) => item.trim()).filter(Boolean)));
}

export function getLengthRatio(sourceText: string, draftText: string) {
  const ratio = draftText.length / Math.max(1, sourceText.length);
  return Number.isFinite(ratio) ? ratio : 0;
}

export function summarizeRewriteConstraints(sourceText: string, draftText: string): RewriteConstraintSummary {
  const sourceParagraphs = splitParagraphs(sourceText);
  const draftParagraphs = splitParagraphs(draftText);
  const lengthRatio = getLengthRatio(sourceParagraphs.join(""), draftParagraphs.join(""));
  const hardTokens = extractHardTokens(sourceParagraphs.join(""));
  const maxSentenceDelta = Math.max(
    0,
    ...draftParagraphs.map((paragraph, index) => {
      const sourceParagraph = sourceParagraphs[index] ?? "";
      return Math.abs(splitSentences(paragraph).length - splitSentences(sourceParagraph).length);
    })
  );

  return {
    paragraphCountMatch: sourceParagraphs.length > 0 && draftParagraphs.length === sourceParagraphs.length,
    lengthRatio,
    lengthRatioOk: lengthRatio >= 0.72 && lengthRatio <= 1.35,
    hardTokenRetention: hardTokens.every((token) => draftText.includes(token)),
    maxSentenceDelta,
  };
}

export function isWeakRewrite(script: string, task: TaskForm) {
  const sourceParagraphs = splitParagraphs(task.sourceText || task.userNote);
  const draftParagraphs = splitParagraphs(script);
  if (!sourceParagraphs.length) return true;
  if (draftParagraphs.length !== sourceParagraphs.length) return true;
  const sourceText = sourceParagraphs.join("");
  const draftText = draftParagraphs.join("");
  const ratio = getLengthRatio(sourceText, draftText);
  if (ratio < 0.72 || ratio > 1.35) return true;
  const hardTokens = extractHardTokens(sourceText);
  if (hardTokens.some((token) => !draftText.includes(token))) return true;
  return draftParagraphs.some((paragraph, index) => {
    const sourceParagraph = sourceParagraphs[index] || "";
    const sentenceDelta = Math.abs(splitSentences(paragraph).length - splitSentences(sourceParagraph).length);
    return sentenceDelta > 1 || paragraph.length < 8;
  });
}

export function normalizeRewriteDrafts(items: Array<Partial<DraftItem>>, task: TaskForm, count: number, fallback: DraftItem[]) {
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
    const created: DraftItem = {
      ...fallback[index % fallback.length],
      ...item,
      id: fallback[index % fallback.length].id,
      script: splitParagraphs(nextScript).join("\n\n"),
      subtitleScript: String(item.subtitleScript || fallback[index % fallback.length].subtitleScript).trim() || fallback[index % fallback.length].subtitleScript,
      title: String(item.title || fallback[index % fallback.length].title).trim() || fallback[index % fallback.length].title,
      coverLine: String(item.coverLine || fallback[index % fallback.length].coverLine).trim() || fallback[index % fallback.length].coverLine,
      platformFit: String(item.platformFit || fallback[index % fallback.length].platformFit).trim() || fallback[index % fallback.length].platformFit,
    };
    if (!seenScripts.has(created.script)) {
      result.push(created);
      seenScripts.add(created.script);
    }
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

export function buildConstraintMessage(summary: RewriteConstraintSummary) {
  const ratio = summary.lengthRatio.toFixed(2);
  const parts = [
    summary.paragraphCountMatch ? "段落一致" : "段落不一致",
    summary.lengthRatioOk ? `字数比 ${ratio}` : `字数比异常 ${ratio}`,
    summary.hardTokenRetention ? "硬信息保留" : "硬信息丢失",
  ];
  if (summary.maxSentenceDelta > 1) {
    parts.push(`句数差 ${summary.maxSentenceDelta}`);
  }
  return parts.join(" / ");
}
