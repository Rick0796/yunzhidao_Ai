import type { RewriteGeneratedScript } from "../types";

interface RewriteScriptResultsProps {
  scripts: RewriteGeneratedScript[];
  refineInstruction: string;
  isAnalyzing: boolean;
  isRefining: boolean;
  onRegenerate: () => void;
  onGenerateMore: () => void;
  onRefineInstructionChange: (value: string) => void;
  onRefine: () => void;
  onReset: () => void;
  onCopyScript: (text: string) => void;
}

const TEXT = {
  reanalyzing: "\u6b63\u5728\u91cd\u65b0\u5206\u6790\u5e76\u751f\u6210\u4eff\u5199\u7a3f...",
  refiningBusy: "\u6b63\u5728\u4f18\u5316\u5e76\u751f\u6210\u66f4\u591a\u4eff\u5199\u7a3f...",
  title: "\u5b9a\u5236\u5316\u7206\u6b3e\u4eff\u5199\u7a3f",
  regenerate: "\u91cd\u65b0\u751f\u6210",
  generateMore: "\u518d\u751f\u6210 3 \u6761",
  empty: "\u6682\u65e0\u751f\u6210\u7684\u4eff\u5199\u5185\u5bb9\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u3002",
  copy: "\u590d\u5236\u811a\u672c",
  refineTitle: "\u7ee7\u7eed\u4f18\u5316\u4eff\u5199\u7a3f",
  refinePlaceholder: "\u4f8b\u5982\uff1a\u8bed\u6c14\u66f4\u72e0\u4e00\u70b9\uff0c\u4f46\u4ecd\u7136\u4fdd\u6301\u5b57\u6570\u63a5\u8fd1\u548c\u7ed3\u6784\u4e00\u81f4\u3002",
  refining: "\u4f18\u5316\u4e2d...",
  submit: "\u53d1\u9001",
  reset: "\u91cd\u65b0\u5206\u6790\u65b0\u6587\u6848",
} as const;

export default function RewriteScriptResults(props: RewriteScriptResultsProps) {
  const busy = props.isAnalyzing || props.isRefining;

  return (
    <div className="relative space-y-6">
      {busy ? (
        <div className="absolute inset-x-0 -inset-y-4 z-10 flex flex-col items-center justify-center gap-4 rounded-3xl bg-black/60 backdrop-blur-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#00D4FF]/30 border-t-[#00D4FF]" />
          <p className="font-bold text-[#00D4FF]">{props.isAnalyzing ? TEXT.reanalyzing : TEXT.refiningBusy}</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="flex items-center gap-2 text-xl font-bold text-white">
          <span className="h-6 w-1 rounded-full bg-[#8B5CF6]" />
          {TEXT.title}
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={props.onRegenerate}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300 transition-all hover:bg-white/10 disabled:opacity-50"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {TEXT.regenerate}
          </button>
          <button
            onClick={props.onGenerateMore}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-[#8B5CF6]/30 bg-[#8B5CF6]/20 px-4 py-2 text-xs text-[#8B5CF6] transition-all hover:bg-[#8B5CF6]/30 disabled:opacity-50"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {TEXT.generateMore}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {props.scripts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-slate-500">
            {TEXT.empty}
          </div>
        ) : (
          props.scripts.map((script, index) => (
            <div key={`${script.title}-${index}`} className="glass-panel rounded-[24px] border border-white/10 p-6 transition-all hover:border-[#00D4FF]/30">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h4 className="text-lg font-bold text-white">{script.title}</h4>
                <button
                  onClick={() => props.onCopyScript(script.content)}
                  className="rounded-lg bg-white/5 p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white"
                  title={TEXT.copy}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </button>
              </div>
              <div className="whitespace-pre-wrap rounded-2xl border border-white/5 bg-black/30 p-4 text-sm leading-7 text-slate-300">
                {script.content}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="glass-panel rounded-[24px] border border-[#00D4FF]/20 bg-[#00D4FF]/5 p-6">
        <h4 className="mb-4 flex items-center gap-2 font-bold text-white">
          <svg className="h-5 w-5 text-[#00D4FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          {TEXT.refineTitle}
        </h4>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={props.refineInstruction}
            onChange={(event) => props.onRefineInstructionChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                props.onRefine();
              }
            }}
            placeholder={TEXT.refinePlaceholder}
            className="field-input mt-0 flex-1"
          />
          <button
            onClick={props.onRefine}
            disabled={props.isRefining || !props.refineInstruction.trim()}
            className="rounded-xl bg-[#00D4FF] px-6 py-3 font-bold text-black transition-all hover:shadow-[0_0_20px_rgba(0,212,255,0.3)] disabled:opacity-50"
          >
            {props.isRefining ? TEXT.refining : TEXT.submit}
          </button>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <button onClick={props.onReset} className="rounded-xl border border-white/10 bg-white/5 px-8 py-3 text-slate-300 transition-all hover:bg-white/10">
          {TEXT.reset}
        </button>
      </div>
    </div>
  );
}
