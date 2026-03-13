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

const SLOT_BLUEPRINT: Array<{ slotKey: ComposeSlotKey; sectionType: ComposeSectionType; title: string }> = [
  { slotKey: "A", sectionType: "A", title: "A 爆皮" },
  { slotKey: "B1", sectionType: "B", title: "B1 钩子" },
  { slotKey: "C1", sectionType: "C", title: "C1 筛选/指令" },
  { slotKey: "D", sectionType: "D", title: "D 铺垫" },
  { slotKey: "B2", sectionType: "B", title: "B2 钩子" },
  { slotKey: "C2", sectionType: "C", title: "C2 筛选/指令" },
  { slotKey: "F", sectionType: "F", title: "F 趋势判断" },
  { slotKey: "G", sectionType: "G", title: "G 旧逻辑/过去对比" },
  { slotKey: "H", sectionType: "H", title: "H 现实案例/权威佐证" },
  { slotKey: "I", sectionType: "I", title: "I 放大焦虑" },
  { slotKey: "J", sectionType: "J", title: "J 解法/新身份" },
  { slotKey: "K", sectionType: "K", title: "K 产品承接" },
  { slotKey: "L", sectionType: "L", title: "L 收口CTA" }
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

function richnessScore(content: string) {
  const length = content.trim().length;
  const sentences = sentenceCount(content);
  return Math.min(length / 20, 28) + Math.min(sentences * 4, 20);
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

  diagnostics.push(...buildComposeDiagnostics(theme, blocks));
  return {
    theme,
    primaryDirection: options.primaryDirection,
    blocks,
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

export function composeFullText(blocks: ComposeBlock[]) {
  return blocks
    .map((item) => item.content.trim())
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
