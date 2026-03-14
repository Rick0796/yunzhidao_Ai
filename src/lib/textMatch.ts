export function normalizeText(value: string) {
  return (value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function extractKeywords(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((item) => item && item.length >= 2);
}

export function overlapScore(left: string, right: string) {
  const a = new Set(extractKeywords(left));
  const b = new Set(extractKeywords(right));
  if (!a.size || !b.size) return 0;

  let hits = 0;
  for (const item of a) {
    if (b.has(item)) hits += 1;
  }
  return hits;
}

export function topicFamilyCluster(topicFamily?: string | null) {
  if (!topicFamily || /^(general|ai_general|wealth_general|cognition_general)$/.test(topicFamily)) {
    return "generic";
  }
  if (topicFamily.startsWith("musk_")) return "musk";
  return topicFamily;
}
