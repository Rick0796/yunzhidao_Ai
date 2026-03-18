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
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">爆款仿写</div>
          <h2 className="mt-3 text-2xl font-bold text-white">短视频文案深度分析</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            这里沿用凡哥原来的分析逻辑，但生成阶段只做仿写：字数相近、结构一致、只去重改写，不扩写、不换命题。
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="field-label">原始爆款文案</label>
            <textarea
              value={props.originalCopy}
              onChange={(event) => props.onOriginalCopyChange(event.target.value)}
              placeholder="请粘贴需要分析和仿写的原始短视频文案"
              className="field-textarea min-h-[220px]"
            />
          </div>

          <div>
            <label className="field-label">你的个人 / 业务介绍</label>
            <textarea
              value={props.userBackground}
              onChange={(event) => props.onUserBackgroundChange(event.target.value)}
              placeholder="例如：我是做 AI 获客增长的，主要服务实体老板和创业者，想把短视频做成稳定获客入口。"
              className="field-textarea min-h-[150px]"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="field-label">所属行业 (可选)</label>
              <input
                value={props.industry}
                onChange={(event) => props.onIndustryChange(event.target.value)}
                placeholder="例如：AI 获客 / 教培 / 门店 / 企业服务"
                className="field-input"
              />
            </div>
            <div>
              <label className="field-label">你的具体需求 (可选)</label>
              <input
                value={props.needs}
                onChange={(event) => props.onNeedsChange(event.target.value)}
                placeholder="例如：增加互动、提高转化、适配数字人口播"
                className="field-input"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          {props.isAnalyzing ? (
            <button onClick={props.onCancel} className="flex-1 rounded-xl border border-red-500/30 bg-red-500/20 py-4 font-bold text-red-400 transition-all hover:bg-red-500/30">
              取消分析
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
              一键深度拆解并生成仿写稿
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
