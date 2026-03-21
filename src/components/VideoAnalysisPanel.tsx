import { useCallback, useRef, useState } from "react";
import type { ApiSettings, SoraPrompt, VideoAnalysisMode, VideoAnalysisResult, VideoHistoryItem } from "../types";
import { analyzeVideoFile, generateSoraPrompts, generateViralCopies } from "../lib/videoAnalysis";
import { useStoredState } from "../lib/workbenchHelpers";
import { STORAGE_KEYS } from "../lib/workbenchStorage";

interface VideoAnalysisPanelProps {
  settings: ApiSettings;
  onImportToRewrite: (script: string) => void;
  showNotice: (tone: "success" | "warning" | "info", text: string) => void;
}

type PanelState = "idle" | "ready" | "analyzing" | "result" | "error";

const STRUCTURE_ITEMS: Array<{ key: keyof VideoAnalysisResult["videoStructure"]; label: string; num: number }> = [
  { key: "coreProposition", label: "核心命题", num: 1 },
  { key: "openingType", label: "开头类型", num: 2 },
  { key: "conflictStructure", label: "核心冲突", num: 3 },
  { key: "progressionLogic", label: "推进结构", num: 4 },
  { key: "psychologicalHook", label: "中段钩子", num: 5 },
  { key: "climaxSentence", label: "高潮金句", num: 6 },
  { key: "languageFeatures", label: "语言风格 DNA", num: 7 },
  { key: "emotionalCurve", label: "情绪曲线", num: 8 },
];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fallbackCopy(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export default function VideoAnalysisPanel({ settings, onImportToRewrite, showNotice }: VideoAnalysisPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<VideoAnalysisMode>("FAST");
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useStoredState<VideoHistoryItem[]>(STORAGE_KEYS.videoHistory, []);
  const [showHistory, setShowHistory] = useState(false);
  const [soraPrompts, setSoraPrompts] = useState<SoraPrompt[]>([]);
  const [isGeneratingSora, setIsGeneratingSora] = useState(false);
  const [viralCopies, setViralCopies] = useState<string[]>([]);
  const [isGeneratingViral, setIsGeneratingViral] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.type.startsWith("video/")) {
      showNotice("warning", "请上传视频文件（MP4、MOV、AVI 等）。");
      return;
    }
    // 释放之前的 URL
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const newUrl = URL.createObjectURL(selectedFile);
    setVideoUrl(newUrl);
    setFile(selectedFile);
    setPanelState("ready");
    setResult(null);
    setErrorMsg("");
    setSoraPrompts([]);
    setViralCopies([]);
  }, [showNotice, videoUrl]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      handleFileSelect(dropped);
    }
  }, [handleFileSelect]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setPanelState(file ? "ready" : "idle");
    setStage("");
    setProgress(0);
  }, [file]);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPanelState("analyzing");
    setProgress(0);
    setStage("正在准备上传完整视频...");
    setSoraPrompts([]);
    setViralCopies([]);

    try {
      setProgress(28);
      setStage("正在上传完整视频到千问...");
      const analysisResult = await analyzeVideoFile(settings, file, mode, controller.signal);
      setProgress(78);
      setStage("千问正在读取完整视频并生成分析结果...");
      setProgress(100);
      setResult(analysisResult);
      setPanelState("result");
      const historyItem: VideoHistoryItem = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        fileName: file.name,
        mode,
        result: analysisResult,
      };
      setHistory((prev) => [historyItem, ...prev].slice(0, 20));
      showNotice("success", "视频分析完成！");
    } catch (error) {
      const abortLike = error instanceof DOMException && error.name === "AbortError";
      const message = error instanceof Error ? error.message : "分析失败，请重试。";
      if (abortLike || message.includes("aborted") || message.includes("AbortError")) {
        setPanelState(file ? "ready" : "idle");
      } else {
        setErrorMsg(message);
        setPanelState("error");
        showNotice("warning", `视频分析失败：${message}`);
      }
    } finally {
      setProgress(0);
      setStage("");
      abortRef.current = null;
    }
  }, [file, mode, settings, setHistory, showNotice]);

  const handleImport = useCallback(() => {
    if (!result?.script) {
      showNotice("warning", "脚本内容为空，无法导入。");
      return;
    }
    onImportToRewrite(result.script);
    showNotice("success", "已导入到爆款仿写工作台！");
  }, [result, onImportToRewrite, showNotice]);

  const handleGenerateSora = useCallback(async (count: number) => {
    if (!result || isGeneratingSora) return;
    setIsGeneratingSora(true);
    showNotice("info", `正在生成 ${count} 条 Sora 提示词...`);
    try {
      const prompts = await generateSoraPrompts(settings, {
        file,
        existingFileUri: result.fileUri,
        mimeType: result.mimeType,
        summary: result.summary,
        count,
      });
      setSoraPrompts((prev) => (count === 1 ? prompts : [...prev, ...prompts]));
      showNotice("success", "Sora 提示词生成成功！");
    } catch (error) {
      showNotice("warning", error instanceof Error ? error.message : "生成失败，请重试。");
    } finally {
      setIsGeneratingSora(false);
    }
  }, [file, result, settings, isGeneratingSora, showNotice]);

  const handleGenerateViral = useCallback(async () => {
    if (!result?.script || isGeneratingViral) return;
    setIsGeneratingViral(true);
    showNotice("info", "正在生成爆款文案...");
    try {
      const copies = await generateViralCopies(settings, result.script);
      setViralCopies(copies);
      showNotice("success", "爆款文案生成成功！");
    } catch (error) {
      showNotice("warning", error instanceof Error ? error.message : "生成失败，请重试。");
    } finally {
      setIsGeneratingViral(false);
    }
  }, [result, settings, isGeneratingViral, showNotice]);

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    showNotice("success", `${label}已复制`);
  }, [showNotice]);

  const loadHistory = useCallback((item: VideoHistoryItem) => {
    setFile(null);
    setMode(item.mode);
    setResult(item.result);
    setSoraPrompts([]);
    setViralCopies([]);
    setPanelState("result");
    setShowHistory(false);
    showNotice("info", `已加载：${item.fileName}`);
  }, [showNotice]);

  const deleteHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, [setHistory]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">视频分析工作台</h2>
          <p className="mt-0.5 text-sm text-slate-400">上传完整视频，千问会直接理解整段视频内容，再生成脚本结构、提示词和爆款文案</p>
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
        <div className="animate-fade-in space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">最近分析记录</span>
            {history.length > 0 ? (
              <button
                onClick={() => {
                  if (window.confirm("确定清空所有历史记录？")) setHistory([]);
                }}
                className="text-xs text-red-400 transition-colors hover:text-red-300"
              >
                清空
              </button>
            ) : null}
          </div>
          {history.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">暂无历史记录</p> : null}
          {history.map((item) => (
            <div
              key={item.id}
              className="group flex cursor-pointer items-center gap-2 rounded-xl border border-white/5 bg-white/5 p-3 transition-all hover:bg-white/10"
              onClick={() => loadHistory(item)}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{item.fileName}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.mode === "DEEP" ? "深度" : "极速"} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</p>
              </div>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  deleteHistory(item.id);
                }}
                className="p-1 text-slate-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {panelState === "idle" ? (
        <label
          className={`group relative flex h-56 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed transition-all ${
            isDragging ? "scale-[1.02] border-[#00D4FF] bg-[#00D4FF]/10" : "border-white/10 bg-white/5 hover:border-[#00D4FF]/50 hover:bg-white/10"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => {
              const nextFile = event.target.files?.[0];
              if (nextFile) handleFileSelect(nextFile);
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#00D4FF]/5 to-[#8B5CF6]/5 opacity-0 transition-opacity group-hover:opacity-100" />
          <div className="pointer-events-none relative z-10 flex flex-col items-center gap-3">
            <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-slate-400 transition-all group-hover:scale-110 group-hover:text-[#00D4FF] ${isDragging ? "scale-110 bg-[#00D4FF]/20 text-[#00D4FF]" : ""}`}>
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">{isDragging ? "释放以添加视频" : "拖放视频文件到这里"}</p>
              <p className="mt-1 text-sm text-slate-400">支持 MP4、MOV、AVI 格式，最大 2GB</p>
            </div>
          </div>
        </label>
      ) : null}

      {panelState === "ready" && file ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-[#00D4FF]/20 bg-[#00D4FF]/5 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#00D4FF]/20 text-[#00D4FF]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-white">{file.name}</p>
              <p className="mt-0.5 text-xs text-slate-400">请在下方选择分析模式</p>
            </div>
            <button onClick={() => { setFile(null); setPanelState("idle"); }} className="text-slate-500 transition-colors hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("FAST")}
              className={`relative overflow-hidden rounded-2xl border p-5 text-left transition-all ${mode === "FAST" ? "border-[#00D4FF] bg-[#00D4FF]/10" : "border-white/10 bg-white/5 hover:border-[#00D4FF]/50 hover:bg-[#00D4FF]/5"}`}
            >
              <div className="mb-2 flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${mode === "FAST" ? "bg-[#00D4FF]/20 text-[#00D4FF]" : "bg-white/10 text-slate-400"}`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="font-bold text-white">极速分析</h3>
              </div>
              <p className="text-xs text-slate-400">优先快速读完整视频，适合先拿到摘要、脚本和结构。</p>
            </button>
            <button
              onClick={() => setMode("DEEP")}
              className={`relative overflow-hidden rounded-2xl border p-5 text-left transition-all ${mode === "DEEP" ? "border-[#8B5CF6] bg-[#8B5CF6]/10" : "border-white/10 bg-white/5 hover:border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/5"}`}
            >
              <div className="mb-2 flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${mode === "DEEP" ? "bg-[#8B5CF6]/20 text-[#8B5CF6]" : "bg-white/10 text-slate-400"}`}>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <h3 className="font-bold text-white">深度分析</h3>
              </div>
              <p className="text-xs text-slate-400">会给出更完整的结构拆解，并补充时间轴分析。</p>
            </button>
          </div>

          <button
            onClick={handleAnalyze}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] py-4 font-bold text-black transition-all hover:shadow-[0_0_30px_rgba(0,212,255,0.3)]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            开始分析
          </button>
        </div>
      ) : null}

      {panelState === "analyzing" ? (
        <div className="flex flex-col items-center justify-center space-y-6 py-16">
          <div className="relative">
            <div className="h-20 w-20 animate-spin rounded-full border-4 border-[#00D4FF]/20 border-t-[#00D4FF]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00D4FF]/10 text-[#00D4FF]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-center">
            <p className="font-semibold text-white">{stage || "千问正在分析完整视频..."}</p>
            <p className="text-sm text-slate-500">请不要关闭页面，完整视频分析通常需要 30 到 90 秒。</p>
          </div>
          <div className="h-1.5 w-64 rounded-full bg-white/10">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <button onClick={handleCancel} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-500 transition-colors hover:text-red-400">
            取消分析
          </button>
        </div>
      ) : null}

      {panelState === "error" ? (
        <div className="space-y-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="font-semibold text-red-400">分析失败</p>
          <p className="text-xs text-red-300/70">{errorMsg}</p>
          <button onClick={() => setPanelState(file ? "ready" : "idle")} className="rounded-xl bg-white/10 px-6 py-2 text-sm text-white transition-colors hover:bg-white/20">
            重试
          </button>
        </div>
      ) : null}

      {panelState === "result" && result ? (
        <div className="space-y-6">
          <div className="flex gap-3">
          <button onClick={handleImport} className="flex-1 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] py-3 text-sm font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(0,212,255,0.3)]">
              导入到爆款仿写工作台
          </button>
            <button onClick={() => { setFile(null); setPanelState("idle"); setResult(null); setSoraPrompts([]); setViralCopies([]); }} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-400 transition-colors hover:border-white/30 hover:text-white">
              重新上传
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span className="h-3.5 w-1 rounded-full bg-[#00D4FF]" />
              核心摘要
            </p>
            <p className="text-sm leading-relaxed text-slate-200">{result.summary}</p>
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span className="h-3.5 w-1 rounded-full bg-[#8B5CF6]" />
              视频结构拆解 (8 步法)
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {STRUCTURE_ITEMS.map(({ key, label, num }) => (
                <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#00D4FF]">{num}. {label}</h4>
                  <p className="text-xs leading-relaxed text-slate-300">{result.videoStructure[key] || "-"}</p>
                </div>
              ))}
            </div>
            {result.videoStructure.viewerReward ? (
              <div className="rounded-xl border border-[#00D4FF]/20 bg-[#00D4FF]/5 p-3">
                <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#00D4FF]">观看回报</h4>
                <p className="text-xs italic text-slate-300">{result.videoStructure.viewerReward}</p>
              </div>
            ) : null}
          </div>

          {result.script ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span className="h-3.5 w-1 rounded-full bg-[#00D4FF]" />
                  视频原始脚本
                </p>
                <button onClick={() => copyToClipboard(result.script, "脚本")} className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-[#00D4FF]">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  复制
                </button>
              </div>
              <div className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/30 p-3 text-xs leading-relaxed text-slate-300">{result.script}</div>
            </div>
          ) : null}

          {result.visualFeatures.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span className="h-3.5 w-1 rounded-full bg-[#8B5CF6]" />
                视觉特征拆解
              </p>
              <div className="space-y-2">
                {result.visualFeatures.map((item, index) => (
                  <div key={index} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/5 p-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00D4FF]/10 text-xs font-bold text-[#00D4FF]">{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{item.feature}</p>
                      {item.description ? <p className="mt-0.5 text-xs text-slate-500">{item.description}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {result.timestamps?.length ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span className="h-3.5 w-1 rounded-full bg-[#8B5CF6]" />
                时间轴节点
              </p>
              {videoUrl ? (
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full"
                    style={{ maxHeight: "300px" }}
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {result.timestamps.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      if (videoRef.current && item.seconds > 0) {
                        videoRef.current.currentTime = item.seconds;
                        videoRef.current.play();
                      }
                    }}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition-all hover:border-[#00D4FF]/50 hover:bg-[#00D4FF]/10"
                  >
                    <span className="font-mono text-[#00D4FF]">{item.time}</span>
                    <span className="text-slate-400">{item.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-6 rounded-2xl border border-[#00D4FF]/20 bg-gradient-to-br from-[#00D4FF]/10 to-[#8B5CF6]/10 p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-white">
              <svg className="h-4 w-4 text-[#00D4FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              一键生成
            </p>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/70">爆款文案生成</h4>
                <button
                  onClick={handleGenerateViral}
                  disabled={isGeneratingViral || !result.script}
                  className="flex items-center gap-1 rounded border border-[#8B5CF6]/30 bg-[#8B5CF6]/20 px-3 py-1 text-[10px] text-[#8B5CF6] transition-all disabled:opacity-50 hover:bg-[#8B5CF6]/30"
                >
                  {isGeneratingViral ? <><div className="h-3 w-3 animate-spin rounded-full border border-[#8B5CF6]/30 border-t-[#8B5CF6]" />生成中...</> : viralCopies.length > 0 ? "重新生成" : "一键生成爆款文案"}
                </button>
              </div>
              {viralCopies.length > 0 ? (
                <div className="space-y-2">
                  {viralCopies.map((copy, index) => (
                    <div key={index} className="group/copy relative rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                      <button onClick={() => copyToClipboard(copy, "文案")} className="absolute right-2 top-2 p-1 opacity-0 transition-opacity hover:text-[#00D4FF] group-hover/copy:opacity-100">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      </button>
                      {copy}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/70">Sora 视频提示词</h4>
                <div className="flex gap-2">
                  {soraPrompts.length > 0 ? (
                    <>
                      <button onClick={() => handleGenerateSora(1)} disabled={isGeneratingSora} className="rounded border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-slate-300 transition-all hover:bg-white/10 disabled:opacity-50">
                        {isGeneratingSora ? "处理中..." : "重新生成"}
                      </button>
                      <button onClick={() => handleGenerateSora(3)} disabled={isGeneratingSora} className="rounded border border-[#00D4FF]/30 bg-[#00D4FF]/20 px-3 py-1 text-[10px] text-[#00D4FF] transition-all hover:bg-[#00D4FF]/30 disabled:opacity-50">
                        {isGeneratingSora ? "处理中..." : "继续生成 3 条"}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleGenerateSora(1)} disabled={isGeneratingSora || !result.summary} className="flex items-center gap-1 rounded border border-[#00D4FF]/30 bg-[#00D4FF]/20 px-3 py-1 text-[10px] text-[#00D4FF] transition-all hover:bg-[#00D4FF]/30 disabled:opacity-50">
                      {isGeneratingSora ? <><div className="h-3 w-3 animate-spin rounded-full border border-[#00D4FF]/30 border-t-[#00D4FF]" />生成中...</> : "一键生成提示词"}
                    </button>
                  )}
                </div>
              </div>
              {soraPrompts.length > 0 ? (
                <div className="space-y-2">
                  {soraPrompts.map((prompt, index) => (
                    <div key={index} className="group/sora relative space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#00D4FF]">{prompt.title}</span>
                        <button onClick={() => copyToClipboard(prompt.fullPrompt, "提示词")} className="p-1 opacity-0 transition-opacity hover:text-[#00D4FF] group-hover/sora:opacity-100">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        </button>
                      </div>
                      <p className="line-clamp-3 text-[10px] italic leading-relaxed text-slate-400 transition-all group-hover/sora:line-clamp-none">{prompt.fullPrompt}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
