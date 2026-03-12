"""
免费热榜爬虫模块
支持: 微博、知乎、百度、抖音
完全免费，无需 API Key
"""

import re
import time
from typing import Any
import requests
from bs4 import BeautifulSoup

try:
    from .free_search import fetch_clean_content, search_duckduckgo, search_news, summarize_content
except ImportError:
    from free_search import fetch_clean_content, search_duckduckgo, search_news, summarize_content


USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
SESSION = requests.Session()
SESSION.trust_env = False
SEARCH_STYLE_URL_PATTERNS = (
    "top.baidu.com",
    "douyin.com/search",
    "s.weibo.com/top",
    "weibo.com/top",
    "zhihu.com/hot",
)
BUSINESS_KEYWORD_WEIGHTS: dict[str, int] = {
    "ai": 4,
    "人工智能": 4,
    "智能体": 4,
    "数字人": 4,
    "获客": 4,
    "流量": 3,
    "客户": 3,
    "订单": 3,
    "转化": 3,
    "创业": 3,
    "企业": 3,
    "经营": 2,
    "老板": 2,
    "监管": 3,
    "合规": 3,
    "治理": 2,
    "平台": 2,
    "内容": 2,
    "短剧": 2,
    "带货": 2,
    "数字": 2,
    "数字资产": 4,
    "数字ip": 4,
    "ip": 2,
    "自动化": 3,
    "私域": 3,
    "商用": 3,
    "量产": 2,
    "人才": 2,
    "教育": 2,
    "文旅": 2,
}
PRIMARY_BUSINESS_KEYWORDS = {
    "ai",
    "人工智能",
    "智能体",
    "数字人",
    "获客",
    "流量",
    "监管",
    "合规",
    "平台",
    "内容",
    "短剧",
    "带货",
    "数字",
    "数字资产",
    "数字ip",
    "ip",
    "自动化",
    "私域",
    "商用",
    "订单",
    "人才",
    "教育",
    "文旅",
    "创业",
}


def clean_text(text: Any) -> str:
    """清理文本"""
    if text is None:
        return ""
    return re.sub(r'\s+', ' ', str(text)).strip()


def trim_text(text: str, max_length: int) -> str:
    if len(text) <= max_length:
        return text
    return text[: max_length - 1].rstrip(" ，。；;:：") + "…"


def dedupe_strings(items: list[str]) -> list[str]:
    results: list[str] = []
    seen: set[str] = set()
    for item in items:
        value = clean_text(item)
        key = re.sub(r"[\W_]+", "", value.lower())
        if not key or key in seen:
            continue
        seen.add(key)
        results.append(value)
    return results


def collect_business_matches(text: str) -> tuple[list[str], int]:
    normalized = clean_text(text).lower()
    matches: list[str] = []
    score = 0

    for keyword, weight in BUSINESS_KEYWORD_WEIGHTS.items():
        if keyword in normalized:
            matches.append(keyword)
            score += weight

    if re.search(r"(监管|合规|治理|处罚|封号|风险)", normalized):
        score += 2
    if re.search(r"(获客|流量|转化|客户|成交|订单)", normalized):
        score += 2
    if re.search(r"(创业|企业|经营|老板)", normalized):
        score += 1

    return dedupe_strings(matches)[:6], score


def is_search_style_url(url: str) -> bool:
    return any(pattern in (url or "") for pattern in SEARCH_STYLE_URL_PATTERNS)


def discover_topic_context(title: str) -> dict[str, str]:
    query = clean_text(title)
    if not query:
        return {}

    candidates = search_news(query, max_results=3)
    if not candidates:
        candidates = search_duckduckgo(f"{query} 最新进展", max_results=3)

    for candidate in candidates:
        url = clean_text(candidate.get("url", ""))
        summary = clean_text(candidate.get("summary") or candidate.get("snippet") or "")
        content = ""

        if url:
            content = fetch_clean_content(url, timeout=5)
        if not summary and content:
            summary = summarize_content(content, max_length=220)

        if summary or content:
            return {
                "summary": trim_text(summary or query, 280),
                "content": trim_text(content or summary or query, 3000),
                "article_url": url,
                "article_source": clean_text(candidate.get("sitename") or candidate.get("source") or ""),
            }

    return {}


def fetch_weibo_hot(limit: int = 20, fetch_content: bool = True) -> list[dict[str, Any]]:
    """
    爬取微博热搜榜 - 完全免费
    返回: [{"title": "", "url": "", "hot_value": "", "rank": 1, "platform": "微博", "summary": "", "content": ""}]
    """
    try:
        headers = {
            "User-Agent": USER_AGENT,
            "Referer": "https://weibo.com/",
            "Accept": "application/json, text/plain, */*",
        }
        api_candidates = (
            "https://weibo.com/ajax/statuses/hot_band",
            "https://weibo.com/ajax/side/hotSearch",
        )

        hot_list: list[dict[str, Any]] = []
        for api_url in api_candidates:
            response = SESSION.get(api_url, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()

            items = data.get("data", {}).get("band_list") or data.get("data", {}).get("realtime") or []
            for idx, item in enumerate(items, 1):
                title = clean_text(item.get("word") or item.get("note") or item.get("label_name") or "")
                if not title or title.startswith("#"):
                    continue

                hot_value = clean_text(
                    item.get("raw_hot")
                    or item.get("num")
                    or item.get("onboard_time")
                    or item.get("hot")
                    or "0"
                )
                hot_url = clean_text(item.get("scheme") or item.get("url") or "")
                if hot_url.startswith("//"):
                    hot_url = f"https:{hot_url}"
                if not hot_url:
                    hot_url = f"https://s.weibo.com/weibo?q={title}"

                summary = clean_text(item.get("desc") or item.get("icon_desc") or title)
                content = clean_text(item.get("desc_extr") or item.get("desc") or title)

                hot_list.append(
                    {
                        "title": title,
                        "url": hot_url,
                        "hot_value": hot_value,
                        "rank": len(hot_list) + 1,
                        "platform": "微博",
                        "source_platform": "weibo",
                        "summary": summary or title,
                        "content": content or summary or title,
                    }
                )
                if len(hot_list) >= limit:
                    return hot_list[:limit]

        return hot_list[:limit]
    except Exception as e:
        print(f"微博热搜获取失败: {e}")
        return []


def fetch_zhihu_hot(limit: int = 20, fetch_content: bool = True) -> list[dict[str, Any]]:
    """
    爬取知乎热榜 - 完全免费
    返回: [{"title": "", "excerpt": "", "url": "", "hot_value": "", "rank": 1, "platform": "知乎", "summary": "", "content": ""}]
    """
    try:
        url = f"https://www.zhihu.com/api/v3/feed/topstory/hot-list-web?limit={max(limit, 20)}&desktop=true"
        headers = {
            "User-Agent": USER_AGENT,
            "Referer": "https://www.zhihu.com/hot",
            "x-api-version": "3.0.91",
        }

        response = SESSION.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()

        hot_list = []
        for idx, item in enumerate(data.get('data', [])[:limit], 1):
            try:
                target = item.get('target') or {}
                title_area = target.get('title_area') or {}
                excerpt_area = target.get('excerpt_area') or {}
                metrics_area = target.get('metrics_area') or {}
                link = target.get('link') or {}

                title = clean_text(title_area.get('text') or target.get('title') or "")
                excerpt = clean_text(excerpt_area.get('text') or target.get('excerpt') or "")
                hot_url = clean_text(link.get('url') or "")
                if not hot_url:
                    question_id = clean_text(target.get('id') or "")
                    hot_url = f"https://www.zhihu.com/question/{question_id}" if question_id else "https://www.zhihu.com/hot"

                hot_value = clean_text(metrics_area.get('text') or item.get('detail_text') or "")
                summary = excerpt or title
                content = excerpt or title

                if not title:
                    continue

                hot_list.append({
                    "title": title,
                    "excerpt": excerpt,
                    "summary": summary,
                    "content": content,
                    "url": hot_url,
                    "hot_value": hot_value,
                    "rank": idx,
                    "platform": "知乎",
                    "source_platform": "zhihu"
                })
            except Exception as e:
                print(f"知乎单条解析失败: {e}")
                continue

        return hot_list
    except Exception as e:
        print(f"知乎热榜获取失败: {e}")
        return []


def fetch_baidu_hot(limit: int = 20, fetch_content: bool = True) -> list[dict[str, Any]]:
    """
    爬取百度热搜 - 完全免费
    返回: [{"title": "", "url": "", "hot_value": "", "rank": 1, "platform": "百度", "summary": "", "content": ""}]
    """
    try:
        url = "http://top.baidu.com/board?tab=realtime"
        headers = {
            "User-Agent": USER_AGENT,
            "Accept-Language": "zh-CN,zh;q=0.9",
        }

        response = SESSION.get(url, headers=headers, timeout=15)
        response.encoding = 'utf-8'
        soup = BeautifulSoup(response.text, 'html.parser')

        hot_list = []
        items = soup.select('.category-wrap_iQLoo')

        for idx, item in enumerate(items[:limit], 1):
            try:
                # 标题
                title_elem = item.select_one('.c-single-text-ellipsis')
                if not title_elem:
                    continue
                title = clean_text(title_elem.get_text())

                # 热度
                hot_elem = item.select_one('.hot-index_1Bl1a')
                hot_value = clean_text(hot_elem.get_text()) if hot_elem else "0"

                # URL
                link = item.select_one('a')
                hot_url = link.get('href', '') if link else ''

                # 使用标题作为摘要和内容
                summary = title
                content = title

                hot_list.append({
                    "title": title,
                    "url": hot_url,
                    "hot_value": hot_value,
                    "rank": idx,
                    "platform": "百度",
                    "source_platform": "baidu",
                    "summary": summary,
                    "content": content
                })
            except Exception as e:
                print(f"百度单条解析失败: {e}")
                continue

        return hot_list
    except Exception as e:
        print(f"百度热搜获取失败: {e}")
        return []


def fetch_douyin_hot(limit: int = 20, fetch_content: bool = True) -> list[dict[str, Any]]:
    """
    爬取抖音热榜 - 使用移动端接口绕过反爬
    返回: [{"title": "", "url": "", "hot_value": "", "rank": 1, "platform": "抖音", "summary": "", "content": ""}]
    """
    try:
        # 使用抖音移动端热榜接口
        url = "https://www.douyin.com/aweme/v1/web/hot/search/list/"
        headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15",
            "Referer": "https://www.douyin.com/"
        }

        response = SESSION.get(url, headers=headers, timeout=10)
        data = response.json()

        hot_list = []
        word_list = data.get('data', {}).get('word_list', [])

        for idx, item in enumerate(word_list[:limit], 1):
            try:
                title = clean_text(item.get('word', ''))
                hot_value = str(item.get('hot_value', 0))

                # 构建搜索 URL
                hot_url = f"https://www.douyin.com/search/{title}"

                # 使用标题作为摘要和内容
                summary = title
                content = title

                hot_list.append({
                    "title": title,
                    "url": hot_url,
                    "hot_value": hot_value,
                    "rank": idx,
                    "platform": "抖音",
                    "source_platform": "douyin",
                    "summary": summary,
                    "content": content
                })
            except Exception as e:
                print(f"抖音单条解析失败: {e}")
                continue

        return hot_list
    except Exception as e:
        print(f"抖音热榜获取失败: {e}")
        # 如果接口失败，尝试备用方案
        return fetch_douyin_hot_backup(limit, fetch_content)


def fetch_douyin_hot_backup(limit: int = 20, fetch_content: bool = True) -> list[dict[str, Any]]:
    """
    抖音热榜备用方案 - 爬取网页版
    """
    try:
        url = "https://www.douyin.com/hot"
        headers = {
            "User-Agent": USER_AGENT,
            "Referer": "https://www.douyin.com/"
        }

        response = SESSION.get(url, headers=headers, timeout=10)
        response.encoding = 'utf-8'

        # 尝试从网页中提取数据
        # 注意: 抖音网页版可能需要 JavaScript 渲染，这里提供基础实现
        soup = BeautifulSoup(response.text, 'html.parser')

        hot_list = []
        # 这里需要根据实际网页结构调整选择器
        # 由于抖音使用 React 渲染，可能需要从 script 标签中提取数据

        return hot_list
    except Exception as e:
        print(f"抖音热榜备用方案失败: {e}")
        return []


def fetch_all_hot_ranks(limit: int = 20, fetch_content: bool = False) -> dict[str, list[dict[str, Any]]]:
    """
    获取所有平台热榜
    返回: {"weibo": [...], "zhihu": [...], "baidu": [...], "douyin": [...]}
    """
    return {
        "weibo": fetch_weibo_hot(limit, fetch_content),
        "zhihu": fetch_zhihu_hot(limit, fetch_content),
        "baidu": fetch_baidu_hot(limit, fetch_content),
        "douyin": fetch_douyin_hot(limit, fetch_content)
    }


def aggregate_hot_ranks(limit: int = 50, fetch_content: bool = False) -> list[dict[str, Any]]:
    """
    聚合所有平台热榜，按热度排序
    """
    all_ranks = fetch_all_hot_ranks(limit, fetch_content)

    # 合并所有平台
    aggregated = []
    for platform, items in all_ranks.items():
        aggregated.extend(items)

    # 简单去重（基于标题相似度）
    unique_items = []
    seen_titles = set()

    for item in aggregated:
        title_key = re.sub(r'[^\w]', '', item['title'].lower())
        if title_key not in seen_titles:
            seen_titles.add(title_key)
            unique_items.append(item)

    return unique_items[:limit]


def filter_business_relevant_hot_ranks(hot_ranks: list[dict[str, Any]], keywords: list[str]) -> list[dict[str, Any]]:
    """
    筛选与业务相关的热榜内容

    参数:
        hot_ranks: 热榜列表
        keywords: 业务关键词列表

    返回:
        筛选后的热榜列表
    """
    relevant_items = []

    for item in hot_ranks:
        headline_text = " ".join(
            filter(
                None,
                [
                    clean_text(item.get("title", "")),
                    clean_text(item.get("summary", "")),
                ],
            )
        )
        content_text = " ".join(
            filter(
                None,
                [
                    clean_text(item.get("content", "")),
                    clean_text(item.get("article_source", "")),
                ],
            )
        )
        headline_matches, headline_score = collect_business_matches(headline_text)
        content_matches, content_score = collect_business_matches(content_text)
        merged_matches = dedupe_strings(headline_matches + content_matches + [kw for kw in keywords if kw.lower() in headline_text.lower()])
        business_score = headline_score * 2 + min(content_score, 4)
        headline_primary_matches = [kw for kw in PRIMARY_BUSINESS_KEYWORDS if kw in headline_text.lower()]

        if not headline_primary_matches and headline_score < 6:
            continue
        if business_score < 6 and len(merged_matches) < 2:
            continue

        enriched_item = dict(item)
        enriched_item["matched_keywords"] = merged_matches[:6]
        enriched_item["business_score"] = business_score
        relevant_items.append(enriched_item)

    return sorted(
        relevant_items,
        key=lambda item: (
            -int(item.get("business_score", 0)),
            -len(clean_text(item.get("summary", ""))),
            int(item.get("rank", 9999)),
        ),
    )


def enrich_hot_ranks_with_content(hot_ranks: list[dict[str, Any]], max_items: int = 10) -> list[dict[str, Any]]:
    """
    使用 Jina Reader 为热榜条目增强内容

    参数:
        hot_ranks: 热榜列表
        max_items: 最多增强多少条（避免超时）

    返回:
        增强后的热榜列表
    """
    enriched = []

    for idx, item in enumerate(hot_ranks[:max_items]):
        try:
            current = dict(item)
            url = clean_text(current.get("url", ""))
            summary = clean_text(current.get("summary", ""))
            content = clean_text(current.get("content", ""))

            context: dict[str, str] = {}
            if not summary or summary == clean_text(current.get("title", "")) or not content or content == clean_text(current.get("title", "")) or is_search_style_url(url):
                context = discover_topic_context(clean_text(current.get("title", "")))

            if context:
                current["summary"] = context.get("summary") or summary or current.get("title", "")
                current["content"] = context.get("content") or content or current.get("title", "")
                if context.get("article_url"):
                    current["article_url"] = context["article_url"]
                if context.get("article_source"):
                    current["article_source"] = context["article_source"]
            elif url and not is_search_style_url(url):
                full_content = fetch_clean_content(url, timeout=5)
                if full_content:
                    current["summary"] = summarize_content(full_content, max_length=260) or current.get("title", "")
                    current["content"] = trim_text(full_content, 3000)

            current["summary"] = clean_text(current.get("summary") or current.get("title", ""))
            current["content"] = clean_text(current.get("content") or current.get("summary") or current.get("title", ""))
            enriched.append(current)
            time.sleep(0.08)

        except Exception as e:
            print(f"内容增强失败 {item.get('url', '')}: {e}")
            enriched.append(item)

    enriched.extend(hot_ranks[max_items:])
    return enriched
