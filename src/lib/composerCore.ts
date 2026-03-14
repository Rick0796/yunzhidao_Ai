import type { ScriptSectionItem } from "./scriptLibrary";
import type {
  CandidateRankEntry,
  ComposeBlock,
  ComposeDraft,
  ComposeHistoryContext,
  ComposeHistoryItem,
  ComposeSectionType,
  ComposeSlotKey,
} from "./composerTypes";
import { MID_SLOT_KEYS, SECTION_TITLE_MAP, SLOT_BLUEPRINT } from "./composerTypes";

const DIRECTION_KEYWORDS = {
  AI趋势: ["ai", "人工智能", "算法", "模型", "机器人", "数字人", "算力", "效率", "系统"],
  财富: ["财富", "资产", "财商", "黄金", "保险", "房产", "现金流", "配置"],
  认知: ["认知", "趋势", "分水岭", "清醒", "规则", "判断", "风险", "逻辑"],
} as const;

const SLOT_MARKERS: Record<ComposeSlotKey, string[]> = {
  A: ["别", "未来", "分水岭", "买不起", "最值钱", "最危险", "这三年", "普通人", "记住"],
  B1: ["接下来", "认真听", "后面", "关键", "重要", "一定要听"],
  C1: ["点赞", "收藏", "转发", "分享", "小爱心", "看完", "点一个"],
  D: ["为什么", "现实", "变化", "窗口期", "重新", "这不是", "意味着", "问题是"],
  B2: ["普通人到底该怎么办", "后面这段", "更重要", "认真听", "听懂了", "别划走"],
  C2: ["如果你现在", "评论区", "转发给", "现在对着屏幕", "默念一句", "能刷到这条视频"],
  F: ["未来", "趋势", "时代", "正在", "意味着", "重构", "判断", "会发生"],
  G: ["过去", "以前", "当年", "错过", "回头看", "曾经"],
  H: ["案例", "现实", "数据", "新闻", "工厂", "公司", "采访", "已经"],
  I: ["焦虑", "危险", "淘汰", "代价", "来不及", "边缘化", "冲击", "断崖"],
  J: ["你要", "学会", "应该", "最快的方式", "路径", "方法", "成为", "升级"],
  K: ["直播", "训练营", "公开课", "第一天", "第二天", "第三天", "第四天", "入口"],
  L: ["点开", "关注", "发消息", "直播入口", "现在就", "点击", "留言"],
};

const OPENING_RESET_MARKERS = [
  "别存钱了",
  "普通人别划走",
  "告诉你一个",
  "这不是我说的",
  "马斯克刚刚",
  "马云再度",
  "他刚刚在一场",
  "这句话你现在",
  "今天这条视频",
  "我不是跟你开玩笑",
];

const SECOND_OPENING_MARKERS = [
  "马斯克刚刚",
  "马云再度",
  "他刚刚在一场",
  "我不是跟你开玩笑",
  "今天这条视频",
  "这不是我说的",
];

const LIVE_COURSE_MARKERS = /(直播|训练营|公开课|四天|直播入口|我要学习|我要看直播)/;
const BOOK_MARKERS = /(这本书|上链接|购物车|单买|套餐|39块|秘籍)/;

function normalizeText(value: string) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractKeywords(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((item) => item && item.length >= 2);
}

function overlapScore(left: string, right: string) {
  const a = new Set(extractKeywords(left));
  const b = new Set(extractKeywords(right));
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const item of a) {
    if (b.has(item)) hits += 1;
  }
  return hits;
}

function splitSentences(value: string) {
  return value
    .split(/[。！？；?\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sentenceCount(value: string) {
  return splitSentences(value).length;
}

function topicFamilyCluster(topicFamily?: string | null) {
  if (!topicFamily || /^(general|ai_general|wealth_general|cognition_general)$/.test(topicFamily)) return "generic";
  if (topicFamily.startsWith("musk_")) return "musk";
  return topicFamily;
}

function buildHistoryContext(historyBlocks?: ComposeHistoryItem[] | null): ComposeHistoryContext {
  const materialIds = new Set<string>();
  const originalIds = new Set<string>();
  const topicFamilies = new Set<string>();
  const familyClusters = new Set<string>();
  const entityTags = new Set<string>();
  const slotMaterialIds = new Map<string, Set<string>>();
  const slotOriginalIds = new Map<string, Set<string>>();

  for (const item of historyBlocks || []) {
    if (item.materialId) {
      materialIds.add(item.materialId);
      if (!slotMaterialIds.has(item.slotKey)) slotMaterialIds.set(item.slotKey, new Set<string>());
      slotMaterialIds.get(item.slotKey)?.add(item.materialId);
    }
    if (item.originalId) {
      originalIds.add(item.originalId);
      if (!slotOriginalIds.has(item.slotKey)) slotOriginalIds.set(item.slotKey, new Set<string>());
      slotOriginalIds.get(item.slotKey)?.add(item.originalId);
    }
    if (item.topicFamily) {
      topicFamilies.add(item.topicFamily);
      familyClusters.add(topicFamilyCluster(item.topicFamily));
    }
    if (item.entityTag) entityTags.add(item.entityTag);
  }

  return { materialIds, originalIds, topicFamilies, familyClusters, entityTags, slotMaterialIds, slotOriginalIds };
}

function containsAny(text: string, markers: string[]) {
  const normalized = normalizeText(text);
  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

function countFamily(blocks: ComposeBlock[], family: string) {
  return blocks.filter((block) => topicFamilyCluster(block.topicFamily) === family).length;
}

function countCluster(blocks: ComposeBlock[], family: string) {
  return blocks.filter((block) => topicFamilyCluster(block.topicFamily) === family).length;
}

function sameMeaningConflict(left?: string, right?: string) {
  if (!left || !right) return false;
  return overlapScore(left, right) >= 5;
}

export function inferPrimaryDirection(theme: string) {
  const text = normalizeText(theme);
  if (DIRECTION_KEYWORDS.财富.some((item) => text.includes(item))) return "财富";
  if (DIRECTION_KEYWORDS.认知.some((item) => text.includes(item))) return "认知";
  return "AI趋势";
}

export function titleForSlot(slotKey: string, sectionType?: ComposeSectionType) {
  const blueprint = SLOT_BLUEPRINT.find((item) => item.slotKey === slotKey);
  if (blueprint) return blueprint.title;
  if (sectionType) return SECTION_TITLE_MAP[sectionType];
  return slotKey;
}

function isOpeningSentence(text: string) {
  const value = normalizeText(text);
  return OPENING_RESET_MARKERS.some((marker) => value.includes(marker.toLowerCase()));
}

export function sanitizeOpeningContent(content: string) {
  const sentences = splitSentences(content);
  if (sentences.length <= 1) return content.trim();
  const next: string[] = [];
  for (const sentence of sentences) {
    if (next.length === 0) {
      next.push(sentence);
      continue;
    }
    if (isOpeningSentence(sentence)) continue;
    next.push(sentence);
  }
  return next.join("。").trim();
}

function extractOpeningSupport(content: string) {
  const sentences = splitSentences(content);
  const support = sentences.filter((sentence, index) => index > 0 && !isOpeningSentence(sentence));
  return support.slice(0, 2).join("。").trim();
}

function canAppendOpeningSupport(custom: string, selectedContent: string) {
  const customText = sanitizeOpeningContent(custom).trim();
  const selectedText = sanitizeOpeningContent(selectedContent).trim();
  if (!customText || !selectedText) return false;
  if (overlapScore(customText, selectedText) >= 2) return true;

  const customNormalized = normalizeText(customText);
  const selectedNormalized = normalizeText(selectedText);
  const directionalMarkers = [
    "房子",
    "存钱",
    "马斯克",
    "买不起",
    "agi",
    "人工智能",
    "赛道",
    "工作",
    "孩子",
    "数字资产",
  ];
  const sharedDirectionalMarker = directionalMarkers.some(
    (marker) => customNormalized.includes(marker) && selectedNormalized.includes(marker),
  );
  return sharedDirectionalMarker;
}

function scoreMarkerMatch(slotKey: ComposeSlotKey, content: string) {
  const markers = SLOT_MARKERS[slotKey] || [];
  return markers.reduce((score, marker) => score + (normalizeText(content).includes(marker.toLowerCase()) ? 2 : 0), 0);
}

function createBlockFromItem(slotKey: ComposeSlotKey, item: ScriptSectionItem): ComposeBlock {
  return {
    id: `${slotKey}-${item.materialId || Math.random().toString(36).slice(2, 8)}`,
    slotKey,
    sectionType: item.type as ComposeSectionType,
    title: titleForSlot(slotKey, item.type as ComposeSectionType),
    content: slotKey === "A" ? sanitizeOpeningContent(item.content.trim()) : item.content.trim(),
    originalId: item.originalId || null,
    materialId: item.materialId || null,
    sourceKey: item.sourceKey || null,
    label: item.label || SECTION_TITLE_MAP[item.type as ComposeSectionType] || item.type,
    isManual: false,
    entityTag: item.entityTag ?? null,
    topicFamily: item.topicFamily ?? null,
    bindingScope: item.bindingScope ?? null,
  };
}

function isAllowedBinding(bindingScope: string | null | undefined, theme: string) {
  const normalizedTheme = normalizeText(theme);
  const allowFamily = ["孩子", "家长", "父母", "家庭", "婚姻", "夫妻", "情感"].some((item) =>
    normalizedTheme.includes(item),
  );
  if (allowFamily) return true;
  return !bindingScope || bindingScope === "general" || bindingScope === "business";
}

function canReuseOriginalInDraft(originalId: string | null, blocks: ComposeBlock[]) {
  if (!originalId) return true;
  return !blocks.some((block) => block.originalId === originalId);
}

function rankCandidates(
  slotKey: ComposeSlotKey,
  sections: ScriptSectionItem[],
  theme: string,
  primaryDirection: string,
  chosenBlocks: ComposeBlock[],
  history: ComposeHistoryContext,
): CandidateRankEntry[] {
  const normalizedTheme = normalizeText(theme);
  const currentB = chosenBlocks.find((block) => String(block.slotKey).startsWith("B"));
  const currentC = chosenBlocks.find((block) => String(block.slotKey).startsWith("C"));

  return sections
    .filter((item) => (item.candidateSlots || []).includes(slotKey))
    .map((item) => {
      let score = Number(item.slotScores?.[slotKey] || item.candidateScore || 0);
      score += scoreMarkerMatch(slotKey, item.content);
      score += overlapScore(theme, item.content) * 3;

      if (normalizeText(item.primaryDirection) === normalizeText(primaryDirection)) score += 10;
      if (!isAllowedBinding(item.bindingScope, theme)) score -= 40;
      if (!canReuseOriginalInDraft(item.originalId || null, chosenBlocks)) score -= 500;

      if (item.materialId && history.materialIds.has(item.materialId)) score -= 20;
      if (item.originalId && history.originalIds.has(item.originalId)) score -= 14;
      if (item.materialId && history.slotMaterialIds.get(slotKey)?.has(item.materialId)) score -= 28;
      if (item.originalId && history.slotOriginalIds.get(slotKey)?.has(item.originalId)) score -= 18;

      if (slotKey !== "A" && containsAny(item.content, SECOND_OPENING_MARKERS)) score -= 90;

      if ((slotKey === "B1" || slotKey === "B2") && currentB && sameMeaningConflict(currentB.content, item.content)) {
        score -= 180;
      }
      if ((slotKey === "C1" || slotKey === "C2") && currentC && sameMeaningConflict(currentC.content, item.content)) {
        score -= 180;
      }

      if ((slotKey === "K" || slotKey === "L") && (!LIVE_COURSE_MARKERS.test(item.content) || BOOK_MARKERS.test(item.content))) {
        score -= 220;
      }

      if (slotKey === "A" && sentenceCount(item.content) < 2) score -= 12;
      if (slotKey === "D" && item.content.trim().length < 24) score -= 10;

      const familyCluster = topicFamilyCluster(item.topicFamily);
      if (familyCluster !== "generic" && history.familyClusters.has(familyCluster)) score -= 12;
      if (item.entityTag && item.entityTag !== "none" && history.entityTags.has(item.entityTag)) score -= 8;
      if (familyCluster !== "generic" && countCluster(chosenBlocks, familyCluster) > 0) score -= 6;
      if (familyCluster === "musk") {
        const muskCount = countFamily(chosenBlocks, "musk");
        if (muskCount >= 2) score -= 600;
        else if (muskCount === 1) score -= 20;
      }

      if (slotKey === "G" && normalizeText(item.content).includes("未来真正值钱")) score -= 10;
      if (slotKey === "F" && normalizeText(item.content).includes("最快的方式")) score -= 8;

      if (!normalizedTheme && slotKey === "A") score += 5;
      return { item, score };
    })
    .sort((left, right) => right.score - left.score);
}

function pickBestCandidate(
  slotKey: ComposeSlotKey,
  ranked: CandidateRankEntry[],
  chosenBlocks: ComposeBlock[],
  history: ComposeHistoryContext,
  excludeMaterialId?: string | null,
) {
  const viable: CandidateRankEntry[] = [];
  for (const entry of ranked) {
    if (excludeMaterialId && entry.item.materialId === excludeMaterialId) continue;
    if (!canReuseOriginalInDraft(entry.item.originalId || null, chosenBlocks)) continue;
    if (entry.item.materialId && history.slotMaterialIds.get(slotKey)?.has(entry.item.materialId)) continue;
    viable.push(entry);
    if (viable.length >= 8) break;
  }
  if (!viable.length) {
    return ranked.find((entry) => entry.item.materialId !== excludeMaterialId)?.item || null;
  }

  const topScore = viable[0]?.score ?? 0;
  const closePool = viable.filter((entry, index) => index < 6 && entry.score >= topScore - 20);
  const pool = closePool.length ? closePool : viable.slice(0, 4);
  if (pool.length === 1) return pool[0].item;
  return pool[Math.floor(Math.random() * pool.length)]?.item || null;
}

function chooseMiddleBridge(previousBlock: ComposeBlock | null, currentBlock: ComposeBlock) {
  if (!previousBlock || !MID_SLOT_KEYS.includes(currentBlock.slotKey as ComposeSlotKey)) return "";
  const bridgeMap: Partial<Record<ComposeSlotKey, string>> = {
    F: "真正值得注意的，不只是一句结论，而是背后的趋势已经开始落地。",
    G: "回头看，所有大趋势真正爆发之前，其实都早有前兆。",
    H: "如果只停留在判断层面还不够，现实里的信号往往更直接。",
    I: "问题是，这些变化一旦落到普通人自己身上，代价会非常直接。",
    J: "所以真正重要的，不只是看懂趋势，而是你接下来怎么站位。",
  };
  return bridgeMap[currentBlock.slotKey as ComposeSlotKey] || "";
}

export function finalizeComposeBlocks(theme: string, blocks: ComposeBlock[]) {
  return blocks.map((block, index) => {
    const previousBlock = index > 0 ? blocks[index - 1] : null;
    return {
      ...block,
      title: titleForSlot(String(block.slotKey), block.sectionType),
      content: block.slotKey === "A" ? sanitizeOpeningContent(block.content) : block.content.trim(),
      bridgeText: chooseMiddleBridge(previousBlock, block),
    };
  });
}

export function composeFullText(blocks: ComposeBlock[]) {
  return blocks
    .filter((block) => block.content.trim())
    .map((block) => (block.bridgeText ? `${block.bridgeText}\n${block.content.trim()}` : block.content.trim()))
    .join("\n\n")
    .trim();
}

export function composeDraftFromSections(options: {
  theme: string;
  primaryDirection: string;
  customHook?: string;
  sections: ScriptSectionItem[];
  historyBlocks?: ComposeHistoryItem[] | null;
}): ComposeDraft {
  const theme = options.theme.trim();
  const blocks: ComposeBlock[] = [];
  const history = buildHistoryContext(options.historyBlocks);

  for (const slot of SLOT_BLUEPRINT) {
    const slotTheme =
      slot.slotKey === "A" && options.customHook?.trim() && sentenceCount(options.customHook.trim()) < 2 && options.customHook.trim().length < 36
        ? options.customHook.trim()
        : theme;
    const ranked = rankCandidates(slot.slotKey, options.sections, slotTheme, options.primaryDirection, blocks, history);
    const selected = pickBestCandidate(slot.slotKey, ranked, blocks, history, null);

    if (slot.slotKey === "A" && options.customHook?.trim()) {
      const custom = sanitizeOpeningContent(options.customHook.trim());
      const useAsFull = sentenceCount(custom) >= 2 || custom.length >= 36;
      const support = selected ? extractOpeningSupport(selected.content) : "";
      const canAppend = selected ? canAppendOpeningSupport(custom, selected.content) : false;
      blocks.push({
        id: `A-manual-${Math.random().toString(36).slice(2, 8)}`,
        slotKey: "A",
        sectionType: "A",
        title: titleForSlot("A", "A"),
        content: useAsFull || !support || !canAppend ? custom : [custom, support].filter(Boolean).join("。"),
        originalId: useAsFull || !support || !canAppend ? null : selected?.originalId || null,
        materialId: useAsFull || !support || !canAppend ? null : selected?.materialId || null,
        sourceKey: useAsFull || !support || !canAppend ? null : selected?.sourceKey || null,
        label: "开头",
        isManual: true,
        entityTag: useAsFull || !support || !canAppend ? null : selected?.entityTag || null,
        topicFamily: useAsFull || !support || !canAppend ? null : selected?.topicFamily || null,
        bindingScope: useAsFull || !support || !canAppend ? "general" : selected?.bindingScope || null,
      });
      continue;
    }

    if (!selected) continue;
    blocks.push(createBlockFromItem(slot.slotKey, selected));
  }

  return {
    theme,
    primaryDirection: options.primaryDirection,
    blocks: finalizeComposeBlocks(theme, blocks),
    diagnostics: [],
  };
}

function buildInlineHistory(blocks: ComposeBlock[], excludeId?: string, externalHistory?: ComposeHistoryItem[] | null) {
  const inline: ComposeHistoryItem[] = [
    ...(externalHistory || []),
    ...blocks
      .filter((block) => block.id !== excludeId)
      .map((block) => ({
        materialId: block.materialId,
        originalId: block.originalId,
        topicFamily: block.topicFamily,
        entityTag: block.entityTag,
        slotKey: String(block.slotKey),
      })),
  ];
  return buildHistoryContext(inline);
}

export function findReplacementCandidate(options: {
  blocks: ComposeBlock[];
  targetId: string;
  sections: ScriptSectionItem[];
  theme: string;
  primaryDirection: string;
  historyBlocks?: ComposeHistoryItem[] | null;
}) {
  const index = options.blocks.findIndex((item) => item.id === options.targetId);
  if (index < 0) return null;

  const target = options.blocks[index];
  const before = options.blocks.slice(0, index);
  const history = buildInlineHistory(options.blocks, options.targetId, options.historyBlocks);
  const ranked = rankCandidates(target.slotKey as ComposeSlotKey, options.sections, options.theme, options.primaryDirection, before, history);
  return pickBestCandidate(target.slotKey as ComposeSlotKey, ranked, before, history, target.materialId);
}

export function rematchComposeBlock(options: {
  blocks: ComposeBlock[];
  targetId: string;
  sections: ScriptSectionItem[];
  theme: string;
  primaryDirection: string;
  historyBlocks?: ComposeHistoryItem[] | null;
}) {
  const index = options.blocks.findIndex((item) => item.id === options.targetId);
  if (index < 0) return options.blocks;

  const target = options.blocks[index];
  const before = options.blocks.slice(0, index);
  const after = options.blocks.slice(index + 1);
  const selected = findReplacementCandidate(options);
  if (!selected) return options.blocks;

  return finalizeComposeBlocks(options.theme, [...before, createBlockFromItem(target.slotKey as ComposeSlotKey, selected), ...after]);
}

export function insertManualComposeBlock(
  blocks: ComposeBlock[],
  afterId: string,
  sectionType: ComposeSectionType,
  content: string,
) {
  const next = [...blocks];
  const index = next.findIndex((item) => item.id === afterId);
  if (index < 0) return blocks;

  const manualBlock: ComposeBlock = {
    id: `manual-${Math.random().toString(36).slice(2, 8)}`,
    slotKey: `${sectionType}-manual-${Date.now()}`,
    sectionType,
    title: SECTION_TITLE_MAP[sectionType],
    content: content.trim(),
    originalId: null,
    materialId: null,
    sourceKey: null,
    label: SECTION_TITLE_MAP[sectionType],
    isManual: true,
    entityTag: null,
    topicFamily: null,
    bindingScope: "general",
  };

  next.splice(index + 1, 0, manualBlock);
  return finalizeComposeBlocks("", next);
}

export function updateComposeBlock(blocks: ComposeBlock[], id: string, content: string) {
  return finalizeComposeBlocks(
    "",
    blocks.map((block) => (block.id === id ? { ...block, content } : block)),
  );
}

export function removeComposeBlock(blocks: ComposeBlock[], id: string) {
  return finalizeComposeBlocks("", blocks.filter((block) => block.id !== id));
}

export function applyComposeSuggestion(
  blocks: ComposeBlock[],
  suggestion: {
    blockId: string;
    candidateContent: string;
    candidateLabel: string;
    candidateMaterialId: string | null;
    candidateOriginalId: string | null;
    candidateSourceKey: string | null;
    candidateEntityTag?: string | null;
    candidateTopicFamily?: string | null;
    candidateBindingScope?: string | null;
  },
) {
  return finalizeComposeBlocks(
    "",
    blocks.map((block) =>
      block.id === suggestion.blockId
        ? {
            ...block,
            content: suggestion.candidateContent,
            label: suggestion.candidateLabel,
            materialId: suggestion.candidateMaterialId,
            originalId: suggestion.candidateOriginalId,
            sourceKey: suggestion.candidateSourceKey,
            entityTag: suggestion.candidateEntityTag ?? null,
            topicFamily: suggestion.candidateTopicFamily ?? null,
            bindingScope: suggestion.candidateBindingScope ?? null,
            isManual: false,
          }
        : block,
    ),
  );
}
