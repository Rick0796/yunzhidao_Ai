import type { ScriptSectionItem } from "./scriptLibrary";
import type {
  ComposeBlock,
  ComposeDiagnostic,
  ComposeHistoryItem,
  ComposeReview,
  ComposeReviewMetric,
  ComposeSuggestion,
} from "./composerTypes";
import { findReplacementCandidate } from "./composerCore";

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

function topicFamilyCluster(topicFamily?: string | null) {
  if (!topicFamily || /^(general|ai_general|wealth_general|cognition_general)$/.test(topicFamily)) return "generic";
  if (topicFamily.startsWith("musk_")) return "musk";
  return topicFamily;
}

function getSlot(blocks: ComposeBlock[], slotKey: string) {
  return blocks.find((block) => String(block.slotKey) === slotKey) || null;
}

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function metricLevel(score: number): "good" | "watch" | "risk" {
  if (score >= 80) return "good";
  if (score >= 60) return "watch";
  return "risk";
}

function buildMetric(
  key: string,
  title: string,
  score: number,
  summary: string,
  detail: string,
  relatedSlots: string[],
): ComposeReviewMetric {
  return {
    key,
    title,
    score: clamp(score),
    level: metricLevel(score),
    summary,
    detail,
    relatedSlots,
  };
}

export function buildComposeDiagnostics(theme: string, blocks: ComposeBlock[]): ComposeDiagnostic[] {
  const diagnostics: ComposeDiagnostic[] = [];
  const a = getSlot(blocks, "A");
  const b1 = getSlot(blocks, "B1");
  const c1 = getSlot(blocks, "C1");
  const d = getSlot(blocks, "D");
  const b2 = getSlot(blocks, "B2");
  const c2 = getSlot(blocks, "C2");
  const j = getSlot(blocks, "J");
  const k = getSlot(blocks, "K");
  const l = getSlot(blocks, "L");
  const middle = blocks.filter((block) => ["F", "G", "H", "I", "J"].includes(String(block.slotKey)));
  const muskCount = blocks.filter((block) => topicFamilyCluster(block.topicFamily) === "musk").length;

  if (!a) diagnostics.push({ level: "warning", title: "缺少开头", detail: "当前没有开头，整篇文案的抓停会直接塌掉。" });
  if (!b1 || !c1) diagnostics.push({ level: "warning", title: "第一次憋单不完整", detail: "前段缺少第一次钩子或动作，开场抓住后不够容易把人往下带。" });
  if (!d) diagnostics.push({ level: "warning", title: "铺垫偏弱", detail: "没有铺垫会让前段从爆点直接跳到结论，中间容易显得硬。" });
  if (b1 && b2 && overlapScore(b1.content, b2.content) >= 5) {
    diagnostics.push({ level: "warning", title: "两次钩子太像", detail: "第一次和第二次钩子的说法太接近，第二次憋单像在复读。" });
  }
  if (c1 && c2 && overlapScore(c1.content, c2.content) >= 5) {
    diagnostics.push({ level: "warning", title: "两次动作太像", detail: "第一次和第二次动作太接近，筛选感不够明显。" });
  }
  if (middle.length < 3) {
    diagnostics.push({ level: "warning", title: "中段偏薄", detail: "当前中段块数偏少，容易像只说了结论，没有把人一步步带进去。" });
  }
  if (muskCount > 2) {
    diagnostics.push({ level: "warning", title: "马斯克内容过载", detail: "同一篇里马斯克同家族内容超过两段，用户会感觉整篇都在复读同一个人。" });
  }
  if (k && !j) {
    diagnostics.push({ level: "warning", title: "课程承接偏硬", detail: "在没有给出明确路径前就接课程承接，听感会像突然卖课。" });
  }
  if (l && !k) {
    diagnostics.push({ level: "warning", title: "收口过早", detail: "最终行动前没有课程承接，收口会显得比较突兀。" });
  }
  if (theme && a && overlapScore(theme, a.content) < 1) {
    diagnostics.push({ level: "info", title: "开头与主题距离偏远", detail: "开头够抓停，但和当前主题的对应关系偏弱，可以考虑换成更贴题的开头。" });
  }

  return diagnostics;
}

function buildSuggestions(options: {
  blocks: ComposeBlock[];
  sections: ScriptSectionItem[];
  theme: string;
  primaryDirection: string;
  historyBlocks?: ComposeHistoryItem[] | null;
}): ComposeSuggestion[] {
  const suggestions: ComposeSuggestion[] = [];
  const middle = options.blocks.filter((block) => ["F", "G", "H", "I", "J"].includes(String(block.slotKey)));

  const muskBlocks = options.blocks.filter((block) => topicFamilyCluster(block.topicFamily) === "musk");
  if (muskBlocks.length > 2) {
    const target = muskBlocks[muskBlocks.length - 1];
    const candidate = findReplacementCandidate({
      blocks: options.blocks,
      targetId: target.id,
      sections: options.sections,
      theme: options.theme,
      primaryDirection: options.primaryDirection,
      historyBlocks: options.historyBlocks,
    });
    if (candidate) {
      suggestions.push({
        id: `suggest-musk-${target.id}`,
        blockId: target.id,
        slotKey: String(target.slotKey),
        title: "减少马斯克重复",
        reason: "这一段和前面的马斯克内容太像，换掉会让整篇更像一篇新稿，而不是同题复读。",
        preview: candidate.content.slice(0, 120),
        candidateMaterialId: candidate.materialId || null,
        candidateOriginalId: candidate.originalId || null,
        candidateSourceKey: candidate.sourceKey || null,
        candidateLabel: candidate.label,
        candidateContent: candidate.content,
        candidateEntityTag: candidate.entityTag ?? null,
        candidateTopicFamily: candidate.topicFamily ?? null,
        candidateBindingScope: candidate.bindingScope ?? null,
      });
    }
  }

  const weakBridgeTarget = middle.find((block, index) => {
    if (index === 0) return false;
    const previous = middle[index - 1];
    return overlapScore(previous.content, block.content) <= 1;
  });
  if (weakBridgeTarget && !suggestions.some((item) => item.blockId === weakBridgeTarget.id)) {
    const candidate = findReplacementCandidate({
      blocks: options.blocks,
      targetId: weakBridgeTarget.id,
      sections: options.sections,
      theme: options.theme,
      primaryDirection: options.primaryDirection,
      historyBlocks: options.historyBlocks,
    });
    if (candidate) {
      suggestions.push({
        id: `suggest-bridge-${weakBridgeTarget.id}`,
        blockId: weakBridgeTarget.id,
        slotKey: String(weakBridgeTarget.slotKey),
        title: "让中段更顺一点",
        reason: "这一段和前一段的承接偏弱，换一条更贴当前主题的内容，听感会更顺。",
        preview: candidate.content.slice(0, 120),
        candidateMaterialId: candidate.materialId || null,
        candidateOriginalId: candidate.originalId || null,
        candidateSourceKey: candidate.sourceKey || null,
        candidateLabel: candidate.label,
        candidateContent: candidate.content,
        candidateEntityTag: candidate.entityTag ?? null,
        candidateTopicFamily: candidate.topicFamily ?? null,
        candidateBindingScope: candidate.bindingScope ?? null,
      });
    }
  }

  return suggestions.slice(0, 3);
}

export function buildComposeReview(options: {
  theme: string;
  blocks: ComposeBlock[];
  sections: ScriptSectionItem[];
  primaryDirection: string;
  historyBlocks?: ComposeHistoryItem[] | null;
}): ComposeReview {
  const a = getSlot(options.blocks, "A");
  const b1 = getSlot(options.blocks, "B1");
  const c1 = getSlot(options.blocks, "C1");
  const d = getSlot(options.blocks, "D");
  const b2 = getSlot(options.blocks, "B2");
  const c2 = getSlot(options.blocks, "C2");
  const j = getSlot(options.blocks, "J");
  const k = getSlot(options.blocks, "K");
  const l = getSlot(options.blocks, "L");
  const middle = options.blocks.filter((block) => ["F", "G", "H", "I", "J"].includes(String(block.slotKey)));
  const middleClusters = middle.map((block) => topicFamilyCluster(block.topicFamily)).filter((item) => item !== "generic");
  const muskCount = middleClusters.filter((item) => item === "musk").length;

  const openingScore = clamp(
    35 +
      (a ? 22 : -20) +
      (b1 ? 12 : -10) +
      (c1 ? 10 : -8) +
      (d ? 12 : -6) +
      (b2 ? 6 : 0) +
      (c2 ? 6 : 0) -
      (b1 && b2 && overlapScore(b1.content, b2.content) >= 5 ? 16 : 0) -
      (c1 && c2 && overlapScore(c1.content, c2.content) >= 5 ? 14 : 0),
  );

  const middleScore = clamp(30 + Math.min(middle.length * 10, 40) - Math.max(muskCount - 2, 0) * 15 - (middle.length < 3 ? 18 : 0));
  const closingScore = clamp(40 + (j ? 20 : -18) + (k ? 18 : 0) + (l ? 14 : 0) - (k && !j ? 18 : 0) - (l && !k ? 16 : 0));
  const diversityScore = clamp(
    42 + new Set(options.blocks.map((block) => block.originalId).filter(Boolean)).size * 5 - Math.max(muskCount - 1, 0) * 10,
  );

  const metrics: ComposeReviewMetric[] = [
    buildMetric(
      "opening",
      "开场链评分",
      openingScore,
      openingScore >= 80 ? "开头到铺垫整体是顺的。" : "开场链还有优化空间。",
      "系统会重点看开头、第一次钩子动作、铺垫、第二次憋单是不是自然推进，而不是各说各的。",
      ["A", "B1", "C1", "D", "B2", "C2"],
    ),
    buildMetric(
      "middle",
      "中段推进评分",
      middleScore,
      middleScore >= 80 ? "中段推进比较完整。" : "中段还有一点像资料堆，需要继续收口。",
      "系统会看中段是否形成判断、对比、案例、风险、解法的推进，而不是简单把几段资料堆在一起。",
      ["F", "G", "H", "I", "J"],
    ),
    buildMetric(
      "closing",
      "承接收口评分",
      closingScore,
      closingScore >= 80 ? "承接到收口比较顺。" : "课程承接或收口还有打磨空间。",
      "系统会看你是不是先把人说服到位，再去接课程和动作，而不是突然卖课。",
      ["J", "K", "L"],
    ),
    buildMetric(
      "diversity",
      "素材分散度评分",
      diversityScore,
      diversityScore >= 80 ? "这篇的来源比较分散。" : "这篇的来源有点集中，可以再换一两块。",
      "系统会检查是否过度依赖同一篇原文或同一主题家族，尤其是马斯克同家族内容。",
      options.blocks.map((block) => String(block.slotKey)),
    ),
  ];

  const overallScore = clamp(
    metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length +
      (new Set(middleClusters).size >= 2 ? 4 : 0),
  );

  return {
    overallScore,
    metrics,
    suggestions: buildSuggestions(options),
  };
}
