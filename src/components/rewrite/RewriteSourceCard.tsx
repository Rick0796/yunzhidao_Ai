import type { SourceStructureItem } from "../../types";
import { rewriteCopy } from "../../lib/rewriteCopy";

export default function RewriteSourceCard(props: { item: SourceStructureItem; index: number; onCopy: (text: string) => void }) {
  const { item, index, onCopy } = props;
  return (
    <div className="rounded-3xl border border-white/10 bg-[#09101f]/78 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-200">{`第 ${index} 段`}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{item.label}</span>
            <span className="text-xs text-slate-400">{item.hint}</span>
          </div>
        </div>
        <button
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300 hover:border-cyan-400/25 hover:text-white"
          onClick={() => onCopy(item.text, rewriteCopy.step2.copySuccess)}
        >
          {rewriteCopy.step2.copyLabel}
        </button>
      </div>
      <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">{item.text}</div>
    </div>
  );
}
