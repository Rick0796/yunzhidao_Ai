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
      props.showNotice("warning", "Paste the source copy before running rewrite.");
      return;
    }

    setIsAnalyzing(true);
    props.showNotice("info", `Analyzing with ${REWRITE_PROVIDER_LABEL} and generating rewrite scripts...`);

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
      props.showNotice("success", "Analysis and rewrite generation completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Analysis failed. Please retry.";
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (aborted || message.includes("aborted") || message.includes("AbortError")) {
        props.showNotice("info", "The current analysis request was cancelled.");
      } else {
        props.showNotice("warning", `Analysis failed: ${message}`);
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
    props.showNotice("info", userInstruction ? "Generating more rewrite scripts..." : "Refining the current rewrite scripts...");

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
      props.showNotice("success", userInstruction ? "More rewrite scripts generated." : "Rewrite scripts refined.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refine failed. Please retry.";
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!(aborted || message.includes("aborted") || message.includes("AbortError"))) {
        props.showNotice("warning", userInstruction ? `Generation failed: ${message}` : `Refine failed: ${message}`);
      }
    } finally {
      setIsRefining(false);
      requestAbortRef.current = null;
    }
  }

  async function handleCopyScript(text: string) {
    try {
      await copyText(text);
      props.showNotice("success", "Script copied.");
    } catch {
      props.showNotice("warning", "Copy failed. Please copy manually.");
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
    props.showNotice("success", "History item loaded.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Viral Rewrite Studio</h2>
          <p className="mt-1 text-sm text-slate-400">
            This module keeps the Fange-style analysis flow, but the rewrite stage now runs only on {REWRITE_PROVIDER_LABEL} (
            {REWRITE_PROVIDER_MODEL}). It rewrites for deduplication only: similar length, same structure, no topic drift.
          </p>
        </div>
        <button
          onClick={() => setShowHistory((value) => !value)}
          className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-400 transition-all hover:border-white/20 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {`History${history.length > 0 ? ` (${history.length})` : ""}`}
        </button>
      </div>

      {showHistory ? (
        <RewriteHistoryPanel
          history={history}
          onLoad={handleLoadHistory}
          onDelete={(id) => setHistory((prev) => prev.filter((item) => item.id !== id))}
          onClear={() => {
            if (window.confirm("Clear all rewrite history?")) {
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
              void handleRefine(
                "Generate 3 more rewrites with different wording, but keep the length close, keep the structure locked, and only rewrite for deduplication.",
              )
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
