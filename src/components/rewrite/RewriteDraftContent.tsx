export default function RewriteDraftContent(props: { title: string; subtitle: string; content: string; copyLabel: string; onCopy: () => void }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#09101f]/80 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">{props.subtitle}</div>
          <div className="mt-3 text-base font-semibold text-white">{props.title}</div>
        </div>
        <button
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/25 hover:text-white"
          onClick={props.onCopy}
        >
          {props.copyLabel}
        </button>
      </div>
      <div className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-black/20 p-4 text-sm leading-8 text-slate-200">
        {props.content}
      </div>
    </div>
  );
}
