export type NavKey =
  | "task"
  | "decompose"
  | "workbench"
  | "drafts"
  | "score";

export type EntryType = "viral" | "hotspot" | "topic" | "boss_story";
export type BusinessMode = "none" | "light" | "strong";
export type CtaMode = "none" | "comment" | "keyword" | "profile" | "lead";
export type RiskLevel = "低" | "中" | "高";
export type DraftStatus = "待审核" | "待剪辑" | "可发布";
export type HotspotType = "risk_regulation" | "platform_change" | "external_shock" | "social_heat" | "mixed_digest" | "trend_shift" | "generic";
export type BridgeStrength = "none" | "weak" | "medium" | "strong";

export interface ApiSettings {
  useLiveApi: boolean;
  baseUrl: string;
  apiKey: string;
  mainModel: string;
  batchModel: string;
  polishModel: string;
  requestTimeoutMs: number;
}

export interface BaseProfile {
  selfIntro: string;
  targetAudience: string;
  coreKeywords: string;
}

export interface TaskForm {
  entryType: EntryType;
  entryTypeChosen: boolean;
  sourceText: string;
  userNote: string;
  hotspotAngle: string;
  topicGoal: string;
  storyConclusion: string;
  businessMode: BusinessMode;
  businessModeChosen: boolean;
  ctaMode: CtaMode;
  ctaModeChosen: boolean;
}

export interface TaskStrategy {
  hotspotType: HotspotType;
  hotspotTypeLabel: string;
  bridgeStrength: BridgeStrength;
  bridgeStrengthLabel: string;
  entryFocus: "source_copy" | "fact_first" | "logic_first" | "story_first";
  allowedBusinessMode: BusinessMode;
  summary: string;
  recommendedSkeletonIds: string[];
  mustHoldFacts: string[];
  safeInferences: string[];
  forbiddenJumps: string[];
  writingRules: string[];
}

export interface DecomposeResult {
  taskName: string;
  summary: string;
  hookAnalysis: {
    type: string;
    example: string;
    logic: string;
  };
  skeletonAnalysis: {
    name: string;
    steps: string[];
    why: string;
  };
  meatAnalysis: {
    fit: BusinessMode;
    reason: string;
    example: string;
  };
  ctaAnalysis: {
    type: string;
    example: string;
    reason: string;
  };
  emotion: string;
  reusablePoints: string[];
  risks: string[];
}

export interface HookItem {
  id: string;
  text: string;
  type: string;
  platformFit: string;
  riskLevel: RiskLevel;
  score: number;
}

export type SkeletonStepRole =
  | "event"
  | "mapping"
  | "risk"
  | "reason"
  | "bridge"
  | "identity"
  | "solution"
  | "proof"
  | "landing"
  | "conflict"
  | "reversal"
  | "payoff"
  | "suspense"
  | "generic";

export interface SkeletonStep {
  name: string;
  purpose: string;
  targetWords: number;
  role?: SkeletonStepRole;
  segmentTask?: string;
  minSentences?: number;
  mustInclude?: string[];
  forbidden?: string[];
  bridgeToNext?: string;
  allowMeat?: boolean;
  requireSource?: boolean;
}

export interface SkeletonItem {
  id: string;
  name: string;
  scenario: string;
  summary: string;
  steps: SkeletonStep[];
}

export interface SourceStructureItem {
  id: string;
  label: string;
  hint: string;
  text: string;
}

export interface MeatItem {
  id: string;
  type: string;
  text: string;
  bridgeText?: string;
  serviceText?: string;
  actionPrepText?: string;
  intensity: BusinessMode;
  smoothnessScore: number;
}

export interface CtaItem {
  id: string;
  type: string;
  text: string;
  scenario: string;
}

export interface DraftItem {
  id: string;
  versionName: string;
  title: string;
  coverLine: string;
  script: string;
  subtitleScript: string;
  selectedHookId: string;
  selectedSkeletonId: string;
  selectedMeatId: string | null;
  selectedCtaId: string;
  platformFit: string;
}

export interface DraftArchiveItem {
  id: string;
  draftId: string;
  entryType: EntryType;
  businessMode: BusinessMode;
  ctaMode: CtaMode;
  createdAt: string;
  status: DraftStatus;
  selectedHookText: string;
  selectedSkeletonName: string;
  selectedSkeletonSteps: string[];
  selectedMeatType: string;
  selectedCtaText: string;
  snapshot: TaskForm;
  draft: DraftItem;
}

export interface ScoreCard {
  totalScore: number;
  summary: string;
  dimensions: {
    label: string;
    score: number;
  }[];
  issues: string[];
  suggestions: string[];
  replaceLines: string[];
}

export interface WorkspaceSnapshot {
  decompose: DecomposeResult | null;
  selectedHook: HookItem | null;
  selectedSkeleton: SkeletonItem | null;
  selectedMeat: MeatItem | null;
  selectedCta: CtaItem | null;
  drafts: DraftItem[];
  selectedDraftId: string | null;
  score: ScoreCard | null;
}

export interface TemplateItem {
  id: string;
  type: "皮模板" | "骨架模板" | "肉模板" | "收口模板" | "成品模板";
  scene: string;
  title: string;
  content: string;
  tags: string[];
  useCount: number;
}

export interface HistoryItem {
  id: string;
  entryType: EntryType;
  businessMode: BusinessMode;
  ctaMode: CtaMode;
  createdAt: string;
  snapshot: TaskForm;
  workspace: WorkspaceSnapshot | null;
}

export interface GenerationSource<T> {
  data: T;
  source: "api" | "local" | "mock";
  message?: string;
}
