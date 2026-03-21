"""
免费搜索模块
优先使用 Bing News RSS，辅以 DuckDuckGo 新闻/网页搜索。
配合 Jina Reader 补正文，并在进入事实包前先做清洗。
"""

from __future__ import annotations

import re
import warnings
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urlparse

import requests
try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS

try:
    from .platform_utils import clean_text, looks_like_upstream_error
except ImportError:
    from platform_utils import clean_text, looks_like_upstream_error

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
REQUEST_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
}
READER_META_LINE_PATTERN = re.compile(
    r"^(Title|URL Source|Published Time|Markdown Content|Description|原标题|原文标题|发布时间|来源)\s*[:：]",
    re.IGNORECASE,
)
READER_NAV_NOISE_PATTERN = re.compile(
    r"(javascript:|栏目大全|节目单|主持人|下载央视影音|English|iPanda|Image \d|首页|直播中国|CCTV\.直播|请直接登录|扫码|扫描成功|微博客户端|邮箱帐号|新浪微博|确认即可登录|点击手机上的确认)",
    re.IGNORECASE,
)
READER_CREDIT_LINE_PATTERN = re.compile(
    r"^(?:监制|制片人|编导|记者|编辑|责编|责任编辑|后期|配音|素材支持|统筹|审核|监审|出品人|策划|剪辑|主播|主持人|作者|通讯员|文案|拍摄|美编|校对|翻译)\s*[丨|：:]",
    re.IGNORECASE,
)
READER_SOCIAL_NOISE_PATTERN = re.compile(
    r"(打开微信|扫一扫|微信扫一扫|分享至朋友圈|分享到朋友圈|分享到微信|媒体矩阵|下载客户端|下载APP|打开APP|二维码|工人日报客户端|客户端下载)",
    re.IGNORECASE,
)
READER_FOOTER_NOISE_PATTERN = re.compile(
    r"(Copyright|版权所有|ICP备|关于我们|联系我们|广告合作|返回首页|上一条|下一条|相关阅读|延伸阅读|推荐阅读|猜你喜欢|热点推荐|相关新闻|专题推荐|更多精彩)",
    re.IGNORECASE,
)
READER_PAGE_NOISE_PATTERN = re.compile(
    r"(百度一下|文心助手|APP内查看|点击查看|点击进入专题|点击底部的[“\"]发现[”\"]|使用[“\"]扫一扫[”\"]|网页链接|正文\s*$|滚动\s*$)",
    re.IGNORECASE,
)
READER_INFOBAR_NOISE_PATTERN = re.compile(
    r"(Language|Audio and Subscription|Subscription|全球视野|常人故事|其它|联合国新闻|UN News|Unsplash/[A-Za-z0-9_-]+|©\s*\S+)",
    re.IGNORECASE,
)
READER_COMMENTARY_NOISE_PATTERN = re.compile(
    r"(评论区|网友|说实话|不稀奇|再近点|我要看看|有没人|看不清|革命尚未成功|同志仍需努力|腿毛|挖鼻孔|都是人才|心里清楚|焦虑啊|必须要看清楚)",
    re.IGNORECASE,
)
READER_WARNING_PATTERN = re.compile(
    r"^(Warning:|This page contains shadow DOM|This is a cached snapshot|Target URL returned error|please make sure you are authorized|requiring CAPTCHA|Forbidden\b)",
    re.IGNORECASE,
)
READER_RANK_BOARD_PATTERN = re.compile(
    r"(热搜榜|民生榜|财经榜|关注榜|热榜|榜单|(?:^|\s)\d{1,2}\s*(?:热|新)(?=\s|$)|(?:^|\s)\d{1,2}(?:\s+\d{1,2}){5,})",
    re.IGNORECASE,
)
UPSTREAM_ERROR_TEXT_PATTERN = re.compile(
    r"(SecurityCompromiseError|Anonymous access to domain blocked|DDoS attack suspected|readableMessage|[\"“]code[\"”]\s*:\s*451|[\"“]status[\"”]\s*:\s*45102)",
    re.IGNORECASE,
)
MARKDOWN_LINK_LINE_PATTERN = re.compile(r"(?:^|\s)#+\s*\[[^\]]{4,120}\]|\[[^\]]{4,120}\]\([^)]{0,240}\)")
URL_NOISE_PATTERN = re.compile(r"https?://\S+|//\S+|www\.\S+", re.IGNORECASE)
INLINE_REF_PATTERN = re.compile(r"\[\d+\]")
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
WHITESPACE_PATTERN = re.compile(r"\s+")
DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")
CHINESE_PATTERN = re.compile(r"[\u4e00-\u9fff]")
CHINESE_TOKEN_PATTERN = re.compile(r"[\u4e00-\u9fff]{2,}")
LATIN_TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9_-]{1,}")

OFFICIAL_SITE_HINTS = (
    "新华社",
    "人民日报",
    "央视",
    "央视新闻",
    "中国日报",
    "中国网",
    "北京日报",
    "新华财经",
    "新浪财经",
    "财联社",
    "澎湃",
    "界面",
    "第一财经",
    "极目新闻",
    "Reuters",
    "Bloomberg",
    "BBC",
    "AP",
)
LOW_QUALITY_DOMAIN_KEYWORDS = (
    "alamy.com",
    "mitrade.com",
    "finance.yahoo.com/quote",
    "stock-photo",
    "image.baidu.com",
)
LOW_QUALITY_TITLE_PATTERNS = (
    re.compile(r"(星座|生肖|运势|塔罗|占卜)", re.IGNORECASE),
    re.compile(r"(高清图片|图库|stock photography)", re.IGNORECASE),
)
SESSION = requests.Session()
SESSION.trust_env = False
SESSION.headers.update(REQUEST_HEADERS)


def strip_url_noise(text: str) -> str:
    if not text:
        return ""
    cleaned = URL_NOISE_PATTERN.sub(" ", text)
    cleaned = INLINE_REF_PATTERN.sub(" ", cleaned)
    cleaned = HTML_TAG_PATTERN.sub(" ", cleaned)
    cleaned = re.sub(r"[\u0000-\u001f\u007f-\u009f\uE000-\uF8FF\uFFF0-\uFFFF�]+", " ", cleaned)
    return clean_text(cleaned)


def text_dedupe_key(text: str) -> str:
    return re.sub(r"[\W_]+", "", clean_text(text).lower())


def reader_line_is_noise(text: str) -> bool:
    line = clean_text(text)
    if not line:
        return True
    if READER_WARNING_PATTERN.search(line):
        return True
    if READER_META_LINE_PATTERN.match(line):
        return True
    if READER_NAV_NOISE_PATTERN.search(line):
        return True
    if READER_CREDIT_LINE_PATTERN.match(line):
        return True
    if READER_SOCIAL_NOISE_PATTERN.search(line):
        return True
    if READER_PAGE_NOISE_PATTERN.search(line):
        return True
    if READER_INFOBAR_NOISE_PATTERN.search(line) and len(line) <= 220:
        return True
    if READER_FOOTER_NOISE_PATTERN.search(line) and len(line) <= 200:
        return True
    if READER_RANK_BOARD_PATTERN.search(line) and len(line) <= 180:
        return True
    if MARKDOWN_LINK_LINE_PATTERN.search(line):
        return True
    if "登录" in line and len(line) <= 24:
        return True
    if re.fullmatch(r"[=\-*#]{4,}", line):
        return True
    if line.startswith("* [") or line.startswith("["):
        return True
    if line.endswith("(") and len(line) <= 24:
        return True
    if re.match(r"^(?:[*-]\s*)?\[[^\]]{0,80}\]$", line):
        return True
    if re.match(r"^(?:[*-]\s*)?\[[^\]]{0,80}\]\([^)]*\)$", line):
        return True
    if re.match(r"^(?:[*-]\s*)?\[[^\]]{0,80}\]\([^)]*$", line):
        return True
    if line.count("[") + line.count("]") + line.count("(") + line.count(")") >= 3 and len(re.sub(r"[\[\]\(\)\*=\-\s]", "", line)) < 8:
        return True
    if line.count("[") + line.count("]") >= 4:
        return True
    if len(line) < 4:
        return True
    return False


def reader_sentence_is_noise(text: str) -> bool:
    line = clean_text(text)
    if not line:
        return True
    if reader_line_is_noise(line):
        return True
    if READER_COMMENTARY_NOISE_PATTERN.search(line):
        return True
    if READER_RANK_BOARD_PATTERN.search(line):
        return True
    if READER_INFOBAR_NOISE_PATTERN.search(line):
        return True
    if len(line) < 10:
        return True
    return False


def dedupe_text_lines(lines: list[str]) -> list[str]:
    deduped: list[str] = []
    seen_keys: list[str] = []
    for line in lines:
        normalized = clean_text(line)
        key = text_dedupe_key(normalized)
        if not key:
            continue
        if any(existing == key or existing in key or key in existing for existing in seen_keys):
            continue
        seen_keys.append(key)
        deduped.append(normalized)
    return deduped


def dedupe_inline_sentences(text: str) -> str:
    normalized = clean_text(text)
    if not normalized:
        return ""
    chunks = [clean_text(part) for part in re.findall(r"[^。！？!?；;\n]+[。！？!?；;]?", normalized) if clean_text(part)]
    if len(chunks) <= 1:
        return normalized

    deduped: list[str] = []
    seen_keys: list[str] = []
    for chunk in chunks:
        key = text_dedupe_key(chunk)
        if not key:
            continue
        if any(existing == key or existing in key or key in existing for existing in seen_keys):
            continue
        seen_keys.append(key)
        deduped.append(chunk)
    return " ".join(deduped).strip()


def strip_reader_noise_fragments(text: str) -> str:
    normalized = clean_text(text)
    if not normalized:
        return ""
    normalized = re.sub(
        r"(Warning:.*$|This page contains shadow DOM.*$|This is a cached snapshot.*$|Target URL returned error.*$|please make sure you are authorized.*$|requiring CAPTCHA.*$|Forbidden\b.*$)",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"\s*[-|｜]\s*滚动\s*[-|｜]\s*[^。！？!?]{0,40}", " ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\*\s*更多", " ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:\|\s*\|?\s*\d*\s*)?(?:联合国新闻|UN News)\b.*?(?=Language|Audio and Subscription|全球视野|常人故事|其它|©|$)", " ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:Language|Audio and Subscription|Subscription|全球视野|常人故事|其它|©\s*\S+|Unsplash/[A-Za-z0-9_-]+).*$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:监制|制片人|编导|记者|编辑|责编|责任编辑|后期|配音|素材支持|统筹|审核|监审|出品人|策划|剪辑|作者|主持人|通讯员|文案|拍摄|美编|校对|翻译)\s*[丨|：:].*$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:媒体矩阵|打开微信|扫一扫|微信扫一扫|分享至朋友圈|分享到朋友圈|分享到微信|下载客户端|下载APP|打开APP|二维码|工人日报客户端|客户端下载).*$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:Copyright|版权所有|相关阅读|延伸阅读|推荐阅读|热点推荐|相关新闻|专题推荐|更多精彩).*$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:[_\s]{0,4}播报[_\s]{0,4}暂停.*$|播报\s*暂停.*$)", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"###.*$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:相关阅读|推荐阅读|更多精彩|热点推荐|相关新闻|专题推荐|延伸阅读|相关内容).*$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"(?:\*{1,3}\s*)?[^\s]{0,20}\s*\(\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}.*$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+", " ", normalized).strip(" -*#")
    return normalized


def split_meaningful_sentences(text: str) -> list[str]:
    normalized = clean_text(text)
    if not normalized:
        return []
    parts = [clean_text(part) for part in re.split(r"[。！？!?；;\n]+", normalized) if clean_text(part)]
    kept: list[str] = []
    seen_keys: set[str] = set()
    for part in parts:
        sentence = strip_reader_noise_fragments(strip_url_noise(part))
        sentence = re.sub(r"^[#*>\-]+\s*", "", sentence)
        sentence = re.sub(r"\s+", " ", sentence).strip(" -*#")
        if reader_sentence_is_noise(sentence):
            continue
        key = text_dedupe_key(sentence)
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        kept.append(sentence)
    return kept


def normalize_reader_content(text: str, max_length: int = 2000) -> str:
    if not text:
        return ""

    lines: list[str] = []
    for raw_line in text.splitlines():
        line = strip_url_noise(clean_text(raw_line))
        line = line.replace("* * *", " ").replace("|", " ").replace("｜", " ")
        line = strip_reader_noise_fragments(line)
        line = re.sub(r"\s+", " ", line).strip(" -*#")
        line = dedupe_inline_sentences(line)
        if reader_line_is_noise(line):
            continue
        split_sentences = split_meaningful_sentences(line)
        if not split_sentences:
            continue
        lines.extend(split_sentences)

    cleaned = "\n".join(dedupe_text_lines(lines)).strip()
    if READER_WARNING_PATTERN.search(cleaned):
        return ""
    if len(cleaned) <= max_length:
        return cleaned
    return cleaned[: max_length - 1].rstrip(" ，。；;:：") + "…"


def summarize_content(text: str, max_length: int = 220) -> str:
    normalized = normalize_reader_content(text, max_length=max_length * 4)
    if not normalized:
        return ""

    sentences = [
        clean_text(chunk)
        for chunk in re.split(r"[。！？!?；;\n]", normalized)
        if clean_text(chunk)
    ]
    picked: list[str] = []
    seen_keys: set[str] = set()
    total_length = 0
    for sentence in sentences:
        if reader_sentence_is_noise(sentence):
            continue
        key = text_dedupe_key(sentence)
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        picked.append(sentence)
        total_length += len(sentence)
        if len(picked) >= 2 or total_length >= max_length - 12:
            break

    if not picked:
        return normalized[:max_length]

    summary = "。".join(picked)
    if not summary.endswith(("。", "！", "？", "!", "?")):
        summary += "。"
    if len(summary) <= max_length:
        return summary
    return summary[: max_length - 1].rstrip(" ，。；;:：") + "…"


def has_chinese(text: str) -> bool:
    return bool(CHINESE_PATTERN.search(text or ""))


def create_ddgs() -> DDGS:
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=r"This package \(`duckduckgo_search`\) has been renamed to `ddgs`!.*",
            category=RuntimeWarning,
        )
        return DDGS()


def extract_query_terms(query: str) -> list[str]:
    normalized = clean_text(query)
    if not normalized:
        return []

    terms: list[str] = []
    for token in CHINESE_TOKEN_PATTERN.findall(normalized):
        if token not in terms:
            terms.append(token)
        if len(token) >= 4:
            for slice_length in (2, 3, 4):
                for index in range(0, len(token) - slice_length + 1):
                    part = token[index : index + slice_length]
                    if part not in terms:
                        terms.append(part)

    for token in LATIN_TOKEN_PATTERN.findall(normalized):
        lowered = token.lower()
        if lowered not in terms:
            terms.append(lowered)

    return terms[:18]


def decode_bing_target_url(link: str) -> str:
    if not link:
        return ""

    parsed = urlparse(link)
    query_params = parse_qs(parsed.query)
    for key in ("url", "u"):
        if query_params.get(key):
            return unquote(query_params[key][0])

    return link


def find_child_text_by_suffix(node: ET.Element, suffix: str) -> str:
    suffix_lower = suffix.lower()
    for child in list(node):
        if child.tag.lower().endswith(suffix_lower):
            return clean_text("".join(child.itertext()))
    return ""


def get_result_domain(url: str) -> str:
    if not url:
        return ""
    return urlparse(url).netloc.lower()


def is_low_quality_result(item: dict[str, Any], query_terms: list[str]) -> bool:
    title = clean_text(item.get("title", ""))
    summary = clean_text(item.get("summary") or item.get("snippet") or "")
    url = clean_text(item.get("url", ""))
    domain = get_result_domain(url)
    sitename = clean_text(item.get("sitename") or item.get("source") or "")
    merged_text = f"{title} {summary} {sitename}".lower()

    if any(keyword in domain or keyword in url.lower() for keyword in LOW_QUALITY_DOMAIN_KEYWORDS):
        return True
    if any(pattern.search(title) for pattern in LOW_QUALITY_TITLE_PATTERNS):
        return True
    if not title and not summary:
        return True

    if query_terms:
        overlap = sum(1 for term in query_terms[:10] if term and term.lower() in merged_text)
        if overlap == 0 and not any(site.lower() in merged_text for site in ("央视", "reuters", "bbc", "新华社")):
            return True

    return False


def score_result(item: dict[str, Any], query_terms: list[str]) -> int:
    title = clean_text(item.get("title", ""))
    summary = clean_text(item.get("summary") or item.get("snippet") or "")
    content = clean_text(item.get("content") or item.get("clean_content") or "")
    sitename = clean_text(item.get("sitename") or item.get("source") or "")
    url = clean_text(item.get("url", ""))
    merged_text = f"{title} {summary} {content} {sitename}".lower()
    score = 0

    if title:
        score += 15
    if len(summary) >= 40:
        score += 20
    elif summary:
        score += 10
    if len(content) >= 240:
        score += 18
    elif content:
        score += 8
    if has_chinese(title):
        score += 10
    if has_chinese(summary):
        score += 8
    if DATE_PATTERN.search(clean_text(item.get("date", ""))):
        score += 6
    if url.startswith("http://") or url.startswith("https://"):
        score += 6
    if sitename and any(keyword.lower() in sitename.lower() for keyword in OFFICIAL_SITE_HINTS):
        score += 12

    overlap = 0
    for term in query_terms[:10]:
        if term and term.lower() in merged_text:
            overlap += 1
    score += overlap * 8

    if "bing_news" == item.get("sourcePlatform"):
        score += 10
    elif "duckduckgo_news" == item.get("sourcePlatform"):
        score += 6

    if any(keyword in merged_text for keyword in ("直播", "快讯", "最新", "进展", "回应", "通报")):
        score += 4

    return score


def dedupe_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in results:
        url = clean_text(item.get("url", ""))
        title = clean_text(item.get("title", "")).lower()
        key = url or re.sub(r"[^\w\u4e00-\u9fff]+", "", title)
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def search_bing_news(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    if not query:
        return []

    try:
        url = f"https://www.bing.com/news/search?q={quote(query)}&format=rss&setlang=zh-Hans"
        response = SESSION.get(url, timeout=10)
        response.raise_for_status()
        body = response.text.lstrip()
        if not (body.startswith("<?xml") or body.startswith("<rss")):
            return []
        root = ET.fromstring(body)
    except Exception as exc:
        if "syntax error" not in str(exc).lower():
            print(f"Bing News RSS 搜索失败: {exc}")
        return []

    results: list[dict[str, Any]] = []
    channel = root.find("channel")
    if channel is None:
        return results

    for item in channel.findall("item")[:max_results]:
        title = clean_text(item.findtext("title", default=""))
        link = clean_text(item.findtext("link", default=""))
        description = strip_url_noise(clean_text(item.findtext("description", default="")))
        pub_date = clean_text(item.findtext("pubDate", default=""))
        sitename = find_child_text_by_suffix(item, "Source")
        target_url = decode_bing_target_url(link)

        results.append(
            {
                "title": title,
                "url": target_url,
                "snippet": description,
                "summary": description,
                "content": "",
                "date": pub_date,
                "source": sitename,
                "sitename": sitename,
                "sourcePlatform": "bing_news",
            }
        )

    return results


def search_duckduckgo(query: str, max_results: int = 10, region: str = "cn-zh") -> list[dict[str, Any]]:
    """
    使用 DuckDuckGo 网页搜索 - 完全免费，无需 API Key

    参数:
        query: 搜索关键词
        max_results: 最大结果数
        region: 地区代码

    返回:
        [{"title": "", "url": "", "snippet": "", "source": ""}]
    """
    try:
        ddgs = create_ddgs()
        results = []

        for result in ddgs.text(query, region=region, max_results=max_results):
            snippet = clean_text(result.get("body", ""))
            results.append(
                {
                    "title": clean_text(result.get("title", "")),
                    "url": result.get("href", ""),
                    "snippet": snippet,
                    "summary": snippet,
                    "content": "",
                    "source": result.get("source", ""),
                    "sitename": result.get("source", ""),
                    "sourcePlatform": "duckduckgo_web",
                }
            )

        return results
    except Exception as exc:
        print(f"DuckDuckGo 搜索失败: {exc}")
        return []


def search_duckduckgo_news(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    try:
        ddgs = create_ddgs()
        results = []

        for result in ddgs.news(query, region="cn-zh", max_results=max_results):
            snippet = clean_text(result.get("body", ""))
            results.append(
                {
                    "title": clean_text(result.get("title", "")),
                    "url": result.get("url", ""),
                    "snippet": snippet,
                    "summary": snippet,
                    "content": "",
                    "date": result.get("date", ""),
                    "source": result.get("source", ""),
                    "sitename": result.get("source", ""),
                    "sourcePlatform": "duckduckgo_news",
                }
            )

        return results
    except Exception as exc:
        print(f"DuckDuckGo 新闻搜索失败: {exc}")
        return []


def fetch_clean_content(url: str, timeout: int = 10) -> str:
    """
    使用 Jina Reader 获取干净的网页内容
    完全免费，自动清理广告、导航等杂质
    """
    try:
        if not url:
            return ""
        clean_url = f"https://r.jina.ai/{url}"
        response = SESSION.get(clean_url, timeout=timeout)
        response.encoding = "utf-8"
        return normalize_reader_content(response.text)
    except requests.Timeout:
        return ""
    except Exception as exc:
        if "timed out" not in str(exc).lower():
            print(f"Jina Reader 内容获取失败: {exc}")
        return ""


def search_news(query: str, max_results: int = 10) -> list[dict[str, Any]]:
    """
    搜索新闻，优先 Bing News RSS，其次 DuckDuckGo 新闻。
    """
    query_terms = extract_query_terms(query)
    candidates = dedupe_results(
        [
            *search_bing_news(query, max_results=max_results * 2),
            *search_duckduckgo_news(query, max_results=max_results),
        ]
    )

    filtered = [item for item in candidates if not is_low_quality_result(item, query_terms)]
    for item in filtered:
        item["qualityScore"] = score_result(item, query_terms)

    filtered.sort(
        key=lambda item: (
            -int(item.get("qualityScore", 0)),
            -len(clean_text(item.get("summary") or item.get("snippet") or "")),
            clean_text(item.get("title", "")),
        )
    )
    return filtered[:max_results]


def search_with_content(
    query: str,
    max_results: int = 10,
    fetch_content: bool = True,
    content_limit: int = 1000,
) -> list[dict[str, Any]]:
    """
    搜索并尽量补正文。
    """
    query_terms = extract_query_terms(query)
    candidates = dedupe_results(
        [
            *search_bing_news(query, max_results=max_results * 2),
            *search_duckduckgo_news(query, max_results=max_results),
            *search_duckduckgo(f"{query} 最新进展", max_results=max_results // 2 + 2),
        ]
    )

    filtered = [item for item in candidates if not is_low_quality_result(item, query_terms)]
    for item in filtered:
        if not clean_text(item.get("summary")) and clean_text(item.get("snippet")):
            item["summary"] = clean_text(item.get("snippet"))
        item["qualityScore"] = score_result(item, query_terms)

    filtered.sort(
        key=lambda item: (
            -int(item.get("qualityScore", 0)),
            -len(clean_text(item.get("summary") or item.get("snippet") or "")),
            clean_text(item.get("title", "")),
        )
    )

    results = filtered[:max_results]
    if not fetch_content:
        return results

    for index, result in enumerate(results):
        try:
            if index >= min(5, max_results):
                break
            clean_content = fetch_clean_content(result.get("url", ""))
            normalized_content = clean_content[:content_limit] if clean_content else result.get("snippet", "")
            result["clean_content"] = normalized_content
            result["content"] = normalized_content
            if not result.get("summary"):
                result["summary"] = summarize_content(normalized_content)
            result["qualityScore"] = int(result.get("qualityScore", 0)) + (10 if normalized_content else 0)
        except Exception as exc:
            print(f"获取内容失败 {result.get('url', '')}: {exc}")
            fallback_content = result.get("snippet", "")
            result["clean_content"] = fallback_content
            result["content"] = fallback_content
            if not result.get("summary"):
                result["summary"] = fallback_content

    results.sort(
        key=lambda item: (
            -int(item.get("qualityScore", 0)),
            -len(clean_text(item.get("content") or "")),
            -len(clean_text(item.get("summary") or item.get("snippet") or "")),
        )
    )
    return results[:max_results]


def build_search_fact_pack(query: str, max_results: int = 5) -> dict[str, Any]:
    """
    构建搜索事实包 - 与主后端保持兼容的轻量版本
    """
    results = search_with_content(query, max_results=max_results, fetch_content=True, content_limit=1800)

    if not results:
        return {
            "topic": query,
            "eventAnchor": "",
            "summary": "",
            "keyFacts": [],
            "focusTitles": [],
            "timelineClues": [],
            "coreConflict": "",
            "businessSignals": [],
            "ambiguousTerms": [],
            "forbiddenExpansions": [],
            "guardrailNote": "",
            "sourceText": "",
            "sources": [],
        }

    focus_titles: list[str] = []
    key_facts: list[str] = []
    time_clues: list[str] = []

    for result in results:
        title = clean_text(result.get("title", ""))
        if title and title not in focus_titles:
            focus_titles.append(title)

        source_text = "\n".join(
            filter(
                None,
                [
                    clean_text(result.get("summary", "")),
                    clean_text(result.get("content", "")),
                    title,
                ],
            )
        )

        for sentence in re.split(r"[。！？!?；;\n]", source_text):
            normalized = strip_url_noise(clean_text(sentence)).strip(" -—_、,，。；;")
            if len(normalized) < 10 or normalized in key_facts:
                continue
            key_facts.append(normalized)
            if len(key_facts) >= 6:
                break

        date_text = clean_text(result.get("date", ""))
        if date_text and date_text not in time_clues:
            time_clues.append(date_text)

        if len(key_facts) >= 6:
            break

    event_anchor = focus_titles[0] if focus_titles else query
    summary = summarize_content("\n".join(key_facts[:3]) or event_anchor, max_length=220) or event_anchor
    source_text = "\n".join(
        [
            f"{event_anchor}。" if event_anchor and not event_anchor.endswith(("。", "！", "？", "!", "?")) else event_anchor,
            *[
                sentence if sentence.endswith(("。", "！", "？", "!", "?")) else f"{sentence}。"
                for sentence in key_facts[:5]
            ],
        ]
    ).strip()

    return {
        "topic": query,
        "eventAnchor": event_anchor,
        "summary": summary,
        "keyFacts": key_facts[:5],
        "focusTitles": focus_titles[:4],
        "timelineClues": time_clues[:4],
        "coreConflict": key_facts[0] if key_facts else "",
        "businessSignals": [],
        "ambiguousTerms": [],
        "forbiddenExpansions": [],
        "guardrailNote": "",
        "sourceText": source_text[:2000],
        "sources": results,
    }
