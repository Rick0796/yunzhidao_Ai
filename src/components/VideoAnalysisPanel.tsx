import { useCallback, useRef, useState } from "react";
import type { ApiSettings, SoraPrompt, VideoAnalysisMode, VideoAnalysisResult, VideoHistoryItem } from "../types";
import { extractKeyFrames } from "../lib/videoFrames";
import { analyzeVideoFrames, generateSoraPrompts, generateViralCopies } from "../lib/videoAnalysis";
import { useStoredState } from "../lib/workbenchHelpers";
import { STORAGE_KEYS } from "../lib/workbenchStorage";

interface VideoAnalysisPanelProps {
  settings: ApiSettings;
  onImportToRewrite: (script: string) => void;
  showNotice: (tone: "success" | "warning" | "info", text: string) => void;
}

type PanelState = "idle" | "ready" | "analyzing" | "result" | "error";

const FRAME_COUNTS: Record<VideoAnalysisMode, number> = { FAST: 4, DEEP: 8 };

const STRUCTURE_ITEMS: Array<{ key: keyof VideoAnalysisResult["videoStructure"]; label: string; num: number }> = [
  { key: "coreProposition", label: "核心命题", num: 1 },
  { key: "openingType", label: "开头类型", num: 2 },
  { key: "conflictStructure", label: "核心冲突", num: 3 },
  { key: "progressionLogic", label: "推进结构", num: 4 },
  { key: "psychologicalHook", label: "中段钩子", num: 5 },
  { key: "climaxSentence", label: "高潮金句", num: 6 },
  { key: "languageFeatures", label: "语言风格DNA", num: 7 },
  { key: "emotionalCurve", label: "情绪曲线", num: 8 },
];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VideoAnalysisPanel({ settings, onImportToRewrite, showNotice }: VideoAnalysisPanelProps) {
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<VideoAnalysisMode>("FAST");
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [history, setHistory] = useStoredState<VideoHistoryItem[]>(STORAGE_KEYS.videoHistory, []);
  const [showHistory, setShowHistory] = useState(false);

  // Sora state
  const [soraPrompts, setSoraPrompts] = useState<SoraPrompt[]>([]);
  const [isGeneratingSora, setIsGeneratingSora] = useState(false);

  // Viral copies state
  const [viralCopies, setViralCopies] = useState<string[]>([]);
  const [isGeneratingViral, setIsGeneratingViral] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.type.startsWith("video/")) {
      showNotice("warning", "请上传视频文件（MP4、MOV、AVI 等）。");
      return;
    }
    setFile(selectedFile);
    setPanelState("ready");
    setResult(null);
    setFrames([]);
    setErrorMsg("");
    setSoraPrompts([]);
    setViralCopies([]);
  }, [showNotice]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
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
    setStage("正在提取视频关键帧...");
    setSoraPrompts([]);
    setViralCopies([]);
    try {
      const frameCount = FRAME_COUNTS[mode];
      const extracted = await extractKeyFrames(file, frameCount);
      setFrames(extracted);
      setProgress(40);
      setStage(`已提取 ${extracted.length} 帧，正在 AI 分析...`);
      const analysisResult = await analyzeVideoFrames(settings, extracted, mode, controller.signal);
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "分析失败，请重试。";
      if (msg === "视频分析已取消。") {
        setPanelState(file ? "ready" : "idle");
      } else {
        setErrorMsg(msg);
        setPanelState("error");
        showNotice("warning", `视频分析失败：${msg}`);
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
    showNotice("success", "已导入到仿写工作台！");
  }, [result, onImportToRewrite, showNotice]);

  const handleGenerateSora = useCallback(async (count: number) => {
    if (!result || isGeneratingSora) return;
    setIsGeneratingSora(true);
    showNotice("info", `正在生成 ${count} 条 Sora 提示词...`);
    try {
      const prompts = await generateSoraPrompts(settings, frames, result.summary, count);
      setSoraPrompts((prev) => count === 1 ? prompts : [...prev, ...prompts]);
      showNotice("success", "Sora 提示词生成成功！");
    } catch (e) {
      showNotice("warning", e instanceof Error ? e.message : "生成失败，请重试。");
    } finally {
      setIsGeneratingSora(false);
    }
  }, [result, frames, settings, isGeneratingSora, showNotice]);

  const handleGenerateViral = useCallback(async () => {
    if (!result?.script || isGeneratingViral) return;
    setIsGeneratingViral(true);
    showNotice("info", "正在生成爆款文案...");
    try {
      const copies = await generateViralCopies(settings, result.script);
      setViralCopies(copies);
      showNotice("success", "爆款文案生成成功！");
    } catch (e) {
      showNotice("warning", e instanceof Error ? e.message : "生成失败，请重试。");
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
    setFrames([]);
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
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">视频分析工作台</h2>
          <p className="text-sm text-slate-400 mt-0.5">上传视频，AI 提取脚本结构，一键生成 Sora 提示词与爆款文案</p>
        </div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          历史记录{history.length > 0 ? ` (${history.length})` : ""}
        </button>
      </div>

      {/* 历史记录侧边面板 */}
      {showHistory && (
        <div className="bg-white/5 rounded-2xl border border-white/10 p-4 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">最近分析记录</span>
            {history.length > 0 && (
              <button
                onClick={() => { if (window.confirm("确定清空所有历史记录？")) setHistory([]); }}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                清空
              </button>
            )}
          </div>
          {history.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">暂无历史记录</p>
          )}
          {history.map((item) => (
            <div key={item.id} className="flex items-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 group transition-all cursor-pointer" onClick={() => loadHistory(item)}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate font-medium">{item.fileName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.mode === "DEEP" ? "深度" : "极速"} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteHistory(item.id); }}
                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 上传区 — idle */}
      {panelState === "idle" && (
        <label
          className={`relative flex flex-col items-center justify-center w-full h-56 rounded-3xl border-2 border-dashed cursor-pointer transition-all group overflow-hidden
            ${isDragging ? "border-[#00D4FF] bg-[#00D4FF]/10 scale-[1.02]" : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-[#00D4FF]/50"}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#00D4FF]/5 to-[#8B5CF6]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="flex flex-col items-center gap-3 relative z-10 pointer-events-none">
            <div className={`w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-[#00D4FF] group-hover:scale-110 transition-all ${isDragging ? "scale-110 text-[#00D4FF] bg-[#00D4FF]/20" : ""}`}>
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-semibold text-lg">{isDragging ? "释放以添加视频" : "拖放视频文件到这里"}</p>
              <p className="text-slate-400 text-sm mt-1">支持 MP4、MOV、AVI 格式，最大 2GB</p>
            </div>
          </div>
        </label>
      )}

      {/* 文件已选 + 模式选择 — ready */}
      {panelState === "ready" && file && (
        <div className="space-y-4">
          {/* 文件信息 */}
          <div className="flex items-center gap-3 p-4 bg-[#00D4FF]/5 rounded-xl border border-[#00D4FF]/20">
            <div className="w-10 h-10 rounded-lg bg-[#00D4FF]/20 flex items-center justify-center flex-shrink-0 text-[#00D4FF]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{file.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">请在下方选择分析模式</p>
            </div>
            <button onClick={() => { setFile(null); setPanelState("idle"); }} className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 模式选择 */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode("FAST")}
              className={`relative overflow-hidden group p-5 rounded-2xl border text-left transition-all ${
                mode === "FAST" ? "border-[#00D4FF] bg-[#00D4FF]/10" : "border-white/10 bg-white/5 hover:border-[#00D4FF]/50 hover:bg-[#00D4FF]/5"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${ mode === "FAST" ? "bg-[#00D4FF]/20 text-[#00D4FF]" : "bg-white/10 text-slate-400"}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="font-bold text-white">极速分析</h3>
              </div>
              <p className="text-xs text-slate-400">提取 5 帧，速度快，适合大多数短视频。</p>
            </button>
            <button
              onClick={() => setMode("DEEP")}
              className={`relative overflow-hidden group p-5 rounded-2xl border text-left transition-all ${
                mode === "DEEP" ? "border-[#8B5CF6] bg-[#8B5CF6]/10" : "border-white/10 bg-white/5 hover:border-[#8B5CF6]/50 hover:bg-[#8B5CF6]/5"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${ mode === "DEEP" ? "bg-[#8B5CF6]/20 text-[#8B5CF6]" : "bg-white/10 text-slate-400"}`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <h3 className="font-bold text-white">深度分析</h3>
              </div>
              <p className="text-xs text-slate-400">提取 10 帧，更精准，包含时间轴分析。</p>
            </button>
          </div>

          <button
            onClick={handleAnalyze}
            className="w-full py-4 bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] text-black font-bold rounded-2xl hover:shadow-[0_0_30px_rgba(0,212,255,0.3)] transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            开始分析
          </button>
        </div>
      )}

      {/* 分析中 — analyzing */}
      {panelState === "analyzing" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-[#00D4FF]/20 border-t-[#00D4FF] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-[#00D4FF]/10 flex items-center justify-center text-[#00D4FF]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </div>
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-white font-semibold">{stage || "AI 深度分析中..."}</p>
            <p className="text-slate-500 text-sm">请勿关闭页面，视频分析可能需要 30-60 秒</p>
          </div>
          <div className="w-64 bg-white/10 rounded-full h-1.5">
            <div className="bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <button onClick={handleCancel} className="text-sm text-slate-500 hover:text-red-400 transition-colors px-4 py-2 border border-white/10 rounded-lg">
            取消分析
          </button>
        </div>
      )}

      {/* 错误 — error */}
      {panelState === "error" && (
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl space-y-4 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto text-red-500">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="text-red-400 font-semibold">分析失败</p>
          <p className="text-xs text-red-300/70">{errorMsg}</p>
          <button
            onClick={() => setPanelState(file ? "ready" : "idle")}
            className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* 结果 — result */}
      {panelState === "result" && result && (
        <div className="space-y-6">
          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={handleImport}
              className="flex-1 py-3 bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] text-black font-bold rounded-xl hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] transition-all text-sm"
            >
              导入到仿写工作台
            </button>
            <button
              onClick={() => { setFile(null); setPanelState("idle"); setResult(null); setSoraPrompts([]); setViralCopies([]); }}
              className="px-4 py-3 border border-white/10 hover:border-white/30 text-slate-400 hover:text-white text-sm rounded-xl transition-colors"
            >
              重新上传
            </button>
          </div>

          {/* 核心摘要 */}
          <div className="p-5 bg-white/5 rounded-2xl border border-white/10">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1 h-3.5 bg-[#00D4FF] rounded-full" />
              核心摘要
            </p>
            <p className="text-sm text-slate-200 leading-relaxed">{result.summary}</p>
          </div>

          {/* 视频结构8步法 */}
          <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1 flex items-center gap-2">
              <span className="w-1 h-3.5 bg-[#8B5CF6] rounded-full" />
              视频结构拆解 (8步法)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {STRUCTURE_ITEMS.map(({ key, label, num }) => (
                <div key={key} className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <h4 className="text-[10px] font-bold text-[#00D4FF] uppercase tracking-wider mb-1">{num}. {label}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{result.videoStructure[key] || "—"}</p>
                </div>
              ))}
            </div>
            {result.videoStructure.viewerReward && (
              <div className="p-3 bg-[#00D4FF]/5 rounded-xl border border-[#00D4FF]/20">
                <h4 className="text-[10px] font-bold text-[#00D4FF] uppercase tracking-wider mb-1">观看回报</h4>
                <p className="text-xs text-slate-300 italic">{result.videoStructure.viewerReward}</p>
              </div>
            )}
          </div>

          {/* 口播脚本 */}
          {result.script && (
            <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-[#00D4FF] rounded-full" />
                  视频原始脚本
                </p>
                <button onClick={() => copyToClipboard(result.script, "脚本")} className="text-xs text-slate-400 hover:text-[#00D4FF] transition-colors flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  复制
                </button>
              </div>
              <div className="p-3 bg-black/30 rounded-xl border border-white/5 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{result.script}</div>
            </div>
          )}

          {/* 视觉特征 */}
          {result.visualFeatures.length > 0 && (
            <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-3">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-2">
                <span className="w-1 h-3.5 bg-[#8B5CF6] rounded-full" />
                视觉特征拆解
              </p>
              <div className="space-y-2">
                {result.visualFeatures.map((vf, i) => (
                  <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/5 flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{vf.feature}</p>
                      {vf.description && <p className="text-xs text-slate-500 mt-0.5">{vf.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 时间轴（DEEP模式） */}
          {result.timestamps && result.timestamps.length > 0 && (
            <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-3">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-2">
                <span className="w-1 h-3.5 bg-[#8B5CF6] rounded-full" />
                时间轴节点
              </p>
              <div className="flex flex-wrap gap-2">
                {result.timestamps.map((ts, i) => (
                  <div key={i} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs flex items-center gap-2">
                    <span className="font-mono text-[#00D4FF]">{ts.time}</span>
                    <span className="text-slate-400">{ts.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 一键生成区 */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-[#00D4FF]/10 to-[#8B5CF6]/10 border border-[#00D4FF]/20 space-y-6">
            <p className="text-sm font-bold text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-[#00D4FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              一键生成爆款
            </p>

            {/* 爆款文案 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">爆款文案生成</h4>
                <button
                  onClick={handleGenerateViral}
                  disabled={isGeneratingViral || !result.script}
                  className="px-3 py-1 bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 text-[#8B5CF6] border border-[#8B5CF6]/30 rounded text-[10px] transition-all flex items-center gap-1 disabled:opacity-50"
                >
                  {isGeneratingViral ? (
                    <><div className="w-3 h-3 border border-[#8B5CF6]/30 border-t-[#8B5CF6] rounded-full animate-spin" />生成中...</>
                  ) : viralCopies.length > 0 ? "重新生成" : "一键生成爆款文案"}
                </button>
              </div>
              {viralCopies.length > 0 && (
                <div className="space-y-2">
                  {viralCopies.map((copy, i) => (
                    <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-slate-300 relative group/copy">
                      <button
                        onClick={() => copyToClipboard(copy, "文案")}
                        className="absolute top-2 right-2 opacity-0 group-hover/copy:opacity-100 transition-opacity p-1 hover:text-[#00D4FF]"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                      </button>
                      {copy}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sora 提示词 */}
            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Sora 视频提示词</h4>
                <div className="flex gap-2">
                  {soraPrompts.length > 0 ? (
                    <>
                      <button
                        onClick={() => handleGenerateSora(1)}
                        disabled={isGeneratingSora}
                        className="px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded text-[10px] transition-all disabled:opacity-50"
                      >
                        {isGeneratingSora ? "处理中..." : "重新生成"}
                      </button>
                      <button
                        onClick={() => handleGenerateSora(3)}
                        disabled={isGeneratingSora}
                        className="px-3 py-1 bg-[#00D4FF]/20 hover:bg-[#00D4FF]/30 text-[#00D4FF] border border-[#00D4FF]/30 rounded text-[10px] transition-all disabled:opacity-50"
                      >
                        {isGeneratingSora ? "处理中..." : "继续生成3条"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleGenerateSora(1)}
                      disabled={isGeneratingSora || !result.summary}
                      className="px-3 py-1 bg-[#00D4FF]/20 hover:bg-[#00D4FF]/30 text-[#00D4FF] border border-[#00D4FF]/30 rounded text-[10px] transition-all disabled:opacity-50 flex items-center gap-1"
                    >
                      {isGeneratingSora ? (
                        <><div className="w-3 h-3 border border-[#00D4FF]/30 border-t-[#00D4FF] rounded-full animate-spin" />生成中...</>
                      ) : "一键生成提示词"}
                    </button>
                  )}
                </div>
              </div>
              {soraPrompts.length > 0 && (
                <div className="space-y-2">
                  {soraPrompts.map((p, i) => (
                    <div key={i} className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1.5 group/sora relative">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#00D4FF] uppercase tracking-wider">{p.title}</span>
                        <button
                          onClick={() => copyToClipboard(p.fullPrompt, "提示词")}
                          className="opacity-0 group-hover/sora:opacity-100 transition-opacity p-1 hover:text-[#00D4FF]"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed italic line-clamp-3 group-hover/sora:line-clamp-none transition-all">{p.fullPrompt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fallbackCopy(text: string) {
  const el = document.createElement("textarea");
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}
