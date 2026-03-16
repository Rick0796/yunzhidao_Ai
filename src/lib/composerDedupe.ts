import type { ApiSettings } from "../types";
import type { ComposeBlock, DedupeComparisonItem, DedupeResult } from "./composerTypes";
import { normalizeBaseUrl } from "./http";
import { extractJsonBlock, normalizeMessageContent, safeJsonParse } from "./modelResponse";
import { normalizeText, overlapScore } from "./textMatch";

const BUSINESS_TERMS = ["AI获客", "数字资产", "数字人", "私域", "流量", "获客", "内容增长", "企业增长", "老板增长"] as const;
const ACTION_TERMS = ["评论区", "评论", "留言", "关键词", "主页", "直播", "公开课", "训练营", "入口", "发消息", "点开"] as const;
const HARD_TOKEN_PATTERN = /(?:\d{4}年|\d+(?:\.\d+)?%?|\d+(?:\.\d+)?(?:万|亿|元|块|倍|天|个月|月|年|小时|分钟)|[一二三四五六七八九十百千万两零半]+(?:年|个月|月|天|次|个|条|倍|万|亿|元|块|小时|分钟|成|%))/g;
const ENGLISH_TOKEN_PATTERN = /\b[A-Za-z]{2,}(?:[-_][A-Za-z0-9]+)*\b/g;

interface RewriteAudit {
  accepted: boolean;
  verdict: "stable" | "watch";
  note: string;
  beforeLength: number;
  afterLength: number;
  lengthDelta: number;
  similarityScore: number;
}

function extractItemsFromLooseJson(text: string) {
  const items: Array<{ id: string; content: string }> = [];
  const regex = /"id"\s*:\s*"([^"]+)"[\s\S]*?"content"\s*:\s*"([\s\S]*?)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const id = match[1]?.trim();
    const content = match[2]?.replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
    if (id && content) items.push({ id, content });
  }
  return items;
}

function normalizeRewriteItems(parsed: unknown): Array<{ id: string; content: string }> {
  if (Array.isArray(parsed)) {
    return parsed
      .filter(
        (item): item is { id: string; content: string } =>
          !!item &&
          typeof item === "object" &&
          "id" in item &&
          "content" in item &&
          typeof (item as { id?: unknown }).id === "string" &&
          typeof (item as { content?: unknown }).content === "string",
      )
      .map((item) => ({ id: item.id.trim(), content: item.content.trim() }))
      .filter((item) => item.id && item.content);
  }

  if (parsed && typeof parsed === "object" && "items" in parsed) {
    return normalizeRewriteItems((parsed as { items?: unknown }).items);
  }

  return [];
}

function settingsModel(settings: ApiSettings) {
  return settings.mainModel || settings.polishModel || "gemini-3-flash";
}

function countSentences(text: string) {
  return text
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function extractProtectedTokens(text: string) {
  const hardTokens = text.match(HARD_TOKEN_PATTERN) ?? [];
  const englishTokens = text.match(ENGLISH_TOKEN_PATTERN) ?? [];
  return [...hardTokens, ...englishTokens].reduce<string[]>((result, token) => {
    const next = token.trim();
    if (!next) return result;
    if (result.includes(next)) return result;
    result.push(next);
    return result;
  }, []);
}

function extractPresentTerms(text: string, terms: readonly string[]) {
  const normalized = normalizeText(text);
  return terms.filter((term) => normalized.includes(term.toLowerCase()));
}

function getLengthBounds(block: ComposeBlock, beforeLength: number) {
  const tightBlock = ["A", "B", "C", "K", "L"].includes(block.sectionType);
  const ratioMin = tightBlock ? 0.84 : 0.76;
  const ratioMax = tightBlock ? 1.16 : 1.24;
  const minLength = Math.max(8, Math.floor(beforeLength * ratioMin));
  const maxLength = Math.max(minLength + 2, Math.ceil(beforeLength * ratioMax));
  return { minLength, maxLength };
}

function buildBlockConstraintLines(block: ComposeBlock) {
  const protectedTokens = extractProtectedTokens(block.content).slice(0, 8);
  const lines = [`原文长度约 ${block.content.trim().length} 字`, `原文句数约 ${countSentences(block.content)} 句`];
  if (protectedTokens.length) {
    lines.push(`这些元素必须保留：${protectedTokens.join("、")}`);
  }
  return lines;
}

function buildDedupeRule(block: ComposeBlock) {
  const baseRule =
    block.sectionType === "A"
      ? "必须保留开头爆点和抓停力度，句子结构不能被洗软。"
      : block.sectionType === "K" || block.sectionType === "L"
        ? "只允许去重表达，动作方式、承接路径和入口不能改。"
        : block.sectionType === "B" || block.sectionType === "C"
          ? "保留钩子或动作功能，不要改成别的结构位。"
          : "保留核心命题、事实、数字、逻辑顺序，只降低重复度。";

  return `${block.id}: ${[baseRule, ...buildBlockConstraintLines(block), "中文必须顺滑，字数尽量贴近原文。"].join(" ")}`;
}

function evaluateRewriteCandidate(block: ComposeBlock, candidate: string): RewriteAudit {
  const before = block.content.trim();
  const after = candidate.trim();
  const beforeLength = before.length;
  const afterLength = after.length;
  const lengthDelta = afterLength - beforeLength;
  const similarityScore = overlapScore(before, after);

  if (!after) {
    return {
      accepted: false,
      verdict: "watch",
      note: "去重结果为空，已保留原文。",
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  const { minLength, maxLength } = getLengthBounds(block, beforeLength);
  if (afterLength < minLength * 0.7 || afterLength > maxLength * 1.4) {
    return {
      accepted: false,
      verdict: "watch",
      note: `字数变化过大，原文约 ${beforeLength} 字，当前约 ${afterLength} 字。`,
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  const protectedTokens = extractProtectedTokens(before);
  const missingHardTokens = protectedTokens.filter((token) => !normalizeText(after).includes(normalizeText(token)));
  if (missingHardTokens.length > 0) {
    return {
      accepted: false,
      verdict: "watch",
      note: `关键数字或硬信息丢了：${missingHardTokens.slice(0, 3).join("、")}。`,
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  const beforeBusinessTerms = extractPresentTerms(before, BUSINESS_TERMS);
  const afterBusinessTerms = extractPresentTerms(after, BUSINESS_TERMS);
  const injectedBusinessTerms = afterBusinessTerms.filter((term) => !beforeBusinessTerms.includes(term));
  if (!beforeBusinessTerms.length && injectedBusinessTerms.length) {
    return {
      accepted: false,
      verdict: "watch",
      note: `改写里新塞进了业务词：${injectedBusinessTerms.slice(0, 3).join("、")}。`,
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  const beforeActionTerms = extractPresentTerms(before, ACTION_TERMS);
  const missingActionTerms = beforeActionTerms.filter((term) => !normalizeText(after).includes(term.toLowerCase()));
  if ((block.sectionType === "K" || block.sectionType === "L") && missingActionTerms.length) {
    return {
      accepted: false,
      verdict: "watch",
      note: `关键动作或入口丢了：${missingActionTerms.slice(0, 3).join("、")}。`,
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  const beforeSentenceCount = countSentences(before);
  const afterSentenceCount = countSentences(after);
  const maxSentenceDelta = ["A", "B", "C", "K", "L"].includes(block.sectionType) ? 1 : 2;
  if (Math.abs(beforeSentenceCount - afterSentenceCount) > maxSentenceDelta) {
    return {
      accepted: false,
      verdict: "watch",
      note: `句数变化太大，原文约 ${beforeSentenceCount} 句，当前约 ${afterSentenceCount} 句。`,
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  if (/[？?]/.test(before) && !/[？?]/.test(after) && ["A", "B", "C"].includes(block.sectionType)) {
    return {
      accepted: false,
      verdict: "watch",
      note: "原文是疑问式抓停，改写后把问感洗掉了。",
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  const minOverlap = beforeLength >= 48 ? 1 : 0;
  if (similarityScore < minOverlap) {
    return {
      accepted: false,
      verdict: "watch",
      note: "改写偏离原文过大，核心爆点或论证方向不够像。",
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  const stable = Math.abs(lengthDelta) <= Math.max(4, Math.round(beforeLength * 0.08)) && Math.abs(beforeSentenceCount - afterSentenceCount) <= 1;
  return {
    accepted: true,
    verdict: stable ? "stable" : "watch",
    note: stable ? "核心爆点、长度感和句式节奏基本保住了。" : "核心点还在，但字数或句式变化稍大，建议对照原文复核。",
    beforeLength,
    afterLength,
    lengthDelta,
    similarityScore,
  };
}

function buildComparisonItem(block: ComposeBlock, nextContent: string, audit: RewriteAudit): DedupeComparisonItem {
  return {
    id: block.id,
    slotKey: String(block.slotKey),
    title: block.title,
    before: block.content,
    after: nextContent,
    beforeLength: audit.beforeLength,
    afterLength: audit.afterLength,
    lengthDelta: audit.lengthDelta,
    similarityScore: audit.similarityScore,
    verdict: audit.verdict,
    note: audit.note,
  };
}

const LOCAL_REWRITE_RULES = [
  ["老百姓", "普通人"],
  ["普通人", "很多人"],
  ["很多人", "不少人"],
  ["现在", "眼下"],
  ["已经", "早就"],
  ["接下来", "往后"],
  ["后面", "往后"],
  ["其实", "说白了"],
  ["你要", "你得"],
  ["如果", "要是"],
  ["而是", "其实是"],
  ["真正", "真正的"],
] as const;

function splitSentences(text: string) {
  return text.match(/[^。！？!?；;]+[。！？!?；;]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function lightlyRewriteSentence(sentence: string, offset: number) {
  const orderedRules = [...LOCAL_REWRITE_RULES.slice(offset), ...LOCAL_REWRITE_RULES.slice(0, offset)];
  for (const [from, to] of orderedRules) {
    if (sentence.includes(from)) {
      return sentence.replace(from, to);
    }
  }
  if (sentence.includes("，") && !sentence.includes("但是") && !sentence.includes("不过")) {
    return sentence.replace("，", "，但");
  }
  return sentence;
}

function buildLocalRewrite(block: ComposeBlock) {
  const sentences = splitSentences(block.content.trim());
  if (!sentences.length) return block.content.trim();
  const rewritten = sentences
    .map((sentence, index) => lightlyRewriteSentence(sentence, (index + block.content.length) % LOCAL_REWRITE_RULES.length))
    .join("");
  return rewritten.trim();
}

async function callChatCompletion(baseUrl: string, settings: ApiSettings, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string }; detail?: string }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message || (typeof payload?.detail === "string" ? payload.detail : "") || "去重调用失败";
    throw new Error(message);
  }

  return normalizeMessageContent(payload?.choices?.[0]?.message?.content).trim();
}

async function repairDedupeJson(options: {
  settings: ApiSettings;
  baseUrl: string;
  malformedContent: string;
  targetBlocks: ComposeBlock[];
}) {
  try {
    const repairedContent = await callChatCompletion(options.baseUrl, options.settings, {
      model: settingsModel(options.settings),
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            '你是 JSON 修复助手。你会把给定内容严格整理成合法 JSON，对外只输出 {"items":[{"id":"...","content":"..."}]}。不要解释，不要多余文字。',
        },
        {
          role: "user",
          content: [
            "把下面这段去重结果修复成合法 JSON。",
            "必须保留每个 id，content 不能为空。",
            `目标 id：${options.targetBlocks.map((item) => item.id).join(", ")}`,
            options.malformedContent,
          ].join("\n"),
        },
      ],
    });
    return safeJsonParse<unknown>(repairedContent) ?? safeJsonParse<unknown>(extractJsonBlock(repairedContent));
  } catch {
    return null;
  }
}

async function dedupeSingleBlock(options: {
  settings: ApiSettings;
  baseUrl: string;
  theme: string;
  block: ComposeBlock;
  guardNote?: string;
}) {
  try {
    return await callChatCompletion(options.baseUrl, options.settings, {
      model: settingsModel(options.settings),
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "你是短视频文案改写专家。任务是对给定段落进行真正的去重改写——用全新的句式和表达重写，而不是只改几个字。保留核心命题、关键数字和逻辑顺序，但句子结构、用词、语序都要有明显变化。字数保持相近。只输出改写后的正文，不要解释。",
        },
        {
          role: "user",
          content: [
            `主题：${options.theme}`,
            `板块类型：${options.block.sectionType}`,
            ...buildBlockConstraintLines(options.block),
            options.guardNote ? `上次改写被打回原因：${options.guardNote}` : "",
            "改写要求：",
            "1. 至少60%的句子必须用全新的表达方式重写",
            "2. 保留原文核心命题、数字、人名、平台名等关键事实",
            "3. 不能只改连接词或同义词替换，要真正重构句子",
            "4. 口播感优先，每句12-28字",
            `原文：
${options.block.content}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });
  } catch {
    return null;
  }
}

async function resolveValidatedRewrite(options: {
  settings: ApiSettings;
  baseUrl: string;
  theme: string;
  block: ComposeBlock;
  candidateContent?: string | null;
}) {
  const originalContent = options.block.content.trim();
  let candidate = options.candidateContent?.trim() ?? "";
  let audit = candidate ? evaluateRewriteCandidate(options.block, candidate) : null;
  let repaired = false;
  let localRewritten = false;

  if (!candidate || !audit?.accepted) {
    const localCandidate = buildLocalRewrite(options.block);
    if (localCandidate && localCandidate !== originalContent) {
      const localAudit = evaluateRewriteCandidate(options.block, localCandidate);
      if (localAudit.accepted) {
        candidate = localCandidate;
        audit = localAudit;
        localRewritten = true;
      }
    }
  }

  if ((!candidate || !audit?.accepted) && !localRewritten) {
    const repairedContent = await dedupeSingleBlock({
      settings: options.settings,
      baseUrl: options.baseUrl,
      theme: options.theme,
      block: options.block,
      guardNote: audit?.note,
    });
    if (repairedContent?.trim()) {
      candidate = repairedContent.trim();
      audit = evaluateRewriteCandidate(options.block, candidate);
      repaired = true;
    }
  }

  if (!candidate || !audit?.accepted) {
    return {
      block: options.block,
      changed: false,
      repaired,
      guarded: true,
      comparison: null,
    };
  }

  if (candidate === originalContent) {
    return {
      block: options.block,
      changed: false,
      repaired: repaired || localRewritten,
      guarded: false,
      comparison: null,
    };
  }

  return {
    block: { ...options.block, content: candidate },
    changed: true,
    repaired,
    guarded: false,
    comparison: buildComparisonItem(options.block, candidate, audit),
  };
}

function buildResultWarning(options: {
  itemsFound: number;
  changedCount: number;
  repairedCount: number;
  localCount: number;
  guardedCount: number;
}) {
  if (options.guardedCount > 0) {
    return `其中 ${options.guardedCount} 段触发保真保护，已保留原文。`;
  }
  if (options.itemsFound === 0 && options.changedCount > 0) {
    return "主模型返回不稳定，已按单段兜底去重。";
  }
  if (options.itemsFound === 0) {
    return "去重结果为空，已保留原文。";
  }
  if (options.repairedCount > 0) {
    return `其中 ${options.repairedCount} 段先触发保真复检，已按单段重写修正。`;
  }
  if (options.changedCount === 0) {
    return "模型返回了结果，但内容与原文几乎一致。";
  }
  return null;
}

export async function dedupeComposeBlocks(options: {
  settings: ApiSettings;
  theme: string;
  blocks: ComposeBlock[];
  blockIds: string[];
}): Promise<DedupeResult> {
  const targetBlocks = options.blocks.filter((item) => options.blockIds.includes(item.id) && item.content.trim());
  if (!targetBlocks.length) {
    return { blocks: options.blocks, changed: false, warning: "没有选中可去重的板块。", comparisons: [] };
  }

  const baseUrl = normalizeBaseUrl(options.settings.baseUrl || "/api");

  try {
    const content = await callChatCompletion(baseUrl, options.settings, {
      model: settingsModel(options.settings),
      temperature: 0.28,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是短视频文案分块去重助手。你的任务是只降低表达重复度，不改变板块类型、核心命题、动作路径和事实信息。A 段必须继续爆，K/L 里的动作和入口不能改，句式和长度尽量贴近原文。对外只输出 JSON。",
        },
        {
          role: "user",
          content: [
            `主题：${options.theme}`,
            "请按原顺序重写以下板块。",
            "要求：",
            "1. 每个板块分别重写。",
            "2. 保留原逻辑、原结论、原事实，不要洗软爆点。",
            "3. 不要随意压字数，不要把一段改成摘要。",
            '4. 输出格式：{"items":[{"id":"原id","content":"重写后内容"}]}',
            ...targetBlocks.map((block) => buildDedupeRule(block)),
            JSON.stringify({
              items: targetBlocks.map((item) => ({
                id: item.id,
                slotKey: item.slotKey,
                sectionType: item.sectionType,
                content: item.content,
              })),
            }),
          ].join("\n"),
        },
      ],
    });

    let parsed = safeJsonParse<unknown>(content) ?? safeJsonParse<unknown>(extractJsonBlock(content));
    if (!parsed) {
      const looseItems = extractItemsFromLooseJson(content);
      parsed = looseItems.length ? looseItems : null;
    }
    if (!parsed) {
      parsed = await repairDedupeJson({
        settings: options.settings,
        baseUrl,
        malformedContent: content,
        targetBlocks,
      });
    }

    const items = normalizeRewriteItems(parsed);
    const itemMap = new Map(items.map((item) => [item.id, item.content]));
    const nextBlocks = [...options.blocks];
    const comparisons: DedupeComparisonItem[] = [];
    let changedCount = 0;
    let repairedCount = 0;
    let localCount = 0;
    let guardedCount = 0;

    for (const target of targetBlocks) {
      const resolved = await resolveValidatedRewrite({
        settings: options.settings,
        baseUrl,
        theme: options.theme,
        block: target,
        candidateContent: itemMap.get(target.id) ?? null,
      });

      if (resolved.repaired) repairedCount += 1;
      if (resolved.repaired && !itemMap.has(target.id)) localCount += 1;
      if (resolved.guarded) guardedCount += 1;

      const index = nextBlocks.findIndex((item) => item.id === target.id);
      if (index >= 0) {
        nextBlocks[index] = resolved.block;
      }

      if (resolved.changed) {
        changedCount += 1;
        if (resolved.comparison) comparisons.push(resolved.comparison);
      }
    }

    return {
      blocks: nextBlocks,
      changed: changedCount > 0,
      warning: buildResultWarning({
        itemsFound: items.length,
        changedCount,
        repairedCount,
        localCount,
        guardedCount,
      }),
      comparisons,
    };
  } catch (error) {
    return {
      blocks: options.blocks,
      changed: false,
      warning: error instanceof Error ? error.message : "去重执行失败",
      comparisons: [],
    };
  }
}
