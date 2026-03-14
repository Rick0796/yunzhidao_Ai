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
  entityTag?: string | null;
  topicFamily?: string | null;
  bindingScope?: string | null;
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
  candidateEntityTag?: string | null;
  candidateTopicFamily?: string | null;
  candidateBindingScope?: string | null;
}

export interface ComposeReview {
  overallScore: number;
  metrics: ComposeReviewMetric[];
  suggestions: ComposeSuggestion[];
}

export interface ComposeHistoryItem {
  materialId: string | null;
  originalId: string | null;
  topicFamily?: string | null;
  entityTag?: string | null;
  slotKey: string;
}

export interface ComposeHistoryContext {
  materialIds: Set<string>;
  originalIds: Set<string>;
  topicFamilies: Set<string>;
  familyClusters: Set<string>;
  entityTags: Set<string>;
  slotMaterialIds: Map<string, Set<string>>;
  slotOriginalIds: Map<string, Set<string>>;
}

export interface SlotBlueprintItem {
  slotKey: ComposeSlotKey;
  sectionType: ComposeSectionType;
  title: string;
}

export interface CandidateRankEntry {
  item: ScriptSectionItem;
  score: number;
}

export interface DedupeResult {
  blocks: ComposeBlock[];
  changed: boolean;
  warning?: string | null;
}

export const SLOT_BLUEPRINT: SlotBlueprintItem[] = [
  { slotKey: "A", sectionType: "A", title: "开头" },
  { slotKey: "B1", sectionType: "B", title: "第一次钩子" },
  { slotKey: "C1", sectionType: "C", title: "第一次动作" },
  { slotKey: "D", sectionType: "D", title: "铺垫" },
  { slotKey: "B2", sectionType: "B", title: "第二次钩子" },
  { slotKey: "C2", sectionType: "C", title: "第二次动作" },
  { slotKey: "F", sectionType: "F", title: "趋势判断" },
  { slotKey: "G", sectionType: "G", title: "历史对比" },
  { slotKey: "H", sectionType: "H", title: "现实案例" },
  { slotKey: "I", sectionType: "I", title: "风险代价" },
  { slotKey: "J", sectionType: "J", title: "解法路径" },
  { slotKey: "K", sectionType: "K", title: "课程承接" },
  { slotKey: "L", sectionType: "L", title: "最终行动" },
];

export const SECTION_TITLE_MAP: Record<ComposeSectionType, string> = {
  A: "开头",
  B: "钩子",
  C: "动作",
  D: "铺垫",
  F: "趋势判断",
  G: "历史对比",
  H: "现实案例",
  I: "风险代价",
  J: "解法路径",
  K: "课程承接",
  L: "最终行动",
};

export const MID_SLOT_KEYS: ComposeSlotKey[] = ["F", "G", "H", "I", "J"];
