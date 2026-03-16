import { useCallback, useRef, useState } from "react";
import type { ApiSettings, VideoAnalysisMode, VideoAnalysisResult, VideoHistoryItem } from "../types";
import { extractKeyFrames } from "../lib/videoFrames";
import { analyzeVideoFrames } from "../lib/videoAnalysis";
import { useStoredState } from "../lib/workbenchHelpers";
import { STORAGE_KEYS } from "../lib/workbenchStorage";

interface VideoAnalysisPanelProps {
  settings: ApiSettings;
  onImportToRewrite: (script: string) => void;
  showNotice: (tone: "success" | "warning" | "info", text: string) => void;
}

type PanelState = "idle" | "ready" | "analyzing" | "result" | "error";

const FRAME_COUNTS: Record<VideoAnalysisMode, number> = { FAST: 5, DEEP: 10 };

const VIDEO_STRUCTURE_LABELS: Array<{ key: keyof VideoAnalysisResult["videoStructure"]; label: string }> = [
  { key: "coreProposition", label: "核心主张" },
  { key: "openingType", label: "开场类型" },
  { key: "conflictStructure", label: "冲突结构" },
  { key: "progressionLogic", label: "推进逻辑" },
  { key: "psychologicalHook", label: "心理钩子" },
  { key: "climaxSentence", label: "高潮句" },
  { key: "languageFeatures", label: "语言风格" },
  { key: "emotionalCurve", label: "情绪曲线" },
  { key: "viewerReward", label: "观看回报" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [expandedStructure, setExpandedStructure] = useState<Set<string>>(new Set(["coreProposition"]));
  const [copiedScript, setCopiedScript] = useState(false);
  const [history, setHistory] = useStoredState<VideoHistoryItem[]>(STORAGE_KEYS.videoHistory, []);
  const [showHistory, setShowHistory] = useState(false);
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
    setErrorMsg("");
  }, [showNotice]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  }, [handleFileSelect]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setPanelState("ready");
    setStage("");
    setProgress(0);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setPanelState("analyzing");
    setProgress(0);
    setStage("正在提取视频关键帧...");
    try {
      const frameCount = FRAME_COUNTS[mode];
      const frames = await extractKeyFrames(file, frameCount);
      setProgress(40);
      setStage(`已提取 ${frames.length} 帧，正在调用 AI 分析...`);
      const analysisResult = await analyzeVideoFrames(settings, frames, mode, controller.signal);
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
        setPanelState("ready");
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
  }, [result, onImportToRewrite, showNotice]);

  const handleCopyScript = useCallback(async () => {
    if (!result?.script) return;
    await navigator.clipboard.writeText(result.script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  }, [result]);

  const toggleStructureKey = useCallback((key: string) => {
    setExpandedStructure((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const loadHistory = useCallback((item: VideoHistoryItem) => {
    setFile(null);
    setMode(item.mode);
    setResult(item.result);
    setPanelState("result");
    setShowHistory(false);
    showNotice("info", `已加载历史记录：${item.fileName}`);
  }, [showNotice]);

  const deleteHistory = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  }, [setHistory]);

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">视频分析</h2>
          <p className="text-sm text-slate-400 mt-0.5">上传短视频，AI 自动提取脚本和结构分析</p>
        </div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="text-sm text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
        >
          历史记录{history.length > 0 ? ` (${history.length})` : ""}
        </button>
      </div>

      {/* 历史记录面板 */}
      {showHistory && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-white">最近分析记录</span>
            {history.length > 0 && (
              <button
                onClick={() => { if (window.confirm("确定清空所有历史记录？")) setHistory([]); }}
                className="text-xs text-red-400 hover:text-red-300"
              >
                清空
              </button>
            )}
          </div>
          {history.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">暂无历史记录</p>
          )}
          {history.map((item) => (
            <div key={item.id} className="flex items-center gap-2 p-3 bg-white/5 rounded-lg group">
              <button className="flex-1 text-left" onClick={() => loadHistory(item)}>
                <p className="text-sm text-white truncate">{item.fileName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.mode === "DEEP" ? "深度分析" : "快速分析"} · {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                </p>
              </button>
              <button
                onClick={() => deleteHistory(item.id)}
                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 上传区 — idle */}
      {panelState === "idle" && (
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
            isDragging ? "border-blue-400 bg-blue-400/5" : "border-white/20 hover:border-white/40 hover:bg-white/5"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">拖拽视频到这里，或点击上传</p>
              <p className="text-slate-500 text-sm mt-1">支持 MP4、MOV、AVI 等常见格式</p>
            </div>
          </div>
        </div>
      )}

      {/* 文件已选 + 模式选择 — ready */}
      {panelState === "ready" && file && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{file.name}</p>
              <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
            </div>
            <button onClick={() => { setFile(null); setPanelState("idle"); }}
              className="text-slate-500 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-2">选择分析模式</p>
            <div className="grid grid-cols-2 gap-3">
              {(["FAST", "DEEP"] as VideoAnalysisMode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    mode === m ? "border-blue-500 bg-blue-500/10 text-white" : "border-white/10 hover:border-white/20 text-slate-400 hover:text-white"
                  }`}
                >
                  <p className="font-medium text-sm">{m === "FAST" ? "快速分析" : "深度分析"}</p>
                  <p className="text-xs mt-1 opacity-70">
                    {m === "FAST" ? "抽取 5 帧，速度快，适合大多数短视频" : "抽取 10 帧，更精准，包含时间轴分析"}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleAnalyze}
            className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-white font-medium rounded-xl transition-colors"
          >
            开始分析
          </button>
        </div>
      )}

      {/* 分析中 — analyzing */}
      {panelState === "analyzing" && (
        <div className="space-y-4 p-6 bg-white/5 rounded-xl border border-white/10">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white font-medium">{stage || "分析中..."}</p>
            <button onClick={handleCancel} className="text-xs text-slate-400 hover:text-red-400 transition-colors">
              取消
            </button>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 text-center">请勿关闭页面，视频分析可能需要 30-60 秒...</p>
        </div>
      )}

      {/* 错误 — error */}
      {panelState === "error" && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3">
          <p className="text-sm text-red-400 font-medium">分析失败</p>
          <p className="text-xs text-red-300/70">{errorMsg}</p>
          <button
            onClick={() => setPanelState(file ? "ready" : "idle")}
            className="text-sm text-white px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* 结果 — result */}
      {panelState === "result" && result && (
        <div className="space-y-4">
          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium rounded-xl transition-colors"
            >
              导入到仿写工作台
            </button>
            <button
              onClick={() => { setFile(null); setPanelState("idle"); setResult(null); }}
              className="px-4 py-2.5 border border-white/20 hover:border-white/40 text-slate-400 hover:text-white text-sm rounded-xl transition-colors"
            >
              重新上传
            </button>
          </div>

          {/* 摘要 */}
          <div className="p-4 bg-white/5 rounded-xl border border-white/10">
            <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">视频摘要</p>
            <p className="text-sm text-slate-200 leading-relaxed">{result.summary}</p>
          </div>

          {/* 视频结构9维度 */}
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide px-4 pt-4 pb-2">视频结构分析</p>
            {VIDEO_STRUCTURE_LABELS.map(({ key, label }) => {
              const value = result.videoStructure[key];
              const isOpen = expandedStructure.has(key);
              return (
                <div key={key} className="border-t border-white/5 first:border-t-0">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
                    onClick={() => toggleStructureKey(key)}
                  >
                    <span className="text-sm font-medium text-slate-300">{label}</span>
                    <svg
                      className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3">
                      <p className="text-sm text-slate-400 leading-relaxed">{value || "—"}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 口播脚本 */}
          {result.script && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">口播脚本还原</p>
                <button
                  onClick={handleCopyScript}
                  className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                  {copiedScript ? "已复制" : "复制"}
                </button>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{result.script}</p>
            </div>
          )}

          {/* 视觉特征 */}
          {result.visualFeatures.length > 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">视觉特征</p>
              <div className="flex flex-wrap gap-2">
                {result.visualFeatures.map((vf, i) => (
                  <div key={i} className="text-xs bg-white/10 rounded-lg px-3 py-1.5">
                    <span className="text-white font-medium">{vf.feature}</span>
                    {vf.description && <span className="text-slate-400 ml-1">· {vf.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 时间轴（DEEP模式） */}
          {result.timestamps && result.timestamps.length > 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">时间轴分析</p>
              <div className="space-y-2">
                {result.timestamps.map((ts, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="text-xs text-blue-400 font-mono flex-shrink-0 mt-0.5 w-12">{ts.time}</span>
                    <p className="text-sm text-slate-400">{ts.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
