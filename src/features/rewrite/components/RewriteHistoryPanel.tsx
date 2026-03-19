import type { RewriteHistoryItem } from "../types";
import { formatRewriteTime, truncateText } from "../utils";

const TEXT = {
  title: "\u6700\u8fd1\u4eff\u5199\u8bb0\u5f55",
  clear: "\u6e05\u7a7a",
  empty: "\u6682\u65e0\u5386\u53f2\u8bb0\u5f55",
  untitled: "\u672a\u547d\u540d\u6587\u6848",
  industry: "\u884c\u4e1a\uff1a",
  need: "\u9700\u6c42\uff1a",
  delete: "\u5220\u9664\u8bb0\u5f55",
} as const;

interface RewriteHistoryPanelProps {
  history: RewriteHistoryItem[];
  onLoad: (item: RewriteHistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export default function RewriteHistoryPanel({ history, onLoad, onDelete, onClear }: RewriteHistoryPanelProps) {
  return (
    <div className="animate-fade-in space-y-2 rounded-3xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">{TEXT.title}</span>
        {history.length > 0 ? (
          <button onClick={onClear} className="text-xs text-red-400 transition-colors hover:text-red-300">
            {TEXT.clear}
          </button>
        ) : null}
      </div>
      {history.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">{TEXT.empty}</p> : null}
      {history.map((item) => (
        <div
          key={item.id}
          className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-white/5 bg-white/5 p-4 transition-all hover:bg-white/10"
          onClick={() => onLoad(item)}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{truncateText(item.originalCopy, 42) || TEXT.untitled}</p>
            <p className="mt-1 text-xs text-slate-500">{formatRewriteTime(item.createdAt)}</p>
            {item.industry ? <p className="mt-2 text-xs text-[#8B5CF6]">{`${TEXT.industry}${item.industry}`}</p> : null}
            {item.needs ? <p className="mt-1 text-xs text-slate-400">{`${TEXT.need}${truncateText(item.needs, 48)}`}</p> : null}
          </div>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onDelete(item.id);
            }}
            className="p-1 text-slate-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
            aria-label={TEXT.delete}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
