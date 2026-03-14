import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useHotspotCenter } from "./hooks/useHotspotCenter";
import ParticleBackground from "./components/ParticleBackground";
import ComposeWorkbench from "./components/ComposeWorkbench";
import HotspotCenterPanel from "./components/HotspotCenterPanel";
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
  const [isWorkbenchIntroCollapsed, setIsWorkbenchIntroCollapsed] = useState(true);
  const [composeWorkbenchNonce, setComposeWorkbenchNonce] = useState(0);
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
    setIsWorkbenchIntroCollapsed(true);
  }, [currentWorkbenchMode]);
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
        ) : currentWorkbenchMode === "compose" ? (
          <div className="mx-auto max-w-7xl">
            <ComposeWorkbench key={composeWorkbenchNonce} settings={settings} />
          </div>
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

      <div className="mx-auto mt-14 flex w-full max-w-4xl flex-col gap-5">
        <LandingModeCard
          title="文案组合"
          subtitle="自动匹配 · 逐块替换 · 分块去重"
          onClick={() => onSelectMode("compose")}
          icon={
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          }
        />
        <div className="grid w-full gap-5 md:grid-cols-2">
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

function LegacyLanding({ onSelectMode }: { onSelectMode: (mode: WorkbenchMode) => void }) {
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




