import type { RewriteCopyResult } from "../types";

const PRIMARY_ITEMS: Array<{ key: keyof RewriteCopyResult["analysis"]; title: string; color: string }> = [
  { key: "hook", title: "Hook", color: "#00D4FF" },
  { key: "contrast", title: "Contrast", color: "#00D4FF" },
  { key: "value", title: "Value", color: "#00D4FF" },
  { key: "trust", title: "Trust", color: "#00D4FF" },
  { key: "cta", title: "CTA", color: "#00D4FF" },
];

export default function RewriteAnalysisGrid({ result }: { result: RewriteCopyResult }) {
  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-[28px] p-5 sm:p-6">
        <div className="text-sm font-semibold text-white">Source Copy</div>
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/5 bg-black/30 p-4 text-sm leading-7 text-slate-300">
          {result.originalCopy || ""}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-[28px] p-5 sm:p-6">
          <div className="text-sm font-semibold text-white">Structure Breakdown</div>
          <div className="mt-4 space-y-4">
            {PRIMARY_ITEMS.map((item) => (
              <div key={item.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 text-xs font-bold uppercase" style={{ color: item.color }}>
                  {item.title}
                </h4>
                <p className="text-sm leading-7 text-slate-300">{result.analysis[item.key] || ""}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-[28px] p-5 sm:p-6">
            <div className="text-sm font-semibold text-white">Audience And Selling Points</div>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 text-xs font-bold uppercase text-[#8B5CF6]">Target Audience</h4>
                <p className="text-sm leading-7 text-slate-300">{result.analysis.targetAudience || ""}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 text-xs font-bold uppercase text-[#8B5CF6]">Selling Points</h4>
                <p className="text-sm leading-7 text-slate-300">{result.analysis.sellingPoints || ""}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#00D4FF]/30 bg-gradient-to-br from-[#00D4FF]/20 to-[#8B5CF6]/20 p-6">
            <h3 className="font-bold text-white">Summary</h3>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              This page freezes the effective viral structure first, then keeps the same progression while rewriting the wording.
              All later scripts stay on the same structure and only change the expression layer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
