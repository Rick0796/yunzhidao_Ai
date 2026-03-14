import type {
  ApiSettings,
  BaseProfile,
  CtaItem,
  DraftItem,
  HookItem,
  MeatItem,
  ModuleMeta,
  SkeletonItem,
  TaskForm
} from "../types";
import {
  runCtaGeneration,
  runDraftGeneration,
  runHookGeneration,
  runMeatGeneration,
  runSkeletonGeneration
} from "../lib/generators";
import {
  normalizeCtaResults,
  normalizeDraftResults,
  normalizeHookResults,
  normalizeMeatResults,
  normalizeSkeletonResults
} from "../lib/normalize";
import type { WorkbenchMode } from "../lib/workbenchConfig";

interface GenerationHandlersParams {
  settings: ApiSettings;
  profile: BaseProfile;
  task: TaskForm;
  currentWorkbenchMode: WorkbenchMode;
  canGoStep2: boolean;
  selectedHook: HookItem | null;
  selectedSkeleton: SkeletonItem | null;
  selectedMeat: MeatItem | null;
  selectedCta: CtaItem | null;
  setHooks: (fn: HookItem[] | ((prev: HookItem[]) => HookItem[])) => void;
  setSkeletons: (fn: SkeletonItem[] | ((prev: SkeletonItem[]) => SkeletonItem[])) => void;
  setMeats: (fn: MeatItem[] | ((prev: MeatItem[]) => MeatItem[])) => void;
  setCtas: (fn: CtaItem[] | ((prev: CtaItem[]) => CtaItem[])) => void;
  setDrafts: (fn: DraftItem[] | ((prev: DraftItem[]) => DraftItem[])) => void;
  setSelectedHookId: (id: string | null) => void;
  setSelectedSkeletonId: (id: string | null) => void;
  setSelectedMeatId: (id: string | null) => void;
  setSelectedCtaId: (id: string | null) => void;
  setSelectedDraftId: (id: string | null) => void;
  setIsGeneratingHooks: (v: boolean) => void;
  setIsGeneratingStructure: (v: boolean) => void;
  setIsGeneratingDrafts: (v: boolean) => void;
  setStructureTab: (tab: "skeleton" | "meat" | "cta") => void;
  setDraftSignature: (sig: string) => void;
  setModuleMeta: (fn: (prev: Record<"hooks" | "structure" | "drafts", ModuleMeta | null>) => Record<"hooks" | "structure" | "drafts", ModuleMeta | null>) => void;
  showNotice: (tone: "success" | "warning" | "info", text: string) => void;
  clearFrom: (level: "task" | "hook" | "structure") => void;
  saveCurrentHistory: (nextDrafts: DraftItem[], nextSelectedDraftId: string | null, hook: HookItem | null, skeleton: SkeletonItem | null, meat: MeatItem | null, cta: CtaItem | null) => void;
}

export function useGenerationHandlers(params: GenerationHandlersParams) {
  const {
    settings,
    profile,
    task,
    currentWorkbenchMode,
    canGoStep2,
    selectedHook,
    selectedSkeleton,
    selectedMeat,
    selectedCta,
    setHooks,
    setSkeletons,
    setMeats,
    setCtas,
    setDrafts,
    setSelectedHookId,
    setSelectedSkeletonId,
    setSelectedMeatId,
    setSelectedCtaId,
    setSelectedDraftId,
    setIsGeneratingHooks,
    setIsGeneratingStructure,
    setIsGeneratingDrafts,
    setStructureTab,
    setDraftSignature,
    setModuleMeta,
    showNotice,
    clearFrom,
    saveCurrentHistory
  } = params;

  async function handleGenerateHooks(): Promise<HookItem[]> {
    if (!canGoStep2) {
      showNotice("warning", "先把主题、素材或热点内容填进去。");
      return [];
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
    } catch (error: unknown) {
      showNotice("warning", `皮生成失败：${error instanceof Error ? error.message : "未知错误"}`);
      return [];
    } finally {
      setIsGeneratingHooks(false);
    }
  }

  async function handleGenerateStructure(): Promise<void> {
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
    } catch (error: unknown) {
      showNotice("warning", `结构生成失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsGeneratingStructure(false);
    }
  }

  async function handleGenerateDrafts(): Promise<void> {
    if (currentWorkbenchMode === "rewrite") {
      if (!selectedHook || !selectedCta || (task.businessMode !== "none" && !selectedMeat)) {
        showNotice("warning", "先把皮、收口确定下来。");
        return;
      }
    } else {
      if (!selectedHook || !selectedSkeleton || !selectedCta || (task.businessMode !== "none" && !selectedMeat)) {
        showNotice("warning", "先把皮、骨、肉、收口都定下来。");
        return;
      }
    }

    setIsGeneratingDrafts(true);
    const effectiveSkeleton: SkeletonItem = selectedSkeleton ?? {
      id: "sk-viral-fallback",
      name: "原文改写",
      scenario: "仿写爆款",
      summary: "按原文段落顺序改写",
      steps: [{ name: "改写推进", purpose: "按原文顺序改写", targetWords: 80 }]
    };
    try {
      const result = await runDraftGeneration(settings, profile, task, selectedHook!, effectiveSkeleton, selectedMeat, selectedCta!);
      const nextDrafts = normalizeDraftResults(result.data.items, {
        task,
        profile,
        hook: selectedHook!,
        skeleton: effectiveSkeleton,
        meat: selectedMeat,
        cta: selectedCta!
      });
      const nextSelectedDraftId = nextDrafts[0]?.id ?? null;
      setDrafts(nextDrafts);
      setSelectedDraftId(nextSelectedDraftId);
      setDraftSignature(`${selectedHook!.id}-${effectiveSkeleton.id}-${selectedMeat?.id ?? "none"}-${selectedCta!.id}`);
      setModuleMeta((prev) => ({
        ...prev,
        drafts: { source: result.source, updatedAt: new Date().toISOString(), message: result.message }
      }));
      saveCurrentHistory(nextDrafts, nextSelectedDraftId, selectedHook!, effectiveSkeleton, selectedMeat, selectedCta!);
      showNotice("success", "完整成品已经生成，并写入历史。");
    } catch (error: unknown) {
      showNotice("warning", `成品生成失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsGeneratingDrafts(false);
    }
  }

  return {
    handleGenerateHooks,
    handleGenerateStructure,
    handleGenerateDrafts
  };
}
