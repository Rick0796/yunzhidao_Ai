import type { RewriteCopyResult } from "../types";

const PRIMARY_ITEMS: Array<{ key: keyof RewriteCopyResult["analysis"]; title: string; color: string }> = [
  { key: "hook", title: "【钩子】Hook", color: "#00D4FF" },
  { key: "contrast", title: "【反差】Contrast", color: "#00D4FF" },
  { key: "value", title: "【价值】Value", color: "#00D4FF" },
  { key: "trust", title: "【信任】Trust", color: "#00D4FF" },
  { key: "cta", title: "【网兜】CTA", color: "#00D4FF" },
];

export default function RewriteAnalysisGrid({ result }: { result: RewriteCopyResult }) {
  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-[28px] p-5 sm:p-6">
        <div className="text-sm font-semibold text-white">原始文案内容</div>
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/5 bg-black/30 p-4 text-sm leading-7 text-slate-300">
          {result.originalCopy || ""}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-[28px] p-5 sm:p-6">
          <div className="text-sm font-semibold text-white">文案底层逻辑拆解</div>
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
            <div className="text-sm font-semibold text-white">受众与卖点</div>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 text-xs font-bold uppercase text-[#8B5CF6]">受众画像</h4>
                <p className="text-sm leading-7 text-slate-300">{result.analysis.targetAudience || ""}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h4 className="mb-2 text-xs font-bold uppercase text-[#8B5CF6]">核心卖点</h4>
                <p className="text-sm leading-7 text-slate-300">{result.analysis.sellingPoints || ""}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#00D4FF]/30 bg-gradient-to-br from-[#00D4FF]/20 to-[#8B5CF6]/20 p-6">
            <h3 className="font-bold text-white">分析总结</h3>
            <p className="mt-2 text-sm leading-7 text-slate-300">
              这一页负责先拆底层逻辑，再把原文的爆款结构固定住，后续所有仿写稿都只在表达层做去重和改写，避免把有效结构改散。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
