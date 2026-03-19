interface RewriteInputFormProps {
  originalCopy: string;
  userBackground: string;
  industry: string;
  needs: string;
  isAnalyzing: boolean;
  onOriginalCopyChange: (value: string) => void;
  onUserBackgroundChange: (value: string) => void;
  onIndustryChange: (value: string) => void;
  onNeedsChange: (value: string) => void;
  onAnalyze: () => void;
  onCancel: () => void;
}

export default function RewriteInputForm(props: RewriteInputFormProps) {
  return (
    <div className="glass-panel rounded-[28px] p-5 sm:p-7">
      <div className="space-y-6">
        <div className="rounded-3xl border border-cyan-400/15 bg-cyan-400/8 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Rewrite Only</div>
          <h2 className="mt-3 text-2xl font-bold text-white">Short-Video Copy Analysis</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            This step keeps the original Fange analysis logic, but generation is rewrite-only: similar length, same structure,
            deduplication rewrite only, no expansion, no topic switch.
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="field-label">Source Viral Copy</label>
            <textarea
              value={props.originalCopy}
              onChange={(event) => props.onOriginalCopyChange(event.target.value)}
              placeholder="Paste the original short-video script that needs analysis and rewrite."
              className="field-textarea min-h-[220px]"
            />
          </div>

          <div>
            <label className="field-label">Your Background</label>
            <textarea
              value={props.userBackground}
              onChange={(event) => props.onUserBackgroundChange(event.target.value)}
              placeholder="Example: I help local businesses and founders use AI for customer growth and content growth."
              className="field-textarea min-h-[150px]"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="field-label">Industry (Optional)</label>
              <input
                value={props.industry}
                onChange={(event) => props.onIndustryChange(event.target.value)}
                placeholder="Example: AI growth / training / local stores / enterprise services"
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">Specific Need (Optional)</label>
              <input
                value={props.needs}
                onChange={(event) => props.onNeedsChange(event.target.value)}
                placeholder="Example: stronger engagement, better conversion, fit for avatar videos"
                className="field-input"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          {props.isAnalyzing ? (
            <button onClick={props.onCancel} className="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 py-4 font-bold text-red-400 transition-all hover:bg-red-500/30">
              Cancel
            </button>
          ) : (
            <button
              onClick={props.onAnalyze}
              disabled={!props.originalCopy.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#8B5CF6] py-4 font-bold text-black transition-all hover:shadow-[0_0_30px_rgba(0,212,255,0.3)] disabled:opacity-50 disabled:shadow-none"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Analyze And Generate Rewrites
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
