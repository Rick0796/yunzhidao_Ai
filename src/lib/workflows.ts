function normalizeBaseUrl(baseUrl: string) {
  return (baseUrl || "/api").replace(/\/+$/, "");
}

const WORKFLOW_REQUEST_TIMEOUT_MS = 45000;
const INVALID_DISPLAY_CHAR_PATTERN = /[\u0000-\u001f\u007f-\u009f\uE000-\uF8FF\uFFF0-\uFFFF�]+/g;
const UPSTREAM_ERROR_TEXT_PATTERN = /(SecurityCompromiseError|Anonymous access to domain blocked|DDoS attack suspected|readableMessage|["“]code["”]\s*:\s*451|["“]status["”]\s*:\s*45102)/i;
const DISPLAY_TITLE_MAX_LENGTH = 24;
const DISPLAY_SUMMARY_MAX_LENGTH = 28;

function cleanText(value?: string) {
  if (!value) return "";
  return value
    .replace(INVALID_DISPLAY_CHAR_PATTERN, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function looksLikeUpstreamErrorText(value?: string) {
  const text = cleanText(value);
  if (!text) return false;
  if (UPSTREAM_ERROR_TEXT_PATTERN.test(text)) return true;
  return text.startsWith("{") && /["“](?:data|code|message|status)["”]\s*:/.test(text);
}

function stripEnglishPrefix(text: string) {
  const firstChineseIndex = text.search(/[\u4e00-\u9fff]/);
  if (firstChineseIndex > 24) {
    return text.slice(firstChineseIndex).trim();
  }
  return text;
}

function normalizeSummary(value?: string) {
  const text = stripEnglishPrefix(cleanText(value));
  return text.replace(/https?:\/\/\S+/g, "").trim();
}

const MATERIAL_ROLE_NOISE_PATTERN =
  /^(?:监制|制片人|编导|记者|编辑|责编|责任编辑|后期|配音|素材支持|统筹|审核|出品人|策划|剪辑|作者|主持人|通讯员)\s*[丨|：:]/i;
const MATERIAL_SOCIAL_NOISE_PATTERN =
  /(打开微信|扫一扫|微信扫一扫|分享至朋友圈|分享到朋友圈|分享到微信|媒体矩阵|下载APP|下载客户端|客户端下载|二维码|工人日报客户端)/i;
const MATERIAL_FOOTER_NOISE_PATTERN =
  /(Copyright|版权所有|返回首页|相关阅读|延伸阅读|推荐阅读|热点推荐|相关新闻|专题推荐|更多精彩)/i;
const MATERIAL_PAGE_NOISE_PATTERN = /(百度一下|文心助手|APP内查看|点击查看|点击进入专题|网页链接|自媒体热点\s*>\s*正文|滚动\s*$|正文\s*$)/i;
const MATERIAL_INFOBAR_NOISE_PATTERN = /(Language|Audio and Subscription|Subscription|全球视野|常人故事|其它|联合国新闻|UN News|Unsplash\/[A-Za-z0-9_-]+|©\s*\S+)/i;
const MATERIAL_COMMENT_NOISE_PATTERN = /(评论区|网友|说实话|不稀奇|再近点|我要看看|有没人|看不清|革命尚未成功|同志仍需努力|腿毛|挖鼻孔|都是人才|心里清楚|焦虑啊|必须要看清楚)/i;
const MATERIAL_RANK_BOARD_PATTERN = /(热搜榜|民生榜|财经榜|关注榜|热榜|榜单|(?:^|\s)\d{1,2}\s*(?:热|新)(?=\s|$)|(?:^|\s)\d{1,2}(?:\s+\d{1,2}){5,})/i;
const MATERIAL_MARKDOWN_LINK_PATTERN = /(?:^|\s)#+\s*\[[^\]]{4,120}\]|\[[^\]]{4,120}\]\([^)]{0,240}\)/;
const HOTSPOT_META_ANGLE_PATTERN = /^(这条热点已经能往|这类(?:外部冲击|变化|内容|热点)|适合继续拆成|老板需要提前准备应对动作)/i;
const MATERIAL_READER_WARNING_PATTERN = /^(Warning:|This page contains shadow DOM|This is a cached snapshot|Target URL returned error|please make sure you are authorized|requiring CAPTCHA|Forbidden\b)/i;

function normalizeMaterialText(value?: string) {
  return normalizeSummary(value)
    .replace(/(?:Warning:.*$|This page contains shadow DOM.*$|This is a cached snapshot.*$|Target URL returned error.*$|please make sure you are authorized.*$|requiring CAPTCHA.*$|Forbidden\b.*$)/gim, " ")
    .replace(/\[[^\]]{4,120}\]\([^)]{0,240}\)/g, " ")
    .replace(/#+\s*\[[^\]]{4,120}\]/g, " ")
    .replace(/\*+\s*\*+\s*\*+/g, " ")
    .replace(/\s*[-|｜]\s*滚动\s*[-|｜]\s*[^。！？!?]{0,40}/gi, " ")
    .replace(/\*\s*更多/gi, " ")
    .replace(/(?:\|\s*\|?\s*\d*\s*)?(?:联合国新闻|UN News)\b.*?(?=Language|Audio and Subscription|全球视野|常人故事|其它|©|$)/gi, " ")
    .replace(/(?:Language|Audio and Subscription|Subscription|全球视野|常人故事|其它|©\s*\S+|Unsplash\/[A-Za-z0-9_-]+).*/gi, " ")
    .replace(/(?:监制|制片人|编导|记者|编辑|责编|责任编辑|后期|配音|素材支持|统筹|审核|出品人|策划|剪辑|作者|主持人|通讯员)\s*[丨|：:][^。！？!\n]{0,240}/gi, " ")
    .replace(/(?:更多资讯请)?(?:下载|打开)(?:[^\s，。！？!?]{0,10})?客户端/gi, " ")
    .replace(/(?:媒体矩阵|打开微信|扫一扫|微信扫一扫|分享至朋友圈|分享到朋友圈|分享到微信|下载APP|下载客户端|客户端下载|二维码|工人日报客户端)[^。！？!\n]{0,240}/gi, " ")
    .replace(/(?:Copyright|版权所有|相关阅读|延伸阅读|推荐阅读|热点推荐|相关新闻|专题推荐|更多精彩)[^。！？!\n]{0,160}/gi, " ")
    .replace(/(?:[_\s]{0,4}播报[_\s]{0,4}暂停.*$|播报\s*暂停.*$)/gim, " ")
    .replace(/###.*$/gim, " ")
    .replace(/(?:相关阅读|推荐阅读|更多精彩|热点推荐|相关新闻|专题推荐|延伸阅读|相关内容).*$/gim, " ")
    .replace(/(?:\*{1,3}\s*)?[^\s]{0,20}\s*\(\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}.*$/gim, " ")
    .replace(/"([^"]+)"/g, "“$1”")
    .replace(/→/g, "")
    .replace(/^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:[日\sT]*\d{1,2}:\d{2})?\s*[，,:：-]?\s*/g, "")
    .replace(/今天（\d{1,2}月\d{1,2}日）/g, "节目中")
    .replace(/截至\d{1,2}月\d{1,2}日/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/[，。；;:：\s]+$/g, "")}…`;
}

function cleanDisplayText(value?: string) {
  const cleaned = normalizeMaterialText(value)
    .replace(/[_~`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return looksLikeUpstreamErrorText(cleaned) ? "" : cleaned;
}

function materialDedupeKey(text: string) {
  return cleanText(text).replace(/[^\u4e00-\u9fffa-z0-9]+/gi, "").toLowerCase();
}

function looksLikeMaterialNoise(text: string) {
  const value = cleanText(text);
  if (!value) return true;
  if (MATERIAL_ROLE_NOISE_PATTERN.test(value)) return true;
  if (MATERIAL_PAGE_NOISE_PATTERN.test(value)) return true;
  if (MATERIAL_INFOBAR_NOISE_PATTERN.test(value)) return true;
  if (MATERIAL_COMMENT_NOISE_PATTERN.test(value)) return true;
  if (MATERIAL_RANK_BOARD_PATTERN.test(value)) return true;
  if (MATERIAL_READER_WARNING_PATTERN.test(value)) return true;
  if (MATERIAL_MARKDOWN_LINK_PATTERN.test(value)) return true;
  if (MATERIAL_SOCIAL_NOISE_PATTERN.test(value) && value.length <= 180) return true;
  if (MATERIAL_FOOTER_NOISE_PATTERN.test(value) && value.length <= 180) return true;
  if (value.startsWith("* [") || value.startsWith("[")) return true;
  if (/^[#=* -]{4,}$/.test(value)) return true;
  const bracketCount = (value.match(/[\[\]\(\)]/g) || []).length;
  if (bracketCount >= 4) return true;
  return false;
}

function collectMaterialSentences(value?: string, maxCount = 2, excludeLines: string[] = []) {
  const normalized = normalizeMaterialText(value);
  if (!normalized) return [];

  const seenKeys = excludeLines
    .map((item) => materialDedupeKey(item))
    .filter(Boolean);
  const accepted: string[] = [];

  for (const chunk of normalized
    .split(/[。！？!?；;\n]/)
    .map((item) => cleanText(item))
    .filter((item) => item.length >= 10)) {
    if (looksLikeMaterialNoise(chunk)) continue;
    const sentence = normalizeMaterialSentence(chunk);
    const key = materialDedupeKey(sentence);
    if (!key) continue;
    if (seenKeys.some((existing) => existing === key || existing.includes(key) || key.includes(existing))) {
      continue;
    }
    seenKeys.push(key);
    accepted.push(sentence);
    if (accepted.length >= maxCount) break;
  }

  return accepted;
}

function extractMaterialSentences(value?: string, maxCount = 2) {
  return collectMaterialSentences(value, maxCount);
}

function pickMaterialExcerpt(value?: string, maxLength = 120) {
  const sentences = extractMaterialSentences(value, 2);
  if (sentences.length === 0) return "";
  return trimText(sentences.join("。"), maxLength);
}

function buildMaterialBody(value?: string, maxCount = 10, maxLength = 2200, excludeLines: string[] = []) {
  const sentences = collectMaterialSentences(value, maxCount, excludeLines);
  if (sentences.length === 0) return "";
  return trimText(sentences.join("\n"), maxLength);
}

function normalizeTimelineFact(value?: string) {
  return normalizeMaterialText(value).replace(/^(时间线|时间线上能确认的是)\s*[：:]/, "").trim();
}

function normalizeMaterialSentence(text: string) {
  const value = cleanText(text).replace(/[。；;，,\s]+$/, "");
  if (!value) return "";
  return /[。！？!?]$/.test(value) ? value : `${value}。`;
}

function dedupeMaterialLines(lines: Array<string | undefined | null | false>) {
  const next: string[] = [];
  for (const line of lines) {
    if (!line) continue;
    const normalized = cleanText(String(line));
    if (!normalized) continue;
    if (looksLikeMaterialNoise(normalized)) continue;
    const key = materialDedupeKey(normalized);
    if (!key) continue;
    if (next.some((item) => {
      const existingKey = materialDedupeKey(item);
      return existingKey === key || existingKey.includes(key) || key.includes(existingKey);
    })) {
      continue;
    }
    next.push(normalized);
  }
  return next;
}

function joinNaturalSentences(lines: Array<string | undefined | null | false>) {
  return lines
    .filter(Boolean)
    .map((line) => cleanText(String(line)))
    .filter(Boolean)
    .join("\n");
}

function toChineseSentence(text: string) {
  const value = cleanText(text).replace(/[。；;，,\s]+$/, "");
  if (!value) return "";
  return /[。！？!?]$/.test(value) ? value : `${value}。`;
}

function buildDisplaySummary(primary?: string, fallback?: string, maxLength = DISPLAY_SUMMARY_MAX_LENGTH) {
  const primarySentences = collectMaterialSentences(primary, 2);
  const fallbackSentences = collectMaterialSentences(fallback, 2, primarySentences);
  const sentence = primarySentences[0] || fallbackSentences[0] || "";
  const nextSentence = (!sentence || sentence.length < 14) ? primarySentences[1] || fallbackSentences[1] || "" : "";
  const summary = [sentence, nextSentence].filter(Boolean).join(" ");
  if (summary) return trimText(summary, maxLength);
  return trimText(cleanDisplayText(primary || fallback), maxLength);
}

function buildDisplayTitle(title?: string, fallback?: string, maxLength = DISPLAY_TITLE_MAX_LENGTH) {
  const candidate = cleanDisplayText(title) || collectMaterialSentences(fallback, 1)[0] || cleanDisplayText(fallback);
  return trimText(candidate, maxLength);
}

function sanitizeHotspotAngle(value?: string) {
  const cleaned = cleanDisplayText(value);
  if (!cleaned || HOTSPOT_META_ANGLE_PATTERN.test(cleaned)) return "";
  return trimText(cleaned, 120);
}

function buildHiddenContent(primary?: string, fallback?: string, maxLength = 3200) {
  const content = buildMaterialBody(primary || fallback || "", 18, maxLength);
  if (content) return content;
  return trimText(cleanDisplayText(primary || fallback), maxLength);
}

async function requestJson<T>(baseUrl: string, path: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), WORKFLOW_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.detail;
      const error = payload?.error?.message || (typeof detail === "string" ? detail : detail?.message) || response.statusText || "请求失败";
      throw new Error(error);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("请求超时：45 秒内没有拿到结果，请检查后端网络或工作流配置。");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface HotRankItem {
  hot_id?: string;
  title?: string;
  summary?: string;
  display_title?: string;
  display_summary?: string;
  content?: string;
  clean_content?: string;
  publish_time?: string;
  source_platform?: string;
  media_name?: string;
  source_url?: string;
  article_source?: string;
  article_url?: string;
  topic_type?: string;
  heat_score?: number;
  why_hot?: string;
  key_points?: string[];
  timeline?: string[];
  public_impact?: string;
  boss_impact?: string;
  business_reason?: string;
  quality_score?: number;
  quality_status?: string;
  detail_loaded?: boolean;
}

export interface BusinessHotItem {
  hot_id?: string;
  title?: string;
  summary?: string;
  display_title?: string;
  display_summary?: string;
  content?: string;
  clean_content?: string;
  publish_time?: string;
  topic_type?: string;
  business_relevance_score?: number;
  recommend_reason?: string;
  recommended_angle?: string;
  recommended_content_type?: string;
  bridge_directions?: string[];
  source_url?: string;
  article_source?: string;
  article_url?: string;
  business_score?: number;
  business_reason?: string;
  quality_score?: number;
  quality_status?: string;
  detail_loaded?: boolean;
}

export interface HotRankResponse {
  snapshotTitle: string;
  generatedAt: string;
  debug: Record<string, number>;
  allHotList: HotRankItem[];
  businessHotList: BusinessHotItem[];
  platformBuckets?: Record<string, HotRankItem[]>;
  workflow: {
    id: string;
    name: string;
  };
  cache?: {
    fetchedAt?: string;
    stale?: boolean;
    refreshing?: boolean;
    fromCache?: boolean;
    warning?: string;
  };
}

export interface HotRankDetailResponse {
  title: string;
  summary: string;
  display_title?: string;
  display_summary?: string;
  content: string;
  clean_content?: string;
  source_url: string;
  article_source?: string;
  article_url?: string;
  business_reason?: string;
  quality_score?: number;
  quality_status?: string;
}

function mapRawHotItem(item: any, generatedAt: string): HotRankItem {
  const title = cleanDisplayText(item.title || "");
  const summary = cleanDisplayText(item.summary || "");
  const content = looksLikeUpstreamErrorText(item.clean_content || item.content) ? "" : buildHiddenContent(item.clean_content || item.content || "", item.summary || item.title || "");
  const whyHot = cleanDisplayText(item.why_hot || "");
  const businessReason = cleanDisplayText(item.business_reason || item.boss_impact || "");
  const displayTitle = cleanDisplayText(item.display_title || "") || buildDisplayTitle(title, summary || whyHot || content);
  const displaySummary = cleanDisplayText(item.display_summary || "") || buildDisplaySummary(summary || whyHot, content || title);
  return {
    hot_id: item.article_url || item.url || item.hot_id || "",
    title,
    summary: summary || whyHot || buildDisplaySummary(content, title, 120),
    display_title: displayTitle,
    display_summary: displaySummary,
    content,
    clean_content: content,
    publish_time: generatedAt || "",
    source_platform: item.source_platform || item.platform || "",
    media_name: item.article_source || item.platform || "",
    source_url: item.article_url || item.url || "",
    article_source: item.article_source || "",
    article_url: item.article_url || "",
    topic_type: item.topic_type || "平台热榜",
    heat_score: parseInt(item.hot_value, 10) || 0,
    why_hot: whyHot || buildDisplaySummary(summary || businessReason, content, 110),
    key_points: [],
    timeline: [],
    public_impact: "",
    boss_impact: businessReason,
    business_reason: businessReason,
    quality_score: Number(item.quality_score) || 0,
    quality_status: item.quality_status || ""
  };
}

export interface SearchResultItem {
  title?: string;
  summary?: string;
  displayTitle?: string;
  displaySummary?: string;
  content?: string;
  cleanContent?: string;
  sitename?: string;
  url?: string;
  has_image?: boolean;
  image_url?: string;
  sourcePlatform?: string;
  qualityScore?: number;
  qualityStatus?: string;
}

export interface SearchFactPack {
  topic: string;
  eventAnchor?: string;
  fullEventAnchor?: string;
  summary: string;
  displaySummary?: string;
  keyFacts: string[];
  focusTitles?: string[];
  timelineClues?: string[];
  coreConflict?: string;
  businessSignals?: string[];
  ambiguousTerms?: string[];
  forbiddenExpansions?: string[];
  guardrailNote?: string;
  sourceText: string;
  cleanContent?: string;
  businessReason?: string;
  qualityScore?: number;
  qualityStatus?: string;
  sources: SearchResultItem[];
}

export interface ManualSearchResponse {
  topicQuery: string;
  searchCode: number;
  searchMessage: string;
  searchData: SearchResultItem[];
  toutiaoCode: number;
  toutiaoMessage: string;
  toutiaoData: SearchResultItem[];
  factPack?: SearchFactPack | null;
  workflow: {
    id: string;
    name: string;
  };
}

export async function fetchHotRank(baseUrl: string, options?: { allLimit?: number; businessLimit?: number; forceRefresh?: boolean }) {
  const freeResponse = await fetch(
    `${normalizeBaseUrl(baseUrl)}/free/hot-rank?platform=all&limit=${options?.allLimit ?? 20}&enrich_content=true&business_filter=false&force_refresh=${options?.forceRefresh ? "true" : "false"}`
  );
  const freeData = await freeResponse.json().catch(() => null);
  if (!freeResponse.ok) {
    const error = freeData?.detail || freeData?.error?.message || "热榜获取失败";
    throw new Error(error);
  }

  const platformBuckets = Object.entries((freeData?.data || {}) as Record<string, any[]>).reduce<Record<string, HotRankItem[]>>((acc, [platform, items]) => {
    acc[platform] = (items || []).map((item) => mapRawHotItem(item, freeData.generatedAt || ""));
    return acc;
  }, {});

  let allHotList = ((freeData?.allHotList || freeData?.aggregated || []) as any[]).map((item) => ({
    hot_id: item.hot_id || item.url || "",
    title: cleanDisplayText(item.title || ""),
    summary: cleanDisplayText(item.summary || ""),
    display_title: cleanDisplayText(item.display_title || "") || buildDisplayTitle(item.title || "", item.summary || item.why_hot || item.content || ""),
    display_summary: cleanDisplayText(item.display_summary || "") || buildDisplaySummary(item.summary || item.why_hot || item.title || "", item.clean_content || item.content || ""),
    content: looksLikeUpstreamErrorText(item.clean_content || item.content) ? "" : buildHiddenContent(item.clean_content || item.content || "", item.summary || item.title || ""),
    clean_content: looksLikeUpstreamErrorText(item.clean_content || item.content) ? "" : buildHiddenContent(item.clean_content || item.content || "", item.summary || item.title || ""),
    publish_time: item.publish_time || freeData.generatedAt || "",
    source_platform: item.source_platform || item.platform || "",
    media_name: item.media_name || item.article_source || item.platform || "",
    source_url: item.source_url || item.article_url || item.url || "",
    article_source: item.article_source || "",
    article_url: item.article_url || "",
    topic_type: item.topic_type || "热点",
    heat_score: item.heat_score || parseInt(item.hot_value, 10) || 0,
    why_hot: cleanDisplayText(item.why_hot || ""),
    key_points: (item.key_points || []).map((value: string) => cleanDisplayText(value)).filter(Boolean),
    timeline: (item.timeline || []).map((value: string) => cleanDisplayText(value)).filter(Boolean),
    public_impact: cleanDisplayText(item.public_impact || ""),
    boss_impact: cleanDisplayText(item.boss_impact || ""),
    business_reason: cleanDisplayText(item.business_reason || item.boss_impact || ""),
    quality_score: Number(item.quality_score) || 0,
    quality_status: item.quality_status || ""
  }));

  let businessHotList = ((freeData?.businessHotList || freeData?.businessAggregated || []) as any[]).map((item) => ({
    hot_id: item.hot_id || item.url || "",
    title: cleanDisplayText(item.title || ""),
    summary: cleanDisplayText(item.summary || ""),
    display_title: cleanDisplayText(item.display_title || "") || buildDisplayTitle(item.title || "", item.summary || item.recommend_reason || item.content || ""),
    display_summary: cleanDisplayText(item.display_summary || "") || buildDisplaySummary(item.summary || item.title || "", item.clean_content || item.content || ""),
    content: looksLikeUpstreamErrorText(item.clean_content || item.content) ? "" : buildHiddenContent(item.clean_content || item.content || "", item.summary || item.recommend_reason || item.title || ""),
    clean_content: looksLikeUpstreamErrorText(item.clean_content || item.content) ? "" : buildHiddenContent(item.clean_content || item.content || "", item.summary || item.recommend_reason || item.title || ""),
    publish_time: item.publish_time || freeData.generatedAt || "",
    topic_type: item.topic_type || "业务热点",
    business_relevance_score: item.business_relevance_score || item.business_score || item.matched_keywords?.length || 0,
    recommend_reason: cleanDisplayText(item.recommend_reason || "") || `匹配关键词: ${item.matched_keywords?.join(", ") || ""}`,
    recommended_angle: cleanDisplayText(item.recommended_angle || item.matched_keywords?.[0] || ""),
    recommended_content_type: item.recommended_content_type || "热点解读",
    bridge_directions: (item.bridge_directions || item.matched_keywords || []).map((value: string) => cleanDisplayText(value)).filter(Boolean),
    source_url: item.source_url || item.article_url || item.url || "",
    article_source: item.article_source || "",
    article_url: item.article_url || item.source_url || item.url || "",
    business_score: item.business_score || 0,
    business_reason: cleanDisplayText(item.business_reason || item.recommend_reason || ""),
    quality_score: Number(item.quality_score) || 0,
    quality_status: item.quality_status || ""
  }));

  if (businessHotList.length > 1 && allHotList.length > 0) {
    const topAllKeys = new Set(allHotList.slice(0, 5).map((item) => `${item.title || ""}|${item.source_url || ""}`));
    const distinct = businessHotList.filter((item) => !topAllKeys.has(`${item.title || ""}|${item.source_url || ""}`));
    const overlap = businessHotList.filter((item) => topAllKeys.has(`${item.title || ""}|${item.source_url || ""}`));
    businessHotList = [...distinct, ...overlap];
  }

  allHotList = allHotList.slice(0, options?.allLimit ?? 20);
  businessHotList = businessHotList.slice(0, options?.businessLimit ?? 10);

  return {
    snapshotTitle: freeData?.snapshotTitle || "今日热榜中心",
    generatedAt: freeData?.generatedAt || "",
    debug: freeData?.debug || {},
    allHotList,
    businessHotList,
    platformBuckets,
    workflow: {
      id: "free_scrapers",
      name: "免费热榜"
    },
    cache: {
      fetchedAt: freeData?.cache?.fetchedAt || freeData?.generatedAt,
      fromCache: freeData?.cache?.fromCache ?? true,
      stale: freeData?.cache?.stale ?? false,
      refreshing: freeData?.cache?.refreshing ?? false,
      warning: freeData?.cache?.warning || ""
    }
  } as HotRankResponse;
}

export async function fetchManualSearch(baseUrl: string, topicQuery: string) {
  const freeResponse = await fetch(`${normalizeBaseUrl(baseUrl)}/free/manual-search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ topicQuery })
  });
  const freeData = await freeResponse.json().catch(() => null);
  if (!freeResponse.ok) {
    const error = freeData?.detail || freeData?.error?.message || "搜索接口失败";
    throw new Error(error);
  }
  const normalizeSearchItem = (item: SearchResultItem): SearchResultItem => ({
    ...item,
    title: cleanDisplayText(item.title || ""),
    summary: cleanDisplayText(item.summary || ""),
    displayTitle: item.displayTitle || buildDisplayTitle(item.title || "", item.summary || item.content || ""),
    displaySummary: item.displaySummary || buildDisplaySummary(item.summary || item.content || item.title || "", item.cleanContent || item.content || ""),
    content: looksLikeUpstreamErrorText(item.cleanContent || item.content) ? "" : buildHiddenContent(item.cleanContent || item.content || "", item.summary || item.title || ""),
    cleanContent: looksLikeUpstreamErrorText(item.cleanContent || item.content) ? "" : buildHiddenContent(item.cleanContent || item.content || "", item.summary || item.title || "")
  });
  return {
    ...freeData,
    searchData: (freeData?.searchData || []).map(normalizeSearchItem),
    toutiaoData: (freeData?.toutiaoData || []).map(normalizeSearchItem),
    factPack: freeData?.factPack
      ? {
          ...freeData.factPack,
          eventAnchor: freeData.factPack.eventAnchor || buildDisplayTitle(freeData.factPack.fullEventAnchor || "", freeData.factPack.summary || ""),
          fullEventAnchor: freeData.factPack.fullEventAnchor || freeData.factPack.eventAnchor || "",
          summary: freeData.factPack.displaySummary || buildDisplaySummary(freeData.factPack.summary || "", freeData.factPack.cleanContent || freeData.factPack.sourceText || ""),
          displaySummary: freeData.factPack.displaySummary || buildDisplaySummary(freeData.factPack.summary || "", freeData.factPack.cleanContent || freeData.factPack.sourceText || ""),
          keyFacts: (freeData.factPack.keyFacts || []).map((item: string) => cleanDisplayText(item)).filter(Boolean),
          sourceText: buildHiddenContent(freeData.factPack.cleanContent || freeData.factPack.sourceText || "", freeData.factPack.summary || "", 2400),
          cleanContent: buildHiddenContent(freeData.factPack.cleanContent || freeData.factPack.sourceText || "", freeData.factPack.summary || "", 2400),
          businessReason: cleanDisplayText(freeData.factPack.businessReason || ""),
        }
      : freeData?.factPack
  } as ManualSearchResponse;
}

export async function fetchHotRankDetail(
  baseUrl: string,
  item: Partial<HotRankItem & BusinessHotItem> & {
    source_url?: string;
    article_url?: string;
    article_source?: string;
  }
) {
  const detail = await requestJson<HotRankDetailResponse>(baseUrl, "/free/hot-rank/detail", {
    title: item.title || "",
    summary: item.summary || "",
    content: item.content || "",
    sourceUrl: item.source_url || item.article_url || "",
    articleSource: item.article_source || ""
  });
  return {
    ...detail,
    title: cleanDisplayText(detail.title || ""),
    summary: cleanDisplayText(detail.summary || ""),
    display_title: detail.display_title || buildDisplayTitle(detail.title || "", detail.summary || detail.content || ""),
    display_summary: detail.display_summary || buildDisplaySummary(detail.summary || detail.title || "", detail.clean_content || detail.content || ""),
    content: looksLikeUpstreamErrorText(detail.clean_content || detail.content) ? "" : buildHiddenContent(detail.clean_content || detail.content || "", detail.summary || detail.title || ""),
    clean_content: looksLikeUpstreamErrorText(detail.clean_content || detail.content) ? "" : buildHiddenContent(detail.clean_content || detail.content || "", detail.summary || detail.title || ""),
    business_reason: cleanDisplayText(detail.business_reason || "")
  };
}

export function buildMaterialFromHotRank(item: HotRankItem) {
  const title = normalizeMaterialText(item.title);
  const summary = normalizeMaterialText(item.summary);
  const whyHot = normalizeMaterialText(item.why_hot);
  const keyPoints = (item.key_points || []).map(normalizeMaterialText).filter(Boolean);
  const bossImpact = sanitizeHotspotAngle(item.business_reason || item.boss_impact);
  const contentValue = item.clean_content || item.content || "";
  const canUseBody = contentValue.trim().length >= 60 && item.quality_status !== "blocked";
  const leadLines = dedupeMaterialLines([
    title ? normalizeMaterialSentence(title) : "",
    summary ? normalizeMaterialSentence(summary) : "",
    ...keyPoints.slice(0, 2).map((point) => normalizeMaterialSentence(point)),
    whyHot ? normalizeMaterialSentence(whyHot) : ""
  ]);
  const fullBody = canUseBody
    ? buildMaterialBody(contentValue, item.quality_status === "ready" ? 14 : 6, item.quality_status === "ready" ? 2600 : 900, leadLines)
    : "";
  const fallbackBody = !fullBody && canUseBody ? trimText(cleanDisplayText(contentValue), item.quality_status === "ready" ? 2600 : 900) : "";
  const bodyLines = (fullBody || fallbackBody) ? (fullBody || fallbackBody).split("\n") : [];

  return {
    sourceText: joinNaturalSentences(dedupeMaterialLines([...leadLines, ...bodyLines])).trim(),
    hotspotAngle: cleanText(bossImpact)
  };
}

export function buildMaterialFromBusinessHot(item: BusinessHotItem) {
  const title = normalizeMaterialText(item.title);
  const summary = normalizeMaterialText(item.summary);
  const reason = normalizeMaterialText(item.business_reason || item.recommend_reason);
  const contentValue = item.clean_content || item.content || "";
  const canUseBody = contentValue.trim().length >= 60 && item.quality_status !== "blocked";
  const leadLines = dedupeMaterialLines([
    title ? normalizeMaterialSentence(title) : "",
    summary ? normalizeMaterialSentence(summary) : ""
  ]);
  const fullBody = canUseBody
    ? buildMaterialBody(contentValue, item.quality_status === "ready" ? 14 : 6, item.quality_status === "ready" ? 2600 : 900, leadLines)
    : "";
  const fallbackBody = !fullBody && canUseBody ? trimText(cleanDisplayText(contentValue), item.quality_status === "ready" ? 2600 : 900) : "";
  const bodyLines = (fullBody || fallbackBody) ? (fullBody || fallbackBody).split("\n") : [];
  const hotspotAngle = dedupeMaterialLines([sanitizeHotspotAngle(item.recommended_angle), sanitizeHotspotAngle(reason)]).join(" ");

  return {
    sourceText: joinNaturalSentences(dedupeMaterialLines([...leadLines, ...bodyLines])).trim(),
    hotspotAngle
  };
}

export function buildMaterialFromSearch(topicQuery: string, item: SearchResultItem) {
  const title = normalizeMaterialText(item.title);
  const summary = normalizeMaterialText(item.summary);
  const contentExcerpt = buildMaterialBody(item.cleanContent || item.content, 3, 260, [title, summary].filter(Boolean));

  return {
    sourceText: dedupeMaterialLines([
      title ? normalizeMaterialSentence(title) : "",
      summary ? normalizeMaterialSentence(summary) : "",
      contentExcerpt ? normalizeMaterialSentence(contentExcerpt) : ""
    ]).slice(0, 4).join("\n"),
    hotspotAngle: ""
  };
}
