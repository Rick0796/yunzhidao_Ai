import { useEffect, useRef, useState } from "react";
import type { ApiSettings } from "../../types";
import { useStoredState } from "../../lib/workbenchHelpers";
import { STORAGE_KEYS } from "../../lib/workbenchStorage";
import { analyzeRewriteCopy, refineRewriteCopy } from "./api";
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
      props.showNotice("warning", "请先粘贴需要分析的原始文案。");
      return;
    }

    setIsAnalyzing(true);
    props.showNotice("info", "正在深度拆解并生成仿写稿...");

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
      props.showNotice("success", "分析与生成成功！");
    } catch (error) {
      const message = error instanceof Error ? error.message : "分析失败，请重试。";
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (aborted || message.includes("aborted") || message.includes("AbortError")) {
        props.showNotice("info", "分析已取消");
      } else {
        props.showNotice("warning", `分析失败：${message}`);
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
    props.showNotice("info", userInstruction ? "正在生成更多爆款仿写稿..." : "正在根据要求优化仿写稿...");

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
      props.showNotice("success", userInstruction ? "更多仿写稿生成成功！" : "仿写稿优化成功！");
    } catch (error) {
      const message = error instanceof Error ? error.message : "优化失败，请重试。";
      const aborted = error instanceof DOMException && error.name === "AbortError";
      if (!(aborted || message.includes("aborted") || message.includes("AbortError"))) {
        props.showNotice("warning", userInstruction ? `生成失败：${message}` : `优化失败：${message}`);
      }
    } finally {
      setIsRefining(false);
      requestAbortRef.current = null;
    }
  }

  async function handleCopyScript(text: string) {
    try {
      await copyText(text);
      props.showNotice("success", "脚本内容已复制");
    } catch {
      props.showNotice("warning", "复制失败，请手动复制。");
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
    props.showNotice("success", "已加载历史仿写记录。");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">爆款仿写工作台</h2>
          <p className="mt-1 text-sm text-slate-400">沿用凡哥的深度拆解逻辑，直接通过 Gemini 官方接口做仿写，强制保持字数接近和结构一致。</p>
        </div>
        <button
          onClick={() => setShowHistory((value) => !value)}
          className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-400 transition-all hover:border-white/20 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {`历史记录${history.length > 0 ? ` (${history.length})` : ""}`}
        </button>
      </div>

      {showHistory ? (
        <RewriteHistoryPanel
          history={history}
          onLoad={handleLoadHistory}
          onDelete={(id) => setHistory((prev) => prev.filter((item) => item.id !== id))}
          onClear={() => {
            if (window.confirm("确定清空所有仿写历史记录？")) {
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
            onGenerateMore={() => void handleRefine("请再生成 3 条不同表达、但仍保持字数相近和爆款结构一致的仿写稿")}
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
