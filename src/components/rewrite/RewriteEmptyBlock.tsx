export default function RewriteEmptyBlock({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">{text}</div>;
}
