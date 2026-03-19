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

const TEXT = {
  sourceLabel: "\u539f\u59cb\u7206\u6b3e\u6587\u6848",
  sourcePlaceholder: "\u8bf7\u7c98\u8d34\u9700\u8981\u5206\u6790\u548c\u4eff\u5199\u7684\u539f\u59cb\u77ed\u89c6\u9891\u6587\u6848",
  backgroundLabel: "\u4f60\u7684\u4e2a\u4eba / \u4e1a\u52a1\u4ecb\u7ecd",
  backgroundPlaceholder:
    "\u4f8b\u5982\uff1a\u6211\u505a AI \u83b7\u5ba2\u589e\u957f\uff0c\u4e3b\u8981\u670d\u52a1\u5b9e\u4f53\u8001\u677f\u548c\u521b\u4e1a\u8005\uff0c\u5e0c\u671b\u628a\u77ed\u89c6\u9891\u505a\u6210\u7a33\u5b9a\u83b7\u5ba2\u5165\u53e3\u3002",
  industryLabel: "\u6240\u5c5e\u884c\u4e1a\uff08\u53ef\u9009\uff09",
  industryPlaceholder: "\u4f8b\u5982\uff1aAI \u83b7\u5ba2 / \u6559\u57f9 / \u95e8\u5e97 / \u4f01\u4e1a\u670d\u52a1",
  needsLabel: "\u5177\u4f53\u9700\u6c42\uff08\u53ef\u9009\uff09",
  needsPlaceholder: "\u4f8b\u5982\uff1a\u63d0\u9ad8\u4e92\u52a8\u3001\u63d0\u9ad8\u8f6c\u5316\u3001\u9002\u914d\u6570\u5b57\u4eba\u53e3\u64ad",
  cancel: "\u53d6\u6d88\u5206\u6790",
  submit: "\u4e00\u952e\u6df1\u5ea6\u62c6\u89e3\u5e76\u751f\u6210\u4eff\u5199\u7a3f",
} as const;

export default function RewriteInputForm(props: RewriteInputFormProps) {
  return (
    <div className="glass-panel rounded-[28px] p-5 sm:p-7">
      <div className="space-y-6">
        <div className="space-y-5">
          <div>
            <label className="field-label">{TEXT.sourceLabel}</label>
            <textarea
              value={props.originalCopy}
              onChange={(event) => props.onOriginalCopyChange(event.target.value)}
              placeholder={TEXT.sourcePlaceholder}
              className="field-textarea min-h-[220px]"
            />
          </div>

          <div>
            <label className="field-label">{TEXT.backgroundLabel}</label>
            <textarea
              value={props.userBackground}
              onChange={(event) => props.onUserBackgroundChange(event.target.value)}
              placeholder={TEXT.backgroundPlaceholder}
              className="field-textarea min-h-[150px]"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="field-label">{TEXT.industryLabel}</label>
              <input
                value={props.industry}
                onChange={(event) => props.onIndustryChange(event.target.value)}
                placeholder={TEXT.industryPlaceholder}
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">{TEXT.needsLabel}</label>
              <input
                value={props.needs}
                onChange={(event) => props.onNeedsChange(event.target.value)}
                placeholder={TEXT.needsPlaceholder}
                className="field-input"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          {props.isAnalyzing ? (
            <button onClick={props.onCancel} className="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 py-4 font-bold text-red-400 transition-all hover:bg-red-500/30">
              {TEXT.cancel}
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
              {TEXT.submit}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
