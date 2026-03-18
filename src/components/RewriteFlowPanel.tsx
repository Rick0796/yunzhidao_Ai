import type { ReactNode } from "react";
import type { DraftItem, ModuleMeta, SourceStructureItem } from "../types";

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
  onCopy: (text: string, successText: string) => void;
  goStep: (step: WizardStep) => void;
}

function cx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">{text}</div>;
}

function MetaHint({ meta }: { meta: ModuleMeta | null }) {
  if (!meta?.message) return null;
  return <div className={cx("mt-3 rounded-2xl border px-4 py-3 text-xs leading-6", meta.source === "api" ? "border-cyan-400/15 bg-cyan-400/8 text-cyan-100" : "border-amber-400/20 bg-amber-400/10 text-amber-100")}>{meta.message}</div>;
}

function SourceCard(props: { item: SourceStructureItem; index: number; onCopy: (text: string) => void }) {
  const { item, index, onCopy } = props;
  return (
    <div className="rounded-3xl border border-white/10 bg-[#09101f]/78 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">{`?? ${index}`}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.label}</span>
            <span className="text-xs text-slate-400">{item.hint}</span>
          </div>
        </div>
        <button className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300 hover:border-cyan-400/25 hover:text-white" onClick={() => onCopy(item.text)}>??</button>
      </div>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">{item.text}</div>
    </div>
  );
}

function DraftContent(props: { title: string; subtitle: string; content: string; copyLabel: string; onCopy: () => void }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#09101f]/80 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{props.subtitle}</div>
          <div className="mt-3 text-base font-semibold text-white">{props.title}</div>
        </div>
        <button className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/25 hover:text-white" onClick={props.onCopy}>{props.copyLabel}</button>
      </div>
      <div className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-8 text-slate-200">{props.content}</div>
    </div>
  );
}

export default function RewriteFlowPanel(props: RewriteFlowPanelProps) {
  const {
    wizardStep, canGoStep2, canGoStep3, showTaskSettings, onToggleTaskSettings, showAdvanced, onToggleAdvanced, hasTaskInput, taskInput, advancedSettings, rewriteSourceStructure, isRewriteStructureCollapsed, onToggleRewriteStructure, drafts, selectedDraftId, selectedDraft, onSelectDraft, isGeneratingDrafts, moduleMeta, onGenerateOne, onGenerateMore, onCopy, goStep,
  } = props;

  if (wizardStep === 1) {
    return (
      <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">
        <div className="space-y-3">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-4 text-sm leading-7 text-cyan-50">??????????????????????????????????</div>
          <div className={cx("rounded-2xl border-2 transition", hasTaskInput ? "border-white/10 bg-white/3" : "border-amber-400/50 bg-amber-400/5")}>
            <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={onToggleTaskSettings}>
              <span className="text-sm font-semibold text-white">????</span>
              <div className="flex items-center gap-2">
                {hasTaskInput ? <span className="text-xs text-emerald-400">? ???</span> : <span className="animate-pulse text-xs font-medium text-amber-300">? ??</span>}
              </div>
            </button>
            {showTaskSettings ? <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-3">{taskInput}</div> : null}
          </div>
          <div className="mt-3 rounded-2xl border border-white/8 bg-white/3">
            <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={onToggleAdvanced}>
              <span className="text-sm font-semibold text-white">????</span>
              <span className="text-xs text-slate-400">???? / API ??</span>
            </button>
            {showAdvanced ? <div className="border-t border-white/8 px-4 pb-4 pt-3">{advancedSettings}</div> : null}
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full sm:[&>.brand-btn]:w-auto">
          <button className="brand-btn" onClick={() => goStep(2)} disabled={!canGoStep2}>??????????</button>
        </div>
      </div>
    );
  }

  if (wizardStep === 2) {
    return (
      <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">????</div>
            <div className="mt-1 text-sm text-slate-300">??????????????</div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{`${rewriteSourceStructure.length} ?`}</div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm font-semibold text-white">?????</div>
            <button type="button" className="text-xs text-slate-400 hover:text-white transition" onClick={onToggleRewriteStructure}>{isRewriteStructureCollapsed ? "??" : "??"}</button>
          </div>
          {isRewriteStructureCollapsed ? <div className="mt-2 text-xs text-slate-500">?????????????????</div> : <div className="mt-3 grid gap-2">{rewriteSourceStructure.length === 0 ? <EmptyBlock text="???????????????????????" /> : rewriteSourceStructure.map((item, index) => <SourceCard key={item.id} item={item} index={index + 1} onCopy={(text) => onCopy(text, "????????")} />)}</div>}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full [&>.ghost-btn]:w-full sm:[&>.brand-btn]:w-auto sm:[&>.ghost-btn]:w-auto">
          <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(1)}>?????</button>
          <button className="brand-btn" onClick={() => goStep(3)} disabled={!canGoStep3}>??????</button>
        </div>
      </div>
    );
  }

  if (wizardStep === 3) {
    return (
      <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">??????</div>
            <div className="mt-1 text-sm text-slate-300">?????????????????????????</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="brand-btn" onClick={onGenerateOne} disabled={isGeneratingDrafts}>{isGeneratingDrafts ? "???..." : drafts.length > 0 ? "????1?" : "??1?"}</button>
            <button className="ghost-btn" onClick={onGenerateMore} disabled={isGeneratingDrafts}>???3?</button>
          </div>
        </div>
        <MetaHint meta={moduleMeta} />
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/4 px-4 py-4 text-sm leading-7 text-slate-300">??????????????????????????????????</div>
        <div className="mt-4 space-y-3">
          {drafts.length === 0 ? <EmptyBlock text="??? 1 ??????????????? 3 ??" /> : drafts.map((item, index) => <button key={item.id} className={cx("result-card-v2", item.id === selectedDraftId && "result-card-v2-active")} onClick={() => onSelectDraft(item.id)}><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-white">{`V${index + 1} ? ${item.versionName}`}</div><div className="mt-1 text-xs text-slate-400">{item.title}</div></div><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">??</span></div></button>)}
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full [&>.ghost-btn]:w-full sm:[&>.brand-btn]:w-auto sm:[&>.ghost-btn]:w-auto">
          <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(2)}>?????</button>
          <button className="brand-btn" onClick={() => goStep(4)} disabled={!drafts.length}>????</button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-[28px] p-4 sm:p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">??????</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 sm:px-3 sm:text-xs">{`${rewriteSourceStructure.length} ?????`}</span>
            <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 sm:px-3 sm:text-xs">{`${drafts.length} ???`}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="brand-btn" onClick={onGenerateOne} disabled={isGeneratingDrafts}>{isGeneratingDrafts ? "???..." : drafts.length > 0 ? "????1?" : "??1?"}</button>
          <button className="ghost-btn" onClick={onGenerateMore} disabled={isGeneratingDrafts}>???3?</button>
        </div>
      </div>
      <MetaHint meta={moduleMeta} />
      {drafts.length > 0 ? (
        <div className="mt-4 hidden md:grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">??</div>
            {drafts.map((item, index) => (
              <button key={item.id} className={cx("result-card-v2", item.id === selectedDraftId && "result-card-v2-active")} onClick={() => onSelectDraft(item.id)}>
                <div className="text-sm font-semibold text-white">{`V${index + 1} ? ${item.versionName}`}</div>
                <div className="mt-1 text-xs text-slate-400">{item.title}</div>
              </button>
            ))}
          </div>
          <div>
            {selectedDraft ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <DraftContent title={selectedDraft.title} subtitle="????" content={selectedDraft.script} copyLabel="????" onCopy={() => onCopy(selectedDraft.script, "????????")} />
                <DraftContent title={selectedDraft.coverLine} subtitle="???" content={selectedDraft.subtitleScript} copyLabel="?????" onCopy={() => onCopy(selectedDraft.subtitleScript, "???????")} />
              </div>
            ) : <EmptyBlock text="????????????????" />}
          </div>
        </div>
      ) : (
        <div className="mt-4"><EmptyBlock text="??? 1 ????????" /></div>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between [&>.brand-btn]:w-full [&>.ghost-btn]:w-full sm:[&>.brand-btn]:w-auto sm:[&>.ghost-btn]:w-auto">
        <button className="ghost-btn hidden md:inline-flex" onClick={() => goStep(3)}>?????</button>
      </div>
    </div>
  );
}
