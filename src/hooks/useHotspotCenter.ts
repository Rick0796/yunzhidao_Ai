import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEYS } from "../lib/workbenchStorage";
import { useStoredState } from "../lib/workbenchHelpers";
import {
  buildMaterialFromBusinessHot,
  buildMaterialFromHotRank,
  fetchHotRank,
  fetchHotRankDetail,
  fetchManualSearch,
  type BusinessHotItem,
  type HotRankItem,
  type HotRankResponse,
  type ManualSearchResponse
} from "../lib/workflows";

export type HotspotPanelTab = "all" | "business" | "douyin" | "weibo" | "zhihu" | "baidu" | "search";
export type HotspotExpandState = { all: boolean; business: boolean; douyin: boolean; weibo: boolean; zhihu: boolean; baidu: boolean };

type NoticeTone = "success" | "warning" | "info";

interface UseHotspotCenterOptions {
  baseUrl: string;
  showNotice: (tone: NoticeTone, text: string) => void;
  applyHotspotMaterial: (material: string, nextAngle?: string, selectionKey?: string, note?: string) => void;
}

const DEFAULT_EXPAND_STATE: HotspotExpandState = {
  all: false,
  business: false,
  douyin: false,
  weibo: false,
  zhihu: false,
  baidu: false
};

function cloneExpandState(): HotspotExpandState {
  return { ...DEFAULT_EXPAND_STATE };
}

function hotRankItemNeedsDetail(item: Partial<HotRankItem & BusinessHotItem>) {
  if (!(item as { detail_loaded?: boolean }).detail_loaded) return true;
  const content = ((item as HotRankItem).clean_content || item.content || "").trim();
  const title = (item.title || "").trim();
  const summary = (item.summary || "").trim();
  const qualityStatus = (((item as { quality_status?: string }).quality_status) || "").trim();
  if (!content) return true;
  if (qualityStatus !== "ready") return true;
  if (content.length < 260) return true;
  if (title && content === title) return true;
  if (summary && content === summary) return true;
  return false;
}

function hotRankItemNeedsSearchFallback(item: Partial<HotRankItem & BusinessHotItem>) {
  const content = ((item as HotRankItem).clean_content || item.content || "").trim();
  const qualityStatus = (((item as { quality_status?: string }).quality_status) || "").trim();
  if (!content) return true;
  if (/^(Warning:|This page contains shadow DOM|This is a cached snapshot|Target URL returned error|Forbidden\b)/i.test(content)) return true;
  if (qualityStatus !== "ready") return true;
  return content.length < 220;
}

function buildHotRankSearchFallbackQuery(item: Partial<HotRankItem & BusinessHotItem>) {
  const title = (item.title || "").trim();
  const summary = (item.summary || "").trim();
  if (!title) return "";
  if (!summary || summary === title) return title;
  const firstSummary = summary
    .split(/[。！？!?；;]/)
    .map((part) => part.trim())
    .find(Boolean) || "";
  if (!firstSummary || firstSummary === title) return title;
  return `${title} ${firstSummary}`.slice(0, 42).trim();
}

export function useHotspotCenter(options: UseHotspotCenterOptions) {
  const apiBaseUrl = "/api";
  const [hotRankResult, setHotRankResult] = useStoredState<HotRankResponse | null>(STORAGE_KEYS.hotRankResult, null);
  const [hotRankFetchedAt, setHotRankFetchedAt] = useStoredState<string>(STORAGE_KEYS.hotRankFetchedAt, "");
  const [manualSearchResult, setManualSearchResult] = useState<ManualSearchResponse | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState("");
  const [hotspotPanelTab, setHotspotPanelTab] = useState<HotspotPanelTab>("all");
  const [selectedHotspotKey, setSelectedHotspotKey] = useState<string | null>(null);
  const [isLoadingHotRank, setIsLoadingHotRank] = useState(false);
  const [isLoadingManualSearch, setIsLoadingManualSearch] = useState(false);
  const [loadingHotspotKey, setLoadingHotspotKey] = useState<string | null>(null);
  const [hotspotListExpanded, setHotspotListExpanded] = useState<HotspotExpandState>(cloneExpandState);
  const [showHotspotCenter, setShowHotspotCenter] = useState(true);

  const hotRankResultRef = useRef(hotRankResult);
  const showNoticeRef = useRef(options.showNotice);
  const applyHotspotMaterialRef = useRef(options.applyHotspotMaterial);

  useEffect(() => {
    hotRankResultRef.current = hotRankResult;
  }, [hotRankResult]);

  useEffect(() => {
    showNoticeRef.current = options.showNotice;
  }, [options.showNotice]);

  useEffect(() => {
    applyHotspotMaterialRef.current = options.applyHotspotMaterial;
  }, [options.applyHotspotMaterial]);

  const notify = useCallback((tone: NoticeTone, text: string) => {
    showNoticeRef.current(tone, text);
  }, []);

  const applyHotspot = useCallback((material: string, nextAngle?: string, selectionKey?: string, note?: string) => {
    applyHotspotMaterialRef.current(material, nextAngle, selectionKey, note);
  }, []);

  const allHotItems = hotRankResult?.allHotList || [];
  const businessHotItems = hotRankResult?.businessHotList || [];
  const platformBuckets = hotRankResult?.platformBuckets || {};
  const douyinHotItems = platformBuckets.douyin || [];
  const weiboHotItems = platformBuckets.weibo || [];
  const zhihuHotItems = platformBuckets.zhihu || [];
  const baiduHotItems = platformBuckets.baidu || [];
  const searchItems = manualSearchResult?.searchData || [];
  const factPack = manualSearchResult?.factPack || null;
  const cacheWarning = hotRankResult?.cache?.warning || "";
  const cacheText = isLoadingHotRank || hotRankResult?.cache?.refreshing
    ? hotRankResult?.cache?.fetchedAt || hotRankFetchedAt
      ? "后台正在刷新，先展示最近缓存"
      : "热榜后台抓取中…"
    : hotRankResult?.cache?.fetchedAt || hotRankFetchedAt
      ? `最近就绪时间：${hotRankResult?.cache?.fetchedAt || hotRankFetchedAt}${hotRankResult?.cache?.stale ? "（缓存）" : ""}`
      : "页面打开后会自动预加载最近热榜";

  const resetHotspotWorkspace = useCallback(() => {
    setManualSearchResult(null);
    setManualSearchQuery("");
    setHotspotPanelTab("all");
    setSelectedHotspotKey(null);
    setHotspotListExpanded(cloneExpandState());
  }, []);

  const mergeHotRankDetailIntoState = useCallback(
    (detail: Partial<HotRankItem & BusinessHotItem>, identity: { hotId?: string; title?: string; sourceUrl?: string }) => {
      const matchItem = (item: Partial<HotRankItem & BusinessHotItem>) => {
        const sourceUrl = (item as HotRankItem).source_url || (item as BusinessHotItem).source_url || "";
        if (identity.hotId && item.hot_id === identity.hotId) return true;
        if (identity.title && item.title === identity.title && identity.sourceUrl && sourceUrl === identity.sourceUrl) return true;
        return Boolean(identity.title && item.title === identity.title && !identity.sourceUrl);
      };

      const applyItem = <T extends Partial<HotRankItem & BusinessHotItem>>(item: T) => (matchItem(item) ? { ...item, ...detail } : item);

      setHotRankResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          allHotList: prev.allHotList.map((item) => applyItem(item as HotRankItem) as HotRankItem),
          businessHotList: prev.businessHotList.map((item) => applyItem(item as BusinessHotItem) as BusinessHotItem),
          platformBuckets: Object.fromEntries(
            Object.entries(prev.platformBuckets || {}).map(([platform, items]) => [platform, (items || []).map((item) => applyItem(item as HotRankItem) as HotRankItem)])
          )
        };
      });
    },
    [setHotRankResult]
  );

  const handleUseHotRankItem = useCallback(
    async (item: HotRankItem | BusinessHotItem, optionsForUse: { business?: boolean; itemKey: string }) => {
      setLoadingHotspotKey(optionsForUse.itemKey);
      try {
        let resolvedItem: HotRankItem | BusinessHotItem = item;
        if (hotRankItemNeedsDetail(item)) {
          const detail = await fetchHotRankDetail(apiBaseUrl, item);
          const displaySummary = ((detail as { display_summary?: string }).display_summary || (item as { display_summary?: string }).display_summary || detail.summary || item.summary || "").trim();
          resolvedItem = {
            ...item,
            title: detail.title || item.title,
            summary: detail.summary || item.summary,
            display_title: (detail as { display_title?: string }).display_title || (item as { display_title?: string }).display_title,
            display_summary: displaySummary,
            clean_content: (detail as { clean_content?: string }).clean_content || detail.content || (item as { clean_content?: string }).clean_content || item.content,
            content: (detail as { clean_content?: string }).clean_content || detail.content || (item as { clean_content?: string }).clean_content || item.content,
            business_reason: (detail as { business_reason?: string }).business_reason || (item as { business_reason?: string; boss_impact?: string }).business_reason || (item as { boss_impact?: string }).boss_impact,
            quality_score: (detail as { quality_score?: number }).quality_score ?? (item as { quality_score?: number }).quality_score,
            quality_status: (detail as { quality_status?: string }).quality_status || (item as { quality_status?: string }).quality_status,
            detail_loaded: true,
            source_url: detail.source_url || item.source_url,
            article_source: detail.article_source || item.article_source,
            article_url: detail.article_url || (item as HotRankItem).article_url
          };
          if (hotRankItemNeedsSearchFallback(resolvedItem)) {
            const fallbackQuery = buildHotRankSearchFallbackQuery(resolvedItem);
            if (fallbackQuery) {
              const searchResult = await fetchManualSearch(apiBaseUrl, fallbackQuery);
              const fallbackFactPack = searchResult.factPack;
              const fallbackContent = (fallbackFactPack?.cleanContent || fallbackFactPack?.sourceText || "").trim();
              const currentContent = (((resolvedItem as { clean_content?: string }).clean_content || resolvedItem.content || "") as string).trim();
              if (fallbackContent.length > currentContent.length + 40) {
                resolvedItem = {
                  ...resolvedItem,
                  clean_content: fallbackContent,
                  content: fallbackContent,
                  business_reason: (resolvedItem as { business_reason?: string }).business_reason || fallbackFactPack?.businessReason || "",
                  quality_score: Math.max(Number((resolvedItem as { quality_score?: number }).quality_score) || 0, Number(fallbackFactPack?.qualityScore) || 0),
                  quality_status: fallbackFactPack?.qualityStatus || (resolvedItem as { quality_status?: string }).quality_status,
                  detail_loaded: true
                };
              }
            }
          }
          mergeHotRankDetailIntoState(
            {
              title: resolvedItem.title,
              summary: resolvedItem.summary,
              display_title: (resolvedItem as { display_title?: string }).display_title,
              display_summary: (resolvedItem as { display_summary?: string }).display_summary,
              clean_content: (resolvedItem as { clean_content?: string }).clean_content,
              content: resolvedItem.content,
              business_reason: (resolvedItem as { business_reason?: string }).business_reason,
              quality_score: (resolvedItem as { quality_score?: number }).quality_score,
              quality_status: (resolvedItem as { quality_status?: string }).quality_status,
              detail_loaded: true,
              source_url: resolvedItem.source_url,
              article_source: resolvedItem.article_source,
              article_url: (resolvedItem as HotRankItem).article_url
            },
            {
              hotId: item.hot_id,
              title: item.title,
              sourceUrl: item.source_url
            }
          );
        }

        const material = optionsForUse.business
          ? buildMaterialFromBusinessHot(resolvedItem as BusinessHotItem)
          : buildMaterialFromHotRank(resolvedItem as HotRankItem);
        applyHotspot(material.sourceText, material.hotspotAngle, optionsForUse.itemKey);
        if ((resolvedItem as { quality_status?: string }).quality_status && (resolvedItem as { quality_status?: string }).quality_status !== "ready") {
          notify("warning", "这条热点正文还不够完整，已按线索回填，建议再用全网搜索补素材。");
        }
      } catch (error) {
        const fallbackQuery = buildHotRankSearchFallbackQuery(item);
        if (fallbackQuery) {
          try {
            const searchResult = await fetchManualSearch(apiBaseUrl, fallbackQuery);
            const fallbackFactPack = searchResult.factPack;
            const fallbackContent = (fallbackFactPack?.cleanContent || fallbackFactPack?.sourceText || "").trim();
            if (fallbackContent.length >= 120) {
              applyHotspot(fallbackContent, fallbackFactPack?.businessReason || "", optionsForUse.itemKey);
              notify("warning", "热点详情提取失败，已自动改用全网搜索事实包回填。");
              return;
            }
          } catch {
            // Keep the existing summary fallback below.
          }
        }
        const fallbackMaterial = optionsForUse.business ? buildMaterialFromBusinessHot(item as BusinessHotItem) : buildMaterialFromHotRank(item as HotRankItem);
        applyHotspot(fallbackMaterial.sourceText, fallbackMaterial.hotspotAngle, optionsForUse.itemKey);
        notify("warning", `热点详情提取失败，先使用已有摘要：${error instanceof Error ? error.message : "未知错误"}`);
      } finally {
        setLoadingHotspotKey(null);
      }
    },
    [apiBaseUrl, applyHotspot, mergeHotRankDetailIntoState, notify]
  );

  const handleFetchTodayHotRank = useCallback(
    async (fetchOptions?: { forceRefresh?: boolean; silent?: boolean }) => {
      setIsLoadingHotRank(true);
      try {
        const result = await fetchHotRank(apiBaseUrl, { allLimit: 20, businessLimit: 10, forceRefresh: fetchOptions?.forceRefresh ?? false });
        setHotRankResult(result);
        setHotRankFetchedAt(result.cache?.fetchedAt || result.generatedAt || "");
        setHotspotPanelTab("all");
        setSelectedHotspotKey(null);
        setHotspotListExpanded(cloneExpandState());
        if (fetchOptions?.silent) {
          return;
        }
        if (result.cache?.refreshing && result.allHotList.length > 0) {
          notify("info", "已切到最近热榜缓存，后台正在刷新最新结果。");
          return;
        }
        if (result.cache?.refreshing) {
          notify("info", "热榜正在后台抓取，稍后会自动刷新出来。");
          return;
        }
        if (result.cache?.warning && result.allHotList.length > 0) {
          notify("warning", `本次刷新没拿到新结果，先展示最近缓存：${result.cache.warning}`);
          return;
        }
        if (result.allHotList.length === 0) {
          notify("info", "热榜正在准备中，稍后会自动补齐。");
          return;
        }
        notify("success", `今日热榜已就绪，当前可选 ${result.allHotList.length} 条全网热点。`);
      } catch (error) {
        if (!fetchOptions?.silent || !hotRankResultRef.current) {
          notify("warning", `热榜获取失败：${error instanceof Error ? error.message : "未知错误"}`);
        }
      } finally {
        setIsLoadingHotRank(false);
      }
    },
    [apiBaseUrl, notify, setHotRankFetchedAt, setHotRankResult]
  );

  const handleSearchTopic = useCallback(async () => {
    const query = manualSearchQuery.trim();
    if (!query) {
      notify("warning", "先输入你要搜索的热点关键词。");
      return;
    }

    setIsLoadingManualSearch(true);
    try {
      const result = await fetchManualSearch(apiBaseUrl, query);
      setManualSearchResult(result);
      setHotspotPanelTab("search");
      setSelectedHotspotKey(null);
      const total = result.searchData.length + result.toutiaoData.length;
      if (total === 0) {
        notify("warning", "搜索完成，但暂时没有拿到有效结果，建议换个关键词再试。");
        return;
      }
      notify("success", `搜索完成，已整理 ${total} 条线索，并生成事实包。`);
    } catch (error) {
      notify("warning", `搜索失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsLoadingManualSearch(false);
    }
  }, [apiBaseUrl, manualSearchQuery, notify]);

  const confirmRefreshHotRank = useCallback(() => {
    if (!window.confirm("确定要刷新今日热榜吗？这会重新触发工作流抓取最新结果。")) {
      return;
    }
    void handleFetchTodayHotRank({ forceRefresh: true });
  }, [handleFetchTodayHotRank]);

  useEffect(() => {
    void handleFetchTodayHotRank({ silent: true, forceRefresh: false });
  }, [handleFetchTodayHotRank]);

  useEffect(() => {
    if (!hotRankResult?.cache?.refreshing) return;
    const timer = window.setTimeout(() => {
      void handleFetchTodayHotRank({ silent: true, forceRefresh: false });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [handleFetchTodayHotRank, hotRankResult?.cache?.refreshing]);

  return {
    allHotItems,
    baiduHotItems,
    businessHotItems,
    cacheText,
    cacheWarning,
    confirmRefreshHotRank,
    douyinHotItems,
    factPack,
    handleSearchTopic,
    handleUseHotRankItem,
    hotRankFetchedAt,
    hotRankResult,
    hotspotListExpanded,
    hotspotPanelTab,
    isLoadingHotRank,
    isLoadingManualSearch,
    loadingHotspotKey,
    manualSearchQuery,
    manualSearchResult,
    resetHotspotWorkspace,
    searchItems,
    selectedHotspotKey,
    setSelectedHotspotKey,
    setHotspotListExpanded,
    setHotspotPanelTab,
    setManualSearchQuery,
    setShowHotspotCenter,
    showHotspotCenter,
    weiboHotItems,
    zhihuHotItems
  };
}
