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

export interface ComposeDraft {
  theme: string;
  primaryDirection: string;
  blocks: ComposeBlock[];
  diagnostics: ComposeDiagnostic[];
}

export interface ComposeDiagnostic {
  level: "info" | "warning";
  title: string;
  detail: string;
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

const DIRECTION_KEYWORDS: Array<{ value: string; keywords: string[] }> = [
  {
    value: "AI趋势",
    keywords: ["ai", "人工智能", "算法", "模型", "数字人", "智能体", "系统", "效率", "算力", "机器人", "自动化", "数字资产"]
  },
  {
    value: "财富",
    keywords: ["财富", "资产", "财商", "负债", "黄金", "存款", "存钱", "现金流", "翻身", "赚钱", "配置", "房产", "保险"]
  },
  {
    value: "认知",
    keywords: ["认知", "趋势", "清醒", "选择", "决策", "分水岭", "边界", "规则", "时代", "判断", "效率系统"]
  }
];

function normalizeText(value: string) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractKeywords(value: string) {
  const text = normalizeText(value);
  const tokens = new Set<string>();
  for (const token of text.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(Boolean)) {
    if (token.length >= 2) tokens.add(token);
  }
  return Array.from(tokens);
}

function keywordScore(keywords: string[], content: string) {
  const normalized = normalizeText(content);
  if (!normalized) return 0;
  let score = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) {
      score += keyword.length >= 4 ? 8 : 5;
    }
  }
  return score;
}

function sentenceCount(content: string) {
  return content
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function richnessScore(content: string) {
  const length = content.trim().length;
  const sentences = sentenceCount(content);
  return Math.min(length / 18, 25) + Math.min(sentences * 4, 20);
}

function overlapScore(left: string, right: string) {
  const leftTokens = extractKeywords(left);
  const rightTokens = new Set(extractKeywords(right));
  let score = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      score += token.length >= 4 ? 6 : 3;
    }
  }
  return score;
}

function blockSuitability(slotKey: ComposeSlotKey, item: ScriptSectionItem, themeKeywords: string[], previousContent: string) {
  let score = keywordScore(themeKeywords, item.content) + richnessScore(item.content);
  if (previousContent) {
    score += overlapScore(previousContent, item.content) * 0.9;
  }

  if (slotKey === "A" && sentenceCount(item.content) < 2) score -= 18;
  if ((slotKey === "B1" || slotKey === "B2" || slotKey === "C1" || slotKey === "C2") && item.content.length < 18) score -= 18;
  if ((slotKey === "F" || slotKey === "G" || slotKey === "H" || slotKey === "I" || slotKey === "J") && sentenceCount(item.content) < 3) score -= 22;
  if ((slotKey === "K" || slotKey === "L") && item.primaryDirection !== "AI趋势") score -= 15;

  return score;
}

function stripLeadingSentence(content: string) {
  const index = content.search(/[。！？!?]/);
  if (index < 0) return "";
  return content.slice(index + 1).trim();
}

function buildCustomAHybrid(customHook: string, item: ScriptSectionItem | null) {
  const hook = customHook.trim();
  if (!item) return hook;
  const rest = stripLeadingSentence(item.content);
  if (!rest) return hook;
  const normalizedHook = normalizeText(hook);
  const normalizedRest = normalizeText(rest);
  if (normalizedRest.includes(normalizedHook)) return rest;
  return `${hook}${/[。！？!?]$/.test(hook) ? "" : "。"}${rest}`;
}

function createBlockFromItem(
  blueprint: { slotKey: ComposeSlotKey; sectionType: ComposeSectionType; title: string },
  item: ScriptSectionItem | null,
  overrideContent?: string
): ComposeBlock {
  return {
    id: `${blueprint.slotKey}-${item?.materialId || "manual"}-${Math.random().toString(36).slice(2, 7)}`,
    slotKey: blueprint.slotKey,
    sectionType: blueprint.sectionType,
    title: blueprint.title,
    content: overrideContent ?? item?.content ?? "",
    originalId: item?.originalId ?? null,
    materialId: item?.materialId ?? null,
    sourceKey: item?.sourceKey ?? null,
    label: item?.label ?? blueprint.sectionType,
    isManual: !item
  };
}

export function inferPrimaryDirection(theme: string) {
  const normalized = normalizeText(theme);
  for (const item of DIRECTION_KEYWORDS) {
    if (item.keywords.some((keyword) => normalized.includes(keyword))) {
      return item.value;
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
  const themeKeywords = extractKeywords(theme);
  const sections = options.sections.filter((item) => item.primaryDirection === options.primaryDirection);
  const blocks: ComposeBlock[] = [];
  const diagnostics: ComposeDiagnostic[] = [];
  const usedMaterialIds = new Set<string>();
  const usedOriginalIds = new Set<string>();
  let previousContent = theme;

  for (const blueprint of SLOT_BLUEPRINT) {
    const pool = sections.filter((item) => {
      if (item.type !== blueprint.sectionType) return false;
      if (usedMaterialIds.has(item.materialId)) return false;
      if (usedOriginalIds.has(item.originalId)) return false;
      if ((blueprint.slotKey === "K" || blueprint.slotKey === "L") && item.primaryDirection !== "AI趋势") return false;
      return true;
    });

    const ranked = pool
      .map((item) => ({
        item,
        score: blockSuitability(blueprint.slotKey, item, themeKeywords, previousContent)
      }))
      .sort((left, right) => right.score - left.score);

    const selected = ranked[0]?.item ?? null;

    if (!selected) {
      blocks.push(createBlockFromItem(blueprint, null, ""));
      diagnostics.push({
        level: "warning",
        title: `${blueprint.title} 未匹配到素材`,
        detail: "当前库里没有找到足够合适的候选，建议手动插入或补充素材。"
      });
      continue;
    }

    usedMaterialIds.add(selected.materialId);
    usedOriginalIds.add(selected.originalId);

    let contentOverride: string | undefined;
    if (blueprint.slotKey === "A" && options.customHook?.trim()) {
      contentOverride = buildCustomAHybrid(options.customHook, selected);
      if (sentenceCount(contentOverride) < 3) {
        const secondBest = ranked[1]?.item ?? null;
        if (secondBest) {
          contentOverride = `${contentOverride}${/[。！？!?]$/.test(contentOverride) ? "" : "。"}${stripLeadingSentence(secondBest.content)}`;
          usedMaterialIds.add(secondBest.materialId);
          usedOriginalIds.add(secondBest.originalId);
        }
      }
    }

    const block = createBlockFromItem(blueprint, selected, contentOverride);
    blocks.push(block);
    previousContent = block.content || previousContent;
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
  const midBlocks = blocks.filter((item) => ["F", "G", "H", "I", "J"].includes(item.sectionType) && item.content.trim());
  if (midBlocks.length < 3) {
    diagnostics.push({
      level: "warning",
      title: "中段说服链偏薄",
      detail: "F/G/H/I/J 的有效内容不足三段，整篇容易像提纲而不像口播。"
    });
  }

  let cohesion = 0;
  for (let index = 1; index < midBlocks.length; index += 1) {
    cohesion += overlapScore(midBlocks[index - 1].content, midBlocks[index].content);
  }
  if (midBlocks.length >= 2 && cohesion < midBlocks.length * 4) {
    diagnostics.push({
      level: "warning",
      title: "中段容易像资料堆",
      detail: "F/G/H/I/J 的相邻承接偏弱，建议手动替换其中 1-2 段，或重新匹配一次中段。"
    });
  } else if (midBlocks.length >= 2) {
    diagnostics.push({
      level: "info",
      title: "中段承接基本成立",
      detail: "当前中段已经形成了主题推进链，后面可以再做局部润色或去重。"
    });
  }

  const aBlock = blocks.find((item) => item.slotKey === "A");
  if (aBlock && sentenceCount(aBlock.content) < 2) {
    diagnostics.push({
      level: "warning",
      title: "爆皮支撑不够",
      detail: "当前 A 段不足两句，建议再换一条或手动补强，避免一上来就掉势能。"
    });
  }

  const themeFitScore = blocks.reduce((total, block) => total + keywordScore(extractKeywords(theme), block.content), 0);
  if (themeFitScore < 18) {
    diagnostics.push({
      level: "warning",
      title: "主题贴合度偏弱",
      detail: "这篇稿子的主题锚点不够明显，建议重配 A/F/J 这三段。"
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
  const themeKeywords = extractKeywords(options.theme);
  const target = options.blocks.find((item) => item.id === options.targetId);
  if (!target) return options.blocks;

  const usedMaterialIds = new Set(
    options.blocks.filter((item) => item.id !== target.id && item.materialId).map((item) => String(item.materialId))
  );
  const usedOriginalIds = new Set(
    options.blocks.filter((item) => item.id !== target.id && item.originalId).map((item) => String(item.originalId))
  );

  const previousIndex = options.blocks.findIndex((item) => item.id === target.id) - 1;
  const previousContent = previousIndex >= 0 ? options.blocks[previousIndex].content : options.theme;
  const pool = options.sections.filter((item) => {
    if (item.primaryDirection !== options.primaryDirection) return false;
    if (item.type !== target.sectionType) return false;
    if (usedMaterialIds.has(item.materialId)) return false;
    if (usedOriginalIds.has(item.originalId)) return false;
    return true;
  });

  const ranked = pool
    .map((item) => ({
      item,
      score: blockSuitability(target.slotKey as ComposeSlotKey, item, themeKeywords, previousContent)
    }))
    .sort((left, right) => right.score - left.score);

  const replacement = ranked.find((item) => item.item.materialId !== target.materialId)?.item;
  if (!replacement) return options.blocks;

  return options.blocks.map((item) =>
    item.id === target.id
      ? {
          ...item,
          content: replacement.content,
          originalId: replacement.originalId,
          materialId: replacement.materialId,
          sourceKey: replacement.sourceKey,
          label: replacement.label,
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
  if (targetBlocks.length === 0) return options.blocks;

  const response = await fetch(`${normalizeApiBaseUrl(options.settings.baseUrl || "/api")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.settings.apiKey ? { Authorization: `Bearer ${options.settings.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: options.settings.mainModel || "gemini-3-flash",
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "你是短视频文案去重助手。你的任务是降低重复表达，但必须保留原板块的核心命题、情绪强度、口播节奏和事实信息。不能把爆皮洗软，不能改结论，不能改动作路径。只输出 JSON。"
        },
        {
          role: "user",
          content: [
            `主题：${options.theme}`,
            "请按原顺序重写以下板块，要求：",
            "1. 每个板块分别重写。",
            "2. 保留原来的板块类型和核心逻辑。",
            "3. A 段必须继续爆，不要洗软前几个字的抓停感。",
            "4. K/L 如果有动作指令，不要改动作，只改说法。",
            "5. 输出格式：{\"items\":[{\"id\":\"原id\",\"content\":\"重写后内容\"}]}",
            JSON.stringify(
              {
                items: targetBlocks.map((item) => ({
                  id: item.id,
                  slotKey: item.slotKey,
                  sectionType: item.sectionType,
                  content: item.content
                }))
              },
              null,
              2
            )
          ].join("\n")
        }
      ]
    })
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || "去重失败");
  }

  const payload = JSON.parse(raw);
  const parsed = typeof payload?.choices?.[0]?.message?.content === "string" ? JSON.parse(payload.choices[0].message.content) : payload;
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const byId = new Map<string, string>();
  for (const item of items) {
    if (item?.id && typeof item?.content === "string") {
      byId.set(String(item.id), item.content.trim());
    }
  }

  return options.blocks.map((item) => {
    const nextContent = byId.get(item.id);
    return nextContent ? { ...item, content: nextContent } : item;
  });
}
