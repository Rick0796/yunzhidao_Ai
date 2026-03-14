import type { Dispatch, ReactNode, SetStateAction } from "react";
import { COMPACT_HOTSPOT_COLLAPSED_COUNT, HOTSPOT_PLATFORM_META } from "../lib/workbenchConfig";
import { classNames, getHotspotPreviewTitle } from "../lib/workbenchHelpers";
import type { HotspotExpandState, HotspotPanelTab } from "../hooks/useHotspotCenter";
import type { BusinessHotItem, HotRankItem, HotRankResponse, ManualSearchResponse } from "../lib/workflows";

interface HotspotCenterPanelProps {
  allHotItems: HotRankResponse["allHotList"];
  businessHotItems: HotRankResponse["businessHotList"];
  douyinHotItems: HotRankItem[];
  weiboHotItems: HotRankItem[];
  zhihuHotItems: HotRankItem[];
  baiduHotItems: HotRankItem[];
  searchItems: ManualSearchResponse["searchData"];
  factPack: ManualSearchResponse["factPack"] | null;
  cacheWarning: string;
  cacheText: string;
  selectedHotspotKey: string | null;
  loadingHotspotKey: string | null;
  hotspotListExpanded: HotspotExpandState;
  hotspotPanelTab: HotspotPanelTab;
  showHotspotCenter: boolean;
  manualSearchQuery: string;
  isLoadingHotRank: boolean;
  isLoadingManualSearch: boolean;
  hasManualSearchResult: boolean;
  onUseHotRankItem: (item: HotRankItem | BusinessHotItem, options: { business?: boolean; itemKey: string }) => void;
  onUseFactPack: () => void;
  onSearchTopic: () => void;
  onRefreshHotRank: () => void;
  onSetHotspotListExpanded: Dispatch<SetStateAction<HotspotExpandState>>;
  onSetHotspotPanelTab: (value: HotspotPanelTab) => void;
  onSetManualSearchQuery: (value: string) => void;
  onToggleHotspotCenter: () => void;
}

export default function HotspotCenterPanel(props: HotspotCenterPanelProps) {
  const {
    allHotItems,
    businessHotItems,
    douyinHotItems,
    weiboHotItems,
    zhihuHotItems,
    baiduHotItems,
    searchItems,
    factPack,
    cacheWarning,
    cacheText,
    selectedHotspotKey,
    loadingHotspotKey,
    hotspotListExpanded,
    hotspotPanelTab,
    showHotspotCenter,
    manualSearchQuery,
    isLoadingHotRank,
    isLoadingManualSearch,
    hasManualSearchResult,
    onUseHotRankItem,
    onUseFactPack,
    onSearchTopic,
    onRefreshHotRank,
    onSetHotspotListExpanded,
    onSetHotspotPanelTab,
    onSetManualSearchQuery,
    onToggleHotspotCenter
  } = props;

  let resultBlock = <HotspotEmptyBlock text="热榜和搜索事实包会显示在这里，你选中任意一条后，会自动回填到下方内容输入区。" />;

  const renderHotRows = (
    items: Array<HotRankResponse["allHotList"][number] | HotRankResponse["businessHotList"][number]>,
    options: {
      expandKey: keyof HotspotExpandState;
      emptyText: string;
      fallbackTitle: string;
      business?: boolean;
      keyPrefix: string;
    }
  ) => {
    const expanded = hotspotListExpanded[options.expandKey];
    const hasMoreRows = items.length > COMPACT_HOTSPOT_COLLAPSED_COUNT;
    const visibleItems = expanded ? items : items.slice(0, COMPACT_HOTSPOT_COLLAPSED_COUNT);
    if (items.length === 0) {
      return <HotspotEmptyBlock text={options.emptyText} />;
    }

    return (
      <div className="grid max-w-full gap-3 overflow-hidden">
        {hasMoreRows ? (
          <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs text-slate-400">
              {expanded ? `已展开 ${items.length} 条热点` : `当前显示前 ${visibleItems.length} 条，共 ${items.length} 条`}
            </div>
            <button
              type="button"
              className="self-start whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:text-white"
              onClick={() => onSetHotspotListExpanded((prev) => ({ ...prev, [options.expandKey]: !prev[options.expandKey] }))}
            >
              {expanded ? "收起列表" : `展开全部 ${items.length} 条`}
            </button>
          </div>
        ) : null}

        <div className="grid max-w-full gap-2 overflow-hidden">
          {visibleItems.map((item, index) => {
            const rankIndex = items.findIndex((candidate) => candidate.hot_id === item.hot_id && candidate.title === item.title);
            const itemKey = item.hot_id || `${options.keyPrefix}-${rankIndex >= 0 ? rankIndex : index}`;
            return (
              <CompactHotspotListRow
                key={itemKey}
                rank={(rankIndex >= 0 ? rankIndex : index) + 1}
                active={selectedHotspotKey === itemKey}
                loading={loadingHotspotKey === itemKey}
                title={getHotspotPreviewTitle(item as HotRankItem & BusinessHotItem, options.fallbackTitle)}
                leadOnly={Boolean((item as { quality_status?: string }).quality_status && (item as { quality_status?: string }).quality_status !== "ready")}
                onUse={() => void onUseHotRankItem(item as HotRankItem | BusinessHotItem, { business: options.business, itemKey })}
              />
            );
          })}
        </div>
        {hasMoreRows && expanded ? (
          <div className="flex justify-center sm:justify-end">
            <button
              type="button"
              className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:text-white"
              onClick={() => onSetHotspotListExpanded((prev) => ({ ...prev, [options.expandKey]: false }))}
            >
              收起列表
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  if (hotspotPanelTab === "all") {
    resultBlock = renderHotRows(allHotItems, {
      expandKey: "all",
      emptyText: "当前还没有热榜缓存，系统正在后台准备中。",
      fallbackTitle: "未命名热点",
      keyPrefix: "all"
    });
  }

  if (hotspotPanelTab === "business") {
    resultBlock = renderHotRows(businessHotItems, {
      expandKey: "business",
      emptyText: "当前还没有 AI 行业热榜，等全网热榜缓存好后会自动出现。",
      fallbackTitle: "未命名 AI 热点",
      keyPrefix: "business",
      business: true
    });
  }

  if (hotspotPanelTab === "douyin" || hotspotPanelTab === "weibo" || hotspotPanelTab === "zhihu" || hotspotPanelTab === "baidu") {
    const currentItems =
      hotspotPanelTab === "douyin"
        ? douyinHotItems
        : hotspotPanelTab === "weibo"
          ? weiboHotItems
          : hotspotPanelTab === "zhihu"
            ? zhihuHotItems
            : baiduHotItems;
    const platformMeta = HOTSPOT_PLATFORM_META[hotspotPanelTab];
    resultBlock = renderHotRows(currentItems, {
      expandKey: hotspotPanelTab,
      emptyText: `当前还没有${platformMeta.label}，缓存更新后会自动出现。`,
      fallbackTitle: `未命名${platformMeta.label}`,
      keyPrefix: hotspotPanelTab
    });
  }

  if (hotspotPanelTab === "search") {
    resultBlock = (
      <div className="grid gap-4">
        {factPack ? (
          <ResponsiveSearchFactPackCard
            eventAnchor={factPack.eventAnchor || ""}
            summary={factPack.summary}
            facts={factPack.keyFacts}
            timelineClues={factPack.timelineClues || []}
            businessSignals={factPack.businessSignals || []}
            guardrailNote={factPack.guardrailNote || ""}
            sourcesCount={factPack.sources.length}
            onUse={onUseFactPack}
          />
        ) : null}
        {searchItems.length === 0 ? (
          <HotspotEmptyBlock text="当前没有全网搜索结果，请换一个关键词。" />
        ) : (
          searchItems.map((item, index) => {
            const itemKey = `search-${index}`;
            return (
              <ResponsiveSearchSourceCard
                key={itemKey}
                active={selectedHotspotKey === itemKey}
                title={(item as { displayTitle?: string }).displayTitle || item.title || "未命名搜索结果"}
                summary={(item as { displaySummary?: string }).displaySummary || item.summary || ""}
                source={item.sitename || item.sourcePlatform || ""}
                url={item.url || ""}
              />
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-full">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 lg:flex-1">
          <div className="section-eyebrow">今日热榜中心</div>
          <div className="mt-3 text-lg font-semibold text-white">自动热榜 + 手动搜索事实包</div>
          <div className="mt-2 text-sm leading-7 text-slate-300">
            热榜会在页面打开后自动预加载。搜索结果不会直接塞进正文，而是先整理成一份可用于写稿的事实包，再回填到内容输入区。
          </div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2 lg:justify-end">
          <HotspotSoftBadge>{cacheText}</HotspotSoftBadge>
          {allHotItems.length > 0 ? <HotspotSoftBadge>全网 {allHotItems.length}</HotspotSoftBadge> : null}
          {businessHotItems.length > 0 ? <HotspotSoftBadge>AI行业 {businessHotItems.length}</HotspotSoftBadge> : null}
          {factPack ? <HotspotSoftBadge>事实包已就绪</HotspotSoftBadge> : null}
          <button
            className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/20 hover:text-white"
            onClick={onToggleHotspotCenter}
          >
            {showHotspotCenter ? "收起热榜" : "展开热榜"}
          </button>
        </div>
      </div>

      {cacheWarning ? (
        <div className="mt-5 rounded-3xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm leading-7 text-amber-100">
          {allHotItems.length > 0 ? `本次刷新没拿到更新结果，先展示最近缓存。${cacheWarning}` : cacheWarning}
        </div>
      ) : null}

      {!showHotspotCenter ? (
        <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-400">
          热榜面板已收起，后台仍会自动抓取和刷新。需要时点右上角“展开热榜”即可。
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4 sm:px-5">
              <div className="text-sm font-semibold text-white">手动搜索事件</div>
              <div className="mt-2 text-xs leading-6 text-slate-400">输入一个事件或热点主题，系统会先抓原始搜索源，再自动清洗成可写稿事实包。</div>
              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                <div className="flex-1">
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
                    value={manualSearchQuery}
                    onChange={(event) => onSetManualSearchQuery(event.target.value)}
                    placeholder="例如：伊朗美国战争实时战况"
                  />
                </div>
                <button className="brand-btn w-full md:w-auto" onClick={() => void onSearchTopic()} disabled={isLoadingManualSearch}>
                  {isLoadingManualSearch ? "清洗中..." : "搜索并生成事实包"}
                </button>
              </div>
            </div>

            <button className="brand-btn h-fit w-full xl:w-auto" onClick={onRefreshHotRank} disabled={isLoadingHotRank}>
              {isLoadingHotRank ? "刷新中..." : "刷新今日热榜"}
            </button>
          </div>

          <div className="mt-5 flex max-w-full flex-wrap gap-2">
            <HotspotResultTabChip active={hotspotPanelTab === "all"} label="全网热榜" count={allHotItems.length} onClick={() => onSetHotspotPanelTab("all")} />
            <HotspotResultTabChip active={hotspotPanelTab === "business"} label="AI行业热榜" count={businessHotItems.length} onClick={() => onSetHotspotPanelTab("business")} />
            <HotspotResultTabChip active={hotspotPanelTab === "douyin"} label="抖音" count={douyinHotItems.length} onClick={() => onSetHotspotPanelTab("douyin")} />
            <HotspotResultTabChip active={hotspotPanelTab === "weibo"} label="微博" count={weiboHotItems.length} onClick={() => onSetHotspotPanelTab("weibo")} />
            <HotspotResultTabChip active={hotspotPanelTab === "zhihu"} label="知乎" count={zhihuHotItems.length} onClick={() => onSetHotspotPanelTab("zhihu")} />
            <HotspotResultTabChip active={hotspotPanelTab === "baidu"} label="百度" count={baiduHotItems.length} onClick={() => onSetHotspotPanelTab("baidu")} />
            {hasManualSearchResult ? (
              <HotspotResultTabChip active={hotspotPanelTab === "search"} label="全网搜索" count={searchItems.length} onClick={() => onSetHotspotPanelTab("search")} />
            ) : null}
          </div>

          <div className="mt-5">{resultBlock}</div>
        </>
      )}
    </div>
  );
}

function HotspotSoftBadge({ children }: { children: ReactNode }) {
  return <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{children}</div>;
}

function HotspotResultTabChip(props: { active: boolean; label: string; count: number; onClick: () => void }) {
  const { active, label, count, onClick } = props;
  return (
    <button
      className={classNames(
        "rounded-full border px-4 py-2 text-sm transition",
        active ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/20 hover:text-white"
      )}
      onClick={onClick}
    >
      {label}
      <span className="ml-2 text-xs opacity-70">{count}</span>
    </button>
  );
}

function CompactHotspotListRow(props: {
  rank: number;
  active: boolean;
  loading?: boolean;
  title: string;
  leadOnly?: boolean;
  onUse: () => void;
}) {
  const { rank, active, loading = false, title, leadOnly = false, onUse } = props;
  return (
    <button
      className={classNames(
        "group flex items-center gap-3 rounded-2xl border p-3 text-left transition-all",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8",
        loading && "cursor-wait opacity-80"
      )}
      onClick={onUse}
      disabled={loading}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-slate-200">{rank}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-xs text-slate-400">{leadOnly ? "正文仍在补全，先按线索取用" : "点击后回填到内容输入区"}</div>
      </div>
      <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{loading ? "提取中" : active ? "已选用" : "选用"}</div>
    </button>
  );
}

function ResponsiveSearchFactPackCard(props: {
  eventAnchor: string;
  summary: string;
  facts: string[];
  timelineClues: string[];
  businessSignals: string[];
  guardrailNote: string;
  sourcesCount: number;
  onUse: () => void;
}) {
  const { eventAnchor, summary, facts, timelineClues, businessSignals, guardrailNote, sourcesCount, onUse } = props;

  return (
    <div className="rounded-3xl border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(0,212,255,0.12),rgba(139,92,246,0.08))] p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="section-eyebrow">搜索事实包</div>
          <div className="mt-2 text-base font-semibold text-white">已把多来源搜索结果清洗成可写稿事实包</div>
          {eventAnchor ? <div className="mt-2 text-sm font-medium text-cyan-100">{eventAnchor}</div> : null}
          <div className="mt-2 break-words text-sm leading-7 text-slate-300">{summary}</div>
        </div>
        <button className="brand-btn w-full md:w-auto" onClick={onUse}>
          使用清洗后事实包
        </button>
      </div>
      {facts.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {facts.slice(0, 4).map((fact, index) => (
            <div key={`${fact}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-slate-200">
              {fact}
            </div>
          ))}
        </div>
      ) : null}
      {(timelineClues.length > 0 || businessSignals.length > 0) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {timelineClues.slice(0, 3).map((item) => (
            <HotspotSoftBadge key={item}>{item}</HotspotSoftBadge>
          ))}
          {businessSignals.slice(0, 3).map((item) => (
            <HotspotSoftBadge key={item}>{item}</HotspotSoftBadge>
          ))}
        </div>
      ) : null}
      {guardrailNote ? (
        <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-6 text-amber-100">
          {guardrailNote}
        </div>
      ) : null}
      <div className="mt-4 text-xs text-slate-400">已汇总 {sourcesCount} 个来源。只有这份清洗后的事实包会进入后续皮骨肉，下面原始搜索源仅作核对参考。</div>
    </div>
  );
}

function ResponsiveSearchSourceCard(props: { active: boolean; title: string; summary: string; source: string; url: string }) {
  const { active, title, summary, source, url } = props;

  return (
    <div
      className={classNames(
        "rounded-3xl border p-4 text-left transition-all",
        active ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/8"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {source ? <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{source}</span> : null}
            <span className="break-words text-sm font-semibold leading-6 text-white sm:leading-7">{title}</span>
          </div>
          <div className="mobile-clamp-3 mt-3 break-words text-sm leading-6 text-slate-300 sm:leading-7">{summary || "暂无摘要"}</div>
          {url ? <div className="mt-3 break-all text-xs leading-5 text-slate-500 sm:truncate">{url}</div> : null}
        </div>
        <div className="w-full sm:w-auto">
          {url ? (
            <a
              className={classNames(
                "inline-flex w-full justify-center whitespace-nowrap rounded-full border px-3 py-2 text-xs transition sm:w-auto sm:py-1",
                active ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/25 hover:text-white"
              )}
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              查看原文
            </a>
          ) : (
            <div className="inline-flex w-full justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400 sm:w-auto sm:py-1">
              仅作参考
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HotspotEmptyBlock({ text }: { text: string }) {
  return <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-slate-400">{text}</div>;
}
