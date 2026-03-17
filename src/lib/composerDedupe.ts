import type { ApiSettings } from "../types";
import type { ComposeBlock, DedupeComparisonItem, DedupeResult } from "./composerTypes";
import { normalizeBaseUrl } from "./http";
import { safeJsonParse } from "./modelResponse";
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
  return settings.mainModel || settings.polishModel || "gemini-2.0-flash";
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

function normalizeRewriteBaseline(text: string) {
  return normalizeText(text).replace(/[\u3002\uff0c\uff1f\uff01!?\uff1b;\u3001,:\uff1a"'\u201c\u201d\u2018\u2019()\uff08\uff09\u3010\u3011\u300a\u300b<>]/g, "");
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
      note: "\u53bb\u91cd\u7ed3\u679c\u4e3a\u7a7a\uff0c\u5df2\u4fdd\u7559\u539f\u6587\u3002",
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  if (normalizeRewriteBaseline(before) === normalizeRewriteBaseline(after)) {
    return {
      accepted: false,
      verdict: "watch",
      note: "\u6539\u5199\u548c\u539f\u6587\u51e0\u4e4e\u4e00\u6837\uff0c\u7b49\u4e8e\u6ca1\u53bb\u91cd\u3002",
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
      note: `\u5b57\u6570\u53d8\u5316\u8fc7\u5927\uff0c\u539f\u6587\u7ea6 ${beforeLength} \u5b57\uff0c\u5f53\u524d\u7ea6 ${afterLength} \u5b57\u3002`,
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
      note: `\u5173\u952e\u6570\u5b57\u6216\u786c\u4fe1\u606f\u4e22\u4e86\uff1a${missingHardTokens.slice(0, 3).join("\u3001")}\u3002`,
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
      note: `\u6539\u5199\u91cc\u65b0\u585e\u8fdb\u4e86\u4e1a\u52a1\u8bcd\uff1a${injectedBusinessTerms.slice(0, 3).join("\u3001")}\u3002`,
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
      note: `\u5173\u952e\u52a8\u4f5c\u6216\u5165\u53e3\u4e22\u4e86\uff1a${missingActionTerms.slice(0, 3).join("\u3001")}\u3002`,
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
      note: `\u53e5\u6570\u53d8\u5316\u592a\u5927\uff0c\u539f\u6587\u7ea6 ${beforeSentenceCount} \u53e5\uff0c\u5f53\u524d\u7ea6 ${afterSentenceCount} \u53e5\u3002`,
      beforeLength,
      afterLength,
      lengthDelta,
      similarityScore,
    };
  }

  if (/[\uff1f?]/.test(before) && !/[\uff1f?]/.test(after) && ["A", "B", "C"].includes(block.sectionType)) {
    return {
      accepted: false,
      verdict: "watch",
      note: "\u539f\u6587\u662f\u7591\u95ee\u5f0f\u6293\u505c\uff0c\u6539\u5199\u540e\u628a\u95ee\u611f\u6d17\u6389\u4e86\u3002",
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
      note: "\u6539\u5199\u504f\u79bb\u539f\u6587\u8fc7\u5927\uff0c\u6838\u5fc3\u7206\u70b9\u6216\u8bba\u8bc1\u65b9\u5411\u4e0d\u591f\u50cf\u3002",
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
    note: stable ? "\u6838\u5fc3\u7206\u70b9\u3001\u957f\u5ea6\u611f\u548c\u53e5\u5f0f\u8282\u594f\u57fa\u672c\u4fdd\u4f4f\u4e86\u3002" : "\u6838\u5fc3\u70b9\u8fd8\u5728\uff0c\u4f46\u5b57\u6570\u6216\u53e5\u5f0f\u53d8\u5316\u7a0d\u5927\uff0c\u5efa\u8bae\u5bf9\u7167\u539f\u6587\u590d\u6838\u3002",
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
  // 从 messages 中提取 prompt
  const messages = body.messages as Array<{ role: string; content: string }> | undefined;
  const systemContent = messages?.find((m) => m.role === "system")?.content || "";
  const userContent = messages?.find((m) => m.role === "user")?.content || "";
  const fullPrompt = [systemContent, "", userContent].join("\n");

  const response = await fetch(`${baseUrl}/generate-json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      model: body.model || settings.mainModel,
      max_tokens: 4096,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { result?: unknown; error?: { message?: string } }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message || "去重调用失败";
    throw new Error(message);
  }

  // 直接返回 result，因为 /generate-json 已经返回解析好的 JSON
  return payload?.result;
}

// 用于单段改写的纯文本调用（不需要 JSON 输出）
async function callTextRewrite(baseUrl: string, settings: ApiSettings, prompt: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/generate-json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt + "\n\n只输出改写后的正文，用 JSON 格式 {\"content\": \"改写后的内容\"}",
        model: settings.mainModel,
        max_tokens: 2048,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { result?: { content?: string } | string; error?: { message?: string } }
      | null;

    if (!response.ok || payload?.error) {
      return null;
    }

    const result = payload?.result;
    if (typeof result === "string") return result.trim();
    if (typeof result === "object" && result?.content) return result.content.trim();
    return null;
  } catch {
    return null;
  }
}

async function repairDedupeJson(options: {
  settings: ApiSettings;
  baseUrl: string;
  malformedContent: string;
  targetBlocks: ComposeBlock[];
}) {
  try {
    const result = await callChatCompletion(options.baseUrl, options.settings, {
      model: settingsModel(options.settings),
      temperature: 0.1,
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
    // callChatCompletion 现在直接返回解析好的 JSON
    return result;
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
  const prompt = [
    "\u4f60\u662f\u77ed\u89c6\u9891\u6587\u6848\u6539\u5199\u4e13\u5bb6\u3002\u4efb\u52a1\u662f\u5bf9\u7ed9\u5b9a\u6bb5\u843d\u8fdb\u884c\u771f\u6b63\u7684\u53bb\u91cd\u6539\u5199\u2014\u2014\u7528\u5168\u65b0\u7684\u53e5\u5f0f\u548c\u8868\u8fbe\u91cd\u5199\uff0c\u800c\u4e0d\u662f\u53ea\u6539\u51e0\u4e2a\u5b57\u3002\u4fdd\u7559\u6838\u5fc3\u547d\u9898\u3001\u5173\u952e\u6570\u5b57\u548c\u903b\u8f91\u987a\u5e8f\uff0c\u4f46\u53e5\u5b50\u7ed3\u6784\u3001\u7528\u8bcd\u3001\u8bed\u5e8f\u90fd\u8981\u6709\u660e\u663e\u53d8\u5316\u3002\u5b57\u6570\u4fdd\u6301\u76f8\u8fd1\u3002",
    "",
    `\u4e3b\u9898\uff1a${options.theme}`,
    `\u677f\u5757\u7c7b\u578b\uff1a${options.block.sectionType}`,
    ...buildBlockConstraintLines(options.block),
    options.guardNote ? `\u4e0a\u6b21\u6539\u5199\u88ab\u6253\u56de\u539f\u56e0\uff1a${options.guardNote}` : "",
    "\u6539\u5199\u8981\u6c42\uff1a",
    "1. \u81f3\u5c1160%\u7684\u53e5\u5b50\u5fc5\u987b\u7528\u5168\u65b0\u7684\u8868\u8fbe\u65b9\u5f0f\u91cd\u5199",
    "2. \u4fdd\u7559\u539f\u6587\u6838\u5fc3\u547d\u9898\u3001\u6570\u5b57\u3001\u4eba\u540d\u3001\u5e73\u53f0\u540d\u7b49\u5173\u952e\u4e8b\u5b9e",
    "3. \u4e0d\u80fd\u53ea\u6539\u8fde\u63a5\u8bcd\u6216\u540c\u4e49\u8bcd\u66ff\u6362\uff0c\u8981\u771f\u6b63\u91cd\u6784\u53e5\u5b50",
    "4. \u5982\u679c\u6539\u5199\u540e\u548c\u539f\u6587\u4e00\u6837\uff0c\u6216\u53ea\u6539\u4e00\u4e24\u4e2a\u5b57\uff0c\u7b97\u5931\u8d25\uff0c\u5fc5\u987b\u7ee7\u7eed\u91cd\u5199",
    "5. \u53e3\u64ad\u611f\u4f18\u5148\uff0c\u6bcf\u53e512-28\u5b57",
    `\u539f\u6587\uff1a\n${options.block.content}`,
  ].filter(Boolean).join("\n");

  return callTextRewrite(options.baseUrl, options.settings, prompt);
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
            "\u4f60\u662f\u77ed\u89c6\u9891\u6587\u6848\u5206\u5757\u53bb\u91cd\u52a9\u624b\u3002\u4f60\u7684\u4efb\u52a1\u662f\u53ea\u964d\u4f4e\u8868\u8fbe\u91cd\u590d\u5ea6\uff0c\u4e0d\u6539\u53d8\u677f\u5757\u7c7b\u578b\u3001\u6838\u5fc3\u547d\u9898\u3001\u52a8\u4f5c\u8def\u5f84\u548c\u4e8b\u5b9e\u4fe1\u606f\u3002A \u6bb5\u5fc5\u987b\u7ee7\u7eed\u7206\uff0cK/L \u91cc\u7684\u52a8\u4f5c\u548c\u5165\u53e3\u4e0d\u80fd\u6539\uff0c\u53e5\u5f0f\u548c\u957f\u5ea6\u5c3d\u91cf\u8d34\u8fd1\u539f\u6587\u3002\u539f\u6837\u8fd4\u56de\u3001\u53ea\u6362\u6807\u70b9\u3001\u53ea\u6362\u4e00\u4e24\u4e2a\u8bcd\u90fd\u7b97\u5931\u8d25\uff0c\u5fc5\u987b\u7ee7\u7eed\u91cd\u5199\u3002\u5bf9\u5916\u53ea\u8f93\u51fa JSON\u3002",
        },
        {
          role: "user",
          content: [
            `\u4e3b\u9898\uff1a${options.theme}`,
            "\u8bf7\u6309\u539f\u987a\u5e8f\u91cd\u5199\u4ee5\u4e0b\u677f\u5757\u3002",
            "\u8981\u6c42\uff1a",
            "1. \u6bcf\u4e2a\u677f\u5757\u5206\u522b\u91cd\u5199\u3002",
            "2. \u4fdd\u7559\u539f\u903b\u8f91\u3001\u539f\u7ed3\u8bba\u3001\u539f\u4e8b\u5b9e\uff0c\u4e0d\u8981\u6d17\u8f6f\u7206\u70b9\u3002",
            "3. \u4e0d\u8981\u968f\u610f\u538b\u5b57\u6570\uff0c\u4e0d\u8981\u628a\u4e00\u6bb5\u6539\u6210\u6458\u8981\u3002",
            "4. \u539f\u6837\u8fd4\u56de\u3001\u53ea\u6539\u6807\u70b9\u3001\u53ea\u6362\u4e00\u4e24\u4e2a\u8bcd\uff0c\u90fd\u7b97\u5931\u8d25\u3002",
            '5. \u8f93\u51fa\u683c\u5f0f\uff1a{"items":[{"id":"\u539fid","content":"\u91cd\u5199\u540e\u5185\u5bb9"}]}',
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

    // callChatCompletion 现在直接返回解析好的 JSON 对象
    let parsed: unknown = content;

    // 如果返回的是字符串（兜底情况），尝试解析
    if (typeof content === "string") {
      parsed = safeJsonParse<unknown>(content);
      if (!parsed) {
        const looseItems = extractItemsFromLooseJson(content);
        parsed = looseItems.length ? looseItems : null;
      }
    }

    if (!parsed) {
      parsed = await repairDedupeJson({
        settings: options.settings,
        baseUrl,
        malformedContent: typeof content === "string" ? content : JSON.stringify(content),
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
