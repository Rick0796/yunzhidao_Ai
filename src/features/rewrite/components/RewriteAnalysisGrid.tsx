import type { RewriteCopyResult } from "../types";

const TEXT = {
  source: "\u539f\u59cb\u6587\u6848",
  structure: "\u6587\u6848\u7ed3\u6784\u62c6\u89e3",
  audienceAndSellingPoints: "\u53d7\u4f17\u4e0e\u5356\u70b9",
  audience: "\u76ee\u6807\u53d7\u4f17",
  sellingPoints: "\u6838\u5fc3\u5356\u70b9",
} as const;

const PRIMARY_ITEMS: Array<{ key: keyof RewriteCopyResult["analysis"]; title: string; color: string }> = [
  { key: "hook", title: "\u94a9\u5b50 Hook", color: "#00D4FF" },
  { key: "contrast", title: "\u53cd\u5dee Contrast", color: "#00D4FF" },
  { key: "value", title: "\u4ef7\u503c Value", color: "#00D4FF" },
  { key: "trust", title: "\u4fe1\u4efb Trust", color: "#00D4FF" },
  { key: "cta", title: "CTA", color: "#00D4FF" },
];

export default function RewriteAnalysisGrid({ result }: { result: RewriteCopyResult }) {
  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-[28px] p-5 sm:p-6">
        <div className="text-sm font-semibold text-white">{TEXT.source}</div>
        <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/5 bg-black/30 p-4 text-sm leading-7 text-slate-300">
          {result.originalCopy || ""}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-[28px] p-5 sm:p-6">
          <div className="text-sm font-semibold text-white">{TEXT.structure}</div>
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

        <div className="glass-panel rounded-[28px] p-5 sm:p-6">
          <div className="text-sm font-semibold text-white">{TEXT.audienceAndSellingPoints}</div>
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h4 className="mb-2 text-xs font-bold uppercase text-[#8B5CF6]">{TEXT.audience}</h4>
              <p className="text-sm leading-7 text-slate-300">{result.analysis.targetAudience || ""}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h4 className="mb-2 text-xs font-bold uppercase text-[#8B5CF6]">{TEXT.sellingPoints}</h4>
              <p className="text-sm leading-7 text-slate-300">{result.analysis.sellingPoints || ""}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
