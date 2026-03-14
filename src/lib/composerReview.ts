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
import { overlapScore, topicFamilyCluster } from "./textMatch";

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
  const f = getSlot(blocks, "F");
  const i = getSlot(blocks, "I");
  const j = getSlot(blocks, "J");
  const k = getSlot(blocks, "K");
  const l = getSlot(blocks, "L");
  const middle = blocks.filter((block) => ["F", "G", "H", "I", "J"].includes(String(block.slotKey)));
  const muskCount = blocks.filter((block) => topicFamilyCluster(block.topicFamily) === "musk").length;

  if (!a) diagnostics.push({ level: "warning", title: "缺少开头爆点", detail: "当前没有强开头，整篇抓停会明显变弱。" });
  if (!b1 || !c1) {
    diagnostics.push({
      level: "warning",
      title: "第一轮钩子动作不完整",
      detail: "开场后的第一次钩子或第一次动作不完整，前段抓住人之后不够容易往下带。",
    });
  }
  if (!d) {
    diagnostics.push({
      level: "warning",
      title: "铺垫承接偏弱",
      detail: "前段缺少承接，容易从爆点直接跳到趋势结论，听感会发硬。",
    });
  }
  if (b1 && b2 && overlapScore(b1.content, b2.content) >= 5) {
    diagnostics.push({
      level: "warning",
      title: "两次钩子太像",
      detail: "B1 和 B2 的功能像在复读，第二次钩子没有形成新的憋单效果。",
    });
  }
  if (c1 && c2 && overlapScore(c1.content, c2.content) >= 5) {
    diagnostics.push({
      level: "warning",
      title: "两次动作太像",
      detail: "C1 和 C2 太接近，容易变成连续两次点赞收藏的重复动作。",
    });
  }
  if (!f || !i || !j) {
    diagnostics.push({
      level: "warning",
      title: "中段推进链不完整",
      detail: "中段最好至少形成趋势、代价、解法这条完整推进链，不然会像堆素材。",
    });
  }
  if (middle.length < 3) {
    diagnostics.push({
      level: "warning",
      title: "中段太薄",
      detail: "当前中段有效板块偏少，说服力不够厚，容易像只说了结论。",
    });
  }
  if (muskCount > 2) {
    diagnostics.push({
      level: "warning",
      title: "马斯克内容过载",
      detail: "同一篇里马斯克同家族内容超过两段，听感会像同一篇稿反复改壳。",
    });
  }
  if (k && !j) {
    diagnostics.push({
      level: "warning",
      title: "课程承接偏硬",
      detail: "还没给出足够解法就接课程承接，会像突然卖课。",
    });
  }
  if (l && !k) {
    diagnostics.push({
      level: "warning",
      title: "最终动作过早",
      detail: "最终动作前没有课程承接，结尾会显得比较突兀。",
    });
  }
  if (theme && a && overlapScore(theme, a.content) < 1) {
    diagnostics.push({
      level: "info",
      title: "开头和主题距离偏远",
      detail: "开头够爆，但和当前主题的对应关系偏弱，可以考虑换成更贴题的开头。",
    });
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
        title: "减少同家族内容重复",
        reason: "这段和前面马斯克内容太接近，换掉以后整篇会更像新稿，不会像同题复读。",
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
        reason: "这段和前一段承接偏弱，换一条更贴主题的内容，中段会少很多资料堆的感觉。",
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
      openingScore >= 80 ? "开头到铺垫整体是顺的。" : "开场链还可以继续收紧。",
      "系统重点看开头、第一次钩子动作、铺垫承接、第二次憋单是不是自然推进，而不是各说各的。",
      ["A", "B1", "C1", "D", "B2", "C2"],
    ),
    buildMetric(
      "middle",
      "中段推进评分",
      middleScore,
      middleScore >= 80 ? "中段推进比较完整。" : "中段还有一点像资料堆，需要继续补桥。",
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
      "系统会检查是否过度依赖同一篇原文或同一个主题家族，尤其是马斯克同家族内容。",
      options.blocks.map((block) => String(block.slotKey)),
    ),
  ];

  const overallScore = clamp(metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length + (new Set(middleClusters).size >= 2 ? 4 : 0));

  return {
    overallScore,
    metrics,
    suggestions: buildSuggestions(options),
  };
}
