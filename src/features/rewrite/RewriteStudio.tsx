import { useEffect, useRef, useState } from "react";
import type { ApiSettings } from "../../types";
import { useStoredState } from "../../lib/workbenchHelpers";
import { STORAGE_KEYS } from "../../lib/workbenchStorage";
import { analyzeRewriteCopy, refineRewriteCopy } from "./api";
import { REWRITE_PROVIDER_LABEL, REWRITE_PROVIDER_MODEL } from "./constants";
import RewriteAnalysisGrid from "./components/RewriteAnalysisGrid";
import RewriteHistoryPanel from "./components/RewriteHistoryPanel";
import RewriteInputForm from "./components/RewriteInputForm";
import RewriteScriptResults from "./components/RewriteScriptResults";
import type { RewriteCopyResult, RewriteFormState, RewriteHistoryItem } from "./types";
import { copyText, generateRewriteId } from "./utils";

const TEXT = {
  emptySource: "\u8bf7\u5148\u7c98\u8d34\u9700\u8981\u5206\u6790\u7684\u539f\u59cb\u6587\u6848\u3002",
  analyzing: "\u6b63\u5728\u901a\u8fc7 ",
  analyzingTail: " \u5206\u6790\u5e76\u751f\u6210\u4eff\u5199\u7a3f...",
  analyzeDone: "\u5206\u6790\u4e0e\u4eff\u5199\u751f\u6210\u5df2\u5b8c\u6210\u3002",
  analyzeFailedFallback: "\u5206\u6790\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  analyzeCancelled: "\u672c\u6b21\u5206\u6790\u5df2\u53d6\u6d88\u3002",
  analyzeFailedPrefix: "\u5206\u6790\u5931\u8d25\uff1a",
  generatingMore: "\u6b63\u5728\u751f\u6210\u66f4\u591a\u4eff\u5199\u7a3f...",
  refining: "\u6b63\u5728\u6839\u636e\u4f60\u7684\u8981\u6c42\u4f18\u5316\u4eff\u5199\u7a3f...",
  generateDone: "\u66f4\u591a\u4eff\u5199\u7a3f\u5df2\u751f\u6210\u3002",
  refineDone: "\u4eff\u5199\u7a3f\u5df2\u4f18\u5316\u5b8c\u6210\u3002",
  refineFailedFallback: "\u4f18\u5316\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
  generateFailedPrefix: "\u751f\u6210\u5931\u8d25\uff1a",
  refineFailedPrefix: "\u4f18\u5316\u5931\u8d25\uff1a",
  copyDone: "\u811a\u672c\u5df2\u590d\u5236\u3002",
  copyFailed: "\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u590d\u5236\u3002",
  historyLoaded: "\u5df2\u52a0\u8f7d\u5386\u53f2\u4eff\u5199\u8bb0\u5f55\u3002",
  title: "\u7206\u6b3e\u4eff\u5199\u5de5\u4f5c\u53f0",
  intro:
    "\u8fd9\u4e2a\u6a21\u5757\u4fdd\u7559\u51e1\u54e5\u7684\u5206\u6790\u903b\u8f91\uff0c\u5f53\u524d\u4eff\u5199\u7edf\u4e00\u8d70 ",
  introTail:
    "\uff08",
  introTail2:
    "\uff09\uff0c\u53ea\u505a\u5b57\u6570\u63a5\u8fd1\u3001\u7ed3\u6784\u4e00\u81f4\u3001\u53bb\u91cd\u6539\u5199\uff0c\u4e0d\u6539\u547d\u9898\u3002",
  history: "\u5386\u53f2\u8bb0\u5f55",
  clearHistory: "\u786e\u5b9a\u6e05\u7a7a\u6240\u6709\u4eff\u5199\u5386\u53f2\u8bb0\u5f55\u5417\uff1f",
  generateMoreInstruction:
    "\u8bf7\u518d\u751f\u6210 3 \u6761\u8868\u8fbe\u4e0d\u540c\u7684\u4eff\u5199\u7a3f\uff0c\u4f46\u4ecd\u7136\u4fdd\u6301\u5b57\u6570\u63a5\u8fd1\u3001\u7ed3\u6784\u4e00\u81f4\u3001\u53ea\u505a\u53bb\u91cd\u6539\u5199\u3002",
} as const;

interface RewriteStudioProps {
  settings: ApiSettings;
  initialOriginalCopy: string;
  defaultUserBackground: string;
  onOriginalCopyChange: (value: string) => void;
  showNotice: (tone: "success" | "warning" | "info", text: string) => void;
}

const DEFAULT_FORM: RewriteFormState = {
  originalCopy: "",
  userBackground: "",
  industry: "",
  needs: "",
  refineInstruction: "",
};

export default function RewriteStudio(props: RewriteStudioProps) {
  const [form, setForm] = useStoredState<RewriteFormState>(STORAGE_KEYS.rewriteForm, DEFAULT_FORM);
  const [result, setResult] = useStoredState<RewriteCopyResult | null>(STORAGE_KEYS.rewriteResult, null);
  const [history, setHistory] = useStoredState<RewriteHistoryItem[]>(STORAGE_KEYS.rewriteHistory, []);
  const [showHistory, setShowHistory] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);

  const requestAbortRef = useRef<AbortController | null>(null);
  const lastImportedCopyRef = useRef("");

  useEffect(() => {
    const imported = props.initialOriginalCopy.trim();
    if (!imported || imported === lastImportedCopyRef.current) return;
    lastImportedCopyRef.current = imported;
    setForm((prev) => ({
      ...prev,
      originalCopy: imported,
      refineInstruction: "",
    }));
    setResult(null);
  }, [props.initialOriginalCopy, setForm, setResult]);

  useEffect(() => {
    const background = props.defaultUserBackground.trim();
    if (!background) return;
    setForm((prev) => (prev.userBackground.trim() ? prev : { ...prev, userBackground: background }));
  }, [props.defaultUserBackground, setForm]);

  function updateForm<K extends keyof RewriteFormState>(key: K, value: RewriteFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "originalCopy") {
      props.onOriginalCopyChange(String(value || ""));
    }
  }

  function cancelCurrentRequest() {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
  }

  function pushHistory(nextResult: RewriteCopyResult) {
    const historyItem: RewriteHistoryItem = {
      id: generateRewriteId(),
      createdAt: new Date().toISOString(),
      originalCopy: form.originalCopy.trim(),
      userBackground: form.userBackground.trim(),
      industry: form.industry.trim(),
      needs: form.needs.trim(),
      result: nextResult,
    };
    setHistory((prev) => [historyItem, ...prev].slice(0, 20));
  }

  async function handleAnalyze() {
    if (!form.originalCopy.trim()) {
      props.showNotice("warning", TEXT.emptySource);
      return;
    }

    setIsAnalyzing(true);
    props.showNotice("info", `${TEXT.analyzing}${REWRITE_PROVIDER_LABEL}${TEXT.analyzingTail}`);

    const controller = new AbortController();
    requestAbortRef.current = controller;

    try {
      const nextResult = await analyzeRewriteCopy(
        props.settings,
        {
          originalCopy: form.originalCopy.trim(),
          userBackground: form.userBackground.trim(),
          industry: form.industry.trim(),
          needs: form.needs.trim(),
        },
        controller.signal,
      );
      const normalizedResult = {
        ...nextResult,
        originalCopy: nextResult.originalCopy || form.originalCopy.trim(),
      };
      setResult(normalizedResult);
      setForm((prev) => ({ ...prev, refineInstruction: "" }));
      pushHistory(normalizedResult);
      props.showNotice("success", TEXT.analyzeDone);
    } catch (error) {
      const message = error instanceof Error ? error.message : TEXT.analyzeFailedFallback;
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (aborted || message.includes("aborted") || message.includes("AbortError")) {
        props.showNotice("info", TEXT.analyzeCancelled);
      } else {
        props.showNotice("warning", `${TEXT.analyzeFailedPrefix}${message}`);
      }
    } finally {
      setIsAnalyzing(false);
      requestAbortRef.current = null;
    }
  }

  async function handleRefine(userInstruction?: string) {
    const instruction = (userInstruction ?? form.refineInstruction).trim();
    if (!result || !instruction || isRefining) {
      return;
    }

    setIsRefining(true);
    props.showNotice("info", userInstruction ? TEXT.generatingMore : TEXT.refining);

    const controller = new AbortController();
    requestAbortRef.current = controller;

    try {
      const refined = await refineRewriteCopy(
        props.settings,
        {
          currentResult: result,
          userInstruction: instruction,
          userBackground: form.userBackground.trim(),
        },
        controller.signal,
      );
      setResult({
        ...result,
        generatedScripts: userInstruction ? [...result.generatedScripts, ...refined.generatedScripts] : refined.generatedScripts,
      });
      if (!userInstruction) {
        setForm((prev) => ({ ...prev, refineInstruction: "" }));
      }
      props.showNotice("success", userInstruction ? TEXT.generateDone : TEXT.refineDone);
    } catch (error) {
      const message = error instanceof Error ? error.message : TEXT.refineFailedFallback;
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!(aborted || message.includes("aborted") || message.includes("AbortError"))) {
        props.showNotice("warning", userInstruction ? `${TEXT.generateFailedPrefix}${message}` : `${TEXT.refineFailedPrefix}${message}`);
      }
    } finally {
      setIsRefining(false);
      requestAbortRef.current = null;
    }
  }

  async function handleCopyScript(text: string) {
    try {
      await copyText(text);
      props.showNotice("success", TEXT.copyDone);
    } catch {
      props.showNotice("warning", TEXT.copyFailed);
    }
  }

  function handleReset() {
    if (isAnalyzing || isRefining) {
      cancelCurrentRequest();
      setIsAnalyzing(false);
      setIsRefining(false);
    }
    setResult(null);
    setForm((prev) => ({ ...prev, refineInstruction: "" }));
  }

  function handleLoadHistory(item: RewriteHistoryItem) {
    setForm({
      originalCopy: item.originalCopy,
      userBackground: item.userBackground,
      industry: item.industry,
      needs: item.needs,
      refineInstruction: "",
    });
    props.onOriginalCopyChange(item.originalCopy);
    setResult(item.result);
    setShowHistory(false);
    props.showNotice("success", TEXT.historyLoaded);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{TEXT.title}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {TEXT.intro}
            {REWRITE_PROVIDER_LABEL}
            {TEXT.introTail}
            {REWRITE_PROVIDER_MODEL}
            {TEXT.introTail2}
          </p>
        </div>
        <button
          onClick={() => setShowHistory((value) => !value)}
          className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-400 transition-all hover:border-white/20 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {`${TEXT.history}${history.length > 0 ? ` (${history.length})` : ""}`}
        </button>
      </div>

      {showHistory ? (
        <RewriteHistoryPanel
          history={history}
          onLoad={handleLoadHistory}
          onDelete={(id) => setHistory((prev) => prev.filter((item) => item.id !== id))}
          onClear={() => {
            if (window.confirm(TEXT.clearHistory)) {
              setHistory([]);
            }
          }}
        />
      ) : null}

      {!result ? (
        <RewriteInputForm
          originalCopy={form.originalCopy}
          userBackground={form.userBackground}
          industry={form.industry}
          needs={form.needs}
          isAnalyzing={isAnalyzing}
          onOriginalCopyChange={(value) => updateForm("originalCopy", value)}
          onUserBackgroundChange={(value) => updateForm("userBackground", value)}
          onIndustryChange={(value) => updateForm("industry", value)}
          onNeedsChange={(value) => updateForm("needs", value)}
          onAnalyze={() => void handleAnalyze()}
          onCancel={cancelCurrentRequest}
        />
      ) : (
        <div className="space-y-8">
          <RewriteAnalysisGrid result={result} />
          <RewriteScriptResults
            scripts={result.generatedScripts}
            refineInstruction={form.refineInstruction}
            isAnalyzing={isAnalyzing}
            isRefining={isRefining}
            onRegenerate={() => void handleAnalyze()}
            onGenerateMore={() =>
              void handleRefine(TEXT.generateMoreInstruction)
            }
            onRefineInstructionChange={(value) => updateForm("refineInstruction", value)}
            onRefine={() => void handleRefine()}
            onReset={handleReset}
            onCopyScript={(text) => void handleCopyScript(text)}
          />
        </div>
      )}
    </div>
  );
}
