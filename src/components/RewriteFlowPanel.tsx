import type { ReactNode } from "react";
import type { DraftItem, ModuleMeta, SourceStructureItem } from "../types";
import { rewriteCopy } from "../lib/rewriteCopy";
import { buildConstraintMessage, summarizeRewriteConstraints } from "../lib/rewriteConstraints";
import RewriteDraftContent from "./rewrite/RewriteDraftContent";
import RewriteEmptyBlock from "./rewrite/RewriteEmptyBlock";
import RewriteMetaHint from "./rewrite/RewriteMetaHint";
import RewriteRefineBox from "./rewrite/RewriteRefineBox";
import RewriteSourceCard from "./rewrite/RewriteSourceCard";

type WizardStep = 1 | 2 | 3 | 4;

interface RewriteFlowPanelProps {
  wizardStep: WizardStep;
  canGoStep2: boolean;
  canGoStep3: boolean;
  showTaskSettings: boolean;
  onToggleTaskSettings: () => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  hasTaskInput: boolean;
  taskInput: ReactNode;
  advancedSettings: ReactNode;
  rewriteSourceStructure: SourceStructureItem[];
  isRewriteStructureCollapsed: boolean;
  onToggleRewriteStructure: () => void;
  drafts: DraftItem[];
  selectedDraftId: string | null;
  selectedDraft: DraftItem | null;
  onSelectDraft: (id: string) => void;
  isGeneratingDrafts: boolean;
  moduleMeta: ModuleMeta | null;
  onGenerateOne: () => void;
  onGenerateMore: () => void;
  refineNote: string;
  onRefineNoteChange: (value: string) => void;
  onRefine: () => void;
  onCopy: (text: string, successText: string) => void;
  goStep: (step: WizardStep) => void;
}

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

export default function RewriteFlowPanel(props: RewriteFlowPanelProps) {
  const {
    wizardStep,
    canGoStep2,
    canGoStep3,
    showTaskSettings,
    onToggleTaskSettings,
    showAdvanced,
    onToggleAdvanced,
    hasTaskInput,
    taskInput,
    advancedSettings,
    rewriteSourceStructure,
    isRewriteStructureCollapsed,
    onToggleRewriteStructure,
    drafts,
    selectedDraftId,
    selectedDraft,
    onSelectDraft,
    isGeneratingDrafts,
    moduleMeta,
    onGenerateOne,
    onGenerateMore,
    refineNote,
    onRefineNoteChange,
    onRefine,
    onCopy,
    goStep,
  } = props;

  const sourceText = rewriteSourceStructure.map((item) => item.text).join("");
  const constraintSummary = selectedDraft ? summarizeRewriteConstraints(sourceText, selectedDraft.script) : null;
  const constraintMessage = constraintSummary ? buildConstraintMessage(constraintSummary) : "";

  if (wizardStep === 1) {
    return (
      <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">
        <div className="space-y-3">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-4 text-sm leading-7 text-cyan-50">{rewriteCopy.step1.intro}</div>
          <div className={cx("rounded-2xl border-2 transition", hasTaskInput ? "border-white/10 bg-white/3" : "border-amber-400/50 bg-amber-400/5")}>
            <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={onToggleTaskSettings}>
              <span className="text-sm font-semibold text-white">{rewriteCopy.step1.taskTitle}</span>
              <div className="flex items-center gap-2">
                {hasTaskInput ? <span className="text-xs text-emerald-400">{rewriteCopy.step1.taskReady}</span> : <span className="animate-pulse text-xs font-medium text-amber-300">{rewriteCopy.step1.taskMissing}</span>}
              </div>
            </button>
            {showTaskSettings ? <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-3">{taskInput}</div> : null}
          </div>
          <div className="mt-3 rounded-2xl border border-white/8 bg-white/3">
            <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={onToggleAdvanced}>
              <span className="text-sm font-semibold text-white">{rewriteCopy.step1.advancedTitle}</span>
              <span className="text-xs text-slate-400">{rewriteCopy.step1.advancedHint}</span>
            </button>
            {showAdvanced ? <div className="border-t border-white/8 px-4 pb-4 pt-3">{advancedSettings}</div> : null}
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full sm:[&>.brand-btn]:w-auto">
          <button className="brand-btn" onClick={() => goStep(2)} disabled={!canGoStep2}>{rewriteCopy.step1.next}</button>
        </div>
      </div>
    );
  }

  if (wizardStep === 2) {
    return (
      <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{rewriteCopy.step2.eyebrow}</div>
            <div className="mt-1 text-sm text-slate-300">{rewriteCopy.step2.subtitle}</div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{`${rewriteSourceStructure.length} ${rewriteCopy.common.structureCount}`}</div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm font-semibold text-white">{rewriteCopy.step2.structureTitle}</div>
            <button type="button" className="text-xs text-slate-400 hover:text-white transition" onClick={onToggleRewriteStructure}>{isRewriteStructureCollapsed ? rewriteCopy.step2.expand : rewriteCopy.step2.collapse}</button>
          </div>
          {isRewriteStructureCollapsed ? <div className="mt-2 text-xs text-slate-500">{rewriteCopy.step2.collapsedHint}</div> : <div className="mt-3 grid gap-2">{rewriteSourceStructure.length === 0 ? <RewriteEmptyBlock text={rewriteCopy.step2.empty} /> : rewriteSourceStructure.map((item, index) => <RewriteSourceCard key={item.id} item={item} index={index + 1} onCopy={(text) => onCopy(text, rewriteCopy.step2.copySuccess)} />)}</div>}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full [&>.ghost-btn]:w-full sm:[&>.brand-btn]:w-auto sm:[&>.ghost-btn]:w-auto">
          <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(1)}>{rewriteCopy.step2.prev}</button>
          <button className="brand-btn" onClick={() => goStep(3)} disabled={!canGoStep3}>{rewriteCopy.step2.next}</button>
        </div>
      </div>
    );
  }

  if (wizardStep === 3) {
    return (
      <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{rewriteCopy.step3.eyebrow}</div>
            <div className="mt-1 text-sm text-slate-300">{rewriteCopy.step3.subtitle}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="brand-btn" onClick={onGenerateOne} disabled={isGeneratingDrafts}>{isGeneratingDrafts ? rewriteCopy.step3.generating : drafts.length > 0 ? rewriteCopy.step3.regenerateOne : rewriteCopy.step3.generateOne}</button>
            <button className="ghost-btn" onClick={onGenerateMore} disabled={isGeneratingDrafts}>{rewriteCopy.step3.generateThree}</button>
          </div>
        </div>
        <RewriteMetaHint meta={moduleMeta} />
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-sm leading-7 text-slate-300">{rewriteCopy.step3.hint}</div>
        <div className="mt-4 space-y-3">
          {drafts.length === 0 ? <RewriteEmptyBlock text={rewriteCopy.step3.empty} /> : drafts.map((item, index) => <button key={item.id} className={cx("result-card-v2", item.id === selectedDraftId && "result-card-v2-active")} onClick={() => onSelectDraft(item.id)}><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-white">{`V${index + 1} · ${item.versionName}`}</div><div className="mt-1 text-xs text-slate-400">{item.title}</div></div><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{rewriteCopy.step3.itemBadge}</span></div></button>)}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full [&>.ghost-btn]:w-full sm:[&>.brand-btn]:w-auto sm:[&>.ghost-btn]:w-auto">
          <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(2)}>{rewriteCopy.step3.prev}</button>
          <button className="brand-btn" onClick={() => goStep(4)} disabled={!drafts.length}>{rewriteCopy.step3.next}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{rewriteCopy.step4.eyebrow}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 sm:px-3 sm:text-xs">{`${rewriteSourceStructure.length} ${rewriteCopy.common.structureCount}`}</span>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 sm:px-3 sm:text-xs">{`${drafts.length} ${rewriteCopy.common.draftCount}`}</span>
            {constraintMessage ? (
              <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 sm:px-3 sm:text-xs">{constraintMessage}</span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="brand-btn" onClick={onGenerateOne} disabled={isGeneratingDrafts}>{isGeneratingDrafts ? rewriteCopy.step4.generating : drafts.length > 0 ? rewriteCopy.step4.regenerateOne : rewriteCopy.step4.generateOne}</button>
          <button className="ghost-btn" onClick={onGenerateMore} disabled={isGeneratingDrafts}>{rewriteCopy.step4.generateThree}</button>
        </div>
      </div>
      <RewriteMetaHint meta={moduleMeta} />
      {drafts.length > 0 ? (
        <div className="mt-4 hidden md:grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">{rewriteCopy.step4.listTitle}</div>
            {drafts.map((item, index) => (
              <button key={item.id} className={cx("result-card-v2", item.id === selectedDraftId && "result-card-v2-active")} onClick={() => onSelectDraft(item.id)}>
                <div className="text-sm font-semibold text-white">{`V${index + 1} · ${item.versionName}`}</div>
                <div className="mt-1 text-xs text-slate-400">{item.title}</div>
              </button>
            ))}
          </div>
          <div>
            {selectedDraft ? (
              <div className="grid gap-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <RewriteDraftContent title={selectedDraft.title} subtitle={rewriteCopy.step4.originalTitle} content={selectedDraft.script} copyLabel={rewriteCopy.step4.copyScript} onCopy={() => onCopy(selectedDraft.script, rewriteCopy.step4.copyScriptSuccess)} />
                  <RewriteDraftContent title={selectedDraft.coverLine} subtitle={rewriteCopy.step4.subtitleTitle} content={selectedDraft.subtitleScript} copyLabel={rewriteCopy.step4.copySubtitle} onCopy={() => onCopy(selectedDraft.subtitleScript, rewriteCopy.step4.copySubtitleSuccess)} />
                </div>
                <RewriteRefineBox value={refineNote} onChange={onRefineNoteChange} onRefine={onRefine} isBusy={isGeneratingDrafts} />
              </div>
            ) : <RewriteEmptyBlock text={rewriteCopy.step4.empty} />}
          </div>
        </div>
      ) : (
        <div className="mt-4"><RewriteEmptyBlock text={rewriteCopy.step4.empty} /></div>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full [&>.ghost-btn]:w-full sm:[&>.brand-btn]:w-auto sm:[&>.ghost-btn]:w-auto">
        <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(3)}>{rewriteCopy.step4.back}</button>
      </div>
    </div>
  );
}
