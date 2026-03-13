import type { ApiSettings } from "../types";
import type { ScriptSectionItem } from "./scriptLibrary";

export type ComposeSectionType = "A" | "B" | "C" | "D" | "F" | "G" | "H" | "I" | "J" | "K" | "L";
export type ComposeSlotKey = "A" | "B1" | "C1" | "D" | "B2" | "C2" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

export interface ComposeBlock {
  id: string;
  slotKey: ComposeSlotKey | string;
  sectionType: ComposeSectionType;
  title: string;
  content: string;
  bridgeText?: string;
  originalId: string | null;
  materialId: string | null;
  sourceKey: string | null;
  label: string;
  isManual: boolean;
}

export interface ComposeDiagnostic {
  level: "info" | "warning";
  title: string;
  detail: string;
}

export interface ComposeDraft {
  theme: string;
  primaryDirection: string;
  blocks: ComposeBlock[];
  diagnostics: ComposeDiagnostic[];
}

export interface ComposeReviewMetric {
  key: string;
  title: string;
  score: number;
  level: "good" | "watch" | "risk";
  summary: string;
  detail: string;
  relatedSlots: string[];
}

export interface ComposeSuggestion {
  id: string;
  blockId: string;
  slotKey: string;
  title: string;
  reason: string;
  preview: string;
  candidateMaterialId: string | null;
  candidateOriginalId: string | null;
  candidateSourceKey: string | null;
  candidateLabel: string;
  candidateContent: string;
}

export interface ComposeReview {
  overallScore: number;
  metrics: ComposeReviewMetric[];
  suggestions: ComposeSuggestion[];
}

const SLOT_BLUEPRINT: Array<{ slotKey: ComposeSlotKey; sectionType: ComposeSectionType; title: string }> = [
  { slotKey: "A", sectionType: "A", title: "开头爆点" },
  { slotKey: "B1", sectionType: "B", title: "第一次钩子" },
  { slotKey: "C1", sectionType: "C", title: "第一次筛选/指令" },
  { slotKey: "D", sectionType: "D", title: "铺垫" },
  { slotKey: "B2", sectionType: "B", title: "第二次钩子" },
  { slotKey: "C2", sectionType: "C", title: "第二次筛选/指令" },
  { slotKey: "F", sectionType: "F", title: "趋势判断" },
  { slotKey: "G", sectionType: "G", title: "旧逻辑/过去对比" },
  { slotKey: "H", sectionType: "H", title: "现实案例/权威佐证" },
  { slotKey: "I", sectionType: "I", title: "放大焦虑" },
  { slotKey: "J", sectionType: "J", title: "解法/新身份" },
  { slotKey: "K", sectionType: "K", title: "产品承接" },
  { slotKey: "L", sectionType: "L", title: "收口CTA" }
];

const MID_SLOT_KEYS: ComposeSlotKey[] = ["F", "G", "H", "I", "J"];

const DIRECTION_KEYWORDS = {
  "AI趋势": ["ai", "人工智能", "算法", "模型", "机器人", "系统", "数字人", "算力", "效率"],
  财富: ["财富", "资产", "财商", "黄金", "保险", "股市", "房产", "现金流", "配置"],
  认知: ["认知", "趋势", "判断", "清醒", "分水岭", "逻辑", "规则", "决策"]
} as const;

const TYPE_MARKERS: Record<ComposeSectionType, string[]> = {
  A: ["别", "千万", "一定", "告诉你", "记住", "马上", "最值钱", "最危险"],
  B: ["接下来", "往下听", "后面", "认真听", "最重要", "关键"],
  C: ["点赞", "收藏", "转发", "分享", "评论", "留言", "关注", "发消息"],
  D: ["为什么", "因为", "其实", "现在", "意味着", "正在", "关键是"],
  F: ["未来", "趋势", "时代", "正在", "意味着", "重构", "核心变量", "分水岭"],
  G: ["过去", "以前", "曾经", "当年", "错过", "回想", "那时候"],
  H: ["案例", "比如", "数据", "已经", "公司", "新闻", "现实", "采访"],
  I: ["危险", "焦虑", "淘汰", "来不及", "扛不住", "边缘化", "断崖", "冲击"],
  J: ["你要", "学会", "应该", "最快的方式", "路径", "方法", "成为", "升级"],
  K: ["直播", "训练营", "公开课", "带你", "第一天", "第二天", "入口", "系统"],
  L: ["点开", "关注", "发消息", "进入", "直播入口", "现在就", "点击"]
};

const TRANSITION_MARKERS: Partial<Record<ComposeSlotKey, string[]>> = {
  B1: ["接下来", "认真听", "往下听", "后面"],
  C1: ["点赞", "收藏", "转发", "分享"],
  D: ["为什么", "因为", "其实", "现实"],
  B2: ["后面", "接下来", "更重要", "关键"],
  C2: ["如果你", "评论", "转发", "点亮"],
  F: ["未来", "趋势", "正在", "意味着"],
  G: ["过去", "以前", "当年", "回头看"],
  H: ["案例", "数据", "现实", "公司"],
  I: ["如果", "危险", "焦虑", "淘汰"],
  J: ["你要", "应该", "学会", "最快的方式"],
  K: ["我给你", "带你", "直播", "训练营", "公开课"],
  L: ["点开", "关注", "发消息", "直播入口"]
};

function normalizeText(value: string) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function splitSentences(value: string) {
  return value
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sentenceCount(value: string) {
  return splitSentences(value).length;
}

function extractKeywords(value: string) {
  const text = normalizeText(value);
  const pieces = text.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean);
  const keywords = new Set<string>();
  for (const piece of pieces) {
    if (piece.length >= 2) keywords.add(piece);
  }
  return Array.from(keywords);
}

function overlapScore(left: string, right: string) {
  const leftKeywords = extractKeywords(left);
  const rightKeywords = new Set(extractKeywords(right));
  let score = 0;
  for (const keyword of leftKeywords) {
    if (rightKeywords.has(keyword)) {
      score += keyword.length >= 4 ? 6 : 3;
    }
  }
  return score;
}

function keywordScore(keywords: string[], content: string) {
  const normalized = normalizeText(content);
  let score = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) {
      score += keyword.length >= 4 ? 8 : 4;
    }
  }
  return score;
}

function markerScore(markers: string[], content: string) {
  const normalized = normalizeText(content);
  let score = 0;
  for (const marker of markers) {
    if (normalized.includes(normalizeText(marker))) {
      score += marker.length >= 4 ? 5 : 3;
    }
  }
  return score;
}

function containsAny(content: string, markers: string[]) {
  const normalized = normalizeText(content);
  return markers.some((marker) => normalized.includes(normalizeText(marker)));
}

function slotSpecificAdjustment(slotKey: ComposeSlotKey, content: string) {
  let score = 0;

  if (slotKey === "D") {
    if (containsAny(content, ["最赚钱", "最暴利", "第四次工业革命", "硬通货", "翻身最快", "浪尖上冲浪"])) score -= 18;
    if (!containsAny(content, ["为什么", "因为", "其实", "现实", "现在", "意味着", "正在"])) score -= 8;
  }

  if (slotKey === "G" && !containsAny(content, ["过去", "以前", "当年", "曾经", "错过", "回头看"])) score -= 16;
  if (slotKey === "H" && !containsAny(content, ["比如", "案例", "采访", "现实", "公司", "数据", "新闻", "已经"])) score -= 14;
  if (slotKey === "I" && !containsAny(content, ["危险", "焦虑", "淘汰", "冲击", "断崖", "边缘化", "来不及", "风险"])) score -= 14;
  if (slotKey === "J" && !containsAny(content, ["你要", "应该", "学会", "方式", "路径", "方法", "成为", "升级", "突破口"])) score -= 14;

  return score;
}

function richnessScore(content: string) {
  const length = content.trim().length;
  const sentences = sentenceCount(content);
  return Math.min(length / 20, 28) + Math.min(sentences * 4, 20);
}

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function metricLevel(score: number): "good" | "watch" | "risk" {
  if (score >= 78) return "good";
  if (score >= 55) return "watch";
  return "risk";
}

function canonicalDirection(value: string) {
  const normalized = normalizeText(value);
  if (
    normalized.includes("ai") ||
    normalized.includes("人工智能") ||
    normalized.includes("算法") ||
    normalized.includes("模型") ||
    normalized.includes("机器人") ||
    normalized.includes("数字人") ||
    normalized.includes("效率") ||
    normalized.includes("算力")
  ) {
    return "ai";
  }
  if (
    normalized.includes("财富") ||
    normalized.includes("资产") ||
    normalized.includes("财商") ||
    normalized.includes("黄金") ||
    normalized.includes("房产") ||
    normalized.includes("保险")
  ) {
    return "wealth";
  }
  if (
    normalized.includes("认知") ||
    normalized.includes("趋势") ||
    normalized.includes("分水岭") ||
    normalized.includes("清醒") ||
    normalized.includes("规则")
  ) {
    return "cognition";
  }
  return normalized;
}

function countSourceUsage(originalId: string | null | undefined, blocks: ComposeBlock[]) {
  if (!originalId) return 0;
  return blocks.filter((block) => block.originalId === originalId).length;
}

function createBlockFromItem(
  slot: { slotKey: ComposeSlotKey; sectionType: ComposeSectionType; title: string },
  item: ScriptSectionItem | null,
  contentOverride?: string
): ComposeBlock {
  return {
    id: `${slot.slotKey}-${item?.materialId || "manual"}-${Math.random().toString(36).slice(2, 7)}`,
    slotKey: slot.slotKey,
    sectionType: slot.sectionType,
    title: slot.title,
    content: contentOverride ?? item?.content ?? "",
    originalId: item?.originalId ?? null,
    materialId: item?.materialId ?? null,
    sourceKey: item?.sourceKey ?? null,
    label: item?.label ?? slot.sectionType,
    isManual: !item
  };
}

function stripFirstSentence(value: string) {
  const sentences = splitSentences(value);
  if (sentences.length <= 1) return "";
  return sentences.slice(1).join("。");
}

function buildCustomAHybrid(customHook: string, primaryA: ScriptSectionItem | null, fallbackA: ScriptSectionItem | null) {
  const hook = customHook.trim();
  if (!hook) return primaryA?.content ?? "";
  if (!primaryA) return hook;

  let content = hook;
  if (sentenceCount(content) < 3) {
    const primaryTail = stripFirstSentence(primaryA.content);
    if (primaryTail) {
      content = `${content}${/[。！？!?]$/.test(content) ? "" : "。"}${primaryTail}`;
    }
  }

  if (sentenceCount(content) < 3 && fallbackA) {
    const fallbackTail = stripFirstSentence(fallbackA.content);
    if (fallbackTail) {
      content = `${content}${/[。！？!?]$/.test(content) ? "" : "。"}${fallbackTail}`;
    }
  }

  return content;
}

function getThemeKeywords(theme: string, primaryDirection: string) {
  const themeKeywords = extractKeywords(theme);
  const matchedDirection =
    Object.entries(DIRECTION_KEYWORDS).find(([label]) => canonicalDirection(label) === canonicalDirection(primaryDirection))?.[1] ?? [];
  return Array.from(new Set([...themeKeywords, ...matchedDirection]));
}

function blockSuitability(
  slotKey: ComposeSlotKey,
  item: ScriptSectionItem,
  themeKeywords: string[],
  previousContent: string,
  previousBlock: ComposeBlock | null,
  blocks: ComposeBlock[],
  primaryDirection: string
) {
  let score = 0;
  score += keywordScore(themeKeywords, item.content);
  score += markerScore(TYPE_MARKERS[item.type as ComposeSectionType] ?? [], item.content);
  score += markerScore(TRANSITION_MARKERS[slotKey] ?? [], item.content);
  score += richnessScore(item.content);
  score += slotSpecificAdjustment(slotKey, item.content);
  score += overlapScore(previousContent, item.content) * 0.65;

  if (previousBlock?.originalId && previousBlock.originalId === item.originalId) {
    score -= 18;
  }

  if (countSourceUsage(item.originalId, blocks) >= 1) {
    score -= 12;
  }

  if (slotKey === "B2" || slotKey === "C2") {
    const sameTypeBlocks = blocks.filter((block) => block.sectionType === item.type);
    for (const block of sameTypeBlocks) {
      const overlap = overlapScore(block.content, item.content);
      if (overlap >= 12) score -= 24;
      else if (overlap >= 8) score -= 12;
    }
  }

  if (slotKey === "A" && sentenceCount(item.content) < 2) score -= 20;
  if ((slotKey === "B1" || slotKey === "B2" || slotKey === "C1" || slotKey === "C2") && sentenceCount(item.content) < 2) score -= 12;
  if (MID_SLOT_KEYS.includes(slotKey) && sentenceCount(item.content) < 3) score -= 20;
  if ((slotKey === "K" || slotKey === "L") && canonicalDirection(primaryDirection) !== canonicalDirection(item.primaryDirection)) score -= 25;

  return score;
}

function rankCandidates(
  slotKey: ComposeSlotKey,
  sectionType: ComposeSectionType,
  sections: ScriptSectionItem[],
  themeKeywords: string[],
  previousContent: string,
  previousBlock: ComposeBlock | null,
  blocks: ComposeBlock[],
  primaryDirection: string
) {
  return sections
    .filter((item) => item.type === sectionType)
    .map((item) => ({
      item,
      score: blockSuitability(slotKey, item, themeKeywords, previousContent, previousBlock, blocks, primaryDirection)
    }))
    .sort((left, right) => right.score - left.score);
}

function pickBestCandidate(
  slotKey: ComposeSlotKey,
  ranked: Array<{ item: ScriptSectionItem; score: number }>,
  blocks: ComposeBlock[],
  usedMaterialIds: Set<string>,
  blockedMaterialId?: string | null
) {
  const passes = [
    (item: ScriptSectionItem) =>
      !usedMaterialIds.has(item.materialId) &&
      item.materialId !== blockedMaterialId &&
      countSourceUsage(item.originalId, blocks) === 0,
    (item: ScriptSectionItem) =>
      !usedMaterialIds.has(item.materialId) &&
      item.materialId !== blockedMaterialId &&
      countSourceUsage(item.originalId, blocks) <= 1,
    (item: ScriptSectionItem) => !usedMaterialIds.has(item.materialId) && item.materialId !== blockedMaterialId,
    (item: ScriptSectionItem) => item.materialId !== blockedMaterialId
  ];

  for (const pass of passes) {
    const found = ranked.find(({ item }) => pass(item));
    if (found) return found.item;
  }

  return slotKey === "K" || slotKey === "L" ? ranked[0]?.item ?? null : null;
}

export function inferPrimaryDirection(theme: string) {
  const normalized = normalizeText(theme);
  for (const [label, keywords] of Object.entries(DIRECTION_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(normalizeText(keyword)))) {
      return label;
    }
  }
  return "AI趋势";
}

export function composeDraftFromSections(options: {
  theme: string;
  primaryDirection: string;
  customHook?: string;
  sections: ScriptSectionItem[];
}) {
  const theme = options.theme.trim();
  const targetDirection = canonicalDirection(options.primaryDirection);
  const themeKeywords = getThemeKeywords(theme, options.primaryDirection);
  const sections = options.sections.filter((item) => canonicalDirection(item.primaryDirection) === targetDirection);
  const blocks: ComposeBlock[] = [];
  const diagnostics: ComposeDiagnostic[] = [];
  const usedMaterialIds = new Set<string>();
  let previousContent = theme;
  let previousBlock: ComposeBlock | null = null;

  for (const slot of SLOT_BLUEPRINT) {
    const ranked = rankCandidates(
      slot.slotKey,
      slot.sectionType,
      sections,
      themeKeywords,
      previousContent,
      previousBlock,
      blocks,
      options.primaryDirection
    );

    const selected = pickBestCandidate(slot.slotKey, ranked, blocks, usedMaterialIds);
    if (!selected) {
      blocks.push(createBlockFromItem(slot, null, ""));
      diagnostics.push({
        level: "warning",
        title: `${slot.title} 暂时缺位`,
        detail: "当前素材库里没有找到足够合适的候选，后面可以手动插入，或者再点一次重新匹配。"
      });
      continue;
    }

    usedMaterialIds.add(selected.materialId);

    let overrideContent: string | undefined;
    if (slot.slotKey === "A" && options.customHook?.trim()) {
      const fallbackA = ranked.find(({ item }) => item.materialId !== selected.materialId)?.item ?? null;
      overrideContent = buildCustomAHybrid(options.customHook, selected, fallbackA);
      if (fallbackA && sentenceCount(overrideContent) >= 3) {
        usedMaterialIds.add(fallbackA.materialId);
      }
    }

    const block = createBlockFromItem(slot, selected, overrideContent);
    blocks.push(block);
    previousContent = block.content || previousContent;
    previousBlock = block;
  }

  const finalizedBlocks = finalizeComposeBlocks(theme, blocks);
  diagnostics.push(...buildComposeDiagnostics(theme, finalizedBlocks));
  return {
    theme,
    primaryDirection: options.primaryDirection,
    blocks: finalizedBlocks,
    diagnostics
  } satisfies ComposeDraft;
}

export function buildComposeDiagnostics(theme: string, blocks: ComposeBlock[]) {
  const diagnostics: ComposeDiagnostic[] = [];

  const requiredSlots: ComposeSlotKey[] = ["A", "D", "F", "I", "J"];
  for (const slot of requiredSlots) {
    const block = blocks.find((item) => item.slotKey === slot);
    if (!block?.content.trim()) {
      diagnostics.push({
        level: "warning",
        title: `${slot} 缺失`,
        detail: `当前草稿缺少 ${slot}，整篇会明显变薄，建议先补齐。`
      });
    }
  }

  const hBlock = blocks.find((item) => item.slotKey === "H" && item.content.trim());
  if (!hBlock) {
    diagnostics.push({
      level: "warning",
      title: "缺少 H 现实锚点",
      detail: "没有 H，整篇容易只剩观点和判断，缺少能让用户信服的现实抓手。"
    });
  }

  const kBlock = blocks.find((item) => item.slotKey === "K" && item.content.trim());
  const lBlock = blocks.find((item) => item.slotKey === "L" && item.content.trim());
  if (!kBlock || !lBlock) {
    diagnostics.push({
      level: "warning",
      title: "K / L 承接不完整",
      detail: "当前草稿缺少产品承接或最终动作，后段会收不住，导流力度也会偏弱。"
    });
  }

  const bBlocks = blocks.filter((item) => item.sectionType === "B" && item.content.trim());
  if (bBlocks.length >= 2 && overlapScore(bBlocks[0].content, bBlocks[1].content) >= 12) {
    diagnostics.push({
      level: "warning",
      title: "B1 / B2 太像",
      detail: "两轮钩子的作用不同，现在这两段太像，建议把第二轮憋单换得更狠一点。"
    });
  }

  const cBlocks = blocks.filter((item) => item.sectionType === "C" && item.content.trim());
  if (cBlocks.length >= 2 && overlapScore(cBlocks[0].content, cBlocks[1].content) >= 12) {
    diagnostics.push({
      level: "warning",
      title: "C1 / C2 太像",
      detail: "两轮动作/筛选现在过于重复，容易像复读，建议重配其中一条。"
    });
  }

  const middleBlocks = blocks.filter((item) => MID_SLOT_KEYS.includes(item.slotKey as ComposeSlotKey) && item.content.trim());
  if (middleBlocks.length < 4) {
    diagnostics.push({
      level: "warning",
      title: "中段说服链偏薄",
      detail: "F/G/H/I/J 有效内容不足四段，整篇容易像提纲，不像完整口播。"
    });
  }

  let middleCohesion = 0;
  for (let index = 1; index < middleBlocks.length; index += 1) {
    middleCohesion += overlapScore(middleBlocks[index - 1].content, middleBlocks[index].content);
  }
  if (middleBlocks.length >= 3 && middleCohesion < middleBlocks.length * 4) {
    diagnostics.push({
      level: "warning",
      title: "F/G/H/I/J 容易像资料堆",
      detail: "当前中段衔接感偏弱，建议优先重配中段，或手动插入一段桥接内容。"
    });
  }

  const repeatedSources = new Map<string, number>();
  for (const block of blocks) {
    if (!block.originalId) continue;
    repeatedSources.set(block.originalId, (repeatedSources.get(block.originalId) ?? 0) + 1);
  }
  if (Array.from(repeatedSources.values()).some((count) => count >= 3)) {
    diagnostics.push({
      level: "warning",
      title: "来源过于集中",
      detail: "当前草稿里有单篇原文被复用过多，中段会更像同一篇改写而不是素材组合。"
    });
  }

  if (!diagnostics.length) {
    diagnostics.push({
      level: "info",
      title: "当前草稿可继续精修",
      detail: `围绕主题“${theme || "未命名主题"}”已经组出一版可用结构，接下来更适合逐块优化和去重。`
    });
  }

  return diagnostics;
}

function buildSlotIssueReason(slotKey: string, block: ComposeBlock | undefined, currentScore: number) {
  if (!block?.content.trim()) {
    return `${slotKey} 当前缺位，先补上会比继续硬写顺很多。`;
  }
  if (sentenceCount(block.content) < 3 && MID_SLOT_KEYS.includes(slotKey as ComposeSlotKey)) {
    return `${slotKey} 现在太薄，单独拿出来更像提纲，不像完整口播。`;
  }
  if (slotKey === "H") {
    return "这条现实锚点不够落地，换一条更有案例感的 H，会更容易让人信。";
  }
  if (slotKey === "I") {
    return "这条危机感还不够往用户自己身上压，换一条更痛的 I，承接会更稳。";
  }
  if (slotKey === "J") {
    return "这条解法像结论摘要，换一条更像路径的 J，会更能带动作。";
  }
  if (slotKey === "D") {
    return "这条铺垫太像结论或太薄，换一条更能把题立住的 D 会更顺。";
  }
  if (slotKey === "K" || slotKey === "L") {
    return "这段承接偏弱，换一条更顺的 K/L 能减少后段的硬卖感。";
  }
  if (slotKey === "B2" || slotKey === "C2") {
    return `${slotKey} 和第一轮太像，换一条更有第二次憋单感的内容更稳。`;
  }
  if (currentScore < 26) {
    return `${slotKey} 当前适配度偏低，建议先换一条再看整稿。`;
  }
  return `${slotKey} 还能更顺，换一条高分候选会更稳。`;
}

function summarizePreview(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > 64 ? `${normalized.slice(0, 64)}...` : normalized;
}

function createSuggestionId(blockId: string, materialId: string | null) {
  return `${blockId}-${materialId || "manual"}`;
}

function buildComposeSuggestions(options: {
  theme: string;
  blocks: ComposeBlock[];
  sections: ScriptSectionItem[];
  primaryDirection: string;
}) {
  const targetDirection = canonicalDirection(options.primaryDirection);
  const library = options.sections.filter((item) => canonicalDirection(item.primaryDirection) === targetDirection);
  const themeKeywords = getThemeKeywords(options.theme, options.primaryDirection);
  const suggestions: ComposeSuggestion[] = [];

  const byId = new Map(options.blocks.map((block, index) => [block.id, { block, index }]));
  const slotBlocks = new Map(options.blocks.map((block) => [String(block.slotKey), block]));

  const suggestionTargets: Array<{ slotKey: ComposeSlotKey; minScore: number }> = [
    { slotKey: "D", minScore: 26 },
    { slotKey: "B2", minScore: 24 },
    { slotKey: "C2", minScore: 24 },
    { slotKey: "F", minScore: 34 },
    { slotKey: "G", minScore: 30 },
    { slotKey: "H", minScore: 32 },
    { slotKey: "I", minScore: 32 },
    { slotKey: "J", minScore: 32 },
    { slotKey: "K", minScore: 28 },
    { slotKey: "L", minScore: 28 }
  ];

  for (const target of suggestionTargets) {
    const current = slotBlocks.get(target.slotKey);
    if (!current) continue;

    const currentMeta = byId.get(current.id);
    const previousBlock = currentMeta && currentMeta.index > 0 ? options.blocks[currentMeta.index - 1] : null;
    const previousContent = previousBlock?.content || options.theme;
    const otherBlocks = options.blocks.filter((block) => block.id !== current.id);
    const usedMaterialIds = new Set(otherBlocks.filter((block) => block.materialId).map((block) => String(block.materialId)));

    const ranked = rankCandidates(
      target.slotKey,
      current.sectionType,
      library,
      themeKeywords,
      previousContent,
      previousBlock,
      otherBlocks,
      options.primaryDirection
    );

    const currentScore = current.materialId
      ? blockSuitability(
          target.slotKey,
          {
            originalId: current.originalId || "",
            theme: options.theme,
            primaryDirection: options.primaryDirection,
            secondaryDirection: "",
            audience: "",
            materialId: current.materialId,
            sourceKey: current.sourceKey || "",
            type: current.sectionType,
            index: null,
            sourceIndex: null,
            label: current.label,
            orderIndex: 0,
            content: current.content
          },
          themeKeywords,
          previousContent,
          previousBlock,
          otherBlocks,
          options.primaryDirection
        )
      : 0;

    const selected = pickBestCandidate(target.slotKey, ranked, otherBlocks, usedMaterialIds, current.materialId);
    if (!selected) continue;

    const selectedScore = ranked.find(({ item }) => item.materialId === selected.materialId)?.score ?? 0;
    const b1 = slotBlocks.get("B1");
    const c1 = slotBlocks.get("C1");
    const repeatedSecondRound =
      (target.slotKey === "B2" && b1 && overlapScore(b1.content, current.content) >= 12) ||
      (target.slotKey === "C2" && c1 && overlapScore(c1.content, current.content) >= 12);

    const shouldSuggest =
      !current.content.trim() ||
      repeatedSecondRound ||
      currentScore < target.minScore ||
      selectedScore - currentScore >= 10;

    if (!shouldSuggest) continue;

    suggestions.push({
      id: createSuggestionId(current.id, selected.materialId),
      blockId: current.id,
      slotKey: target.slotKey,
      title: `${current.title} 自动建议`,
      reason: buildSlotIssueReason(target.slotKey, current, currentScore),
      preview: summarizePreview(selected.content),
      candidateMaterialId: selected.materialId,
      candidateOriginalId: selected.originalId,
      candidateSourceKey: selected.sourceKey,
      candidateLabel: selected.label,
      candidateContent: selected.content
    });
  }

  return suggestions.slice(0, 6);
}

export function buildComposeReview(options: {
  theme: string;
  blocks: ComposeBlock[];
  sections: ScriptSectionItem[];
  primaryDirection: string;
}) {
  const slots = new Map(options.blocks.map((block) => [String(block.slotKey), block]));
  const openingSlots = ["A", "B1", "C1", "D", "B2", "C2"];
  const middleSlots = ["F", "G", "H", "I", "J"];
  const closingSlots = ["K", "L"];

  const openingBlocks = openingSlots.map((slot) => slots.get(slot)).filter(Boolean) as ComposeBlock[];
  const middleBlocks = middleSlots.map((slot) => slots.get(slot)).filter(Boolean) as ComposeBlock[];
  const closingBlocks = closingSlots.map((slot) => slots.get(slot)).filter(Boolean) as ComposeBlock[];

  const openingPresence = openingBlocks.filter((block) => block.content.trim()).length;
  const openingStrength =
    openingPresence * 10 +
    openingBlocks.reduce((sum, block) => sum + Math.min(sentenceCount(block.content), 4) * 3, 0) -
    (slots.get("B1") && slots.get("B2") && overlapScore(slots.get("B1")!.content, slots.get("B2")!.content) >= 12 ? 12 : 0) -
    (slots.get("C1") && slots.get("C2") && overlapScore(slots.get("C1")!.content, slots.get("C2")!.content) >= 12 ? 12 : 0);

  const middlePresence = middleBlocks.filter((block) => block.content.trim()).length;
  let cohesion = 0;
  for (let index = 1; index < middleBlocks.length; index += 1) {
    cohesion += overlapScore(middleBlocks[index - 1].content, middleBlocks[index].content);
    if (middleBlocks[index].bridgeText) cohesion += 4;
  }
  const middleStrength =
    middlePresence * 10 +
    middleBlocks.reduce((sum, block) => sum + Math.min(sentenceCount(block.content), 5) * 3, 0) +
    cohesion -
    (!slots.get("H")?.content.trim() ? 14 : 0) -
    (!slots.get("I")?.content.trim() ? 12 : 0) -
    (!slots.get("J")?.content.trim() ? 12 : 0);

  const closingStrength =
    closingBlocks.filter((block) => block.content.trim()).length * 16 +
    Math.min(sentenceCount(slots.get("K")?.content || ""), 5) * 3 +
    Math.min(sentenceCount(slots.get("L")?.content || ""), 5) * 3 -
    (!slots.get("K")?.content.trim() ? 18 : 0) -
    (!slots.get("L")?.content.trim() ? 22 : 0);

  const sourceUsage = new Map<string, number>();
  for (const block of options.blocks) {
    if (!block.originalId) continue;
    sourceUsage.set(block.originalId, (sourceUsage.get(block.originalId) ?? 0) + 1);
  }
  const maxSourceUsage = Math.max(0, ...Array.from(sourceUsage.values()));
  const sourceDiversityScore = 100 - Math.max(0, (maxSourceUsage - 1) * 18);

  const metrics: ComposeReviewMetric[] = [
    {
      key: "opening",
      title: "开场链评分",
      score: clampScore(openingStrength),
      level: metricLevel(clampScore(openingStrength)),
      summary: clampScore(openingStrength) >= 78 ? "开场抓停和立题都比较稳。" : "开场还有提升空间。",
      detail:
        clampScore(openingStrength) >= 78
          ? "A 到 D 的节奏基本顺，前两轮憋单也没有明显打架。"
          : "优先检查 B1/B2、C1/C2 是否太像，以及 D 有没有把题真正立住。",
      relatedSlots: openingSlots
    },
    {
      key: "middle",
      title: "中段推进评分",
      score: clampScore(middleStrength),
      level: metricLevel(clampScore(middleStrength)),
      summary: clampScore(middleStrength) >= 78 ? "中段推进感和说服链都比较完整。" : "中段还有资料堆风险。",
      detail:
        clampScore(middleStrength) >= 78
          ? "F/G/H/I/J 的承接已经比较自然，用户能顺着听下去。"
          : "中段要么桥不够，要么 H/I/J 偏薄，建议先看自动替换建议。",
      relatedSlots: middleSlots
    },
    {
      key: "closing",
      title: "承接收口评分",
      score: clampScore(closingStrength),
      level: metricLevel(clampScore(closingStrength)),
      summary: clampScore(closingStrength) >= 78 ? "后段承接和动作都比较完整。" : "后段可能会显得硬或收不住。",
      detail:
        clampScore(closingStrength) >= 78
          ? "K/L 已经具备承接逻辑，比较适合直接去重精修。"
          : "优先补强 K/L，避免前面刚说完就突然卖课或动作不清。",
      relatedSlots: closingSlots
    },
    {
      key: "diversity",
      title: "素材分散度评分",
      score: clampScore(sourceDiversityScore),
      level: metricLevel(clampScore(sourceDiversityScore)),
      summary: clampScore(sourceDiversityScore) >= 78 ? "当前来源分散度比较好。" : "当前来源过于集中。",
      detail:
        clampScore(sourceDiversityScore) >= 78
          ? "不会太像同一篇原文拆开重排。"
          : "同一篇原文复用太多，中段容易有重复感，建议优先换中段块。",
      relatedSlots: options.blocks.filter((block) => block.originalId).map((block) => String(block.slotKey))
    }
  ];

  const suggestions = buildComposeSuggestions(options);
  const overallScore = clampScore(
    metrics[0].score * 0.24 + metrics[1].score * 0.42 + metrics[2].score * 0.22 + metrics[3].score * 0.12
  );

  return {
    overallScore,
    metrics,
    suggestions
  } satisfies ComposeReview;
}

export function applyComposeSuggestion(blocks: ComposeBlock[], suggestion: ComposeSuggestion) {
  return blocks.map((block) =>
    block.id === suggestion.blockId
      ? {
          ...block,
          content: suggestion.candidateContent,
          originalId: suggestion.candidateOriginalId,
          materialId: suggestion.candidateMaterialId,
          sourceKey: suggestion.candidateSourceKey,
          label: suggestion.candidateLabel,
          isManual: false
        }
      : block
  );
}

export function rematchComposeBlock(options: {
  blocks: ComposeBlock[];
  targetId: string;
  sections: ScriptSectionItem[];
  theme: string;
  primaryDirection: string;
}) {
  const target = options.blocks.find((item) => item.id === options.targetId);
  if (!target) return options.blocks;

  const targetDirection = canonicalDirection(options.primaryDirection);
  const themeKeywords = getThemeKeywords(options.theme, options.primaryDirection);
  const otherBlocks = options.blocks.filter((item) => item.id !== target.id);
  const usedMaterialIds = new Set(otherBlocks.filter((item) => item.materialId).map((item) => String(item.materialId)));
  const targetIndex = options.blocks.findIndex((item) => item.id === target.id);
  const previousContent = targetIndex > 0 ? options.blocks[targetIndex - 1].content : options.theme;
  const previousBlock = targetIndex > 0 ? options.blocks[targetIndex - 1] : null;

  const ranked = rankCandidates(
    target.slotKey as ComposeSlotKey,
    target.sectionType,
    options.sections.filter((item) => canonicalDirection(item.primaryDirection) === targetDirection),
    themeKeywords,
    previousContent,
    previousBlock,
    otherBlocks,
    options.primaryDirection
  );

  const selected = pickBestCandidate(target.slotKey as ComposeSlotKey, ranked, otherBlocks, usedMaterialIds, target.materialId);
  if (!selected) return options.blocks;

  if (selected.materialId === target.materialId && selected.content.trim() === target.content.trim()) {
    return options.blocks;
  }

  return options.blocks.map((item) =>
    item.id === target.id
      ? {
          ...item,
          content: selected.content,
          originalId: selected.originalId,
          materialId: selected.materialId,
          sourceKey: selected.sourceKey,
          label: selected.label,
          isManual: false
        }
      : item
  );
}

export function insertManualComposeBlock(
  blocks: ComposeBlock[],
  afterId: string,
  sectionType: ComposeSectionType,
  content: string
) {
  const next = [...blocks];
  const index = next.findIndex((item) => item.id === afterId);
  if (index < 0) return blocks;
  next.splice(index + 1, 0, {
    id: `manual-${sectionType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    slotKey: `manual-${sectionType}`,
    sectionType,
    title: `手动插入 ${sectionType}`,
    content: content.trim(),
    originalId: null,
    materialId: null,
    sourceKey: null,
    label: sectionType,
    isManual: true
  });
  return next;
}

export function updateComposeBlock(blocks: ComposeBlock[], id: string, content: string) {
  return blocks.map((item) => (item.id === id ? { ...item, content } : item));
}

export function removeComposeBlock(blocks: ComposeBlock[], id: string) {
  return blocks.filter((item) => item.id !== id);
}

function hasNaturalBridgeLead(content: string) {
  return containsAny(content, ["所以", "但", "问题是", "回头看", "也正因为这样", "接下来", "说白了"]);
}

function chooseMiddleBridge(previousBlock: ComposeBlock | null, currentBlock: ComposeBlock, theme: string) {
  if (!previousBlock) return "";
  if (currentBlock.content.trim() && hasNaturalBridgeLead(currentBlock.content)) return "";
  if (currentBlock.slotKey === "F") return "说白了，围绕“" + (theme || "这个主题") + "”真正值得你盯住的，是后面这层更大的趋势。";
  if (currentBlock.slotKey === "G") return "回头看，所有大趋势真正爆发之前，其实都早有前兆。";
  if (currentBlock.slotKey === "H") return "如果你觉得这还只是判断，那就看看现实里已经发生了什么。";
  if (currentBlock.slotKey === "I") return "问题是，这些变化一旦落到普通人自己身上，代价会非常直接。";
  if (currentBlock.slotKey === "J") return "也正因为这样，接下来最重要的不是继续害怕，而是立刻换打法。";
  return "";
}

export function finalizeComposeBlocks(theme: string, blocks: ComposeBlock[]) {
  let previousMiddleBlock: ComposeBlock | null = null;
  return blocks.map((block) => {
    let bridgeText = "";
    if (MID_SLOT_KEYS.includes(block.slotKey as ComposeSlotKey)) {
      bridgeText = chooseMiddleBridge(previousMiddleBlock, block, theme);
      previousMiddleBlock = block;
    }
    return { ...block, bridgeText };
  });
}

export function composeFullText(blocks: ComposeBlock[]) {
  return blocks
    .map((item) => [item.bridgeText?.trim(), item.content.trim()].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

function normalizeApiBaseUrl(baseUrl: string) {
  return (baseUrl || "/api").replace(/\/+$/, "");
}

export async function dedupeComposeBlocks(options: {
  settings: ApiSettings;
  theme: string;
  blocks: ComposeBlock[];
  blockIds: string[];
}) {
  const targetBlocks = options.blocks.filter((item) => options.blockIds.includes(item.id) && item.content.trim());
  if (!targetBlocks.length) return options.blocks;

  const response = await fetch(`${normalizeApiBaseUrl(options.settings.baseUrl || "/api")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.settings.apiKey ? { Authorization: `Bearer ${options.settings.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: options.settings.mainModel || "gemini-3-flash",
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是短视频文案分块去重助手。你的任务是只降低表达重复度，不改变板块类型、核心命题、动作路径和事实信息。A段必须继续爆，K/L里的动作指令不能改，只能换说法。只输出 JSON。"
        },
        {
          role: "user",
          content: [
            `主题：${options.theme}`,
            "请按原顺序重写以下板块。",
            "要求：",
            "1. 每个板块分别重写。",
            "2. 保留原逻辑、原结论、原事实，不要洗软爆点。",
            "3. 输出格式：{\"items\":[{\"id\":\"原id\",\"content\":\"重写后内容\"}]}",
            JSON.stringify({
              items: targetBlocks.map((item) => ({
                id: item.id,
                slotKey: item.slotKey,
                sectionType: item.sectionType,
                content: item.content
              }))
            })
          ].join("\n")
        }
      ]
    })
  });

  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | { detail?: string }
    | null;

  if (!response.ok) {
    const detail = payload && "detail" in payload ? payload.detail : null;
    throw new Error(typeof detail === "string" && detail.trim() ? detail : "去重调用失败");
  }

  const content = payload && "choices" in payload ? payload.choices?.[0]?.message?.content : null;
  if (!content) {
    throw new Error("去重没有返回可用结果");
  }

  let parsed: { items?: Array<{ id: string; content: string }> } | null = null;
  try {
    parsed = JSON.parse(content) as { items?: Array<{ id: string; content: string }> };
  } catch {
    throw new Error("去重结果不是合法 JSON");
  }

  const rewritten = new Map<string, string>();
  for (const item of parsed?.items ?? []) {
    if (item?.id && typeof item.content === "string" && item.content.trim()) {
      rewritten.set(item.id, item.content.trim());
    }
  }

  if (!rewritten.size) {
    throw new Error("去重结果为空");
  }

  return options.blocks.map((block) => {
    const nextContent = rewritten.get(block.id);
    return nextContent ? { ...block, content: nextContent } : block;
  });
}
