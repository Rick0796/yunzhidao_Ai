import { useEffect, useState } from "react";
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

export function useHotspotCenter(options: UseHotspotCenterOptions) {
  const apiBaseUrl = options.baseUrl || "/api";
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
      ? "??????????????"
      : "????????"
    : hotRankResult?.cache?.fetchedAt || hotRankFetchedAt
      ? `???????${hotRankResult?.cache?.fetchedAt || hotRankFetchedAt}${hotRankResult?.cache?.stale ? "????" : ""}`
      : "???????????????";

  useEffect(() => {
    void handleFetchTodayHotRank({ silent: true, forceRefresh: false });
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!hotRankResult?.cache?.refreshing) return;
    const timer = window.setTimeout(() => {
      void handleFetchTodayHotRank({ silent: true, forceRefresh: false });
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [apiBaseUrl, hotRankResult?.cache?.refreshing]);

  function resetHotspotWorkspace() {
    setManualSearchResult(null);
    setManualSearchQuery("");
    setHotspotPanelTab("all");
    setSelectedHotspotKey(null);
    setHotspotListExpanded(cloneExpandState());
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
      .split(/[???!??;]/)
      .map((part) => part.trim())
      .find(Boolean) || "";
    if (!firstSummary || firstSummary === title) return title;
    return `${title} ${firstSummary}`.slice(0, 42).trim();
  }

  function mergeHotRankDetailIntoState(
    detail: Partial<HotRankItem & BusinessHotItem>,
    identity: { hotId?: string; title?: string; sourceUrl?: string }
  ) {
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
  }

  async function handleUseHotRankItem(item: HotRankItem | BusinessHotItem, optionsForUse: { business?: boolean; itemKey: string }) {
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
      options.applyHotspotMaterial(material.sourceText, material.hotspotAngle, optionsForUse.itemKey);
      if ((resolvedItem as { quality_status?: string }).quality_status && (resolvedItem as { quality_status?: string }).quality_status !== "ready") {
        options.showNotice("warning", "???????????????????????????????");
      }
    } catch (error) {
      const fallbackQuery = buildHotRankSearchFallbackQuery(item);
      if (fallbackQuery) {
        try {
          const searchResult = await fetchManualSearch(apiBaseUrl, fallbackQuery);
          const fallbackFactPack = searchResult.factPack;
          const fallbackContent = (fallbackFactPack?.cleanContent || fallbackFactPack?.sourceText || "").trim();
          if (fallbackContent.length >= 120) {
            options.applyHotspotMaterial(fallbackContent, fallbackFactPack?.businessReason || "", optionsForUse.itemKey);
            options.showNotice("warning", "????????????????????????");
            return;
          }
        } catch {
          // Keep the existing summary fallback below.
        }
      }
      const fallbackMaterial = optionsForUse.business ? buildMaterialFromBusinessHot(item as BusinessHotItem) : buildMaterialFromHotRank(item as HotRankItem);
      options.applyHotspotMaterial(fallbackMaterial.sourceText, fallbackMaterial.hotspotAngle, optionsForUse.itemKey);
      options.showNotice("warning", `?????????????????${error instanceof Error ? error.message : "????"}`);
    } finally {
      setLoadingHotspotKey(null);
    }
  }

  async function handleFetchTodayHotRank(fetchOptions?: { forceRefresh?: boolean; silent?: boolean }) {
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
        options.showNotice("info", "?????????????????????");
        return;
      }
      if (result.cache?.refreshing) {
        options.showNotice("info", "???????????????????");
        return;
      }
      if (result.cache?.warning && result.allHotList.length > 0) {
        options.showNotice("warning", `???????????????????${result.cache.warning}`);
        return;
      }
      if (result.allHotList.length === 0) {
        options.showNotice("info", "????????????????");
        return;
      }
      options.showNotice("success", `???????????? ${result.allHotList.length} ??????`);
    } catch (error) {
      if (!fetchOptions?.silent || !hotRankResult) {
        options.showNotice("warning", `???????${error instanceof Error ? error.message : "????"}`);
      }
    } finally {
      setIsLoadingHotRank(false);
    }
  }

  async function handleSearchTopic() {
    const query = manualSearchQuery.trim();
    if (!query) {
      options.showNotice("warning", "??????????????");
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
        options.showNotice("warning", "???????????????????????????");
        return;
      }
      options.showNotice("success", `???????? ${total} ???????????`);
    } catch (error) {
      options.showNotice("warning", `?????${error instanceof Error ? error.message : "????"}`);
    } finally {
      setIsLoadingManualSearch(false);
    }
  }

  function confirmRefreshHotRank() {
    if (!window.confirm("???????????????????????????")) {
      return;
    }
    void handleFetchTodayHotRank({ forceRefresh: true });
  }

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
