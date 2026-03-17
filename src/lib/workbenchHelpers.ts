import { useEffect, useState } from "react";
import type {
  ApiSettings,
  BaseProfile,
  CtaItem,
  DraftItem,
  EntryType,
  HistoryItem,
  HookItem,
  MeatItem,
  SkeletonItem,
  TaskForm,
  WorkspaceSnapshot,
} from "../types";
import { DEFAULT_ORIGINAL_ENTRY_TYPE, defaultApiSettings, defaultTask, displayEntryType, type OriginalEntryType, isOriginalEntryType, type WorkbenchMode } from "./workbenchConfig";
import type { BusinessHotItem, HotRankItem } from "./workflows";
import { normalizeBaseUrl } from "./http";

export function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

export function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeApiSettings(value: Partial<ApiSettings> | null | undefined): ApiSettings {
  return {
    ...defaultApiSettings,
    ...(value || {}),
    useLiveApi: typeof value?.useLiveApi === "boolean" ? value.useLiveApi : defaultApiSettings.useLiveApi,
    baseUrl: normalizeBaseUrl(typeof value?.baseUrl === "string" && value.baseUrl.trim() ? value.baseUrl : defaultApiSettings.baseUrl),
    apiKey: "",
    mainModel: typeof value?.mainModel === "string" && value.mainModel.trim() ? value.mainModel : defaultApiSettings.mainModel,
    batchModel: typeof value?.batchModel === "string" && value.batchModel.trim() ? value.batchModel : defaultApiSettings.batchModel,
    polishModel: typeof value?.polishModel === "string" && value.polishModel.trim() ? value.polishModel : defaultApiSettings.polishModel,
    imageModel: typeof value?.imageModel === "string" && value.imageModel.trim() ? value.imageModel : defaultApiSettings.imageModel,
    requestTimeoutMs:
      Math.max(
        90000,
        typeof value?.requestTimeoutMs === "number" && Number.isFinite(value.requestTimeoutMs) && value.requestTimeoutMs > 0
          ? value.requestTimeoutMs
          : defaultApiSettings.requestTimeoutMs
      ),
  };
}

export function sameApiSettings(left: ApiSettings, right: ApiSettings) {
  return (
    left.useLiveApi === right.useLiveApi &&
    left.baseUrl === right.baseUrl &&
    left.apiKey === right.apiKey &&
    left.mainModel === right.mainModel &&
    left.batchModel === right.batchModel &&
    left.polishModel === right.polishModel &&
    left.imageModel === right.imageModel &&
    left.requestTimeoutMs === right.requestTimeoutMs
  );
}

export function useStoredState<T>(storageKey: string, initialValue: T | (() => T)) {
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

export function createWorkspaceSnapshot(
  selectedHook: HookItem | null,
  selectedSkeleton: SkeletonItem | null,
  selectedMeat: MeatItem | null,
  selectedCta: CtaItem | null,
  drafts: DraftItem[],
  selectedDraftId: string | null,
): WorkspaceSnapshot {
  return {
    decompose: null,
    selectedHook: selectedHook ? cloneDeep(selectedHook) : null,
    selectedSkeleton: selectedSkeleton ? cloneDeep(selectedSkeleton) : null,
    selectedMeat: selectedMeat ? cloneDeep(selectedMeat) : null,
    selectedCta: selectedCta ? cloneDeep(selectedCta) : null,
    drafts: cloneDeep(drafts),
    selectedDraftId,
    score: null,
  };
}

export function createHistoryRecord(
  task: TaskForm,
  selectedHook: HookItem | null,
  selectedSkeleton: SkeletonItem | null,
  selectedMeat: MeatItem | null,
  selectedCta: CtaItem | null,
  drafts: DraftItem[],
  selectedDraftId: string | null,
): HistoryItem {
  return {
    id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entryType: task.entryType,
    businessMode: task.businessMode,
    ctaMode: task.ctaMode,
    createdAt: new Date().toISOString(),
    snapshot: cloneDeep(task),
    workspace: createWorkspaceSnapshot(selectedHook, selectedSkeleton, selectedMeat, selectedCta, drafts, selectedDraftId),
  };
}

export function getTaskPrimaryText(task: TaskForm) {
  if (task.entryType === "hotspot") return task.sourceText || task.hotspotAngle;
  if (task.entryType === "topic") return task.topicGoal || task.sourceText;
  if (task.entryType === "boss_story") return task.sourceText || task.storyConclusion;
  return task.sourceText;
}

export function getTaskDisplayName(task: TaskForm) {
  const seed = getTaskPrimaryText(task).replace(/\s+/g, "").slice(0, 22);
  return seed || displayEntryType(task.entryType);
}

export function inferWorkbenchMode(entryType: EntryType): WorkbenchMode {
  return entryType === "viral" ? "rewrite" : "original";
}

export function normalizeTaskState(task: TaskForm): TaskForm {
  return {
    ...defaultTask,
    ...task,
    entryTypeChosen: typeof task.entryTypeChosen === "boolean" ? task.entryTypeChosen : Boolean(task.entryType),
    businessModeChosen: typeof task.businessModeChosen === "boolean" ? task.businessModeChosen : Boolean(task.businessMode),
    ctaModeChosen: typeof task.ctaModeChosen === "boolean" ? task.ctaModeChosen : Boolean(task.ctaMode),
  };
}

export function createTaskForMode(
  mode: WorkbenchMode,
  options?: {
    previousTask?: TaskForm;
    lastOriginalEntryType?: OriginalEntryType;
    lastOriginalEntryChosen?: boolean;
  },
): TaskForm {
  if (mode === "compose") {
    return options?.previousTask ?? defaultTask;
  }

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
      ctaModeChosen,
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
    ctaModeChosen,
  };
}

export function getWorkbenchLabel(mode: WorkbenchMode) {
  if (mode === "rewrite") return "爆款仿写";
  if (mode === "original") return "热点 / 主题创作";
  if (mode === "video") return "视频分析";
  return "文案组合";
}

export function formatTime(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

export function looksLikeBlockedSummary(value?: string) {
  const text = (value || "").trim();
  if (!text) return false;
  return /SecurityCompromiseError|Anonymous access to domain blocked|DDoS attack suspected|["“]code["”]\s*:\s*451|["“]status["”]\s*:\s*45102/i.test(
    text,
  );
}

export function trimCardPreviewText(value?: string, maxLength = 28) {
  const text = (value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/[，。；;:：\s]+$/g, "")}…`;
}

export function pickHotspotCardSummary(item: Partial<HotRankItem & BusinessHotItem>, business = false) {
  const candidates = business
    ? [(item as BusinessHotItem).display_summary, item.summary, (item as BusinessHotItem).business_reason, (item as BusinessHotItem).recommend_reason, item.title]
    : [(item as HotRankItem).display_summary, item.summary, (item as HotRankItem).business_reason, (item as HotRankItem).why_hot, item.title];
  return candidates.find((text) => text && !looksLikeBlockedSummary(text)) || "暂无摘要";
}

export function pickHotspotCardTitle(item: Partial<HotRankItem & BusinessHotItem>, fallbackTitle: string) {
  return (item as HotRankItem).display_title || item.title || fallbackTitle;
}

export function getHotspotPreviewSummary(item: Partial<HotRankItem & BusinessHotItem>, business = false) {
  const candidates = business
    ? [(item as BusinessHotItem).display_summary, item.summary, item.title]
    : [(item as HotRankItem).display_summary, item.summary, (item as HotRankItem).why_hot, item.title];
  const next = candidates.find((text) => text && !looksLikeBlockedSummary(text));
  return trimCardPreviewText(next, 28) || "暂无摘要";
}

export function getHotspotPreviewTitle(item: Partial<HotRankItem & BusinessHotItem>, fallbackTitle: string) {
  return trimCardPreviewText((item as HotRankItem).display_title || item.title || fallbackTitle, 40);
}

