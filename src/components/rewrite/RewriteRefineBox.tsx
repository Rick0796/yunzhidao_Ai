import { rewriteCopy } from "../../lib/rewriteCopy";

export default function RewriteRefineBox(props: {
  value: string;
  onChange: (value: string) => void;
  onRefine: () => void;
  isBusy: boolean;
}) {
  const disabled = props.isBusy || !props.value.trim();
  return (
    <div className="rounded-3xl border border-white/10 bg-[#09101f]/80 p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{rewriteCopy.step4.instructionTitle}</div>
      <textarea
        className="mt-3 min-h-[120px] w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-7 text-slate-200 placeholder:text-slate-500"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={rewriteCopy.step4.instructionPlaceholder}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="brand-btn" onClick={props.onRefine} disabled={disabled}>
          {rewriteCopy.step4.refineButton}
        </button>
      </div>
    </div>
  );
}
