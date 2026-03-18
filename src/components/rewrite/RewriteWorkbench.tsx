import { useState, useRef } from "react";
import type { ApiSettings, TaskForm } from "../../types";
import { normalizeBaseUrl } from "../../lib/http";

interface GeneratedScript {
  id: string;
  text: string;
}

interface RewriteWorkbenchProps {
  task: TaskForm;
  settings: ApiSettings;
  onUpdateSourceText: (value: string) => void;
  onUpdateUserNote: (value: string) => void;
  showNotice: (tone: "success" | "warning" | "info", text: string) => void;
}

const REPLACEMENTS: Array<[string, string]> = [
  ["很多人", "不少人"],
  ["其实", "说白了"],
  ["现在", "眼下"],
  ["已经", "早就"],
  ["真正", "说到底"],
  ["如果", "要是"],
  ["普通人", "大多数人"],
  ["接下来", "往后"],
  ["非常", "相当"],
  ["发现", "注意到"],
  ["告诉", "提醒"],
  ["开始", "着手"],
];

function buildLocalFallback(sourceText: string, count: number): GeneratedScript[] {
  const prefixes = ["换句话说，", "说白了，", "你要知道，", ""];
  return Array.from({ length: count }, (_, i) => {
    let text = sourceText;
    const offset = i * 3;
    for (let j = 0; j < 4; j++) {
      const pair = REPLACEMENTS[(offset + j) % REPLACEMENTS.length];
      text = text.replace(pair[0], pair[1]);
    }
    const prefix = prefixes[i % prefixes.length];
    if (prefix && !text.startsWith(prefix)) {
      text = prefix + text;
    }
    return { id: `local-${Date.now()}-${i}`, text };
  });
}

function buildPrompt(sourceText: string, userNote: string, refineNote: string | undefined, count: number) {
  const lines = [
    `请仿写以下爆款短视频文案，生成 ${count} 条。`,
    "要求：",
    "1. 保持原文段落结构和推进顺序不变",
    "2. 字数必须与原文相近（±15%以内）",
    "3. 改变表达方式、措辞和情绪，不要照抄原文",
    "4. 保留原文中的数字、年份、百分比、具体数据等",
    count > 1 ? "5. 每条版本风格要有明显差异" : "",
    userNote ? `补充要求：${userNote}` : "",
    refineNote ? `优化指令：${refineNote}` : "",
    "原文：",
    sourceText,
  ];
  return lines.filter(Boolean).join("\n");
}

export default function RewriteWorkbench(props: RewriteWorkbenchProps) {
  const { task, settings, onUpdateSourceText, onUpdateUserNote, showNotice } = props;
  const [scripts, setScripts] = useState<GeneratedScript[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [refineInput, setRefineInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sourceText = task.sourceText || "";
  const userNote = task.userNote || "";
  const baseUrl = normalizeBaseUrl(settings.baseUrl || "/api");

  async function handleGenerate(count: number, refineNote?: string, append = false) {
    if (!sourceText.trim()) {
      showNotice("warning", "请先粘贴要仿写的原文。");
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    showNotice("info", "正在仿写中，请稍候...");

    try {
      const prompt = buildPrompt(sourceText, userNote, refineNote, count);
      const response = await fetch(`${baseUrl}/generate-viral-copies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: prompt, count }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json() as { copies?: string[]; error?: { message?: string } };
      if (raw.error) throw new Error(raw.error.message || "API 返回错误");
      const copies = Array.isArray(raw.copies) ? raw.copies.filter((c) => typeof c === "string" && c.trim()) : [];
      if (!copies.length) throw new Error("未返回有效内容");

      const next: GeneratedScript[] = copies.map((text, i) => ({
        id: `draft-${Date.now()}-${i}`,
        text: text.trim(),
      }));
      setScripts(append ? (prev) => [...prev, ...next] : next);
      showNotice("success", append ? `已追加 ${next.length} 条版本。` : `已生成 ${next.length} 条仿写版本。`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const fallback = buildLocalFallback(sourceText, count);
      setScripts(append ? (prev) => [...prev, ...fallback] : fallback);
      showNotice("info", "API 暂时不可用，已使用本地仿写版本。");
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }

  async function handleRefine() {
    if (!refineInput.trim() || isGenerating) return;
    const note = refineInput;
    setRefineInput("");
    await handleGenerate(1, note, true);
  }

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      showNotice("success", "文案已复制");
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  const hasContent = scripts.length > 0;

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-[28px] p-5 sm:p-7 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">爆款仿写</div>
            <div className="mt-1 text-sm text-slate-400">粘贴原文，AI 自动仿写，结构相近字数相仿，去重改写。</div>
          </div>
          {hasContent && (
            <button onClick={() => setScripts([])} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
              清空结果
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-2">原始文案 *</label>
          <textarea
            value={sourceText}
            onChange={(e) => onUpdateSourceText(e.target.value)}
            placeholder="在这里粘贴你要仿写的爆款原文..."
            className="w-full min-h-[180px] resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-7 text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/40 outline-none transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-2">
            补充要求 <span className="text-slate-500">(可选)</span>
          </label>
          <textarea
            value={userNote}
            onChange={(e) => onUpdateUserNote(e.target.value)}
            placeholder="例如：语气更像老板讲话、结尾更有行动感、针对宝妈群体..."
            className="w-full min-h-[72px] resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-7 text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/40 outline-none transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void handleGenerate(1, undefined, false)}
            disabled={isGenerating || !sourceText.trim()}
            className="brand-btn flex-1 sm:flex-none"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                仿写中...
              </span>
            ) : (hasContent ? "重新生成 1 条" : "生成 1 条")}
          </button>
          <button
            onClick={() => void handleGenerate(3, undefined, false)}
            disabled={isGenerating || !sourceText.trim()}
            className="ghost-btn flex-1 sm:flex-none"
          >
            生成 3 条
          </button>
          {isGenerating && (
            <button
              onClick={() => { abortRef.current?.abort(); setIsGenerating(false); }}
              className="px-4 py-2 rounded-2xl border border-red-400/30 text-red-400 text-sm hover:bg-red-400/10 transition-colors"
            >
              取消
            </button>
          )}
        </div>
      </div>

      {hasContent && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              仿写结果
              <span className="ml-2 text-xs font-normal text-slate-400">{scripts.length} 条</span>
            </h3>
            <button
              onClick={() => void handleGenerate(3, undefined, true)}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-slate-300 hover:border-cyan-400/30 hover:text-white transition-colors disabled:opacity-40"
            >
              追加 3 条
            </button>
          </div>

          <div className="grid gap-4">
            {scripts.map((script, index) => (
              <div key={script.id} className="glass-panel rounded-[24px] border border-white/10 p-5 hover:border-cyan-400/20 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-[11px] font-bold text-cyan-200">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-white">版本 {index + 1}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(script.id, script.text)}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:border-cyan-400/30 hover:text-white transition-colors"
                  >
                    {copiedId === script.id ? (
                      <>
                        <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-emerald-400">已复制</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        复制文案
                      </>
                    )}
                  </button>
                </div>
                <div className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-8 text-slate-200">
                  {script.text}
                </div>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-[24px] border border-cyan-400/15 bg-cyan-400/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-sm font-semibold text-white">继续优化</span>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                value={refineInput}
                onChange={(e) => setRefineInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !isGenerating) void handleRefine(); }}
                placeholder="例如：开头再劲爆一点、增加幽默感、针对宝妈群体优化..."
                className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/40 outline-none transition-colors"
              />
              <button
                onClick={() => void handleRefine()}
                disabled={isGenerating || !refineInput.trim()}
                className="brand-btn whitespace-nowrap"
              >
                {isGenerating ? "生成中..." : "发送"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
