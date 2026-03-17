import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useHotspotCenter } from "./hooks/useHotspotCenter";
import ParticleBackground from "./components/ParticleBackground";
import ComposeWorkbench from "./components/ComposeWorkbench";
import HotspotCenterPanel from "./components/HotspotCenterPanel";
import VideoAnalysisPanel from "./components/VideoAnalysisPanel";
import {
  buildMockSourceStructure
} from "./lib/mock";
import {
  classNames,
  cloneDeep,
  createHistoryRecord,
  createTaskForMode,
  formatTime,
  getTaskPrimaryText,
  getTaskDisplayName,
  getWorkbenchLabel,
  inferWorkbenchMode,
  normalizeApiSettings,
  normalizeTaskState,
  sameApiSettings,
  useStoredState
} from "./lib/workbenchHelpers";
import {
  BUSINESS_OPTIONS,
  CTA_OPTIONS,
  DEFAULT_ORIGINAL_ENTRY_TYPE,
  ORIGINAL_ENTRY_OPTIONS,
  defaultApiSettings,
  defaultBaseProfile,
  defaultTask,
  displayBusinessMode,
  displayCtaMode,
  displayEntryType,
  getStepConfig,
  getWorkbenchCopy,
  isOriginalEntryType,
  type OriginalEntryType,
  type WorkbenchMode
} from "./lib/workbenchConfig";
import { useGenerationHandlers } from "./hooks/useGenerationHandlers";
import {
  formatSkeletonPreview
} from "./lib/normalize";
import { formatSkeletonCardDescription, formatSkeletonExecutionLines } from "./lib/skeletons";
import { STORAGE_KEYS } from "./lib/workbenchStorage";
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
  ModuleMeta,
  SkeletonItem,
  SourceStructureItem,
  TaskForm,
  WorkspaceSnapshot
} from "./types";

type WizardStep = 1 | 2 | 3 | 4;
type NoticeTone = "success" | "warning" | "info";
interface NoticeState {
  text: string;
  tone: NoticeTone;
}

function App() {
  const [enteredWorkbench, setEnteredWorkbench] = useState(false);
  const [workbenchMode, setWorkbenchMode] = useStoredState<WorkbenchMode | null>(STORAGE_KEYS.workbenchMode, null);
  const [experienceMode, setExperienceMode] = useStoredState<"beginner" | "advanced">(STORAGE_KEYS.experienceMode, "beginner");
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
  const [isRewriteStructureCollapsed, setIsRewriteStructureCollapsed] = useState(false);
  const [isWorkbenchIntroHidden, setIsWorkbenchIntroHidden] = useState(false);
  const canCollapseWorkbenchIntro = false;
  const [composeWorkbenchNonce, setComposeWorkbenchNonce] = useState(0);
  const [showHotspotHelper, setShowHotspotHelper] = useState(false);
  const [isHooksCollapsed, setIsHooksCollapsed] = useState(false);
  const [isStructureCollapsed, setIsStructureCollapsed] = useState(false);
  const [isDraftsCollapsed, setIsDraftsCollapsed] = useState(false);
  const [isEntryExpanded, setIsEntryExpanded] = useState(true);
  const [isBusinessExpanded, setIsBusinessExpanded] = useState(true);
  const [isCtaExpanded, setIsCtaExpanded] = useState(true);
  const [wizardStep, setWizardStep] = useState<WizardStep>(() =>
    drafts.length > 0 ? 4 : skeletons.length > 0 || ctas.length > 0 || meats.length > 0 ? 3 : hooks.length > 0 ? 2 : 1
  );
  const currentWorkbenchMode = workbenchMode ?? inferWorkbenchMode(task.entryType);
  const isBeginnerMode = experienceMode === "beginner";
  const normalizedTask = useMemo(() => normalizeTaskState(task), [task]);
  const lastOriginalEntryRef = useRef<{ entryType: OriginalEntryType; chosen: boolean }>({
    entryType: isOriginalEntryType(defaultTask.entryType) ? defaultTask.entryType : DEFAULT_ORIGINAL_ENTRY_TYPE,
    chosen: false
  });

  const {
    allHotItems,
    baiduHotItems,
    businessHotItems,
    cacheText,
    cacheWarning,
    confirmRefreshHotRank,
    douyinHotItems,
    factPack,
    handleSearchTopic,
    handleUseHotRankItem,
    hotRankFetchedAt,
    hotRankResult,
    hotspotListExpanded,
    hotspotPanelTab,
    isLoadingHotRank,
    isLoadingManualSearch,
    loadingHotspotKey,
    manualSearchQuery,
    manualSearchResult,
    resetHotspotWorkspace,
    searchItems,
    selectedHotspotKey,
    setSelectedHotspotKey,
    setHotspotListExpanded,
    setHotspotPanelTab,
    setManualSearchQuery,
    setShowHotspotCenter,
    showHotspotCenter,
    weiboHotItems,
    zhihuHotItems
  } = useHotspotCenter({
    baseUrl: settings.baseUrl || "/api",
    showNotice,
    applyHotspotMaterial
  });

  useEffect(() => {
    setIsWorkbenchIntroHidden(true);
  }, [currentWorkbenchMode]);
  useEffect(() => {
    if (!isBeginnerMode) return;
    setShowTaskSettings(true);
    setShowAdvanced(false);
    setIsWorkbenchIntroHidden(true);
  }, [isBeginnerMode]);

  useEffect(() => {
    const shouldOfferHotspotHelper = currentWorkbenchMode === "original" && normalizedTask.entryTypeChosen && task.entryType === "hotspot";
    if (!shouldOfferHotspotHelper) {
      setShowHotspotHelper(false);
      return;
    }
    if (!isBeginnerMode) {
      setShowHotspotHelper(true);
    }
  }, [currentWorkbenchMode, normalizedTask.entryTypeChosen, task.entryType, isBeginnerMode]);
  const taskChoiceMissing = useMemo(() => {
    if (currentWorkbenchMode === "compose") {
      return [];
    }
    const missing: string[] = [];
    if (currentWorkbenchMode === "original" && !normalizedTask.entryTypeChosen) {
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
  const canGoStep4 = canGoStep3 && (
    currentWorkbenchMode === "rewrite"
      ? Boolean(selectedCta && (task.businessMode === "none" || selectedMeat))
      : Boolean(selectedSkeleton && selectedCta && (task.businessMode === "none" || selectedMeat))
  );
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
    if (mode === "compose") {
      setComposeWorkbenchNonce((prev) => prev + 1);
    }
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
    resetHotspotWorkspace();
    setShowTaskSettings(false);
    setShowAdvanced(false);
    setShowHistory(false);
    setEnteredWorkbench(true);
  }

  function startNewTask(mode: WorkbenchMode = currentWorkbenchMode) {
    openWorkbench(mode);
    showNotice("success", `已新建${getWorkbenchLabel(mode)}任务。`);
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
    setShowHotspotHelper(false);
    setShowTaskSettings(isBeginnerMode);
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

  const { handleGenerateHooks, handleGenerateStructure, handleGenerateDrafts } = useGenerationHandlers({
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
  });

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
    return (
      <HotspotCenterPanel
        allHotItems={allHotItems}
        businessHotItems={businessHotItems}
        douyinHotItems={douyinHotItems}
        weiboHotItems={weiboHotItems}
        zhihuHotItems={zhihuHotItems}
        baiduHotItems={baiduHotItems}
        searchItems={searchItems}
        factPack={factPack}
        cacheWarning={cacheWarning}
        cacheText={cacheText}
        selectedHotspotKey={selectedHotspotKey}
        loadingHotspotKey={loadingHotspotKey}
        hotspotListExpanded={hotspotListExpanded}
        hotspotPanelTab={hotspotPanelTab}
        showHotspotCenter={showHotspotCenter}
        manualSearchQuery={manualSearchQuery}
        isLoadingHotRank={isLoadingHotRank}
        isLoadingManualSearch={isLoadingManualSearch}
        hasManualSearchResult={Boolean(manualSearchResult)}
        onUseHotRankItem={(item, options) => void handleUseHotRankItem(item, options)}
        onUseFactPack={() => {
          if (!factPack) return;
          applyHotspotMaterial(factPack.sourceText, factPack.businessReason || "", "fact-pack", factPack.guardrailNote || "");
        }}
        onSearchTopic={() => void handleSearchTopic()}
        onRefreshHotRank={confirmRefreshHotRank}
        onSetHotspotListExpanded={setHotspotListExpanded}
        onSetHotspotPanelTab={setHotspotPanelTab}
        onSetManualSearchQuery={setManualSearchQuery}
        onToggleHotspotCenter={() => setShowHotspotCenter((prev) => !prev)}
      />
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
    if (target === 1) {
      // 返回 Step 1 时收起内容输入区，避免误触清空已生成内容
      setShowTaskSettings(false);
      return setWizardStep(1);
    }
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
        <div className="space-y-3">

          {/* ── 任务设置（合并折叠卡片） ── */}
          {currentWorkbenchMode !== "rewrite" ? (
            <div className={classNames(
              "rounded-2xl border-2 transition",
              (normalizedTask.entryTypeChosen && normalizedTask.businessModeChosen && (normalizedTask.ctaModeChosen || task.businessMode === "none"))
                ? "border-white/10 bg-white/3"
                : "border-amber-400/50 bg-amber-400/5"
            )}>
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setIsEntryExpanded((v) => !v)}
              >
                <span className="text-sm font-semibold text-white">任务设置</span>
                <div className="flex items-center gap-2">
                  {normalizedTask.entryTypeChosen && normalizedTask.businessModeChosen && (normalizedTask.ctaModeChosen || task.businessMode === "none")
                    ? <span className="flex items-center gap-1 text-xs text-emerald-400"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>已完成</span>
                    : <span className="animate-pulse text-xs font-medium text-amber-300">← 请选择</span>
                  }
                  <svg className={classNames("h-4 w-4 text-slate-500 transition-transform", !isEntryExpanded && "-rotate-90")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              {isEntryExpanded && (
                <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-4">
                  {/* 创作入口 */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">创作入口</span>
                      {normalizedTask.entryTypeChosen && <span className="text-xs text-emerald-400">{displayEntryType(task.entryType)}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      {ORIGINAL_ENTRY_OPTIONS.map((item) => (
                        <button
                          key={item.value}
                          className={classNames(
                            "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                            normalizedTask.entryTypeChosen && task.entryType === item.value
                              ? "border-cyan-400 bg-cyan-400/15 shadow-[0_0_12px_rgba(0,212,255,0.25)] text-white"
                              : "border-white/15 bg-white/5 text-slate-300 hover:border-cyan-400/50 hover:bg-cyan-400/8 hover:text-white"
                          )}
                          onClick={() => chooseEntryType(item.value)}
                        >
                          <div className="text-sm font-semibold">{item.label}</div>
                          <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{item.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 挂业务方式 */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">挂业务方式</span>
                      {normalizedTask.businessModeChosen && <span className="text-xs text-emerald-400">{displayBusinessMode(task.businessMode)}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {BUSINESS_OPTIONS.map((item) => (
                        <button
                          key={item.value}
                          className={classNames(
                            "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                            normalizedTask.businessModeChosen && task.businessMode === item.value
                              ? "border-cyan-400 bg-cyan-400/15 shadow-[0_0_12px_rgba(0,212,255,0.25)] text-white"
                              : "border-white/15 bg-white/5 text-slate-300 hover:border-cyan-400/50 hover:bg-cyan-400/8 hover:text-white"
                          )}
                          onClick={() => chooseBusinessMode(item.value)}
                        >
                          <div className="text-sm font-semibold">{item.label}</div>
                          <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{item.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 收口方式 — 不管业务模式都可选 */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">收口方式</span>
                      {normalizedTask.ctaModeChosen && <span className="text-xs text-emerald-400">{displayCtaMode(task.ctaMode)}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {CTA_OPTIONS.map((item) => (
                        <button
                          key={item.value}
                          className={classNames(
                            "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                            normalizedTask.ctaModeChosen && task.ctaMode === item.value
                              ? "border-cyan-400 bg-cyan-400/15 shadow-[0_0_12px_rgba(0,212,255,0.25)] text-white"
                              : "border-white/15 bg-white/5 text-slate-300 hover:border-cyan-400/50 hover:bg-cyan-400/8 hover:text-white"
                          )}
                          onClick={() => chooseCtaMode(item.value)}
                        >
                          <div className="text-sm font-semibold">{item.label}</div>
                          <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{item.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={classNames(
              "rounded-2xl border-2 transition",
              (normalizedTask.businessModeChosen && (normalizedTask.ctaModeChosen || task.businessMode === "none"))
                ? "border-white/10 bg-white/3"
                : "border-amber-400/50 bg-amber-400/5"
            )}>
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setIsEntryExpanded((v) => !v)}
              >
                <span className="text-sm font-semibold text-white">任务设置</span>
                <div className="flex items-center gap-2">
                  {normalizedTask.businessModeChosen && (normalizedTask.ctaModeChosen || task.businessMode === "none")
                    ? <span className="flex items-center gap-1 text-xs text-emerald-400"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>已完成</span>
                    : <span className="animate-pulse text-xs font-medium text-amber-300">← 请选择</span>
                  }
                  <svg className={classNames("h-4 w-4 text-slate-500 transition-transform", !isEntryExpanded && "-rotate-90")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>
              {isEntryExpanded && (
                <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-4">
                  {/* 模式说明 */}
                  <div className="text-sm text-slate-300">模式：爆款仿写 — 保留原文结构，改开头抓力和表达去重</div>
                  {/* 挂业务方式 */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">挂业务方式</span>
                      {normalizedTask.businessModeChosen && <span className="text-xs text-emerald-400">{displayBusinessMode(task.businessMode)}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {BUSINESS_OPTIONS.map((item) => (
                        <button
                          key={item.value}
                          className={classNames(
                            "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                            normalizedTask.businessModeChosen && task.businessMode === item.value
                              ? "border-cyan-400 bg-cyan-400/15 shadow-[0_0_12px_rgba(0,212,255,0.25)] text-white"
                              : "border-white/15 bg-white/5 text-slate-300 hover:border-cyan-400/50 hover:bg-cyan-400/8 hover:text-white"
                          )}
                          onClick={() => chooseBusinessMode(item.value)}
                        >
                          <div className="text-sm font-semibold">{item.label}</div>
                          <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{item.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* 收口方式 */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">收口方式</span>
                      {normalizedTask.ctaModeChosen && <span className="text-xs text-emerald-400">{displayCtaMode(task.ctaMode)}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                      {CTA_OPTIONS.map((item) => (
                        <button
                          key={item.value}
                          className={classNames(
                            "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                            normalizedTask.ctaModeChosen && task.ctaMode === item.value
                              ? "border-cyan-400 bg-cyan-400/15 shadow-[0_0_12px_rgba(0,212,255,0.25)] text-white"
                              : "border-white/15 bg-white/5 text-slate-300 hover:border-cyan-400/50 hover:bg-cyan-400/8 hover:text-white"
                          )}
                          onClick={() => chooseCtaMode(item.value)}
                        >
                          <div className="text-sm font-semibold">{item.label}</div>
                          <div className="mt-0.5 text-[11px] leading-4 text-slate-400">{item.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>{/* end space-y-3 */}

        {/* ── 热点中心 ── */}
        {currentWorkbenchMode === "original" && normalizedTask.entryTypeChosen && task.entryType === "hotspot" ? (
          <div className="mt-3">
            <GlassCard>{renderHotspotCenter()}</GlassCard>
          </div>
        ) : null}

        {/* ── 内容输入（折叠卡片） ── */}
        <div className={classNames(
          "mt-3 rounded-2xl border-2 transition",
          getTaskPrimaryText(task).trim() ? "border-white/10 bg-white/3" : "border-amber-400/50 bg-amber-400/5"
        )}>
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setShowTaskSettings((prev) => !prev)}
          >
            <span className="text-sm font-semibold text-white">内容输入</span>
            <div className="flex items-center gap-2">
              {getTaskPrimaryText(task).trim()
                ? <span className="text-xs text-emerald-400">✓ 已填写</span>
                : <span className="animate-pulse text-xs font-medium text-amber-300">← 必填</span>
              }
              <svg className={classNames("h-4 w-4 text-slate-400 transition-transform", showTaskSettings && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {showTaskSettings ? (
            <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-3">
              {renderTaskInput()}
            </div>
          ) : null}
        </div>

        {/* ── 高级设置（折叠卡片） ── */}
        <div className="mt-3 rounded-2xl border border-white/8 bg-white/3">
          <button
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setShowAdvanced((prev) => !prev)}
          >
            <span className="text-sm font-semibold text-white">高级设置</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">业务背景 / API 配置</span>
              <svg className={classNames("h-4 w-4 text-slate-400 transition-transform", showAdvanced && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
          {showAdvanced ? (
            <div className="border-t border-white/8 px-4 pb-4 pt-3 grid gap-3 md:grid-cols-2">
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
              <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel text="是否启用实时 API" />
                  <Toggle checked={settings.useLiveApi} onChange={(checked) => updateSettingsField("useLiveApi", checked)} label={settings.useLiveApi ? "已开启" : "使用本地兜底"} />
                </div>
                <div>
                  <FieldLabel text="后端代理地址" />
                  <Input value={settings.baseUrl} onChange={(value) => updateSettingsField("baseUrl", value)} placeholder="/api" />
                </div>
                <div className="md:col-span-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-slate-300">
                  API Key 现在统一由后端托管，这里不再从浏览器直接持有或发送密钥。前端只保留代理地址和模型名，避免密钥泄露，也避免不同功能各走一套模型链路。
                </div>
                <div>
                  <FieldLabel text="模型名（后端默认）" />
                  <Input value={settings.mainModel} onChange={(value) => updateSettingsField("mainModel", value)} placeholder="gemini-2.0-flash" />
                </div>
                <div>
                  <FieldLabel text="视觉模型名（视频分析）" />
                  <Input value={settings.imageModel} onChange={(value) => updateSettingsField("imageModel", value)} placeholder="gemini-2.0-flash" />
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              {currentWorkbenchMode === "rewrite" ? "仿写开头生成" : "开头（皮）"}
            </div>
            {currentWorkbenchMode !== "rewrite" && (
              <div className="mt-1 text-sm text-slate-300 truncate max-w-xs md:max-w-md">{getTaskPrimaryText(task) || "还没填写"}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {moduleMeta.hooks ? <SourceBadge meta={moduleMeta.hooks} /> : null}
            <button className="brand-btn" onClick={() => void handleGenerateHooks()} disabled={isGeneratingHooks}>
              {isGeneratingHooks ? "生成中..." : hooks.length > 0 ? "重新生成" : "生成开头"}
            </button>
          </div>
        </div>
        <ModuleMetaHint meta={moduleMeta.hooks} />

        {currentWorkbenchMode === "rewrite" ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-sm font-semibold text-white">原文结构版</div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{rewriteSourceStructure.length} 段</span>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-white transition"
                  onClick={() => setIsRewriteStructureCollapsed((value) => !value)}
                >
                  {isRewriteStructureCollapsed ? "展开" : "收起"}
                </button>
              </div>
            </div>
            {isRewriteStructureCollapsed ? (
              <div className="mt-2 text-xs text-slate-500">原文结构已收起，需要对照时点「展开」。</div>
            ) : (
              <div className="mt-3 grid gap-2">
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

        <div className="mt-4">
          <button
            className="flex w-full items-center justify-between text-left"
            onClick={() => setIsHooksCollapsed((v) => !v)}
          >
            <span className="text-xs font-semibold text-slate-400">开头列表 {hooks.length > 0 ? `· ${hooks.length} 条` : ""}</span>
            <svg className={classNames("h-4 w-4 text-slate-500 transition-transform", isHooksCollapsed && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {!isHooksCollapsed && (
            <div className="mt-2 grid gap-2">
              {hooks.length === 0 ? (
                <EmptyBlock text="还没生成开头，点上面的按钮先出一批。" />
              ) : (
                hooks.map((item) => (
                  <button
                    key={item.id}
                    className={classNames("result-card-v2", item.id === selectedHook?.id && "result-card-v2-active")}
                    onClick={() => handleHookSelect(item.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold leading-6 text-white">{item.text}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.type} · {item.riskLevel}风险 · {item.score}分</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          role="button" tabIndex={0}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:text-white"
                          onClick={(e) => { e.stopPropagation(); handleCopy(item.text, "开头已复制。"); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleCopy(item.text, "开头已复制。"); } }}
                        >复制</span>
                        <div className={classNames("h-4 w-4 rounded-full border", item.id === selectedHook?.id ? "border-cyan-300 bg-cyan-300" : "border-white/20")} />
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <StepFooter>
          <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(1)}>返回上一步</button>
          <button className="brand-btn" onClick={() => goStep(3)} disabled={!selectedHook}>
            {currentWorkbenchMode === "rewrite" ? "确定开头，进入装配" : "确定开头，进入结构"}
          </button>
        </StepFooter>
      </GlassCard>
    ) : wizardStep === 3 ? (
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">骨架 / 业务植入 / 收口</div>
            <div className="mt-1 text-sm text-slate-300 truncate max-w-xs md:max-w-md">{selectedHook?.text ?? "还没选开头"}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {moduleMeta.structure ? <SourceBadge meta={moduleMeta.structure} /> : null}
            <button className="brand-btn" onClick={() => void handleGenerateStructure()} disabled={!selectedHook || isGeneratingStructure}>
              {isGeneratingStructure ? "生成中..." : skeletons.length > 0 || ctas.length > 0 ? "重新生成" : "生成结构"}
            </button>
          </div>
        </div>
        <ModuleMetaHint meta={moduleMeta.structure} />

        <div className="mt-4">
          <button
            className="flex w-full items-center justify-between text-left mb-2"
            onClick={() => setIsStructureCollapsed((v) => !v)}
          >
            <span className="text-xs font-semibold text-slate-400">结构列表</span>
            <svg className={classNames("h-4 w-4 text-slate-500 transition-transform", isStructureCollapsed && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {!isStructureCollapsed && (
            <>
          <div className="seg-ctrl">
            <button className={classNames("seg-ctrl-item", structureTab === "skeleton" && "seg-ctrl-item-active")} onClick={() => setStructureTab("skeleton")}>
              骨架（推进）
            </button>
            {task.businessMode !== "none" ? (
              <button className={classNames("seg-ctrl-item", structureTab === "meat" && "seg-ctrl-item-active")} onClick={() => setStructureTab("meat")}>
                业务植入
              </button>
            ) : null}
            <button className={classNames("seg-ctrl-item", structureTab === "cta" && "seg-ctrl-item-active")} onClick={() => setStructureTab("cta")}>
              {task.businessMode === "none" ? "收口（已跳过）" : "收口"}
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {structureTab === "skeleton" ? (
              skeletons.length === 0 ? (
                <EmptyBlock text="还没生成骨架，点上面生成按钮。" />
              ) : (
                skeletons.map((item) => (
                  <button
                    key={item.id}
                    className={classNames("result-card-v2", item.id === selectedSkeleton?.id && "result-card-v2-active")}
                    onClick={() => handleStructureSelect("skeleton", item.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{formatSkeletonPreview(item.name, item.steps.map((s) => s.name))}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatSkeletonCardDescription(item)}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          role="button" tabIndex={0}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:text-white"
                          onClick={(e) => { e.stopPropagation(); handleCopy(`${item.name}\n${item.steps.map((s) => s.name).join(" → ")}\n${formatSkeletonExecutionLines(item).join("\n")}\n${item.summary}`, "骨架已复制。"); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleCopy(item.name, "骨架已复制。"); } }}
                        >复制</span>
                        <div className={classNames("h-4 w-4 rounded-full border", item.id === selectedSkeleton?.id ? "border-cyan-300 bg-cyan-300" : "border-white/20")} />
                      </div>
                    </div>
                  </button>
                ))
              )
            ) : null}

            {structureTab === "meat" ? (
              task.businessMode === "none" ? (
                <EmptyBlock text="当前不挂业务。" />
              ) : meats.length === 0 ? (
                <EmptyBlock text="还没生成业务植入，点上面生成按钮。" />
              ) : (
                meats.map((item) => (
                  <button
                    key={item.id}
                    className={classNames("result-card-v2", item.id === selectedMeat?.id && "result-card-v2-active")}
                    onClick={() => handleStructureSelect("meat", item.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">{item.type}</div>
                        <div className="mt-1 text-xs text-slate-400">{displayBusinessMode(item.intensity)} · 丝滑度 {item.smoothnessScore}</div>
                        <div className="mt-1 text-xs text-slate-300">{item.text}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          role="button" tabIndex={0}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:text-white"
                          onClick={(e) => { e.stopPropagation(); handleCopy(item.text, "已复制。"); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleCopy(item.text, "已复制。"); } }}
                        >复制</span>
                        <div className={classNames("h-4 w-4 rounded-full border", item.id === selectedMeat?.id ? "border-cyan-300 bg-cyan-300" : "border-white/20")} />
                      </div>
                    </div>
                  </button>
                ))
              )
            ) : null}

            {structureTab === "cta" ? (
              task.businessMode === "none" ? (
                <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-sm text-slate-400">
                  已选择不挂业务，系统不会生成收口内容。
                </div>
              ) : ctas.length === 0 ? (
                <EmptyBlock text="还没生成收口，点上面生成按钮。" />
              ) : (
                ctas.map((item) => (
                  <button
                    key={item.id}
                    className={classNames("result-card-v2", item.id === selectedCta?.id && "result-card-v2-active")}
                    onClick={() => handleStructureSelect("cta", item.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-white">{item.text}</div>
                        <div className="mt-1 text-xs text-slate-400">{item.type} · {item.scenario}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          role="button" tabIndex={0}
                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:text-white"
                          onClick={(e) => { e.stopPropagation(); handleCopy(item.text, "收口已复制。"); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleCopy(item.text, "收口已复制。"); } }}
                        >复制</span>
                        <div className={classNames("h-4 w-4 rounded-full border", item.id === selectedCta?.id ? "border-cyan-300 bg-cyan-300" : "border-white/20")} />
                      </div>
                    </div>
                  </button>
                ))
              )
            ) : null}
          </div>
            </>
          )}
        </div>

        <StepFooter>
          <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(2)}>返回上一步</button>
          <button className="brand-btn" onClick={() => goStep(4)} disabled={!canGoStep4}>
            确定结构，进入成品
          </button>
        </StepFooter>
      </GlassCard>
    ) : (
      <GlassCard>
        {/* 顶部：组合摘要 + 生成按钮 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">完整成品</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <SoftBadge>{selectedHook?.text.slice(0, 20) ?? "未选开头"}{(selectedHook?.text.length ?? 0) > 20 ? "..." : ""}</SoftBadge>
              <SoftBadge>{selectedSkeleton?.name ?? "未选骨架"}</SoftBadge>
              {task.businessMode !== "none" && <SoftBadge>{selectedMeat?.type ?? "未选植入"}</SoftBadge>}
              <SoftBadge>{selectedCta?.type ?? "未选收口"}</SoftBadge>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {moduleMeta.drafts ? <SourceBadge meta={moduleMeta.drafts} /> : null}
            <button className="brand-btn" onClick={() => void handleGenerateDrafts()} disabled={!canGoStep4 || isGeneratingDrafts}>
              {isGeneratingDrafts ? "生成中..." : drafts.length > 0 ? "重新生成" : "生成成品"}
            </button>
          </div>
        </div>
        <ModuleMetaHint meta={moduleMeta.drafts} />

        {/* 桌面端：两列布局；手机端：tab 切换 */}
        {drafts.length > 0 ? (
          <>
            {/* 手机端 tab */}
            <div className="mt-4 md:hidden">
              <MobileDraftTabs
                drafts={drafts}
                selectedDraft={selectedDraft}
                onSelect={(id) => setSelectedDraftId(id)}
                onCopyScript={(text) => handleCopy(text, "完整文案已复制。")}
                onCopySubtitle={(text) => handleCopy(text, "字幕稿已复制。")}
              />
            </div>
            {/* 桌面端两列 */}
            <div className="mt-4 hidden md:grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">版本</div>
                {drafts.map((item, index) => (
                  <button
                    key={item.id}
                    className={classNames("result-card-v2", item.id === selectedDraft?.id && "result-card-v2-active")}
                    onClick={() => setSelectedDraftId(item.id)}
                  >
                    <div className="text-sm font-semibold text-white">V{index + 1} · {item.versionName}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.title}</div>
                  </button>
                ))}
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
                  <EmptyBlock text="选左侧版本查看完整成品和字幕稿。" />
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <EmptyBlock text="点上面按钮生成完整成品。" />
          </div>
        )}

        <StepFooter>
          <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(3)}>返回上一步</button>
        </StepFooter>
      </GlassCard>
    );

  // 手机底部操作栏按钮
  const mobileActionBtn = enteredWorkbench && currentWorkbenchMode !== "compose" && currentWorkbenchMode !== "video" ? (
    wizardStep === 1 ? (
      <button className="brand-btn" onClick={() => goStep(2)} disabled={!canGoStep2}>
        {currentWorkbenchMode === "rewrite" ? "确定，进入选开头" : "确定任务"}
      </button>
    ) : wizardStep === 2 ? (
      <button className="brand-btn" onClick={() => goStep(3)} disabled={!selectedHook}>确定开头</button>
    ) : wizardStep === 3 ? (
      <button className="brand-btn" onClick={() => goStep(4)} disabled={!canGoStep4}>确定结构</button>
    ) : (
      <button className="brand-btn" onClick={() => void handleGenerateDrafts()} disabled={!canGoStep4 || isGeneratingDrafts}>
        {isGeneratingDrafts ? "生成中..." : drafts.length > 0 ? "重新生成" : "生成成品"}
      </button>
    )
  ) : null;

  return (
    <div className="flex min-h-screen flex-col text-white">
      <ParticleBackground />
      <div className="app-overlay" />

      <header className="fixed inset-x-0 top-0 z-40 bg-[#070b16]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6 border-b border-white/10">
          <button className="flex items-center gap-2" onClick={() => setEnteredWorkbench(false)}>
            <div className="bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] bg-clip-text text-lg font-bold text-transparent">云智道AI</div>
          </button>

          <div className="flex items-center gap-2">
            <button
              className="ghost-btn !min-h-8 !px-3 !text-xs"
              onClick={() => setShowHistory(true)}
              title="历史记录"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="hidden sm:inline">历史</span>
            </button>
            {enteredWorkbench ? (
              <button className="ghost-btn !min-h-8 !px-3 !text-xs" onClick={() => startNewTask()}>
                + 新任务
              </button>
            ) : null}
          </div>
        </div>

        {enteredWorkbench && currentWorkbenchMode !== "compose" && currentWorkbenchMode !== "video" ? (
          <div className="step-bar">
            {stepConfig.map((item) => {
              const available = item.step === 1 ? true : item.step === 2 ? canGoStep2 : item.step === 3 ? canGoStep3 : canGoStep4 || drafts.length > 0;
              const done = item.step < wizardStep || (item.step === 4 && drafts.length > 0);
              const active = wizardStep === item.step;
              return (
                <button
                  key={item.step}
                  className={`step-bar-item${active ? " step-bar-item-active" : done ? " step-bar-item-done" : ""}`}
                  onClick={() => goStep(item.step)}
                  disabled={!available}
                >
                  <span className="font-semibold">{item.step}</span>
                  <span className="hidden sm:inline">{item.title}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      <HistoryDrawer open={showHistory} history={history} onClose={() => setShowHistory(false)} onRestore={restoreHistory} onDelete={deleteHistory} />
      {notice ? <Notice toast={notice} /> : null}

      <main className="relative z-10 flex-1 px-4 pb-24 md:pb-10" style={{paddingTop: enteredWorkbench && currentWorkbenchMode !== "compose" && currentWorkbenchMode !== "video" ? "96px" : "56px"}}>
        {!enteredWorkbench ? (
          <Landing onSelectMode={openWorkbench} />
        ) : currentWorkbenchMode === "compose" ? (
          <div className="mx-auto max-w-7xl">
            <ComposeWorkbench key={composeWorkbenchNonce} settings={settings} />
          </div>
        ) : currentWorkbenchMode === "video" ? (
          <div className="mx-auto max-w-2xl">
            <VideoAnalysisPanel
              settings={settings}
              onImportToRewrite={(script) => {
                openWorkbench("rewrite");
                setTask((prev) => ({ ...prev, sourceText: script }));
                showNotice("success", "脚本已导入到仿写工作台。");
              }}
              showNotice={showNotice}
            />
          </div>
        ) : (
          <div className="mx-auto max-w-7xl space-y-4">
            <div>{stepPanel}</div>
          </div>
        )}
      </main>

      {/* 手机端底部操作栏 */}
      {mobileActionBtn ? (
        <div className="mobile-action-bar md:hidden">
          <div className="text-xs text-slate-400">步骤 {wizardStep} / 4 · {stepConfig[wizardStep - 1]?.title}</div>
          {mobileActionBtn}
        </div>
      ) : null}

      {/* 底部版权栏 */}
      <footer className="relative z-10 bg-[#070b16]/80 py-4 pb-20 md:pb-4">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4">
          <div className="flex items-center gap-4">
            <a href="#" aria-label="微信" onClick={(e) => e.preventDefault()} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:border-green-400/40 hover:text-green-400">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.295.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.601-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .246-.11.246-.247 0-.06-.023-.12-.04-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zm-3.18 3.199c.54 0 .977.445.977.993a.99.99 0 0 1-.977.995.99.99 0 0 1-.977-.995c0-.548.437-.993.977-.993zm4.864 0c.54 0 .977.445.977.993a.99.99 0 0 1-.977.995.99.99 0 0 1-.977-.995c0-.548.437-.993.977-.993z"/></svg>
            </a>
            <a href="#" aria-label="抖音" onClick={(e) => e.preventDefault()} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:border-slate-300/40 hover:text-white">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>
            </a>
            <a href="#" aria-label="Telegram" onClick={(e) => e.preventDefault()} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:border-sky-400/40 hover:text-sky-400">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </a>
          </div>
          <div className="text-xs text-slate-500">Version 1.1 &nbsp;|&nbsp; © 2026 Yunzhidao Ai. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}

function MobileDraftTabs(props: {
  drafts: DraftItem[];
  selectedDraft: DraftItem | null;
  onSelect: (id: string) => void;
  onCopyScript: (text: string) => void;
  onCopySubtitle: (text: string) => void;
}) {
  const { drafts, selectedDraft, onSelect, onCopyScript, onCopySubtitle } = props;
  const [tab, setTab] = useState<"versions" | "content">("versions");
  return (
    <div>
      <div className="seg-ctrl">
        <button className={classNames("seg-ctrl-item", tab === "versions" && "seg-ctrl-item-active")} onClick={() => setTab("versions")}>版本</button>
        <button className={classNames("seg-ctrl-item", tab === "content" && "seg-ctrl-item-active")} onClick={() => setTab("content")}>内容</button>
      </div>
      {tab === "versions" ? (
        <div className="mt-3 grid gap-2">
          {drafts.map((item, index) => (
            <button
              key={item.id}
              className={classNames("result-card-v2", item.id === selectedDraft?.id && "result-card-v2-active")}
              onClick={() => { onSelect(item.id); setTab("content"); }}
            >
              <div className="text-sm font-semibold text-white">V{index + 1} · {item.versionName}</div>
              <div className="mt-1 text-xs text-slate-400">{item.title}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {selectedDraft ? (
            <>
              <ContentPanel
                title={selectedDraft.title}
                subtitle="完整文案"
                content={selectedDraft.script}
                copyLabel="复制文案"
                onCopy={() => onCopyScript(selectedDraft.script)}
              />
              <ContentPanel
                title={selectedDraft.coverLine}
                subtitle="字幕稿"
                content={selectedDraft.subtitleScript}
                copyLabel="复制字幕稿"
                onCopy={() => onCopySubtitle(selectedDraft.subtitleScript)}
              />
            </>
          ) : (
            <EmptyBlock text="先在「版本」tab 选一个版本。" />
          )}
        </div>
      )}
    </div>
  );
}

function Landing({ onSelectMode }: { onSelectMode: (mode: WorkbenchMode) => void }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] max-w-2xl flex-col justify-center px-4">
      {/* 标题区 */}
      <div className="text-center">
        {/* 科技感装饰点 */}
        <div className="mb-6 flex justify-center gap-1.5">
          <span className="h-1 w-8 rounded-full bg-gradient-to-r from-cyan-400 to-transparent" />
          <span className="h-1 w-1 rounded-full bg-cyan-400/60" />
          <span className="h-1 w-1 rounded-full bg-purple-400/60" />
          <span className="h-1 w-8 rounded-full bg-gradient-to-l from-purple-400 to-transparent" />
        </div>
        <h1 className="text-4xl font-bold leading-tight text-white md:text-6xl">
          爆款文案
          <br />
          <span className="bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] bg-clip-text text-transparent">工作生成台</span>
        </h1>
        <p className="mt-4 text-sm text-slate-400">云智道团队专用短视频内容生成器</p>
        {/* 分割线 */}
        <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* 功能卡片 */}
      <div className="mt-8 grid gap-2.5">
        <button
          type="button"
          onClick={() => onSelectMode("compose")}
          className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-left transition hover:border-cyan-400/40 hover:bg-white/[0.09] hover:shadow-[0_0_20px_rgba(0,212,255,0.08)]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-400 transition group-hover:bg-cyan-400/20">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">文案组合</div>
            <div className="mt-0.5 text-xs text-slate-400">自动匹配 · 逐块替换 · 分块去重</div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("rewrite")}
          className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-left transition hover:border-purple-400/40 hover:bg-white/[0.09] hover:shadow-[0_0_20px_rgba(139,92,246,0.08)]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-400/10 text-purple-400 transition group-hover:bg-purple-400/20">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">爆款仿写</div>
            <div className="mt-0.5 text-xs text-slate-400">拆文案 · 改开头 · 出成稿</div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("original")}
          className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-left transition hover:border-amber-400/40 hover:bg-white/[0.09] hover:shadow-[0_0_20px_rgba(245,158,11,0.08)]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-400 transition group-hover:bg-amber-400/20">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">热点 / 主题原创</div>
            <div className="mt-0.5 text-xs text-slate-400">抓热点 · 组结构 · 生成稿</div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>

        <button
          type="button"
          onClick={() => onSelectMode("video")}
          className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-left transition hover:border-blue-400/40 hover:bg-white/[0.09] hover:shadow-[0_0_20px_rgba(59,130,246,0.08)]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-blue-400 transition group-hover:bg-blue-400/20">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">视频分析</div>
            <div className="mt-0.5 text-xs text-slate-400">上传视频 · 提取脚本 · 结构分析</div>
          </div>
          <svg className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* 底部小字说明 */}
      <div className="mt-8 flex items-center justify-center gap-4 text-[11px] text-slate-600">
        <span>皮 · 骨 · 肉 · 收口</span>
        <span className="h-3 w-px bg-white/10" />
        <span>全链路装配</span>
        <span className="h-3 w-px bg-white/10" />
        <span>一键出稿</span>
      </div>
    </div>
  );
}

function GlassCard({ children }: { children: ReactNode }) {
  return <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">{children}</div>;
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

function StepFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full [&>.ghost-btn]:w-full sm:[&>.brand-btn]:w-auto sm:[&>.ghost-btn]:w-auto">
      {children}
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




