import type { ReactNode } from "react";
import type { DraftItem, ModuleMeta, SourceStructureItem } from "../types";
import RewriteFlowPanel from "./RewriteFlowPanel";

export default function RewriteFlowContainer(props: {
  wizardStep: 1 | 2 | 3 | 4;
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
  goStep: (step: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <RewriteFlowPanel
      wizardStep={props.wizardStep}
      canGoStep2={props.canGoStep2}
      canGoStep3={props.canGoStep3}
      showTaskSettings={props.showTaskSettings}
      onToggleTaskSettings={props.onToggleTaskSettings}
      showAdvanced={props.showAdvanced}
      onToggleAdvanced={props.onToggleAdvanced}
      hasTaskInput={props.hasTaskInput}
      taskInput={props.taskInput}
      advancedSettings={props.advancedSettings}
      rewriteSourceStructure={props.rewriteSourceStructure}
      isRewriteStructureCollapsed={props.isRewriteStructureCollapsed}
      onToggleRewriteStructure={props.onToggleRewriteStructure}
      drafts={props.drafts}
      selectedDraftId={props.selectedDraftId}
      selectedDraft={props.selectedDraft}
      onSelectDraft={props.onSelectDraft}
      isGeneratingDrafts={props.isGeneratingDrafts}
      moduleMeta={props.moduleMeta}
      onGenerateOne={props.onGenerateOne}
      onGenerateMore={props.onGenerateMore}
      refineNote={props.refineNote}
      onRefineNoteChange={props.onRefineNoteChange}
      onRefine={props.onRefine}
      onCopy={props.onCopy}
      goStep={props.goStep}
    />
  );
}
