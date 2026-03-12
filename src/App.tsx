import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import ParticleBackground from "./components/ParticleBackground";
import {
  buildMockSourceStructure,
  defaultApiSettings,
  defaultBaseProfile,
  defaultTask,
  displayBusinessMode,
  displayCtaMode,
  displayEntryType
} from "./lib/mock";
import {
  runCtaGeneration,
  runDraftGeneration,
  runHookGeneration,
  runMeatGeneration,
  runSkeletonGeneration
} from "./lib/generators";
import {
  formatSkeletonPreview,
  normalizeCtaResults,
  normalizeDraftResults,
  normalizeHookResults,
  normalizeMeatResults,
  normalizeSkeletonResults
} from "./lib/normalize";
import {
  buildMaterialFromBusinessHot,
  buildMaterialFromHotRank,
  fetchHotRankDetail,
  fetchHotRank,
  fetchManualSearch
} from "./lib/workflows";
import { formatSkeletonCardDescription, formatSkeletonExecutionLines } from "./lib/skeletons";
import type {
  ApiSettings,
  BaseProfile,
  BusinessMode,
  CtaItem,
  CtaMode,
  DraftItem,
  EntryType,
  HistoryItem,
  HookItem,
  MeatItem,
  SkeletonItem,
  SourceStructureItem,
  TaskForm,
  WorkspaceSnapshot
} from "./types";
import type { BusinessHotItem, HotRankItem, HotRankResponse, ManualSearchResponse } from "./lib/workflows";

const STORAGE_KEYS = {
  enteredWorkbench: "yzd.copy.entered-workbench",
  workbenchMode: "yzd.copy.workbench-mode",
  settings: "yzd.copy.settings",
  profile: "yzd.copy.profile",
  task: "yzd.copy.task",
  hooks: "yzd.copy.hooks",
  skeletons: "yzd.copy.skeletons",
  meats: "yzd.copy.meats",
  ctas: "yzd.copy.ctas",
  drafts: "yzd.copy.drafts",
  history: "yzd.copy.history",
  hotRankResult: "yzd.copy.hot-rank-result.v2",
  hotRankFetchedAt: "yzd.copy.hot-rank-fetched-at.v2",
  selectedHookId: "yzd.copy.selected-hook-id",
  selectedSkeletonId: "yzd.copy.selected-skeleton-id",
  selectedMeatId: "yzd.copy.selected-meat-id",
  selectedCtaId: "yzd.copy.selected-cta-id",
  selectedDraftId: "yzd.copy.selected-draft-id"
} as const;

const ENTRY_OPTIONS: Array<{ value: EntryType; label: string; hint: string }> = [
  { value: "viral", label: "仿写爆款", hint: "拆同行爆款，改表达不改命题。" },
  { value: "hotspot", label: "蹭热点", hint: "借事件流量，快速落到自己的判断。" },
  { value: "topic", label: "主题创作", hint: "围绕一个认知点，直接做成系列。" },
  { value: "boss_story", label: "我的故事", hint: "讲老板经历、反转和认知。" }
];
const ORIGINAL_ENTRY_OPTIONS = ENTRY_OPTIONS.filter((item) => item.value !== "viral");

const BUSINESS_OPTIONS: Array<{ value: BusinessMode; label: string; hint: string }> = [
  { value: "none", label: "不挂业务", hint: "纯内容、纯流量、不提服务。" },
  { value: "light", label: "轻挂业务", hint: "中后段顺带提一下，不抢正文。" },
  { value: "strong", label: "明确挂业务", hint: "业务高度相关，结果导向更强。" }
];

const CTA_OPTIONS: Array<{ value: CtaMode; label: string; hint: string }> = [
  { value: "comment", label: "评论互动", hint: "先把评论区做热。" },
  { value: "keyword", label: "评论关键词", hint: "把高意向用户筛出来。" },
  { value: "profile", label: "评论后看主页", hint: "适合主页有明确承接内容。" },
  { value: "lead", label: "评论后领资料", hint: "适合资料承接和转化。" },
  { value: "none", label: "不加收口", hint: "纯内容表达，不做导流。" }
];

type WorkbenchMode = "rewrite" | "original";
type WizardStep = 1 | 2 | 3 | 4;
type NoticeTone = "success" | "warning" | "info";
type HotspotPanelTab = "all" | "business" | "douyin" | "weibo" | "zhihu" | "baidu" | "search";
type HotspotExpandState = { all: boolean; business: boolean; douyin: boolean; weibo: boolean; zhihu: boolean; baidu: boolean };
type OriginalEntryType = Exclude<EntryType, "viral">;

const DEFAULT_ORIGINAL_ENTRY_TYPE: OriginalEntryType = "hotspot";
const COMPACT_HOTSPOT_COLLAPSED_COUNT = 3;

function isOriginalEntryType(value: EntryType): value is OriginalEntryType {
  return value !== "viral";
}

const HOTSPOT_PLATFORM_META: Record<Exclude<HotspotPanelTab, "all" | "business" | "search">, { label: string }> = {
  douyin: { label: "抖音热榜" },
  weibo: { label: "微博热搜" },
  zhihu: { label: "知乎热榜" },
  baidu: { label: "百度热搜" }
};

function getStepConfig(mode: WorkbenchMode) {
  return mode === "rewrite"
    ? [
        { step: 1 as const, title: "上传原文", hint: "先上传爆款原文和改写要求。" },
        { step: 2 as const, title: "看结构选皮", hint: "先看原文结构，再确定更炸的开头。" },
        { step: 3 as const, title: "装配骨肉收口", hint: "顺着原文推进装配骨、塑品、肉和收口。" },
        { step: 4 as const, title: "生成成品", hint: "输出完整改写正文和字幕稿。" }
      ]
    : [
        { step: 1 as const, title: "设定任务", hint: "先定热点/主题、内容方向和收口。" },
        { step: 2 as const, title: "选择皮", hint: "先把开头打到位，确定前三秒。" },
        { step: 3 as const, title: "选择骨肉收口", hint: "骨接住皮，肉放中后段，收口只做一个动作。" },
        { step: 4 as const, title: "生成成品", hint: "输出完整正文和字幕稿，直接进人工筛选。" }
      ];
}

function getWorkbenchCopy(mode: WorkbenchMode) {
  return mode === "rewrite"
    ? {
        eyebrow: "爆款仿写",
        title: "爆款仿写工作台",
        description: "上传爆款原文，先看原文结构，再装配皮、骨、肉和完整改写成品。",
        step1Title: "步骤 1 / 上传原文",
        step1Subtitle: "先点开任务设置，再把爆款原文和补充要求填进去。",
        step2Title: "步骤 2 / 看结构选皮",
        step2Subtitle: "先看原文结构，再确定更能抓人的开头。",
        step3Title: "步骤 3 / 装配骨肉收口",
        step3Subtitle: "顺着原文推进装配骨、塑品、肉和收口。",
        step4Title: "步骤 4 / 生成成品",
        step4Subtitle: "这里直接出完整改写正文和字幕稿。"
      }
    : {
        eyebrow: "热点 / 主题创作",
        title: "热点 / 主题创作工作台",
        description: "先定内容任务，再按步骤生成皮、骨、肉和完整成品。",
        step1Title: "步骤 1 / 设定任务",
        step1Subtitle: "先点开任务设置，再把热点、主题或故事素材填进去。",
        step2Title: "步骤 2 / 选择皮",
        step2Subtitle: "第一句话先抓住人，后面才接得住。",
        step3Title: "步骤 3 / 选择骨肉收口",
        step3Subtitle: "骨负责推进，肉放中后段，收口只留一个动作。",
        step4Title: "步骤 4 / 生成成品",
        step4Subtitle: "这里直接出完整正文和字幕稿。"
      };
}

interface NoticeState {
  text: string;
  tone: NoticeTone;
}

interface ModuleMeta {
  source: "api" | "local" | "mock";
  updatedAt: string;
  message?: string;
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeApiSettings(value: Partial<ApiSettings> | null | undefined): ApiSettings {
  return {
    ...defaultApiSettings,
    ...(value || {}),
    useLiveApi: typeof value?.useLiveApi === "boolean" ? value.useLiveApi : defaultApiSettings.useLiveApi,
    baseUrl: typeof value?.baseUrl === "string" && value.baseUrl.trim() ? value.baseUrl : defaultApiSettings.baseUrl,
    apiKey: typeof value?.apiKey === "string" ? value.apiKey : defaultApiSettings.apiKey,
    mainModel: typeof value?.mainModel === "string" && value.mainModel.trim() ? value.mainModel : defaultApiSettings.mainModel,
    batchModel: typeof value?.batchModel === "string" && value.batchModel.trim() ? value.batchModel : defaultApiSettings.batchModel,
    polishModel: typeof value?.polishModel === "string" && value.polishModel.trim() ? value.polishModel : defaultApiSettings.polishModel,
    requestTimeoutMs:
      typeof value?.requestTimeoutMs === "number" && Number.isFinite(value.requestTimeoutMs) && value.requestTimeoutMs > 0
        ? value.requestTimeoutMs
        : defaultApiSettings.requestTimeoutMs
  };
}

function sameApiSettings(left: ApiSettings, right: ApiSettings) {
  return (
    left.useLiveApi === right.useLiveApi &&
    left.baseUrl === right.baseUrl &&
    left.apiKey === right.apiKey &&
    left.mainModel === right.mainModel &&
    left.batchModel === right.batchModel &&
    left.polishModel === right.polishModel &&
    left.requestTimeoutMs === right.requestTimeoutMs
  );
}

function useStoredState<T>(storageKey: string, initialValue: T | (() => T)) {
  const [state, setState] = useState<T>(() => {
    const fallback = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

  return [state, setState] as const;
}

function createWorkspaceSnapshot(
  selectedHook: HookItem | null,
  selectedSkeleton: SkeletonItem | null,
  selectedMeat: MeatItem | null,
  selectedCta: CtaItem | null,
  drafts: DraftItem[],
  selectedDraftId: string | null
): WorkspaceSnapshot {
  return {
    decompose: null,
    selectedHook: selectedHook ? cloneDeep(selectedHook) : null,
    selectedSkeleton: selectedSkeleton ? cloneDeep(selectedSkeleton) : null,
    selectedMeat: selectedMeat ? cloneDeep(selectedMeat) : null,
    selectedCta: selectedCta ? cloneDeep(selectedCta) : null,
    drafts: cloneDeep(drafts),
    selectedDraftId,
    score: null
  };
}

function createHistoryRecord(
  task: TaskForm,
  selectedHook: HookItem | null,
  selectedSkeleton: SkeletonItem | null,
  selectedMeat: MeatItem | null,
  selectedCta: CtaItem | null,
  drafts: DraftItem[],
  selectedDraftId: string | null
): HistoryItem {
  return {
    id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entryType: task.entryType,
    businessMode: task.businessMode,
    ctaMode: task.ctaMode,
    createdAt: new Date().toISOString(),
    snapshot: cloneDeep(task),
    workspace: createWorkspaceSnapshot(selectedHook, selectedSkeleton, selectedMeat, selectedCta, drafts, selectedDraftId)
  };
}

function getTaskPrimaryText(task: TaskForm) {
  if (task.entryType === "hotspot") return task.sourceText || task.hotspotAngle;
  if (task.entryType === "topic") return task.topicGoal || task.sourceText;
  if (task.entryType === "boss_story") return task.sourceText || task.storyConclusion;
  return task.sourceText;
}

function getTaskDisplayName(task: TaskForm) {
  const seed = getTaskPrimaryText(task).replace(/\s+/g, "").slice(0, 22);
  return seed || displayEntryType(task.entryType);
}

function inferWorkbenchMode(entryType: EntryType): WorkbenchMode {
  return entryType === "viral" ? "rewrite" : "original";
}

function normalizeTaskState(task: TaskForm): TaskForm {
  return {
    ...defaultTask,
    ...task,
    entryTypeChosen: typeof task.entryTypeChosen === "boolean" ? task.entryTypeChosen : Boolean(task.entryType),
    businessModeChosen: typeof task.businessModeChosen === "boolean" ? task.businessModeChosen : Boolean(task.businessMode),
    ctaModeChosen: typeof task.ctaModeChosen === "boolean" ? task.ctaModeChosen : Boolean(task.ctaMode)
  };
}

function createTaskForMode(
  mode: WorkbenchMode,
  options?: {
    previousTask?: TaskForm;
    lastOriginalEntryType?: OriginalEntryType;
    lastOriginalEntryChosen?: boolean;
  }
): TaskForm {
  const previousTask = options?.previousTask ?? defaultTask;
  const businessMode = previousTask.businessMode;
  const businessModeChosen = previousTask.businessModeChosen;
  const ctaMode = previousTask.ctaMode;
  const ctaModeChosen = previousTask.ctaModeChosen;

  if (mode === "rewrite") {
    return {
      ...defaultTask,
      entryType: "viral",
      entryTypeChosen: true,
      sourceText: "",
      userNote: "",
      hotspotAngle: "",
      topicGoal: "",
      storyConclusion: "",
      businessMode,
      businessModeChosen,
      ctaMode,
      ctaModeChosen
    };
  }

  const entryType = isOriginalEntryType(previousTask.entryType)
    ? previousTask.entryType
    : options?.lastOriginalEntryType ?? DEFAULT_ORIGINAL_ENTRY_TYPE;
  const entryTypeChosen = isOriginalEntryType(previousTask.entryType)
    ? previousTask.entryTypeChosen
    : Boolean(options?.lastOriginalEntryChosen);

  return {
    ...defaultTask,
    entryType,
    entryTypeChosen,
    sourceText: "",
    userNote: "",
    hotspotAngle: "",
    topicGoal: "",
    storyConclusion: "",
    businessMode,
    businessModeChosen,
    ctaMode,
    ctaModeChosen
  };
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function looksLikeBlockedSummary(value?: string) {
  const text = (value || "").trim();
  if (!text) return false;
  return /SecurityCompromiseError|Anonymous access to domain blocked|DDoS attack suspected|["“]code["”]\s*:\s*451|["“]status["”]\s*:\s*45102/i.test(text);
}

function trimCardPreviewText(value?: string, maxLength = 28) {
  const text = (value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/[，。；;:：\s]+$/g, "")}…`;
}

function pickHotspotCardSummary(item: Partial<HotRankItem & BusinessHotItem>, business = false) {
  const candidates = business
    ? [(item as BusinessHotItem).display_summary, item.summary, (item as BusinessHotItem).business_reason, (item as BusinessHotItem).recommend_reason, item.title]
    : [(item as HotRankItem).display_summary, item.summary, (item as HotRankItem).business_reason, (item as HotRankItem).why_hot, item.title];
  return candidates.find((text) => text && !looksLikeBlockedSummary(text)) || "暂无摘要";
}

function pickHotspotCardTitle(item: Partial<HotRankItem & BusinessHotItem>, fallbackTitle: string) {
  return (item as HotRankItem).display_title || item.title || fallbackTitle;
}

function getHotspotPreviewSummary(item: Partial<HotRankItem & BusinessHotItem>, business = false) {
  const candidates = business
    ? [(item as BusinessHotItem).display_summary, item.summary, item.title]
    : [(item as HotRankItem).display_summary, item.summary, (item as HotRankItem).why_hot, item.title];
  const next = candidates.find((text) => text && !looksLikeBlockedSummary(text));
  return trimCardPreviewText(next, 28) || "暂无摘要";
}

function getHotspotPreviewTitle(item: Partial<HotRankItem & BusinessHotItem>, fallbackTitle: string) {
  return trimCardPreviewText((item as HotRankItem).display_title || item.title || fallbackTitle, 40);
}

function App() {
  const [enteredWorkbench, setEnteredWorkbench] = useState(false);
  const [workbenchMode, setWorkbenchMode] = useStoredState<WorkbenchMode | null>(STORAGE_KEYS.workbenchMode, null);
  const [settings, setSettings] = useStoredState<ApiSettings>(STORAGE_KEYS.settings, defaultApiSettings);
  const [profile, setProfile] = useStoredState<BaseProfile>(STORAGE_KEYS.profile, defaultBaseProfile);
  const [task, setTask] = useStoredState<TaskForm>(STORAGE_KEYS.task, defaultTask);
  const [hooks, setHooks] = useStoredState<HookItem[]>(STORAGE_KEYS.hooks, []);
  const [skeletons, setSkeletons] = useStoredState<SkeletonItem[]>(STORAGE_KEYS.skeletons, []);
  const [meats, setMeats] = useStoredState<MeatItem[]>(STORAGE_KEYS.meats, []);
  const [ctas, setCtas] = useStoredState<CtaItem[]>(STORAGE_KEYS.ctas, []);
  const [drafts, setDrafts] = useStoredState<DraftItem[]>(STORAGE_KEYS.drafts, []);
  const [history, setHistory] = useStoredState<HistoryItem[]>(STORAGE_KEYS.history, []);
  const [selectedHookId, setSelectedHookId] = useStoredState<string | null>(STORAGE_KEYS.selectedHookId, null);
  const [selectedSkeletonId, setSelectedSkeletonId] = useStoredState<string | null>(STORAGE_KEYS.selectedSkeletonId, null);
  const [selectedMeatId, setSelectedMeatId] = useStoredState<string | null>(STORAGE_KEYS.selectedMeatId, null);
  const [selectedCtaId, setSelectedCtaId] = useStoredState<string | null>(STORAGE_KEYS.selectedCtaId, null);
  const [selectedDraftId, setSelectedDraftId] = useStoredState<string | null>(STORAGE_KEYS.selectedDraftId, null);
  const [moduleMeta, setModuleMeta] = useState<Record<"hooks" | "structure" | "drafts", ModuleMeta | null>>({
    hooks: null,
    structure: null,
    drafts: null
  });
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTaskSettings, setShowTaskSettings] = useState(false);
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false);
  const [isGeneratingStructure, setIsGeneratingStructure] = useState(false);
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [draftSignature, setDraftSignature] = useState("");
  const [structureTab, setStructureTab] = useState<"skeleton" | "meat" | "cta">("skeleton");
  const [hotRankResult, setHotRankResult] = useStoredState<HotRankResponse | null>(STORAGE_KEYS.hotRankResult, null);
  const [hotRankFetchedAt, setHotRankFetchedAt] = useStoredState<string>(STORAGE_KEYS.hotRankFetchedAt, "");
  const [manualSearchResult, setManualSearchResult] = useState<ManualSearchResponse | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [hotspotPanelTab, setHotspotPanelTab] = useState<HotspotPanelTab>("all");
  const [selectedHotspotKey, setSelectedHotspotKey] = useState<string | null>(null);
  const [isLoadingHotRank, setIsLoadingHotRank] = useState(false);
  const [isLoadingManualSearch, setIsLoadingManualSearch] = useState(false);
  const [loadingHotspotKey, setLoadingHotspotKey] = useState<string | null>(null);
  const [isRewriteStructureCollapsed, setIsRewriteStructureCollapsed] = useState(false);
  const [isWorkbenchIntroCollapsed, setIsWorkbenchIntroCollapsed] = useState(true);
  const [hotspotListExpanded, setHotspotListExpanded] = useState<HotspotExpandState>({
    all: false,
    business: false,
    douyin: false,
    weibo: false,
    zhihu: false,
    baidu: false
  });
  const [showHotspotCenter, setShowHotspotCenter] = useState(true);
  const [wizardStep, setWizardStep] = useState<WizardStep>(() =>
    drafts.length > 0 ? 4 : skeletons.length > 0 || ctas.length > 0 || meats.length > 0 ? 3 : hooks.length > 0 ? 2 : 1
  );
  const currentWorkbenchMode = workbenchMode ?? inferWorkbenchMode(task.entryType);
  const normalizedTask = useMemo(() => normalizeTaskState(task), [task]);
  const canCollapseWorkbenchIntro = true;
  const isWorkbenchIntroHidden = isWorkbenchIntroCollapsed;
  const lastOriginalEntryRef = useRef<{ entryType: OriginalEntryType; chosen: boolean }>({
    entryType: isOriginalEntryType(defaultTask.entryType) ? defaultTask.entryType : DEFAULT_ORIGINAL_ENTRY_TYPE,
    chosen: false
  });

  useEffect(() => {
    setIsWorkbenchIntroCollapsed(true);
  }, [currentWorkbenchMode]);
  const taskChoiceMissing = useMemo(() => {
    const missing: string[] = [];
    if (currentWorkbenchMode !== "rewrite" && !normalizedTask.entryTypeChosen) {
      missing.push("创作入口");
    }
    if (!normalizedTask.businessModeChosen) {
      missing.push("挂业务方式");
    }
    if (!normalizedTask.ctaModeChosen) {
      missing.push("收口方式");
    }
    return missing;
  }, [currentWorkbenchMode, normalizedTask.businessModeChosen, normalizedTask.ctaModeChosen, normalizedTask.entryTypeChosen]);
  const hasRequiredTaskChoices = taskChoiceMissing.length === 0;
  const previousRequiredChoicesRef = useRef(hasRequiredTaskChoices);
  const stepConfig = getStepConfig(currentWorkbenchMode);
  const workbenchCopy = getWorkbenchCopy(currentWorkbenchMode);
  const rewriteSourceStructure = useMemo<SourceStructureItem[]>(() => (currentWorkbenchMode === "rewrite" ? buildMockSourceStructure(task) : []), [currentWorkbenchMode, task]);

  const selectedHook = useMemo(() => hooks.find((item) => item.id === selectedHookId) ?? hooks[0] ?? null, [hooks, selectedHookId]);
  const selectedSkeleton = useMemo(
    () => skeletons.find((item) => item.id === selectedSkeletonId) ?? skeletons[0] ?? null,
    [selectedSkeletonId, skeletons]
  );
  const selectedMeat = useMemo(() => {
    if (task.businessMode === "none") return null;
    return meats.find((item) => item.id === selectedMeatId) ?? meats[0] ?? null;
  }, [meats, selectedMeatId, task.businessMode]);
  const selectedCta = useMemo(() => ctas.find((item) => item.id === selectedCtaId) ?? ctas[0] ?? null, [ctas, selectedCtaId]);
  const selectedDraft = useMemo(() => drafts.find((item) => item.id === selectedDraftId) ?? drafts[0] ?? null, [drafts, selectedDraftId]);

  useEffect(() => {
    if (currentWorkbenchMode !== "rewrite") return;
    setIsRewriteStructureCollapsed(hooks.length > 0);
  }, [currentWorkbenchMode, hooks.length]);

  const currentSelectionSignature = `${selectedHook?.id ?? "none"}-${selectedSkeleton?.id ?? "none"}-${selectedMeat?.id ?? "none"}-${selectedCta?.id ?? "none"}`;
  const canGoStep2 = hasRequiredTaskChoices && Boolean(getTaskPrimaryText(task).trim());
  const canGoStep3 = canGoStep2 && Boolean(selectedHook);
  const canGoStep4 = canGoStep3 && Boolean(selectedSkeleton && selectedCta && (task.businessMode === "none" || selectedMeat));
  const progress = [canGoStep2, canGoStep3, canGoStep4, drafts.length > 0].filter(Boolean).length;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const normalized = normalizeApiSettings(settings);
    if (!sameApiSettings(settings, normalized)) {
      setSettings(normalized);
    }
  }, [settings, setSettings]);

  useEffect(() => {
    if (
      task.entryTypeChosen !== normalizedTask.entryTypeChosen ||
      task.businessModeChosen !== normalizedTask.businessModeChosen ||
      task.ctaModeChosen !== normalizedTask.ctaModeChosen
    ) {
      setTask(normalizedTask);
    }
  }, [normalizedTask, setTask, task]);

  useEffect(() => {
    if (!isOriginalEntryType(normalizedTask.entryType)) return;
    lastOriginalEntryRef.current = {
      entryType: normalizedTask.entryType,
      chosen: normalizedTask.entryTypeChosen
    };
  }, [normalizedTask.entryType, normalizedTask.entryTypeChosen]);

  useEffect(() => {
    const justCompletedRequiredChoices = !previousRequiredChoicesRef.current && hasRequiredTaskChoices;
    if (showTaskSettings && justCompletedRequiredChoices) {
      setShowTaskSettings(false);
    }
    previousRequiredChoicesRef.current = hasRequiredTaskChoices;
  }, [hasRequiredTaskChoices, showTaskSettings]);

  useEffect(() => {
    void handleFetchTodayHotRank({ silent: true, forceRefresh: false });
  }, []);

  useEffect(() => {
    if (!hotRankResult?.cache?.refreshing) return;
    const timer = window.setTimeout(() => {
      void handleFetchTodayHotRank({ silent: true, forceRefresh: false });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [hotRankResult?.cache?.refreshing]);

  useEffect(() => {
    if (hooks.length > 0 && !hooks.some((item) => item.id === selectedHookId)) {
      setSelectedHookId(hooks[0].id);
    }
  }, [hooks, selectedHookId, setSelectedHookId]);

  useEffect(() => {
    if (skeletons.length > 0 && !skeletons.some((item) => item.id === selectedSkeletonId)) {
      setSelectedSkeletonId(skeletons[0].id);
    }
  }, [selectedSkeletonId, setSelectedSkeletonId, skeletons]);

  useEffect(() => {
    if (meats.length > 0 && task.businessMode !== "none" && !meats.some((item) => item.id === selectedMeatId)) {
      setSelectedMeatId(meats[0].id);
    }
  }, [meats, selectedMeatId, setSelectedMeatId, task.businessMode]);

  useEffect(() => {
    if (task.businessMode === "none" && structureTab === "meat") {
      setStructureTab("skeleton");
    }
  }, [structureTab, task.businessMode]);

  useEffect(() => {
    if (ctas.length > 0 && !ctas.some((item) => item.id === selectedCtaId)) {
      setSelectedCtaId(ctas[0].id);
    }
  }, [ctas, selectedCtaId, setSelectedCtaId]);

  useEffect(() => {
    if (drafts.length > 0 && !drafts.some((item) => item.id === selectedDraftId)) {
      setSelectedDraftId(drafts[0].id);
    }
  }, [drafts, selectedDraftId, setSelectedDraftId]);

  useEffect(() => {
    if (drafts.length > 0 && draftSignature && draftSignature !== currentSelectionSignature) {
      setDrafts([]);
      setSelectedDraftId(null);
      setModuleMeta((prev) => ({ ...prev, drafts: null }));
    }
  }, [currentSelectionSignature, draftSignature, drafts.length, setDrafts, setSelectedDraftId]);

  useEffect(() => {
    if (canGoStep2) return;
    if (!hooks.length && !skeletons.length && !meats.length && !ctas.length && !drafts.length) {
      if (wizardStep !== 1) setWizardStep(1);
      return;
    }
    clearFrom("task");
    if (wizardStep !== 1) {
      setWizardStep(1);
    }
  }, [canGoStep2, hooks.length, skeletons.length, meats.length, ctas.length, drafts.length, wizardStep]);

  function showNotice(tone: NoticeTone, text: string) {
    setNotice({ tone, text });
  }

  function clearFrom(level: "task" | "hook" | "structure") {
    if (level === "task") {
      setHooks([]);
      setSkeletons([]);
      setMeats([]);
      setCtas([]);
      setDrafts([]);
      setSelectedHookId(null);
      setSelectedSkeletonId(null);
      setSelectedMeatId(null);
      setSelectedCtaId(null);
      setSelectedDraftId(null);
      setModuleMeta({ hooks: null, structure: null, drafts: null });
      setDraftSignature("");
      return;
    }

    if (level === "hook") {
      setSkeletons([]);
      setMeats([]);
      setCtas([]);
      setDrafts([]);
      setSelectedSkeletonId(null);
      setSelectedMeatId(null);
      setSelectedCtaId(null);
      setSelectedDraftId(null);
      setModuleMeta((prev) => ({ ...prev, structure: null, drafts: null }));
      setDraftSignature("");
      return;
    }

    setDrafts([]);
    setSelectedDraftId(null);
    setModuleMeta((prev) => ({ ...prev, drafts: null }));
    setDraftSignature("");
  }

  function updateTaskField<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    setTask((prev) => ({ ...prev, [key]: value }));
    if (hooks.length > 0 || skeletons.length > 0 || drafts.length > 0 || ctas.length > 0 || meats.length > 0) {
      clearFrom("task");
      setWizardStep(1);
    }
  }

  function chooseEntryType(value: EntryType) {
    setTask((prev) => ({ ...prev, entryType: value, entryTypeChosen: true }));
    if (hooks.length > 0 || skeletons.length > 0 || drafts.length > 0 || ctas.length > 0 || meats.length > 0) {
      clearFrom("task");
      setWizardStep(1);
    }
  }

  function chooseBusinessMode(value: BusinessMode) {
    setTask((prev) => ({ ...prev, businessMode: value, businessModeChosen: true }));
    if (hooks.length > 0 || skeletons.length > 0 || drafts.length > 0 || ctas.length > 0 || meats.length > 0) {
      clearFrom("task");
      setWizardStep(1);
    }
  }

  function chooseCtaMode(value: CtaMode) {
    setTask((prev) => ({ ...prev, ctaMode: value, ctaModeChosen: true }));
    if (hooks.length > 0 || skeletons.length > 0 || drafts.length > 0 || ctas.length > 0 || meats.length > 0) {
      clearFrom("task");
      setWizardStep(1);
    }
  }

  function updateProfileField<K extends keyof BaseProfile>(key: K, value: BaseProfile[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
    if (meats.length > 0 || drafts.length > 0 || ctas.length > 0) {
      clearFrom("hook");
      if (wizardStep > 2) setWizardStep(2);
    }
  }

  function updateSettingsField<K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) {
    setSettings((prev) => normalizeApiSettings({ ...prev, [key]: value }));
  }

  function openWorkbench(mode: WorkbenchMode) {
    setWorkbenchMode(mode);
    setTask(
      createTaskForMode(mode, {
        previousTask: normalizedTask,
        lastOriginalEntryType: lastOriginalEntryRef.current.entryType,
        lastOriginalEntryChosen: lastOriginalEntryRef.current.chosen
      })
    );
    clearFrom("task");
    setWizardStep(1);
    setStructureTab("skeleton");
    setManualSearchResult(null);
    setManualSearchQuery("");
    setHotspotPanelTab("all");
    setSelectedHotspotKey(null);
    setShowTaskSettings(false);
    setShowAdvanced(false);
    setShowHistory(false);
    setEnteredWorkbench(true);
  }

  function startNewTask(mode: WorkbenchMode = currentWorkbenchMode) {
    openWorkbench(mode);
    showNotice("success", `已新建${mode === "rewrite" ? "爆款仿写" : "热点 / 主题创作"}任务。`);
  }

  function saveCurrentHistory(nextDrafts: DraftItem[], nextSelectedDraftId: string | null, hook: HookItem | null, skeleton: SkeletonItem | null, meat: MeatItem | null, cta: CtaItem | null) {
    const record = createHistoryRecord(task, hook, skeleton, meat, cta, nextDrafts, nextSelectedDraftId);
    setHistory((prev) => [record, ...prev].slice(0, 50));
  }

  function restoreHistory(item: HistoryItem) {
    setWorkbenchMode(inferWorkbenchMode(item.snapshot.entryType));
    setTask(cloneDeep(item.snapshot));
    setEnteredWorkbench(true);
    const workspace = item.workspace;
    setHooks(workspace?.selectedHook ? [cloneDeep(workspace.selectedHook)] : []);
    setSkeletons(workspace?.selectedSkeleton ? [cloneDeep(workspace.selectedSkeleton)] : []);
    setMeats(workspace?.selectedMeat ? [cloneDeep(workspace.selectedMeat)] : []);
    setCtas(workspace?.selectedCta ? [cloneDeep(workspace.selectedCta)] : []);
    setDrafts(workspace?.drafts ? cloneDeep(workspace.drafts) : []);
    setSelectedHookId(workspace?.selectedHook?.id ?? null);
    setSelectedSkeletonId(workspace?.selectedSkeleton?.id ?? null);
    setSelectedMeatId(workspace?.selectedMeat?.id ?? null);
    setSelectedCtaId(workspace?.selectedCta?.id ?? null);
    setSelectedDraftId(workspace?.selectedDraftId ?? workspace?.drafts?.[0]?.id ?? null);
    setDraftSignature(
      `${workspace?.selectedHook?.id ?? "none"}-${workspace?.selectedSkeleton?.id ?? "none"}-${workspace?.selectedMeat?.id ?? "none"}-${workspace?.selectedCta?.id ?? "none"}`
    );
    setWizardStep(workspace?.drafts?.length ? 4 : workspace?.selectedCta ? 3 : workspace?.selectedHook ? 2 : 1);
    setStructureTab("skeleton");
    setShowTaskSettings(false);
    setShowAdvanced(false);
    setShowHistory(false);
    showNotice("success", `已回显历史任务：${getTaskDisplayName(item.snapshot)}`);
  }

  function deleteHistory(id: string) {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }

  function applyHotspotMaterial(material: string, nextAngle?: string, selectionKey?: string, note?: string) {
    setTask((prev) => {
      const nextUserNote = note && !prev.userNote.includes(note) ? [prev.userNote, note].filter(Boolean).join("\n") : prev.userNote;
      return {
        ...prev,
        sourceText: material,
        hotspotAngle: nextAngle && !prev.hotspotAngle.trim() ? nextAngle : prev.hotspotAngle,
        userNote: nextUserNote
      };
    });
    if (hooks.length > 0 || skeletons.length > 0 || drafts.length > 0 || ctas.length > 0 || meats.length > 0) {
      clearFrom("task");
    }
    if (selectionKey) {
      setSelectedHotspotKey(selectionKey);
    }
    setWizardStep(1);
    showNotice("success", "热点素材已回填到内容输入区。");
  }

  function hotRankItemNeedsDetail(item: Partial<HotRankItem & BusinessHotItem>) {
    if (!(item as any).detail_loaded) return true;
    const content = ((item as HotRankItem).clean_content || item.content || "").trim();
    const title = (item.title || "").trim();
    const summary = (item.summary || "").trim();
    const qualityStatus = ((item as any).quality_status || "").trim();
    if (!content) return true;
    if (qualityStatus !== "ready") return true;
    if (content.length < 260) return true;
    if (title && content === title) return true;
    if (summary && content === summary) return true;
    return false;
  }

  function hotRankItemNeedsSearchFallback(item: Partial<HotRankItem & BusinessHotItem>) {
    const content = ((item as HotRankItem).clean_content || item.content || "").trim();
    const qualityStatus = ((item as any).quality_status || "").trim();
    if (!content) return true;
    if (qualityStatus !== "ready") return true;
    return content.length < 220;
  }

  function buildHotRankSearchFallbackQuery(item: Partial<HotRankItem & BusinessHotItem>) {
    const title = (item.title || "").trim();
    const summary = (item.summary || "").trim();
    if (!title) return "";
    if (!summary || summary === title) return title;
    const firstSummary = summary
      .split(/[。！？!?；;]/)
      .map((part) => part.trim())
      .find(Boolean) || "";
    if (!firstSummary || firstSummary === title) return title;
    return `${title} ${firstSummary}`.slice(0, 42).trim();
  }

  function mergeHotRankDetailIntoState(
    detail: Partial<HotRankItem & BusinessHotItem>,
    identity: { hotId?: string; title?: string; sourceUrl?: string }
  ) {
    const matchItem = (item: Partial<HotRankItem & BusinessHotItem>) => {
      const sourceUrl = (item as HotRankItem).source_url || (item as BusinessHotItem).source_url || "";
      if (identity.hotId && item.hot_id === identity.hotId) return true;
      if (identity.title && item.title === identity.title && identity.sourceUrl && sourceUrl === identity.sourceUrl) return true;
      return Boolean(identity.title && item.title === identity.title && !identity.sourceUrl);
    };

    const applyItem = <T extends Partial<HotRankItem & BusinessHotItem>>(item: T) => (matchItem(item) ? { ...item, ...detail } : item);

    setHotRankResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        allHotList: prev.allHotList.map((item) => applyItem(item as HotRankItem) as HotRankItem),
        businessHotList: prev.businessHotList.map((item) => applyItem(item as BusinessHotItem) as BusinessHotItem),
        platformBuckets: Object.fromEntries(
          Object.entries(prev.platformBuckets || {}).map(([platform, items]) => [platform, (items || []).map((item) => applyItem(item as HotRankItem) as HotRankItem)])
        )
      };
    });
  }

  async function handleUseHotRankItem(item: HotRankItem | BusinessHotItem, options: { business?: boolean; itemKey: string }) {
    setLoadingHotspotKey(options.itemKey);
    try {
      let resolvedItem: HotRankItem | BusinessHotItem = item;
      if (hotRankItemNeedsDetail(item)) {
        const detail = await fetchHotRankDetail(settings.baseUrl || "/api", item);
        const displaySummary = ((detail as any).display_summary || (item as any).display_summary || detail.summary || item.summary || "").trim();
        resolvedItem = {
          ...item,
          title: detail.title || item.title,
          summary: detail.summary || item.summary,
          display_title: (detail as any).display_title || (item as any).display_title,
          display_summary: displaySummary,
          clean_content: (detail as any).clean_content || detail.content || (item as any).clean_content || item.content,
          content: (detail as any).clean_content || detail.content || (item as any).clean_content || item.content,
          business_reason: (detail as any).business_reason || (item as any).business_reason || (item as any).boss_impact,
          quality_score: (detail as any).quality_score ?? (item as any).quality_score,
          quality_status: (detail as any).quality_status || (item as any).quality_status,
          detail_loaded: true,
          source_url: detail.source_url || item.source_url,
          article_source: detail.article_source || item.article_source,
          article_url: detail.article_url || (item as HotRankItem).article_url
        };
        if (hotRankItemNeedsSearchFallback(resolvedItem)) {
          const fallbackQuery = buildHotRankSearchFallbackQuery(resolvedItem);
          if (fallbackQuery) {
            const searchResult = await fetchManualSearch(settings.baseUrl || "/api", fallbackQuery);
            const factPack = (searchResult as ManualSearchResponse).factPack;
            const fallbackContent = (factPack?.cleanContent || factPack?.sourceText || "").trim();
            const currentContent = (((resolvedItem as any).clean_content || resolvedItem.content || "") as string).trim();
            if (fallbackContent.length > currentContent.length + 40) {
              resolvedItem = {
                ...resolvedItem,
                clean_content: fallbackContent,
                content: fallbackContent,
                business_reason: (resolvedItem as any).business_reason || factPack?.businessReason || "",
                quality_score: Math.max(Number((resolvedItem as any).quality_score) || 0, Number(factPack?.qualityScore) || 0),
                quality_status: factPack?.qualityStatus || (resolvedItem as any).quality_status,
                detail_loaded: true
              };
            }
          }
        }
        mergeHotRankDetailIntoState(
          {
            title: resolvedItem.title,
            summary: resolvedItem.summary,
            display_title: (resolvedItem as any).display_title,
            display_summary: (resolvedItem as any).display_summary,
            clean_content: (resolvedItem as any).clean_content,
            content: resolvedItem.content,
            business_reason: (resolvedItem as any).business_reason,
            quality_score: (resolvedItem as any).quality_score,
            quality_status: (resolvedItem as any).quality_status,
            detail_loaded: true,
            source_url: resolvedItem.source_url,
            article_source: resolvedItem.article_source,
            article_url: (resolvedItem as HotRankItem).article_url
          },
          {
            hotId: item.hot_id,
            title: item.title,
            sourceUrl: item.source_url
          }
        );
      }

      const material = options.business
        ? buildMaterialFromBusinessHot(resolvedItem as BusinessHotItem)
        : buildMaterialFromHotRank(resolvedItem as HotRankItem);
      applyHotspotMaterial(material.sourceText, material.hotspotAngle, options.itemKey);
      if ((resolvedItem as any).quality_status && (resolvedItem as any).quality_status !== "ready") {
        showNotice("warning", "这条热点正文还不够完整，已按线索回填，建议再用全网搜索补素材。");
      }
    } catch (error: any) {
      const fallbackMaterial = options.business ? buildMaterialFromBusinessHot(item as BusinessHotItem) : buildMaterialFromHotRank(item as HotRankItem);
      applyHotspotMaterial(fallbackMaterial.sourceText, fallbackMaterial.hotspotAngle, options.itemKey);
      showNotice("warning", `热点详情提取失败，先使用已有摘要：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setLoadingHotspotKey(null);
    }
  }

  async function handleFetchTodayHotRank(options?: { forceRefresh?: boolean; silent?: boolean }) {
    setIsLoadingHotRank(true);
    try {
      const result = await fetchHotRank(settings.baseUrl || "/api", { allLimit: 20, businessLimit: 10, forceRefresh: options?.forceRefresh ?? false });
      setHotRankResult(result);
      setHotRankFetchedAt(result.cache?.fetchedAt || result.generatedAt || "");
      setHotspotPanelTab("all");
      setSelectedHotspotKey(null);
      setHotspotListExpanded({
        all: false,
        business: false,
        douyin: false,
        weibo: false,
        zhihu: false,
        baidu: false
      });
      if (options?.silent) {
        return;
      }
      if (result.cache?.refreshing && result.allHotList.length > 0) {
        showNotice("info", "已切到最近热榜缓存，后台正在刷新最新结果。");
        return;
      }
      if (result.cache?.refreshing) {
        showNotice("info", "热榜正在后台抓取，稍后会自动刷新出来。");
        return;
      }
      if (result.cache?.warning && result.allHotList.length > 0) {
        showNotice("warning", `本次刷新没拿到新结果，先展示最近缓存：${result.cache.warning}`);
        return;
      }
      if (result.allHotList.length === 0) {
        showNotice("info", "热榜正在准备中，稍后会自动补齐。");
        return;
      }
      showNotice("success", `今日热榜已就绪，当前可选 ${result.allHotList.length} 条全网热点。`);
    } catch (error: any) {
      if (!options?.silent || !hotRankResult) {
        showNotice("warning", `热榜获取失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    } finally {
      setIsLoadingHotRank(false);
    }
  }

  async function handleSearchTopic() {
    const query = manualSearchQuery.trim();
    if (!query) {
      showNotice("warning", "先输入你要搜索的热点关键词。");
      return;
    }

    setIsLoadingManualSearch(true);
    try {
      const result = await fetchManualSearch(settings.baseUrl || "/api", query);
      setManualSearchResult(result);
      setHotspotPanelTab("search");
      setSelectedHotspotKey(null);
      const total = result.searchData.length + result.toutiaoData.length;
      if (total === 0) {
        showNotice("warning", "搜索完成，但暂时没有拿到有效结果，建议换个关键词再试。");
        return;
      }
      showNotice("success", `搜索完成，已整理 ${total} 条线索，并生成事实包。`);
    } catch (error: any) {
      showNotice("warning", `搜索失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsLoadingManualSearch(false);
    }
  }

  function confirmRefreshHotRank() {
    if (!window.confirm("确定要刷新今日热榜吗？这会重新触发工作流抓取最新结果。")) {
      return;
    }
    void handleFetchTodayHotRank({ forceRefresh: true });
  }

  async function handleGenerateHooks() {
    if (!canGoStep2) {
      showNotice("warning", "先把主题、素材或热点内容填进去。");
      return [] as HookItem[];
    }

    setIsGeneratingHooks(true);
    try {
      const result = await runHookGeneration(settings, profile, task);
      const nextHooks = normalizeHookResults(result.data.items, task);
      setHooks(nextHooks);
      setSelectedHookId(nextHooks[0]?.id ?? null);
      clearFrom("hook");
      setModuleMeta((prev) => ({
        ...prev,
        hooks: { source: result.source, updatedAt: new Date().toISOString(), message: result.message }
      }));
      showNotice("success", "皮已经生成好了，挑一个最能打的开头。");
      return nextHooks;
    } catch (error: any) {
      showNotice("warning", `皮生成失败：${error instanceof Error ? error.message : "未知错误"}`);
      return [] as HookItem[];
    } finally {
      setIsGeneratingHooks(false);
    }
  }

  async function handleGenerateStructure() {
    if (!selectedHook) {
      showNotice("warning", "先把皮确定下来。");
      return;
    }

    setIsGeneratingStructure(true);
    try {
      const skeletonPromise = runSkeletonGeneration(settings, profile, task);
      const ctaPromise = runCtaGeneration(settings, profile, task);
      const meatPromise = task.businessMode === "none" ? Promise.resolve(null) : runMeatGeneration(settings, profile, task);
      const [skeletonResult, ctaResult, meatResult] = await Promise.all([skeletonPromise, ctaPromise, meatPromise]);

      const nextSkeletons = normalizeSkeletonResults(skeletonResult.data.items, task);
      const nextMeats = task.businessMode === "none" || !meatResult ? [] : normalizeMeatResults(meatResult.data.items, task, profile);
      const nextCtas = normalizeCtaResults(ctaResult.data.items, task, profile);

      setSkeletons(nextSkeletons);
      setSelectedSkeletonId(nextSkeletons[0]?.id ?? null);
      setMeats(nextMeats);
      setSelectedMeatId(nextMeats[0]?.id ?? null);
      setCtas(nextCtas);
      setSelectedCtaId(nextCtas[0]?.id ?? null);
      setStructureTab("skeleton");
      clearFrom("structure");
      setModuleMeta((prev) => ({
        ...prev,
        structure: {
          source: skeletonResult.source === "api" || ctaResult.source === "api" || meatResult?.source === "api" ? "api" : "local",
          updatedAt: new Date().toISOString(),
          message: skeletonResult.message || ctaResult.message || meatResult?.message
        }
      }));
      showNotice("success", "骨、肉、收口已经生成好了。");
    } catch (error: any) {
      showNotice("warning", `结构生成失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsGeneratingStructure(false);
    }
  }

  async function handleGenerateDrafts() {
    if (!selectedHook || !selectedSkeleton || !selectedCta || (task.businessMode !== "none" && !selectedMeat)) {
      showNotice("warning", "先把皮、骨、肉、收口都定下来。");
      return;
    }

    setIsGeneratingDrafts(true);
    try {
      const result = await runDraftGeneration(settings, profile, task, selectedHook, selectedSkeleton, selectedMeat, selectedCta);
      const nextDrafts = normalizeDraftResults(result.data.items, {
        task,
        profile,
        hook: selectedHook,
        skeleton: selectedSkeleton,
        meat: selectedMeat,
        cta: selectedCta
      });
      const nextSelectedDraftId = nextDrafts[0]?.id ?? null;
      setDrafts(nextDrafts);
      setSelectedDraftId(nextSelectedDraftId);
      setDraftSignature(`${selectedHook.id}-${selectedSkeleton.id}-${selectedMeat?.id ?? "none"}-${selectedCta.id}`);
      setModuleMeta((prev) => ({
        ...prev,
        drafts: { source: result.source, updatedAt: new Date().toISOString(), message: result.message }
      }));
      saveCurrentHistory(nextDrafts, nextSelectedDraftId, selectedHook, selectedSkeleton, selectedMeat, selectedCta);
      showNotice("success", "完整成品已经生成，并写入历史。");
    } catch (error: any) {
      showNotice("warning", `成品生成失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsGeneratingDrafts(false);
    }
  }

  function handleHookSelect(id: string) {
    if (id === selectedHookId) return;
    setSelectedHookId(id);
    clearFrom("hook");
  }

  function handleStructureSelect(type: "skeleton" | "meat" | "cta", id: string) {
    if (type === "skeleton") {
      if (id === selectedSkeletonId) return;
      setSelectedSkeletonId(id);
    }
    if (type === "meat") {
      if (id === selectedMeatId) return;
      setSelectedMeatId(id);
    }
    if (type === "cta") {
      if (id === selectedCtaId) return;
      setSelectedCtaId(id);
    }
    clearFrom("structure");
  }

  function handleCopy(text: string, successText: string) {
    navigator.clipboard.writeText(text);
    showNotice("success", successText);
  }

  function renderHotspotCenter() {
    const allHotItems = hotRankResult?.allHotList || [];
    const businessHotItems = hotRankResult?.businessHotList || [];
    const platformBuckets = hotRankResult?.platformBuckets || {};
    const douyinHotItems = platformBuckets.douyin || [];
    const weiboHotItems = platformBuckets.weibo || [];
    const zhihuHotItems = platformBuckets.zhihu || [];
    const baiduHotItems = platformBuckets.baidu || [];
    const searchItems = manualSearchResult?.searchData || [];
    const factPack = manualSearchResult?.factPack || null;
    const cacheWarning = hotRankResult?.cache?.warning || "";
    const cacheText = isLoadingHotRank || hotRankResult?.cache?.refreshing
      ? hotRankResult?.cache?.fetchedAt || hotRankFetchedAt
        ? "后台正在刷新，先展示最近缓存"
        : "热榜后台抓取中…"
      : hotRankResult?.cache?.fetchedAt || hotRankFetchedAt
        ? `最近就绪时间：${hotRankResult?.cache?.fetchedAt || hotRankFetchedAt}${hotRankResult?.cache?.stale ? "（缓存）" : ""}`
        : "页面打开后会自动预加载最近热榜";

    let resultBlock: ReactNode = <EmptyBlock text="热榜和搜索事实包会显示在这里，你选中任意一条后，会自动回填到下方内容输入区。" />;

    const renderHotRows = (
      items: Array<HotRankResponse["allHotList"][number] | HotRankResponse["businessHotList"][number]>,
      options: {
        expandKey: keyof HotspotExpandState;
        emptyText: string;
        fallbackTitle: string;
        tone?: "business";
        business?: boolean;
        keyPrefix: string;
      }
    ) => {
      const expanded = hotspotListExpanded[options.expandKey];
      const hasMoreRows = items.length > COMPACT_HOTSPOT_COLLAPSED_COUNT;
      const visibleItems = expanded ? items : items.slice(0, COMPACT_HOTSPOT_COLLAPSED_COUNT);
      if (items.length === 0) {
        return <EmptyBlock text={options.emptyText} />;
      }

      return (
        <div className="grid max-w-full gap-3 overflow-hidden">
          {hasMoreRows ? (
            <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs text-slate-400">
                {expanded ? `已展开 ${items.length} 条热点` : `当前显示前 ${visibleItems.length} 条，共 ${items.length} 条`}
              </div>
              <button
                type="button"
                className="self-start whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:text-white"
                onClick={() => setHotspotListExpanded((prev) => ({ ...prev, [options.expandKey]: !prev[options.expandKey] }))}
              >
                {expanded ? "收起列表" : `展开全部 ${items.length} 条`}
              </button>
            </div>
          ) : null}

          <div className="grid max-w-full gap-2 overflow-hidden">
          {visibleItems.map((item, index) => {
            const rankIndex = items.findIndex((candidate) => candidate.hot_id === item.hot_id && candidate.title === item.title);
            const itemKey = item.hot_id || `${options.keyPrefix}-${rankIndex >= 0 ? rankIndex : index}`;
            return (
              <CompactHotspotListRow
                key={itemKey}
                rank={(rankIndex >= 0 ? rankIndex : index) + 1}
                active={selectedHotspotKey === itemKey}
                loading={loadingHotspotKey === itemKey}
                title={getHotspotPreviewTitle(item as HotRankItem & BusinessHotItem, options.fallbackTitle)}
                leadOnly={Boolean((item as any).quality_status && (item as any).quality_status !== "ready")}
                onUse={() => void handleUseHotRankItem(item as HotRankItem | BusinessHotItem, { business: options.business, itemKey })}
              />
            );
          })}
          </div>
          {hasMoreRows && expanded ? (
            <div className="flex justify-center sm:justify-end">
              <button
                type="button"
                className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:text-white"
                onClick={() => setHotspotListExpanded((prev) => ({ ...prev, [options.expandKey]: false }))}
              >
                收起列表
              </button>
            </div>
          ) : null}
        </div>
      );
    };

    if (hotspotPanelTab === "all") {
      resultBlock = renderHotRows(allHotItems, {
        expandKey: "all",
        emptyText: "当前还没有热榜缓存，系统正在后台准备中。",
        fallbackTitle: "未命名热点",
        keyPrefix: "all"
      });
    }

    if (hotspotPanelTab === "business") {
      resultBlock = renderHotRows(businessHotItems, {
        expandKey: "business",
        emptyText: "当前还没有 AI 行业热榜，等全网热榜缓存好后会自动出现。",
        fallbackTitle: "未命名AI热点",
        keyPrefix: "business",
        business: true,
        tone: "business"
      });
    }

    if (hotspotPanelTab === "douyin" || hotspotPanelTab === "weibo" || hotspotPanelTab === "zhihu" || hotspotPanelTab === "baidu") {
      const currentItems =
        hotspotPanelTab === "douyin"
          ? douyinHotItems
          : hotspotPanelTab === "weibo"
            ? weiboHotItems
            : hotspotPanelTab === "zhihu"
              ? zhihuHotItems
              : baiduHotItems;
      const platformMeta = HOTSPOT_PLATFORM_META[hotspotPanelTab];
      resultBlock = renderHotRows(currentItems, {
        expandKey: hotspotPanelTab,
        emptyText: `当前还没有${platformMeta.label}，缓存更新后会自动出现。`,
        fallbackTitle: `未命名${platformMeta.label}`,
        keyPrefix: hotspotPanelTab
      });
    }

    if (hotspotPanelTab === "search") {
      resultBlock = (
        <div className="grid gap-4">
          {factPack ? (
            <ResponsiveSearchFactPackCard
              eventAnchor={factPack.eventAnchor || ""}
              summary={factPack.summary}
              facts={factPack.keyFacts}
              timelineClues={factPack.timelineClues || []}
              businessSignals={factPack.businessSignals || []}
              guardrailNote={factPack.guardrailNote || ""}
              sourcesCount={factPack.sources.length}
              onUse={() => applyHotspotMaterial(factPack.sourceText, factPack.businessReason || "", "fact-pack", factPack.guardrailNote || "")}
            />
          ) : null}
          {searchItems.length === 0 ? (
            <EmptyBlock text="当前没有全网搜索结果，请换一个关键词。" />
          ) : (
            searchItems.map((item, index) => {
              const itemKey = `${hotspotPanelTab}-${index}`;
              return (
                <ResponsiveSearchSourceCard
                  key={itemKey}
                  active={selectedHotspotKey === itemKey}
                  title={(item as any).displayTitle || item.title || "未命名搜索结果"}
                  summary={(item as any).displaySummary || item.summary || ""}
                  source={item.sitename || item.sourcePlatform || ""}
                  url={item.url || ""}
                />
              );
            })
          )}
        </div>
      );
    }

    return (
      <div className="w-full max-w-full overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(0,212,255,0.14),transparent_34%),linear-gradient(180deg,rgba(10,17,32,0.96),rgba(10,17,32,0.80))] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 lg:flex-1">
            <div className="section-eyebrow">今日热榜中心</div>
            <div className="mt-3 text-lg font-semibold text-white">自动热榜 + 手动搜索事实包</div>
            <div className="mt-2 text-sm leading-7 text-slate-300">
              热榜会在页面打开后自动预加载。搜索结果不会直接塞进正文，而是先整理成一份可用于写稿的事实包，再回填到内容输入区。
            </div>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2 lg:justify-end">
            <SoftBadge>{cacheText}</SoftBadge>
            {allHotItems.length > 0 ? <SoftBadge>全网 {allHotItems.length}</SoftBadge> : null}
            {businessHotItems.length > 0 ? <SoftBadge>AI行业 {businessHotItems.length}</SoftBadge> : null}
            {factPack ? <SoftBadge>事实包已就绪</SoftBadge> : null}
            <button
              className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:text-white"
              onClick={() => setShowHotspotCenter((prev) => !prev)}
            >
              {showHotspotCenter ? "收起热榜" : "展开热榜"}
            </button>
          </div>
        </div>

        {cacheWarning ? (
          <div className="mt-5 rounded-3xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-7 text-amber-100">
            {allHotItems.length > 0 ? `本次刷新没拿到更新结果，先展示最近缓存。${cacheWarning}` : cacheWarning}
          </div>
        ) : null}

        {!showHotspotCenter ? (
          <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-400">
            热榜面板已收起，后台仍会自动抓取和刷新。需要时点右上角“展开热榜”即可。
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">手动搜索事件</div>
                <div className="mt-2 text-xs leading-6 text-slate-400">输入一个事件或热点主题，系统会先抓原始搜索源，再自动清洗成可写稿事实包。</div>
                <div className="mt-4 flex flex-col gap-3 md:flex-row">
                  <div className="flex-1">
                    <Input value={manualSearchQuery} onChange={setManualSearchQuery} placeholder="例如：伊朗美国战争实时战况" />
                  </div>
                  <button className="brand-btn w-full md:w-auto" onClick={() => void handleSearchTopic()} disabled={isLoadingManualSearch}>
                    {isLoadingManualSearch ? "清洗中..." : "搜索并生成事实包"}
                  </button>
                </div>
              </div>

              <button
                className="brand-btn h-fit w-full xl:w-auto"
                onClick={confirmRefreshHotRank}
                disabled={isLoadingHotRank}
              >
                {isLoadingHotRank || hotRankResult?.cache?.refreshing ? "刷新中..." : "刷新今日热榜"}
              </button>
            </div>

            <div className="mt-5 flex max-w-full flex-wrap gap-2">
              <ResultTabChip active={hotspotPanelTab === "all"} label="全网热榜" count={allHotItems.length} onClick={() => setHotspotPanelTab("all")} />
              <ResultTabChip active={hotspotPanelTab === "business"} label="AI行业热榜" count={businessHotItems.length} onClick={() => setHotspotPanelTab("business")} />
              <ResultTabChip active={hotspotPanelTab === "douyin"} label="抖音" count={douyinHotItems.length} onClick={() => setHotspotPanelTab("douyin")} />
              <ResultTabChip active={hotspotPanelTab === "weibo"} label="微博" count={weiboHotItems.length} onClick={() => setHotspotPanelTab("weibo")} />
              <ResultTabChip active={hotspotPanelTab === "zhihu"} label="知乎" count={zhihuHotItems.length} onClick={() => setHotspotPanelTab("zhihu")} />
              <ResultTabChip active={hotspotPanelTab === "baidu"} label="百度" count={baiduHotItems.length} onClick={() => setHotspotPanelTab("baidu")} />
              {manualSearchResult ? (
                <ResultTabChip active={hotspotPanelTab === "search"} label="全网搜索" count={searchItems.length} onClick={() => setHotspotPanelTab("search")} />
              ) : null}
            </div>

            <div className="mt-5">{resultBlock}</div>
          </>
        )}
      </div>
    );
  }

  function renderTaskInput() {
    if (currentWorkbenchMode === "original" && !normalizedTask.entryTypeChosen) {
      return (
        <>
          <div className="rounded-3xl border border-dashed border-amber-400/30 bg-amber-400/8 px-4 py-3 text-sm leading-7 text-amber-100">
            先选上面的创作入口，再填写对应素材。没选入口前，系统不会允许进入下一步。
          </div>
          <FieldLabel text="内容素材" />
          <Textarea
            value={task.sourceText}
            onChange={(value) => updateTaskField("sourceText", value)}
            placeholder="你可以先把素材贴进来，但必须先完成上面的任务设置。"
            minHeight="min-h-[160px]"
          />
        </>
      );
    }

    if (task.entryType === "viral") {
      return (
        <>
          <FieldLabel text="上传文案" />
          <Textarea
            value={task.sourceText}
            onChange={(value) => updateTaskField("sourceText", value)}
            placeholder="把参考爆款文案粘进来，系统会按原命题改表达、改情绪、改开头。"
            minHeight="min-h-[180px]"
          />
          <FieldLabel text="补充要求" />
          <Textarea
            value={task.userNote}
            onChange={(value) => updateTaskField("userNote", value)}
            placeholder="比如：更炸一点、要更像老板讲话、不要太鸡汤。"
          />
        </>
      );
    }

    if (task.entryType === "hotspot") {
      return (
        <>
          <FieldLabel text="热点文案 / 事件素材" />
          <Textarea
            value={task.sourceText}
            onChange={(value) => updateTaskField("sourceText", value)}
            placeholder="把事件、平台动作、人物、时间点写清楚。"
            minHeight="min-h-[160px]"
          />
          <FieldLabel text="你的切入角度" />
          <Textarea
            value={task.hotspotAngle}
            onChange={(value) => updateTaskField("hotspotAngle", value)}
            placeholder="比如：从平台入口变化切入，落到老板获客入口变化。"
          />
        </>
      );
    }

    if (task.entryType === "topic") {
      return (
        <>
          <FieldLabel text="主题要求" />
          <Textarea
            value={task.topicGoal}
            onChange={(value) => updateTaskField("topicGoal", value)}
            placeholder="比如：不会AI获客的老板，绝对没生意。"
            minHeight="min-h-[120px]"
          />
          <FieldLabel text="补充素材" />
          <Textarea
            value={task.sourceText}
            onChange={(value) => updateTaskField("sourceText", value)}
            placeholder="可选：补充案例、场景、数据。没有也可以。"
          />
        </>
      );
    }

    return (
      <>
        <FieldLabel text="故事口述文案" />
        <Textarea
          value={task.sourceText}
          onChange={(value) => updateTaskField("sourceText", value)}
          placeholder="把故事原始经历讲清楚，尤其是冲突、代价、反转。"
          minHeight="min-h-[160px]"
        />
        <FieldLabel text="想传达的结论" />
        <Textarea
          value={task.storyConclusion}
          onChange={(value) => updateTaskField("storyConclusion", value)}
          placeholder="比如：高维度解决问题，很多时候比硬碰硬更有结果。"
        />
      </>
    );
  }

  function goStep(target: WizardStep) {
    if (target === 1) return setWizardStep(1);
    if (target === 2 && !hasRequiredTaskChoices) {
      showNotice("warning", `先完成任务设置：${taskChoiceMissing.join("、")}。`);
      return;
    }
    if (target === 2 && !getTaskPrimaryText(task).trim()) {
      showNotice("warning", "先填写内容素材，再进入下一步。");
      return;
    }
    if (target === 2 && canGoStep2) return setWizardStep(2);
    if (target === 3 && canGoStep3) return setWizardStep(3);
    if (target === 4 && canGoStep4) return setWizardStep(4);
  }

  const stepPanel =
    wizardStep === 1 ? (
      <GlassCard>
        <StepHeader title={workbenchCopy.step1Title} subtitle={workbenchCopy.step1Subtitle} />

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
          <button className="flex w-full items-start justify-between gap-4 text-left" onClick={() => setShowTaskSettings((prev) => !prev)}>
            <div>
              <div className="text-sm font-semibold text-white">任务设置（必选）</div>
              <div className="mt-1 text-xs leading-6 text-slate-400">
                {currentWorkbenchMode === "rewrite" ? "本模式固定为爆款仿写，只需要确定挂业务方式和收口方式。" : "点击选择创作入口、挂业务方式和收口方式。"}
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {showTaskSettings ? "收起" : "点击选择"}
            </div>
          </button>

          <div className="mt-4 flex flex-wrap gap-2">
            <SoftBadge>{currentWorkbenchMode === "rewrite" ? "爆款仿写" : normalizedTask.entryTypeChosen ? displayEntryType(task.entryType) : "未选入口"}</SoftBadge>
            <SoftBadge>{normalizedTask.businessModeChosen ? displayBusinessMode(task.businessMode) : "未选业务"}</SoftBadge>
            <SoftBadge>{normalizedTask.ctaModeChosen ? displayCtaMode(task.ctaMode) : "未选收口"}</SoftBadge>
          </div>

          {showTaskSettings ? (
            <div className="mt-5 space-y-5">
              {currentWorkbenchMode === "rewrite" ? (
                <div className="rounded-3xl border border-white/10 bg-[#0a1120]/60 p-4">
                  <div className="text-sm font-semibold text-white">当前入口</div>
                  <div className="mt-2 text-sm leading-7 text-slate-300">爆款仿写模式会尽量保留原文推进结构，重点改开头抓力、表达去重和肉的装配位置。</div>
                </div>
              ) : (
                <div className={classNames("rounded-3xl border p-4 transition", !normalizedTask.entryTypeChosen ? "border-amber-400/35 bg-amber-400/8" : "border-transparent")}>
                  <div className="field-label">创作入口</div>
                  {!normalizedTask.entryTypeChosen ? <div className="mt-2 text-xs text-amber-200">先选一个入口，下面才会切到对应任务面板。</div> : null}
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {ORIGINAL_ENTRY_OPTIONS.map((item) => (
                      <ChoiceCard
                        key={item.value}
                        active={normalizedTask.entryTypeChosen && task.entryType === item.value}
                        title={item.label}
                        description={item.hint}
                        onClick={() => chooseEntryType(item.value)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className={classNames("rounded-3xl border p-4 transition", !normalizedTask.businessModeChosen ? "border-amber-400/35 bg-amber-400/8" : "border-transparent")}>
                  <div className="field-label">挂业务方式</div>
                  {!normalizedTask.businessModeChosen ? <div className="mt-2 text-xs text-amber-200">这里必须选，不选就不能往下生成。</div> : null}
                  <div className="mt-2 grid gap-2">
                    {BUSINESS_OPTIONS.map((item) => (
                      <ChoiceRow
                        key={item.value}
                        active={normalizedTask.businessModeChosen && task.businessMode === item.value}
                        title={item.label}
                        description={item.hint}
                        onClick={() => chooseBusinessMode(item.value)}
                      />
                    ))}
                  </div>
                </div>
                <div className={classNames("rounded-3xl border p-4 transition", !normalizedTask.ctaModeChosen ? "border-amber-400/35 bg-amber-400/8" : "border-transparent")}>
                  <div className="field-label">收口方式</div>
                  {!normalizedTask.ctaModeChosen ? <div className="mt-2 text-xs text-amber-200">这里也要先选好，系统才允许进入下一步。</div> : null}
                  <div className="mt-2 grid gap-2">
                    {CTA_OPTIONS.map((item) => (
                      <ChoiceRow
                        key={item.value}
                        active={normalizedTask.ctaModeChosen && task.ctaMode === item.value}
                        title={item.label}
                        description={item.hint}
                        onClick={() => chooseCtaMode(item.value)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {currentWorkbenchMode === "original" && normalizedTask.entryTypeChosen && task.entryType === "hotspot" ? (
          <div className="mt-6">
            <GlassCard>{renderHotspotCenter()}</GlassCard>
          </div>
        ) : null}

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm font-semibold text-white">内容输入</div>
          <div className="mt-1 text-xs leading-6 text-slate-400">
            {currentWorkbenchMode === "rewrite" ? "把参考爆款文案贴进来，系统会先拆原文结构，再往下改写。" : "把热点、主题或故事素材贴进来，系统再往下生成。"}
          </div>
          <div className="mt-5 space-y-4">
            {renderTaskInput()}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setShowAdvanced((prev) => !prev)}>
            <div>
              <div className="text-sm font-semibold text-white">高级设置</div>
              <div className="text-xs text-slate-400">补充你的业务背景和 API 配置，生成会更贴业务。</div>
            </div>
            <div className="text-sm text-slate-400">{showAdvanced ? "收起" : "展开"}</div>
          </button>

          {showAdvanced ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <FieldLabel text="我是谁 / 做什么" />
                <Textarea value={profile.selfIntro} onChange={(value) => updateProfileField("selfIntro", value)} />
              </div>
              <div>
                <FieldLabel text="目标客户" />
                <Textarea value={profile.targetAudience} onChange={(value) => updateProfileField("targetAudience", value)} />
              </div>
              <div>
                <FieldLabel text="核心关键词" />
                <Textarea value={profile.coreKeywords} onChange={(value) => updateProfileField("coreKeywords", value)} />
              </div>
              <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel text="是否启用实时 API" />
                  <Toggle checked={settings.useLiveApi} onChange={(checked) => updateSettingsField("useLiveApi", checked)} label={settings.useLiveApi ? "已开启" : "使用本地兜底"} />
                </div>
                <div>
                  <FieldLabel text="API Base URL" />
                  <Input value={settings.baseUrl} onChange={(value) => updateSettingsField("baseUrl", value)} placeholder="/api" />
                </div>
                <div>
                  <FieldLabel text="API Key" />
                  <Input value={settings.apiKey} onChange={(value) => updateSettingsField("apiKey", value)} placeholder="留空则依赖服务端环境变量" />
                </div>
                <div>
                  <FieldLabel text="模型名" />
                  <Input value={settings.mainModel} onChange={(value) => updateSettingsField("mainModel", value)} placeholder="gemini-3-flash" />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <StepFooter>
          <button className="brand-btn" onClick={() => goStep(2)} disabled={!canGoStep2}>
            {currentWorkbenchMode === "rewrite" ? "确定原文，进入看结构选皮" : "确定任务，进入选皮"}
          </button>
        </StepFooter>
      </GlassCard>
    ) : wizardStep === 2 ? (
      <GlassCard>
        <StepHeader title={workbenchCopy.step2Title} subtitle={workbenchCopy.step2Subtitle} />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
          {currentWorkbenchMode === "rewrite" ? (
            <div>
              <div className="text-sm font-semibold text-white">仿写开头生成</div>
              <div className="mt-1 text-xs leading-6 text-slate-400">这里不再重复展示原文，直接根据下面的结构版去改更抓人的皮。</div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-semibold text-white">当前内容</div>
              <div className="mt-2 text-sm leading-7 text-slate-300">{getTaskPrimaryText(task) || "还没填写"}</div>
            </div>
          )}
          <div className="flex items-center gap-3">
            {moduleMeta.hooks ? <SourceBadge meta={moduleMeta.hooks} /> : null}
            <button className="brand-btn" onClick={() => void handleGenerateHooks()} disabled={isGeneratingHooks}>
              {isGeneratingHooks ? "正在生成皮..." : hooks.length > 0 ? "重新生成皮" : "生成皮"}
            </button>
          </div>
        </div>
        <ModuleMetaHint meta={moduleMeta.hooks} />

        {currentWorkbenchMode === "rewrite" ? (
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">原文结构版</div>
                <div className="mt-1 text-xs leading-6 text-slate-400">
                  先把原文按抓停、立题、展开、深化、塑品、植入、动作拆开，再判断这一条皮怎么改更稳。
                  {hooks.length > 0 ? " 皮出来后这里会自动收起，避免往下翻太久。" : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full border border-white/10 bg-[#0a1120]/60 px-3 py-1 text-xs text-slate-300">
                  {rewriteSourceStructure.length} 段
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-[#0a1120]/60 px-3 py-1 text-xs text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
                  onClick={() => setIsRewriteStructureCollapsed((value) => !value)}
                >
                  {isRewriteStructureCollapsed ? "展开结构" : "收起结构"}
                </button>
              </div>
            </div>
            {isRewriteStructureCollapsed ? (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-[#0a1120]/40 px-4 py-3 text-sm text-slate-300">
                原文结构已收起，当前共 {rewriteSourceStructure.length} 段。需要对照时点“展开结构”即可。
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {rewriteSourceStructure.length === 0 ? (
                  <EmptyBlock text="原文还不够完整，贴入原文后这里会自动拆出结构。" />
                ) : (
                  rewriteSourceStructure.map((item, index) => (
                    <SourceStructureCard key={item.id} item={item} index={index + 1} onCopy={(text) => handleCopy(text, "结构段落已复制。")} />
                  ))
                )}
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3">
          {hooks.length === 0 ? (
            <EmptyBlock text="还没生成皮。点上面的按钮先出一批开头。" />
          ) : (
            hooks.map((item, index) => (
              <SelectableResultCard
                key={item.id}
                active={item.id === selectedHook?.id}
                badge={`皮 ${index + 1}`}
                title={item.text}
                meta={`${item.type} · ${item.riskLevel}风险 · ${item.score}分`}
                copyText={item.text}
                onCopy={(text) => handleCopy(text, "皮已复制。")}
                onClick={() => handleHookSelect(item.id)}
              />
            ))
          )}
        </div>

        <StepFooter>
          <button className="ghost-btn" onClick={() => goStep(1)}>
            返回上一步
          </button>
          <button className="brand-btn" onClick={() => goStep(3)} disabled={!selectedHook}>
            {currentWorkbenchMode === "rewrite" ? "确定这个皮，进入装配骨肉" : "确定这个皮，进入骨肉收口"}
          </button>
        </StepFooter>
      </GlassCard>
    ) : wizardStep === 3 ? (
      <GlassCard>
        <StepHeader title={workbenchCopy.step3Title} subtitle={workbenchCopy.step3Subtitle} />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div>
            <div className="text-sm font-semibold text-white">已选皮</div>
            <div className="mt-2 text-sm leading-7 text-slate-300">{selectedHook?.text ?? "还没选"}</div>
          </div>
          <div className="flex items-center gap-3">
            {moduleMeta.structure ? <SourceBadge meta={moduleMeta.structure} /> : null}
            <button className="brand-btn" onClick={() => void handleGenerateStructure()} disabled={!selectedHook || isGeneratingStructure}>
              {isGeneratingStructure ? "正在生成结构..." : skeletons.length > 0 || ctas.length > 0 ? "重新生成结构" : "生成骨 / 肉 / 收口"}
            </button>
          </div>
        </div>
        <ModuleMetaHint meta={moduleMeta.structure} />

        <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap gap-2">
            <button className={classNames("tab-chip", structureTab === "skeleton" && "tab-chip-active")} onClick={() => setStructureTab("skeleton")}>
              骨架
            </button>
            {task.businessMode !== "none" ? (
              <button className={classNames("tab-chip", structureTab === "meat" && "tab-chip-active")} onClick={() => setStructureTab("meat")}>
                肉
              </button>
            ) : null}
            <button className={classNames("tab-chip", structureTab === "cta" && "tab-chip-active")} onClick={() => setStructureTab("cta")}>
              收口
            </button>
          </div>

          <div className="mt-4">
            {structureTab === "skeleton" ? (
              skeletons.length === 0 ? (
                <EmptyBlock text="还没生成骨架。" />
              ) : (
                <div className="grid gap-3">
                  {skeletons.map((item) => (
                    <SelectableResultCard
                      key={item.id}
                      active={item.id === selectedSkeleton?.id}
                      badge="骨"
                      title={item.name}
                      meta={formatSkeletonPreview(item.name, item.steps.map((step) => step.name))}
                      description={formatSkeletonCardDescription(item)}
                      copyText={`${item.name}\n${item.steps.map((step) => step.name).join(" → ")}\n${formatSkeletonExecutionLines(item).join("\n")}\n${item.summary}`}
                      onCopy={(text) => handleCopy(text, "骨架已复制。")}
                      onClick={() => handleStructureSelect("skeleton", item.id)}
                    />
                  ))}
                </div>
              )
            ) : null}

            {structureTab === "meat" ? (
              task.businessMode === "none" ? (
                <EmptyBlock text="当前不挂业务。" />
              ) : meats.length === 0 ? (
                <EmptyBlock text="还没生成肉。" />
              ) : (
                <div className="grid gap-3">
                  {meats.map((item) => (
                    <SelectableResultCard
                      key={item.id}
                      active={item.id === selectedMeat?.id}
                      badge="肉"
                      title={item.type}
                      meta={`${displayBusinessMode(item.intensity)} · 丝滑度 ${item.smoothnessScore}`}
                      description={item.text}
                      copyText={item.text}
                      onCopy={(text) => handleCopy(text, "肉已复制。")}
                      onClick={() => handleStructureSelect("meat", item.id)}
                    />
                  ))}
                </div>
              )
            ) : null}

            {structureTab === "cta" ? (
              ctas.length === 0 ? (
                <EmptyBlock text="还没生成收口。" />
              ) : (
                <div className="grid gap-3">
                  {ctas.map((item) => (
                    <SelectableResultCard
                      key={item.id}
                      active={item.id === selectedCta?.id}
                      badge="收口"
                      title={item.text}
                      meta={`${item.type} · ${item.scenario}`}
                      copyText={item.text}
                      onCopy={(text) => handleCopy(text, "收口已复制。")}
                      onClick={() => handleStructureSelect("cta", item.id)}
                    />
                  ))}
                </div>
              )
            ) : null}
          </div>
        </div>

        <StepFooter>
          <button className="ghost-btn" onClick={() => goStep(2)}>
            返回上一步
          </button>
          <button className="brand-btn" onClick={() => goStep(4)} disabled={!canGoStep4}>
            确定骨肉收口，进入成品
          </button>
        </StepFooter>
      </GlassCard>
    ) : (
      <GlassCard>
        <StepHeader title={workbenchCopy.step4Title} subtitle={workbenchCopy.step4Subtitle} />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
          <div>
            <div className="text-sm font-semibold text-white">当前组合</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <SoftBadge>{selectedHook?.text ?? "未选皮"}</SoftBadge>
              <SoftBadge>{selectedSkeleton?.name ?? "未选骨"}</SoftBadge>
              <SoftBadge>{selectedMeat?.type ?? (task.businessMode === "none" ? "不挂业务" : "未选肉")}</SoftBadge>
              <SoftBadge>{selectedCta?.type ?? "未选收口"}</SoftBadge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {moduleMeta.drafts ? <SourceBadge meta={moduleMeta.drafts} /> : null}
            <button className="brand-btn" onClick={() => void handleGenerateDrafts()} disabled={!canGoStep4 || isGeneratingDrafts}>
              {isGeneratingDrafts ? "正在生成成品..." : drafts.length > 0 ? "重新生成成品" : "生成完整成品"}
            </button>
          </div>
        </div>
        <ModuleMetaHint meta={moduleMeta.drafts} />

        <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="text-sm font-semibold text-white">成品版本</div>
            {drafts.length === 0 ? (
              <EmptyBlock text="还没出成品。点击上面的按钮生成。" />
            ) : (
              drafts.map((item, index) => (
                <SelectableResultCard
                  key={item.id}
                  active={item.id === selectedDraft?.id}
                  badge={`V${index + 1}`}
                  title={item.versionName}
                  meta={item.title}
                  description={item.coverLine}
                  onClick={() => setSelectedDraftId(item.id)}
                />
              ))
            )}
          </div>

          <div>
            {selectedDraft ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <ContentPanel
                  title={selectedDraft.title}
                  subtitle="完整文案"
                  content={selectedDraft.script}
                  copyLabel="复制文案"
                  onCopy={() => handleCopy(selectedDraft.script, "完整文案已复制。")}
                />
                <ContentPanel
                  title={selectedDraft.coverLine}
                  subtitle="字幕稿"
                  content={selectedDraft.subtitleScript}
                  copyLabel="复制字幕稿"
                  onCopy={() => handleCopy(selectedDraft.subtitleScript, "字幕稿已复制。")}
                />
              </div>
            ) : (
              <EmptyBlock text="这里会展示你当前选中的完整成品和字幕稿。" />
            )}
          </div>
        </div>

        <StepFooter>
          <button className="ghost-btn" onClick={() => goStep(3)}>
            返回上一步
          </button>
        </StepFooter>
      </GlassCard>
    );

  return (
    <div className="min-h-screen text-white">
      <ParticleBackground />
      <div className="app-overlay" />

      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#070b16]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <button className="flex items-center gap-3" onClick={() => setEnteredWorkbench(false)}>
            <div className="bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] bg-clip-text text-2xl font-bold text-transparent">云智道AI</div>
          </button>

          <div className="flex items-center gap-3">
            <button className="ghost-btn" onClick={() => setShowHistory(true)}>
              历史记录 {history.length}
            </button>
            {enteredWorkbench ? (
              <button className="ghost-btn" onClick={() => startNewTask()}>
                新任务
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <HistoryDrawer open={showHistory} history={history} onClose={() => setShowHistory(false)} onRestore={restoreHistory} onDelete={deleteHistory} />
      {notice ? <Notice toast={notice} /> : null}

      <main className="relative z-10 px-4 pb-20 pt-20 md:px-6 md:pt-24">
        {!enteredWorkbench ? (
          <Landing onSelectMode={openWorkbench} />
        ) : (
          <div className="mx-auto max-w-7xl space-y-6">
            <GlassCard>
              {isWorkbenchIntroHidden ? (
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setIsWorkbenchIntroCollapsed(false)}
                >
                  <div className="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 transition hover:border-cyan-400/20 hover:bg-white/[0.05] sm:px-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="section-eyebrow">{workbenchCopy.eyebrow}</div>
                        <h1 className="mt-3 text-2xl font-bold text-white md:text-3xl">{workbenchCopy.title}</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                          工作台默认收起。点击展开后查看完整四步流程、当前阶段和操作面板。
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                          已完成 <span className="font-semibold text-white">{progress}</span> / 4 步
                        </div>
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
                          展开工作台
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ) : (
                <>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="section-eyebrow">{workbenchCopy.eyebrow}</div>
                      <h1 className="mt-3 text-3xl font-bold text-white md:text-4xl">{workbenchCopy.title}</h1>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{workbenchCopy.description}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-slate-300">
                        已完成 <span className="font-semibold text-white">{progress}</span> / 4 步
                      </div>
                      {canCollapseWorkbenchIntro ? (
                        <button
                          type="button"
                          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:text-white"
                          onClick={() => setIsWorkbenchIntroCollapsed(true)}
                        >
                          收起工作台
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 md:grid-cols-4">
                    {stepConfig.map((item) => {
                      const available =
                        item.step === 1 ? true : item.step === 2 ? canGoStep2 : item.step === 3 ? canGoStep3 : canGoStep4 || drafts.length > 0;
                      const done = item.step < wizardStep || (item.step === 4 && drafts.length > 0);
                      return (
                        <StepPill
                          key={item.step}
                          active={wizardStep === item.step}
                          done={done}
                          disabled={!available}
                          step={item.step}
                          title={item.title}
                          hint={item.hint}
                          onClick={() => goStep(item.step)}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </GlassCard>

            <SelectionSummaryBar
              task={task}
              selectedHook={selectedHook}
              selectedSkeleton={selectedSkeleton}
              selectedMeat={selectedMeat}
              selectedCta={selectedCta}
            />

            <div>{stepPanel}</div>
          </div>
        )}
      </main>
    </div>
  );
}

function Landing({ onSelectMode }: { onSelectMode: (mode: WorkbenchMode) => void }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-7xl flex-col justify-center px-2">
      <div className="text-center">
        <h1 className="mx-auto max-w-5xl text-5xl font-bold leading-tight text-white md:text-6xl">
          爆款文案
          <br />
          <span className="bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] bg-clip-text text-transparent">工作生成台</span>
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-300">云智道团队专用短视频内容生成器</p>
      </div>

      <div className="mx-auto mt-14 grid w-full max-w-4xl gap-5 md:grid-cols-2">
        <LandingModeCard
          title="爆款仿写"
          subtitle="拆文案 · 改开头 · 出成稿"
          onClick={() => onSelectMode("rewrite")}
          icon={
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <LandingModeCard
          title="热点 / 主题原创"
          subtitle="抓热点 · 组结构 · 生成稿"
          onClick={() => onSelectMode("original")}
          icon={
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      <div className="mx-auto mt-16 grid w-full max-w-7xl grid-cols-1 gap-6 md:grid-cols-3">
        <LandingFeatureCard
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          title="全网热点雷达"
          description="自动汇总今日热榜、AI行业热榜和手动搜索结果，把碎片信息压成可直接写稿的事实包。"
        />
        <LandingFeatureCard
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          title="推进职责引擎"
          description="不是简单套模板，而是把皮、骨、肉、收口拆成一条可控的脚本装配链，确保每一步都能追踪。"
        />
        <LandingFeatureCard
          icon={
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
          title="数字人交付层"
          description="完整文案、字幕稿一步到位，直接进入数字人口播、人工审核、剪辑发布和后续复盘链路。"
        />
      </div>
    </div>
  );
}

function LandingModeCard(props: { title: string; subtitle: string; icon: ReactNode; onClick: () => void }) {
  const { title, subtitle, icon, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className="landing-action-btn group relative mx-auto flex h-[142px] w-full max-w-[430px] items-center justify-center overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(67,31,120,0.55),rgba(6,85,123,0.5))] px-6 py-5 text-center shadow-[0_20px_80px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-1 hover:border-[#00D4FF]/45 hover:shadow-[0_0_30px_rgba(0,212,255,0.12)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.18),transparent_42%)] opacity-90" />
      <div className="relative flex items-center justify-center gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-[#151c37]/80 text-[#00D4FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-transform duration-300 group-hover:scale-105">
          {icon}
        </div>
        <div className="text-left">
          <div className="text-[25px] font-bold tracking-[0.02em] text-white">{title}</div>
          <div className="mt-2 text-sm text-slate-300">{subtitle}</div>
        </div>
      </div>
    </button>
  );
}

function LandingFeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="glass-panel rounded-2xl border border-white/5 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#00D4FF]/30 hover:shadow-[0_0_20px_rgba(0,212,255,0.1)] group">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-[#00D4FF]/20 to-[#8B5CF6]/20 text-[#00D4FF] transition-transform group-hover:scale-110">
        {icon}
      </div>
      <div className="text-lg font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-slate-400">{description}</div>
    </div>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div className="section-eyebrow">{title}</div>
      <div className="mt-3 text-lg font-semibold text-white">{subtitle}</div>
    </div>
  );
}

function StepPill(props: {
  active: boolean;
  done: boolean;
  disabled: boolean;
  step: number;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  const { active, done, disabled, step, title, hint, onClick } = props;
  return (
    <button
      className={classNames(
        "rounded-3xl border px-4 py-4 text-left transition-all",
        active && "border-cyan-400/35 bg-cyan-400/10",
        !active && !disabled && "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8",
        disabled && "cursor-not-allowed border-white/8 bg-white/3 opacity-45"
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-[0.18em] text-cyan-200">STEP {step}</span>
        {done ? <span className="text-xs text-emerald-300">已完成</span> : null}
      </div>
      <div className="mt-3 text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{hint}</div>
    </button>
  );
}

function GlassCard({ children }: { children: ReactNode }) {
  return <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">{children}</div>;
}

function ChoiceCard(props: { active: boolean; title: string; description: string; onClick: () => void }) {
  const { active, title, description, onClick } = props;
  return (
    <button className={classNames("choice-card", active && "choice-card-active")} onClick={onClick}>
      <div className="text-base font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-300">{description}</div>
    </button>
  );
}

function ChoiceRow(props: { active: boolean; title: string; description: string; onClick: () => void }) {
  const { active, title, description, onClick } = props;
  return (
    <button className={classNames("choice-row", active && "choice-row-active")} onClick={onClick}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
      </div>
      <div className={classNames("mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border", active ? "border-cyan-300 bg-cyan-300" : "border-white/20")} />
    </button>
  );
}

function SelectableResultCard(props: {
  active: boolean;
  badge: string;
  title: string;
  meta: string;
  description?: string;
  copyText?: string;
  onCopy?: (text: string) => void;
  onClick: () => void;
}) {
  const { active, badge, title, meta, description, copyText, onCopy, onClick } = props;
  return (
    <button className={classNames("result-card text-left", active && "result-card-active")} onClick={onClick}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
            {badge}
          </div>
          <div className="mt-3 break-words text-sm font-semibold leading-6 text-white sm:leading-7">{title}</div>
          <div className="mt-2 break-words text-xs leading-5 text-slate-400">{meta}</div>
          {description ? <div className="mt-3 break-words text-sm leading-7 text-slate-300">{description}</div> : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-3 self-end sm:self-auto">
          {copyText && onCopy ? (
            <span
              role="button"
              tabIndex={0}
              className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300 hover:border-cyan-400/25 hover:text-white"
              onClick={(event) => {
                event.stopPropagation();
                onCopy(copyText);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onCopy(copyText);
                }
              }}
            >
              复制
            </span>
          ) : null}
          <div className={classNames("mt-1 h-4 w-4 rounded-full border", active ? "border-cyan-300 bg-cyan-300" : "border-white/20")} />
        </div>
      </div>
    </button>
  );
}

function SourceStructureCard(props: { item: SourceStructureItem; index: number; onCopy: (text: string) => void }) {
  const { item, index, onCopy } = props;
  return (
    <div className="rounded-3xl border border-white/10 bg-[#09101f]/78 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">
            结构 {index}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.label}</span>
            <span className="text-xs text-slate-400">{item.hint}</span>
          </div>
        </div>
        <button className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300 hover:border-cyan-400/25 hover:text-white" onClick={() => onCopy(item.text)}>
          复制
        </button>
      </div>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">{item.text}</div>
    </div>
  );
}

function StepBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function StepFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full [&>.ghost-btn]:w-full sm:[&>.brand-btn]:w-auto sm:[&>.ghost-btn]:w-auto">
      {children}
    </div>
  );
}

function SelectionSummaryBar(props: {
  task: TaskForm;
  selectedHook: HookItem | null;
  selectedSkeleton: SkeletonItem | null;
  selectedMeat: MeatItem | null;
  selectedCta: CtaItem | null;
}) {
  const { task, selectedHook, selectedSkeleton, selectedMeat, selectedCta } = props;
  const [open, setOpen] = useState(false);
  const completed = [selectedHook, selectedSkeleton, selectedCta, task.businessMode === "none" ? true : selectedMeat].filter(Boolean).length;

  return (
    <>
      <div className="flex justify-end">
        <button className="ghost-btn" onClick={() => setOpen(true)}>
          任务状态 {completed}/4
        </button>
      </div>
      <TaskStatusDrawer
        open={open}
        task={task}
        selectedHook={selectedHook}
        selectedSkeleton={selectedSkeleton}
        selectedMeat={selectedMeat}
        selectedCta={selectedCta}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function TaskStatusDrawer(props: {
  open: boolean;
  task: TaskForm;
  selectedHook: HookItem | null;
  selectedSkeleton: SkeletonItem | null;
  selectedMeat: MeatItem | null;
  selectedCta: CtaItem | null;
  onClose: () => void;
}) {
  const { open, task, selectedHook, selectedSkeleton, selectedMeat, selectedCta, onClose } = props;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-lg border-l border-white/10 bg-[#070b16]/96 p-6 shadow-[0_0_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold text-white">任务状态</div>
            <div className="mt-1 text-sm text-slate-400">查看当前任务里已经确定的皮、骨、肉和收口。</div>
          </div>
          <button className="ghost-btn" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <StatusRow label="皮" status={selectedHook ? "已完成" : "未完成"} value={selectedHook?.text ?? "还没选"} />
          <StatusRow label="骨" status={selectedSkeleton ? "已完成" : "未完成"} value={selectedSkeleton?.name ?? "还没选"} />
          <StatusRow
            label="肉"
            status={task.businessMode === "none" ? "不挂业务" : selectedMeat ? "已完成" : "未完成"}
            value={task.businessMode === "none" ? "当前不挂业务" : selectedMeat?.type ?? "还没选"}
          />
          <StatusRow label="收口" status={selectedCta ? "已完成" : "未完成"} value={selectedCta?.type ?? "还没选"} />
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, status, value }: { label: string; status: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="rounded-full border border-white/10 bg-[#0a1120]/70 px-3 py-1 text-xs text-slate-300">{status}</div>
      </div>
      <div className="mt-3 text-sm leading-7 text-slate-300">{value}</div>
    </div>
  );
}

function SourceBadge({ meta }: { meta: ModuleMeta }) {
  return (
    <div className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {meta.source === "api" ? "实时 API" : "本地兜底"} · {formatTime(meta.updatedAt)}
    </div>
  );
}

function ModuleMetaHint({ meta }: { meta: ModuleMeta | null }) {
  if (!meta?.message) return null;

  return (
    <div
      className={classNames(
        "mt-3 rounded-2xl border px-4 py-3 text-xs leading-6",
        meta.source === "api" ? "border-cyan-400/15 bg-cyan-400/8 text-cyan-100" : "border-amber-400/20 bg-amber-400/10 text-amber-100"
      )}
    >
      {meta.message}
    </div>
  );
}

function SoftBadge({ children }: { children: ReactNode }) {
  return <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 sm:px-3 sm:text-xs">{children}</span>;
}

function ResultTabChip(props: { active: boolean; label: string; count: number; onClick: () => void }) {
  const { active, label, count, onClick } = props;
  return (
    <button
      className={classNames(
        "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-all sm:px-3 sm:text-xs",
        active ? "border-cyan-400/35 bg-cyan-400/12 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/20 hover:text-white"
      )}
      onClick={onClick}
    >
      {label} · {count}
    </button>
  );
}

function CompactHotspotListRow(props: {
  rank: number;
  active: boolean;
  loading?: boolean;
  title: string;
  onUse: () => void;
  leadOnly?: boolean;
}) {
  const { rank, active, loading = false, title, onUse, leadOnly = false } = props;
  const rankStyle =
    rank === 1
      ? "from-[#ff7a59]/30 to-[#ff4d6d]/15 text-[#ffb199]"
      : rank === 2
        ? "from-[#ffb347]/25 to-[#ffcc33]/10 text-[#ffd27d]"
        : rank === 3
          ? "from-[#8b5cf6]/25 to-[#00d4ff]/10 text-[#b7c7ff]"
          : "from-white/10 to-white/5 text-slate-300";

  return (
    <button
      className={classNames(
        "group flex w-full max-w-full items-center gap-2 overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition-all sm:gap-3 sm:px-4 sm:py-3",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8",
        loading && "cursor-wait opacity-80"
      )}
      onClick={onUse}
      disabled={loading}
      title={title}
    >
      <div className={classNames("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold", rankStyle)}>{rank}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white sm:text-[15px]">{title}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {leadOnly ? (
          <span className="hidden rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200 sm:inline-flex">
            线索
          </span>
        ) : null}
        <span
          className={classNames(
            "whitespace-nowrap rounded-full border px-2 py-1 text-[11px] transition-all sm:px-2.5",
            active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 group-hover:border-cyan-400/25 group-hover:text-white"
          )}
        >
          {loading ? "提取中" : active ? "已选" : "选用"}
        </span>
      </div>
    </button>
  );
}

function HotspotRankRow(props: {
  rank: number;
  active: boolean;
  loading?: boolean;
  title: string;
  summary: string;
  meta: string;
  onUse: () => void;
  tone?: "hot" | "business";
}) {
  const { rank, active, loading = false, title, summary, meta, onUse, tone = "hot" } = props;
  const rankStyle =
    rank === 1
      ? "from-[#ff7a59]/30 to-[#ff4d6d]/15 text-[#ffb199]"
      : rank === 2
        ? "from-[#ffb347]/25 to-[#ffcc33]/10 text-[#ffd27d]"
        : rank === 3
          ? "from-[#8b5cf6]/25 to-[#00d4ff]/10 text-[#b7c7ff]"
          : "from-white/10 to-white/5 text-slate-300";

  return (
    <button
      className={classNames(
        "group rounded-3xl border p-4 text-left transition-all sm:p-5",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8",
        loading && "cursor-wait opacity-80"
      )}
      onClick={onUse}
      disabled={loading}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className={classNames("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold", rankStyle)}>{rank}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-white">{title}</span>
            <span className={classNames("rounded-full border px-2 py-0.5 text-[11px]", tone === "business" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200")}>
              {tone === "business" ? "AI行业" : "今日热榜"}
            </span>
          </div>
          <div className="mt-2 text-sm leading-7 text-slate-300">{summary || "暂无摘要"}</div>
          <div className="mt-3 text-xs leading-5 text-slate-500">{meta || "正在补充更多上下文"}</div>
        </div>
        <div className={classNames("rounded-full border px-3 py-1 text-xs transition-all", active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 group-hover:border-cyan-400/25 group-hover:text-white")}>
          {loading ? "提取中" : active ? "已选用" : "选用"}
        </div>
      </div>
    </button>
  );
}

function SearchFactPackCard(props: {
  eventAnchor: string;
  summary: string;
  facts: string[];
  timelineClues: string[];
  businessSignals: string[];
  guardrailNote: string;
  sourcesCount: number;
  onUse: () => void;
}) {
  const { eventAnchor, summary, facts, timelineClues, businessSignals, guardrailNote, sourcesCount, onUse } = props;
  return (
    <div className="rounded-3xl border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(0,212,255,0.12),rgba(139,92,246,0.08))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow">搜索事实包</div>
          <div className="mt-2 text-base font-semibold text-white">已把多来源搜索结果清洗成一份可写稿事实包</div>
          {eventAnchor ? <div className="mt-2 text-sm font-medium text-cyan-100">{eventAnchor}</div> : null}
          <div className="mt-2 text-sm leading-7 text-slate-300">{summary}</div>
        </div>
        <button className="brand-btn md:w-auto" onClick={onUse}>
          使用清洗后事实包
        </button>
      </div>
      {facts.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {facts.slice(0, 4).map((fact, index) => (
            <div key={`${fact}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-slate-200">
              {fact}
            </div>
          ))}
        </div>
      ) : null}
      {(timelineClues.length > 0 || businessSignals.length > 0) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {timelineClues.slice(0, 3).map((item) => (
            <SoftBadge key={item}>{item}</SoftBadge>
          ))}
          {businessSignals.slice(0, 3).map((item) => (
            <SoftBadge key={item}>{item}</SoftBadge>
          ))}
        </div>
      ) : null}
      {guardrailNote ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-6 text-amber-100">
          {guardrailNote}
        </div>
      ) : null}
      <div className="mt-4 text-xs text-slate-400">已汇总 {sourcesCount} 个来源。只有这份清洗后的事实包会进入后续皮骨肉，下面原始搜索源仅供核对参考。</div>
    </div>
  );
}

function SearchSourceCard(props: { active: boolean; title: string; summary: string; source: string; url: string }) {
  const { active, title, summary, source, url } = props;
  return (
    <div
      className={classNames(
        "rounded-3xl border p-4 text-left transition-all",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {source ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{source}</span> : null}
            <span className="text-sm font-semibold leading-7 text-white">{title}</span>
          </div>
          <div className="mt-3 text-sm leading-7 text-slate-300">{summary || "暂无摘要"}</div>
          {url ? <div className="mt-3 truncate text-xs leading-5 text-slate-500">{url}</div> : null}
        </div>
        {url ? (
          <a
            className={classNames(
              "rounded-full border px-3 py-1 text-xs transition",
              active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/25 hover:text-white"
            )}
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            查看原文
          </a>
        ) : (
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">仅作参考</div>
        )}
      </div>
    </div>
  );
}

/*
function ResponsiveHotspotRankRow(props: {
  rank: number;
  active: boolean;
  loading?: boolean;
  title: string;
  summary: string;
  meta: string;
  onUse: () => void;
  tone?: "hot" | "business";
}) {
  const { rank, active, loading = false, title, summary, meta, onUse, tone = "hot" } = props;
  const rankStyle =
    rank === 1
      ? "from-[#ff7a59]/30 to-[#ff4d6d]/15 text-[#ffb199]"
      : rank === 2
        ? "from-[#ffb347]/25 to-[#ffcc33]/10 text-[#ffd27d]"
        : rank === 3
          ? "from-[#8b5cf6]/25 to-[#00d4ff]/10 text-[#b7c7ff]"
          : "from-white/10 to-white/5 text-slate-300";

  return (
    <button
      className={classNames(
        "group rounded-3xl border p-4 text-left transition-all sm:p-5",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8",
        loading && "cursor-wait opacity-80"
      )}
      onClick={onUse}
      disabled={loading}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <div className={classNames("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold", rankStyle)}>{rank}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words text-sm font-semibold leading-6 text-white sm:text-base sm:leading-7">{title}</span>
              <span
                className={classNames(
                  "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]",
                  tone === "business" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
                )}
              >
                {tone === "business" ? "AI琛屼笟" : "浠婃棩鐑"}
              </span>
            </div>
            <div className="mobile-clamp-3 mt-2 break-words text-sm leading-6 text-slate-300">{summary || "鏆傛棤鎽樿"}</div>
            <div className="mobile-clamp-2 mt-3 break-words text-xs leading-5 text-slate-500">{meta || "姝ｅ湪琛ュ厖鏇村涓婁笅鏂?"}</div>
          </div>
        </div>
        <div className="w-full sm:w-auto">
          <div
            className={classNames(
              "inline-flex w-full justify-center whitespace-nowrap rounded-full border px-3 py-2 text-xs transition-all sm:w-auto sm:py-1",
              active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 group-hover:border-cyan-400/25 group-hover:text-white"
            )}
          >
            {loading ? "鎻愬彇涓?" : active ? "宸查€夌敤" : "閫夌敤"}
          </div>
        </div>
      </div>
    </button>
  );
}

function ResponsiveSearchFactPackCard(props: {
  eventAnchor: string;
  summary: string;
  facts: string[];
  timelineClues: string[];
  businessSignals: string[];
  guardrailNote: string;
  sourcesCount: number;
  onUse: () => void;
}) {
  const { eventAnchor, summary, facts, timelineClues, businessSignals, guardrailNote, sourcesCount, onUse } = props;

  return (
    <div className="rounded-3xl border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(0,212,255,0.12),rgba(139,92,246,0.08))] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="section-eyebrow">鎼滅储浜嬪疄鍖?/div>
          <div className="mt-2 text-base font-semibold text-white">宸叉妸澶氭潵婧愭悳绱㈢粨鏋滄竻娲楁垚涓€浠藉彲鍐欑浜嬪疄鍖?/div>
          {eventAnchor ? <div className="mt-2 text-sm font-medium text-cyan-100">{eventAnchor}</div> : null}
          <div className="mt-2 break-words text-sm leading-7 text-slate-300">{summary}</div>
        </div>
        <button className="brand-btn w-full md:w-auto" onClick={onUse}>
          浣跨敤娓呮礂鍚庝簨瀹炲寘
        </button>
      </div>
      {facts.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {facts.slice(0, 4).map((fact, index) => (
            <div key={`${fact}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-slate-200">
              {fact}
            </div>
          ))}
        </div>
      ) : null}
      {(timelineClues.length > 0 || businessSignals.length > 0) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {timelineClues.slice(0, 3).map((item) => (
            <SoftBadge key={item}>{item}</SoftBadge>
          ))}
          {businessSignals.slice(0, 3).map((item) => (
            <SoftBadge key={item}>{item}</SoftBadge>
          ))}
        </div>
      ) : null}
      {guardrailNote ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-6 text-amber-100">
          {guardrailNote}
        </div>
      ) : null}
      <div className="mt-4 text-xs text-slate-400">宸叉眹鎬?{sourcesCount} 涓潵婧愩€傚彧鏈夎繖浠芥竻娲楀悗鐨勪簨瀹炲寘浼氳繘鍏ュ悗缁毊楠ㄨ倝锛屼笅闈㈠師濮嬫悳绱㈡簮浠呬緵鏍稿鍙傝€冦€?/div>
    </div>
  );
}

function ResponsiveSearchSourceCard(props: { active: boolean; title: string; summary: string; source: string; url: string }) {
  const { active, title, summary, source, url } = props;

  return (
    <div
      className={classNames(
        "rounded-3xl border p-4 text-left transition-all",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {source ? <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{source}</span> : null}
            <span className="break-words text-sm font-semibold leading-6 text-white sm:leading-7">{title}</span>
          </div>
          <div className="mobile-clamp-3 mt-3 break-words text-sm leading-6 text-slate-300 sm:leading-7">{summary || "鏆傛棤鎽樿"}</div>
          {url ? <div className="mt-3 break-all text-xs leading-5 text-slate-500 sm:truncate">{url}</div> : null}
        </div>
        <div className="w-full sm:w-auto">
          {url ? (
            <a
              className={classNames(
                "inline-flex w-full justify-center whitespace-nowrap rounded-full border px-3 py-2 text-xs transition sm:w-auto sm:py-1",
                active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/25 hover:text-white"
              )}
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              鏌ョ湅鍘熸枃
            </a>
          ) : (
            <div className="inline-flex w-full justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 sm:w-auto sm:py-1">
              浠呬綔鍙傝€?
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

*/

function ResponsiveHotspotRankRow(props: {
  rank: number;
  active: boolean;
  loading?: boolean;
  title: string;
  summary: string;
  meta: string;
  onUse: () => void;
  tone?: "hot" | "business";
}) {
  const { rank, active, loading = false, title, summary, meta, onUse, tone = "hot" } = props;
  const rankStyle =
    rank === 1
      ? "from-[#ff7a59]/30 to-[#ff4d6d]/15 text-[#ffb199]"
      : rank === 2
        ? "from-[#ffb347]/25 to-[#ffcc33]/10 text-[#ffd27d]"
        : rank === 3
          ? "from-[#8b5cf6]/25 to-[#00d4ff]/10 text-[#b7c7ff]"
          : "from-white/10 to-white/5 text-slate-300";

  return (
    <button
      className={classNames(
        "group rounded-3xl border p-4 text-left transition-all sm:p-5",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8",
        loading && "cursor-wait opacity-80"
      )}
      onClick={onUse}
      disabled={loading}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
          <div className={classNames("flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-bold", rankStyle)}>{rank}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words text-sm font-semibold leading-6 text-white sm:text-base sm:leading-7">{title}</span>
              <span
                className={classNames(
                  "shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]",
                  tone === "business" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
                )}
              >
                {tone === "business" ? "AI行业" : "今日热榜"}
              </span>
            </div>
            <div className="mobile-clamp-3 mt-2 break-words text-sm leading-6 text-slate-300">{summary || "暂无摘要"}</div>
            <div className="mobile-clamp-2 mt-3 break-words text-xs leading-5 text-slate-500">{meta || "正在补充更多信息"}</div>
          </div>
        </div>
        <div className="w-full sm:w-auto">
          <div
            className={classNames(
              "inline-flex w-full justify-center whitespace-nowrap rounded-full border px-3 py-2 text-xs transition-all sm:w-auto sm:py-1",
              active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 group-hover:border-cyan-400/25 group-hover:text-white"
            )}
          >
            {loading ? "提取中" : active ? "已选用" : "选用"}
          </div>
        </div>
      </div>
    </button>
  );
}

function ResponsiveSearchFactPackCard(props: {
  eventAnchor: string;
  summary: string;
  facts: string[];
  timelineClues: string[];
  businessSignals: string[];
  guardrailNote: string;
  sourcesCount: number;
  onUse: () => void;
}) {
  const { eventAnchor, summary, facts, timelineClues, businessSignals, guardrailNote, sourcesCount, onUse } = props;

  return (
    <div className="rounded-3xl border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(0,212,255,0.12),rgba(139,92,246,0.08))] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="section-eyebrow">搜索事实包</div>
          <div className="mt-2 text-base font-semibold text-white">已把多来源搜索结果清洗成可写稿事实包</div>
          {eventAnchor ? <div className="mt-2 text-sm font-medium text-cyan-100">{eventAnchor}</div> : null}
          <div className="mt-2 break-words text-sm leading-7 text-slate-300">{summary}</div>
        </div>
        <button className="brand-btn w-full md:w-auto" onClick={onUse}>
          使用清洗后事实包
        </button>
      </div>
      {facts.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {facts.slice(0, 4).map((fact, index) => (
            <div key={`${fact}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-slate-200">
              {fact}
            </div>
          ))}
        </div>
      ) : null}
      {(timelineClues.length > 0 || businessSignals.length > 0) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {timelineClues.slice(0, 3).map((item) => (
            <SoftBadge key={item}>{item}</SoftBadge>
          ))}
          {businessSignals.slice(0, 3).map((item) => (
            <SoftBadge key={item}>{item}</SoftBadge>
          ))}
        </div>
      ) : null}
      {guardrailNote ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-6 text-amber-100">
          {guardrailNote}
        </div>
      ) : null}
      <div className="mt-4 text-xs text-slate-400">已汇总 {sourcesCount} 个来源。只有这份清洗后的事实包会进入后续皮骨肉，下面原始搜索源仅作核对参考。</div>
    </div>
  );
}

function ResponsiveSearchSourceCard(props: { active: boolean; title: string; summary: string; source: string; url: string }) {
  const { active, title, summary, source, url } = props;

  return (
    <div
      className={classNames(
        "rounded-3xl border p-4 text-left transition-all",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {source ? <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{source}</span> : null}
            <span className="break-words text-sm font-semibold leading-6 text-white sm:leading-7">{title}</span>
          </div>
          <div className="mobile-clamp-3 mt-3 break-words text-sm leading-6 text-slate-300 sm:leading-7">{summary || "暂无摘要"}</div>
          {url ? <div className="mt-3 break-all text-xs leading-5 text-slate-500 sm:truncate">{url}</div> : null}
        </div>
        <div className="w-full sm:w-auto">
          {url ? (
            <a
              className={classNames(
                "inline-flex w-full justify-center whitespace-nowrap rounded-full border px-3 py-2 text-xs transition sm:w-auto sm:py-1",
                active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/25 hover:text-white"
              )}
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              查看原文
            </a>
          ) : (
            <div className="inline-flex w-full justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 sm:w-auto sm:py-1">
              仅作参考
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">{text}</div>;
}

function FieldLabel({ text }: { text: string }) {
  return <div className="field-label">{text}</div>;
}

function Textarea(props: { value: string; onChange: (value: string) => void; placeholder?: string; minHeight?: string }) {
  return (
    <textarea
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      className={classNames("field-textarea", props.minHeight || "min-h-[110px]")}
    />
  );
}

function Input(props: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <input value={props.value} onChange={(event) => props.onChange(event.target.value)} placeholder={props.placeholder} className="field-input" />;
}

function Toggle(props: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button className="toggle-wrap" onClick={() => props.onChange(!props.checked)}>
      <div className={classNames("toggle-switch", props.checked && "toggle-switch-on")}>
        <div className={classNames("toggle-dot", props.checked && "toggle-dot-on")} />
      </div>
      <span className="text-sm text-slate-200">{props.label}</span>
    </button>
  );
}

function ContentPanel({
  title,
  subtitle,
  content,
  copyLabel,
  onCopy
}: {
  title: string;
  subtitle: string;
  content: string;
  copyLabel?: string;
  onCopy?: () => void;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#09101f]/80 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{subtitle}</div>
          <div className="mt-3 text-base font-semibold text-white">{title}</div>
        </div>
        {copyLabel && onCopy ? (
          <button
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/25 hover:text-white"
            onClick={onCopy}
          >
            {copyLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-8 text-slate-200">
        {content}
      </div>
    </div>
  );
}

function Notice({ toast }: { toast: NoticeState }) {
  return (
    <div className="fixed right-6 top-24 z-50">
      <div
        className={classNames(
          "rounded-2xl border px-4 py-3 text-sm shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl",
          toast.tone === "success" && "border-emerald-400/30 bg-emerald-400/12 text-emerald-100",
          toast.tone === "warning" && "border-amber-400/30 bg-amber-400/12 text-amber-100",
          toast.tone === "info" && "border-cyan-400/30 bg-cyan-400/12 text-cyan-100"
        )}
      >
        {toast.text}
      </div>
    </div>
  );
}

function HistoryDrawer(props: {
  open: boolean;
  history: HistoryItem[];
  onClose: () => void;
  onRestore: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <button className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={props.onClose} />
      <div className="relative ml-auto h-full w-full max-w-xl border-l border-white/10 bg-[#070b16]/96 p-6 shadow-[0_0_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold text-white">历史记录</div>
            <div className="mt-1 text-sm text-slate-400">保存的是任务快照 + 当前选中的皮骨肉收口 + 成品。</div>
          </div>
          <button className="ghost-btn" onClick={props.onClose}>
            关闭
          </button>
        </div>

        <div className="mt-6 max-h-[calc(100vh-120px)] space-y-3 overflow-auto pr-1">
          {props.history.length === 0 ? (
            <EmptyBlock text="还没有历史记录，先生成一条完整成品。" />
          ) : (
            props.history.map((item) => (
              <div key={item.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-base font-semibold text-white">{getTaskDisplayName(item.snapshot)}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <SoftBadge>{displayEntryType(item.entryType)}</SoftBadge>
                      <SoftBadge>{displayBusinessMode(item.businessMode)}</SoftBadge>
                      <SoftBadge>{displayCtaMode(item.ctaMode)}</SoftBadge>
                    </div>
                    <div className="mt-3 text-xs text-slate-400">{formatTime(item.createdAt)}</div>
                    <div className="mt-3 text-sm leading-7 text-slate-300">{(item.workspace?.selectedHook?.text ?? "未保存皮").slice(0, 60)}</div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button className="brand-btn" onClick={() => props.onRestore(item)}>
                      回显
                    </button>
                    <button className="ghost-btn" onClick={() => props.onDelete(item.id)}>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
