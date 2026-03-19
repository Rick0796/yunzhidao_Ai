from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import html
import json
import os
import re
import time
from pathlib import Path
from typing import Any

try:
    import urllib.error
    import urllib.request
except ImportError as exc:  # pragma: no cover
    raise SystemExit("当前 Python 环境缺少 urllib，无法启动后端。") from exc

try:
    from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
    from fastapi.staticfiles import StaticFiles
    import uvicorn
    from backend.script_library import (
        count_script_documents,
        fetch_script_document,
        init_script_library,
        list_script_documents,
        list_script_sections,
        list_compose_candidates,
        render_script_document_text,
        resolve_script_library_db_path,
        upsert_script_document,
    )
except ImportError as exc:  # pragma: no cover
    raise SystemExit("缺少 FastAPI 依赖，请先运行：pip install -r backend/requirements.txt") from exc


from backend.runtime_paths import ensure_runtime_paths, resolve_runtime_paths
from backend.anthropic_client import AnthropicApiError, DEFAULT_ANTHROPIC_MODEL, normalize_anthropic_model_name
from backend.gemini_models import DEFAULT_GEMINI_MODEL, normalize_gemini_model_name
from backend.platform_utils import clean_text, dedupe_strings, collect_business_keyword_hits
from backend.gemini_video import GeminiVideoError, analyze_video_with_gemini, generate_sora_prompts_with_gemini, generate_json_with_gemini, generate_text_with_gemini
from backend.rewrite_service import analyze_copy_with_claude, normalize_multiline_text, refine_copy_with_claude

RUNTIME_PATHS = resolve_runtime_paths()
ROOT_DIR = RUNTIME_PATHS.root_dir
DIST_DIR = RUNTIME_PATHS.dist_dir
RUNTIME_DIR = RUNTIME_PATHS.runtime_dir
CACHE_DIR = RUNTIME_PATHS.cache_dir
STATE_DIR = RUNTIME_PATHS.state_dir
LOG_FILE = STATE_DIR / "api_requests.jsonl"
HOT_RANK_CACHE_PATH = CACHE_DIR / "hot_rank_cache.json"
SCRIPT_LIBRARY_DB_PATH = resolve_script_library_db_path()

LOCAL_CONFIG_PATH = Path(__file__).resolve().parent / "config.local.json"
BACKEND_EXAMPLE_CONFIG_PATH = Path(__file__).resolve().parent / "config.example.json"
LEGACY_CONFIG_PATH = ROOT_DIR / "server" / "config.local.json"
EXAMPLE_CONFIG_PATH = ROOT_DIR / "server" / "config.example.json"

HOT_RANK_CACHE_MAX_AGE_SECONDS = 45 * 60
HOT_RANK_CACHE_VERSION = 2
HOT_RANK_DEFAULT_ALL_LIMIT = 20
HOT_RANK_DEFAULT_BUSINESS_LIMIT = 10
HOT_RANK_WARM_PARAMETERS = {
    "all_limit": HOT_RANK_DEFAULT_ALL_LIMIT,
    "business_limit": HOT_RANK_DEFAULT_BUSINESS_LIMIT,
}
OFFICIAL_SOURCE_KEYWORDS = [
    "新华社",
    "人民日报",
    "央视",
    "央视新闻",
    "中国日报",
    "北京日报",
    "中国网",
    "新浪财经",
    "财联社",
    "新华财经",
    "极目新闻",
    "澎湃",
    "界面",
    "第一财经",
    "中国新闻周刊",
    "南方周末",
    "大风新闻",
]
AGGREGATE_HOT_KEYWORDS = [
    "今日热点",
    "热点新闻",
    "新闻摘要",
    "早知道",
    "top",
    "盘点",
    "合集",
    "看完",
    "速览",
    "汇总",
]
BUSINESS_RELEVANT_KEYWORDS = [
    "ai",
    "人工智能",
    "智能体",
    "获客",
    "流量",
    "创业",
    "老板",
    "企业",
    "平台",
    "监管",
    "合规",
    "内容",
    "短剧",
    "带货",
    "数字",
    "ip",
    "自动化",
    "私域",
    "商用",
    "量产",
    "订单",
    "人才",
    "教育",
    "文旅",
]
BUSINESS_KEYWORD_WEIGHTS: dict[str, int] = {
    "ai": 4,
    "人工智能": 4,
    "智能体": 4,
    "数字人": 4,
    "数字资产": 4,
    "数字ip": 4,
    "获客": 4,
    "流量": 3,
    "客户": 3,
    "订单": 3,
    "转化": 3,
    "创业": 3,
    "企业": 3,
    "监管": 3,
    "合规": 3,
    "自动化": 3,
    "私域": 3,
    "商用": 3,
    "平台": 2,
    "内容": 2,
    "老板": 2,
    "经营": 2,
    "短剧": 2,
    "带货": 2,
    "数字": 2,
    "ip": 2,
    "量产": 2,
    "人才": 2,
    "教育": 2,
    "文旅": 2,
}
BRIDGE_DIRECTION_RULES: list[tuple[list[str], str]] = [
    (["ai", "人工智能", "智能体", "算法"], "AI获客"),
    (["数字ip", "数字资产", "ip"], "数字IP"),
    (["流量", "热度", "爆火"], "流量增长"),
    (["创业", "创始", "补贴"], "创业"),
    (["老板", "经营"], "老板增长"),
    (["企业", "产业", "订单", "人才", "商用"], "企业增长"),
    (["内容", "短剧", "带货", "视频", "创作"], "内容增长"),
    (["私域", "会员", "社群"], "私域"),
    (["自动化", "智能体", "效率工具"], "自动化"),
    (["平台", "监管", "治理", "规则", "封号"], "平台变化"),
    (["趋势", "量产", "商用", "落地", "增长"], "商业趋势"),
]
AI_INDUSTRY_KEYWORDS = [
    "ai",
    "aigc",
    "gpt",
    "agent",
    "rag",
    "copilot",
    "chatgpt",
    "openai",
    "claude",
    "deepseek",
    "cursor",
    "sora",
    "midjourney",
    "人工智能",
    "生成式",
    "大模型",
    "模型",
    "智能体",
    "工作流",
    "自动化",
    "数字人",
    "虚拟人",
    "机器人",
    "机器学习",
    "算力",
    "芯片",
    "gpu",
    "npu",
    "语音识别",
    "计算机视觉",
    "知识库",
    "向量",
    "多模态",
    "提示词",
    "文心",
    "通义",
    "豆包",
]
AI_KEYWORD_WEIGHTS: dict[str, int] = {
    "ai": 5,
    "aigc": 5,
    "gpt": 5,
    "agent": 5,
    "rag": 4,
    "copilot": 4,
    "chatgpt": 5,
    "openai": 5,
    "claude": 4,
    "deepseek": 5,
    "cursor": 4,
    "sora": 4,
    "midjourney": 4,
    "人工智能": 5,
    "生成式": 4,
    "大模型": 5,
    "模型": 3,
    "智能体": 5,
    "工作流": 3,
    "自动化": 4,
    "数字人": 5,
    "虚拟人": 4,
    "机器人": 4,
    "机器学习": 4,
    "算力": 4,
    "芯片": 4,
    "gpu": 4,
    "npu": 4,
    "语音识别": 3,
    "计算机视觉": 3,
    "知识库": 3,
    "向量": 3,
    "多模态": 4,
    "提示词": 3,
    "文心": 3,
    "通义": 3,
    "豆包": 3,
}
AI_DIRECTION_RULES: list[tuple[list[str], str]] = [
    (["agent", "智能体", "工作流", "自动化", "copilot"], "AI自动化"),
    (["数字人", "虚拟人", "口播"], "AI数字人"),
    (["获客", "营销", "广告", "销售", "内容", "短视频"], "AI营销"),
    (["算力", "芯片", "gpu", "npu"], "AI算力"),
    (["机器人", "机械臂"], "AI机器人"),
    (["rag", "知识库", "向量"], "AI知识库"),
    (["大模型", "模型", "生成式", "多模态"], "AI模型"),
    (["人工智能", "ai", "aigc"], "AI趋势"),
]
AI_HARD_KEYWORDS = {
    "ai",
    "aigc",
    "gpt",
    "agent",
    "chatgpt",
    "openai",
    "claude",
    "deepseek",
    "cursor",
    "sora",
    "midjourney",
    "人工智能",
    "生成式",
    "大模型",
    "智能体",
    "数字人",
    "虚拟人",
    "机器人",
    "机器学习",
    "多模态",
    "文心",
    "通义",
    "豆包",
}
TIME_CLUE_PATTERNS = [
    re.compile(r"\d{4}-\d{1,2}-\d{1,2}(?:\s*\d{1,2}:\d{2})?"),
    re.compile(r"\d{1,2}月\d{1,2}日(?:\s*\d{1,2}[:：]\d{2})?"),
    re.compile(r"当地时间\d{1,2}日"),
    re.compile(r"\d{1,2}日(?:上午|下午|晚间|晚)?"),
]
URL_NOISE_PATTERN = re.compile(r"(https?://\S+|//\S+|www\.\S+)")
REFERENCE_MARK_PATTERN = re.compile(r"\[\d+\]")
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
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
QUOTE_TERM_PATTERN = re.compile(r"[“\"']([^”“\"'\n]{2,18})[”\"']")
HOT_RANK_QUERY_STOP_WORDS = {
    "最新",
    "今日",
    "回应",
    "建议",
    "代表",
    "委员",
    "话题",
    "热榜",
    "热搜",
    "视频",
    "新闻",
    "内容",
    "事件",
    "消息",
    "发布",
    "提出",
    "如何",
    "解读",
    "什么",
    "为什么",
    "怎么",
    "今日看点",
}
HOT_RANK_META_REASON_PATTERN = re.compile(
    r"^(这条热点已经能往|这类(?:外部冲击|变化|内容|热点)|适合继续拆成|老板需要提前准备应对动作)",
    re.IGNORECASE,
)
CONTENT_FIELD_CANDIDATES = (
    "content",
    "clean_content",
    "full_content",
    "article_content",
    "body",
    "excerpt",
)
SUMMARY_FIELD_CANDIDATES = (
    "summary",
    "snippet",
    "description",
    "excerpt",
    "body",
)
SEARCH_CONTENT_MAX_LENGTH = 1800
DISPLAY_TITLE_MAX_LENGTH = 24
DISPLAY_SUMMARY_MAX_LENGTH = 28
BUSINESS_REASON_MAX_LENGTH = 90

class UpstreamHttpError(Exception):
    def __init__(self, status_code: int, raw_text: str):
        super().__init__(f"HTTP {status_code}")
        self.status_code = status_code
        self.raw_text = raw_text


class HotRankCacheManager:
    """热榜缓存管理器，封装全局缓存状态和并发控制"""

    def __init__(self, cache_path: Path, max_age_seconds: int):
        self.cache_path = cache_path
        self.max_age_seconds = max_age_seconds
        self._cache: dict[str, Any] | None = None
        self._refresh_task: asyncio.Task[Any] | None = None
        self._refresh_lock = asyncio.Lock()
        self._refresh_error: dict[str, Any] | None = None
        self.retry_cooldown_seconds = 5 * 60

    @property
    def cache(self) -> dict[str, Any] | None:
        """获取当前缓存"""
        return self._cache

    @cache.setter
    def cache(self, value: dict[str, Any] | None) -> None:
        """设置缓存"""
        self._cache = value

    @property
    def refresh_task(self) -> asyncio.Task[Any] | None:
        """获取刷新任务"""
        return self._refresh_task

    @refresh_task.setter
    def refresh_task(self, value: asyncio.Task[Any] | None) -> None:
        """设置刷新任务"""
        self._refresh_task = value

    @property
    def refresh_lock(self) -> asyncio.Lock:
        """获取刷新锁"""
        return self._refresh_lock

    @property
    def refresh_error(self) -> dict[str, Any] | None:
        """获取刷新错误"""
        return self._refresh_error

    @refresh_error.setter
    def refresh_error(self, value: dict[str, Any] | None) -> None:
        """设置刷新错误"""
        self._refresh_error = value

    def is_cache_stale(self) -> bool:
        """检查缓存是否过期"""
        if not self._cache:
            return True
        fetched_at = self._cache.get("fetchedAt")
        if not fetched_at:
            return True
        try:
            fetched_time = time.mktime(time.strptime(fetched_at, "%Y-%m-%d %H:%M:%S"))
            return (time.time() - fetched_time) > self.max_age_seconds
        except (ValueError, TypeError):
            return True

    def load_from_disk(self) -> dict[str, Any] | None:
        """从磁盘加载缓存"""
        if not self.cache_path.exists():
            return None
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8-sig"))
            if isinstance(data, dict):
                self._cache = data
                return data
        except (OSError, json.JSONDecodeError):
            pass
        return None

    def save_to_disk(self, data: dict[str, Any]) -> None:
        """保存缓存到磁盘"""
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8"
            )
            self._cache = data
        except OSError:
            pass


# 全局缓存管理器实例
hot_rank_cache_manager = HotRankCacheManager(
    cache_path=HOT_RANK_CACHE_PATH,
    max_age_seconds=HOT_RANK_CACHE_MAX_AGE_SECONDS
)


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        return


def now_text() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def to_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def clean_config_text(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    placeholder_patterns = ("请替换", "your_", "your-", "example", "示例", "placeholder")
    if any(pattern.lower() in text.lower() for pattern in placeholder_patterns):
        return ""
    return text


def deep_copy_json(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False))


def env_text(*names: str) -> str:
    for name in names:
        value = clean_config_text(os.getenv(name, ""))
        if value:
            return value
    return ""


def env_int(*names: str) -> int | None:
    for name in names:
        raw = os.getenv(name)
        if raw is None:
            continue
        try:
            return int(raw)
        except ValueError:
            continue
    return None


def read_config() -> dict[str, Any]:
    config = (
        read_json(LOCAL_CONFIG_PATH)
        or read_json(LEGACY_CONFIG_PATH)
        or read_json(BACKEND_EXAMPLE_CONFIG_PATH)
        or read_json(EXAMPLE_CONFIG_PATH)
        or {}
    )

    # 优先使用 GEMINI_API_KEY 环境变量
    api_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("API_KEY") or "").strip()
    if not api_key:
        api_key = clean_config_text(config.get("apiKey", ""))

    base_url = "https://generativelanguage.googleapis.com"
    default_model = normalize_gemini_model_name(
        env_text("GEMINI_MODEL") or clean_config_text(config.get("defaultModel", DEFAULT_GEMINI_MODEL)),
        DEFAULT_GEMINI_MODEL,
    )
    anthropic_base_url = env_text("ANTHROPIC_BASE_URL", "CLAUDE_BASE_URL") or clean_config_text(
        config.get("anthropicBaseUrl") or config.get("claudeBaseUrl", "")
    )
    anthropic_api_key = env_text("ANTHROPIC_API_KEY", "CLAUDE_API_KEY") or clean_config_text(
        config.get("anthropicApiKey") or config.get("claudeApiKey", "")
    )
    anthropic_model = normalize_anthropic_model_name(
        env_text("ANTHROPIC_MODEL", "CLAUDE_MODEL") or clean_config_text(config.get("anthropicModel", DEFAULT_ANTHROPIC_MODEL)),
        DEFAULT_ANTHROPIC_MODEL,
    )
    prompt_version = env_text("PROMPT_VERSION") or clean_config_text(config.get("promptVersion", "copy-workbench-v2026-03-09")) or "copy-workbench-v2026-03-09"
    port = env_int("PORT") or to_int(config.get("port", 8788), 8788)
    retries = env_int("API_RETRIES") or to_int(config.get("retries", 2), 2)
    timeout_seconds = env_int("API_TIMEOUT_SECONDS") or to_int(config.get("timeoutSeconds", 110), 110)

    return {
        "baseUrl": base_url,
        "apiKey": api_key,
        "defaultModel": default_model,
        "anthropicBaseUrl": anthropic_base_url,
        "anthropicApiKey": anthropic_api_key,
        "anthropicModel": anthropic_model,
        "port": port,
        "promptVersion": prompt_version,
        "retries": retries,
        "timeoutSeconds": max(10, timeout_seconds),
    }


CONFIG = read_config()


def resolve_model_name(raw_model: Any) -> str:
    return normalize_gemini_model_name(str(raw_model or ""), CONFIG["defaultModel"])


def resolve_rewrite_model_name(raw_model: Any) -> str:
    return normalize_anthropic_model_name(str(raw_model or ""), CONFIG["anthropicModel"])
FREE_WORKFLOW_HOT_RANK = {"id": "free_scrapers", "name": "免费热榜兼容入口"}
FREE_WORKFLOW_MANUAL_SEARCH = {"id": "free_search", "name": "免费搜索兼容入口"}

@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_runtime_paths(RUNTIME_PATHS)
    init_script_library(SCRIPT_LIBRARY_DB_PATH)
    if not get_hot_rank_cache():
        start_hot_rank_refresh(force=False)
    yield

app = FastAPI(title="云智道AI后端", version="0.4.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yunzhidao-ai.vercel.app", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def append_log(payload: dict[str, Any]) -> None:
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as file:
            file.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except OSError:
        return




async def read_request_json(request: Request) -> dict[str, Any]:
    raw = await request.body()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="请求体不是合法 JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="请求体必须是 JSON 对象")
    return parsed


def unwrap_json_value(value: Any) -> Any:
    current = value
    for _ in range(8):
        if not isinstance(current, str):
            return current
        text = current.strip()
        if not text:
            return ""
        try:
            current = json.loads(text)
        except json.JSONDecodeError:
            return current
    return current


def stringify_error(detail: Any) -> str:
    if isinstance(detail, str):
        return detail
    try:
        return json.dumps(detail, ensure_ascii=False)
    except TypeError:
        return str(detail)


def get_hot_rank_cache() -> dict[str, Any] | None:
    cache = hot_rank_cache_manager.cache
    if isinstance(cache, dict):
        if to_int(cache.get("cacheVersion"), 0) == HOT_RANK_CACHE_VERSION:
            return cache
        hot_rank_cache_manager.cache = None

    cache = read_json(HOT_RANK_CACHE_PATH)
    if isinstance(cache, dict):
        if to_int(cache.get("cacheVersion"), 0) != HOT_RANK_CACHE_VERSION:
            return None
        hot_rank_cache_manager.cache = cache
        return cache
    return None


def cache_age_seconds(cache: dict[str, Any] | None) -> int:
    if not isinstance(cache, dict):
        return 10**9
    fetched_at_ts = to_int(cache.get("fetchedAtTs"), 0)
    if fetched_at_ts <= 0:
        return 10**9
    return max(0, int(time.time()) - fetched_at_ts)


def hot_rank_cache_is_fresh(cache: dict[str, Any] | None) -> bool:
    return cache_age_seconds(cache) < HOT_RANK_CACHE_MAX_AGE_SECONDS


def hot_rank_supports_background_refresh() -> bool:
    return not RUNTIME_PATHS.serverless


def hot_rank_should_refresh_inline(cache: dict[str, Any] | None, *, force_refresh: bool) -> bool:
    if not RUNTIME_PATHS.serverless:
        return False
    if force_refresh:
        return True
    if not cache:
        return True
    return not hot_rank_cache_is_fresh(cache)


def get_hot_rank_refresh_error() -> dict[str, Any] | None:
    error = hot_rank_cache_manager.refresh_error
    if not isinstance(error, dict):
        return None
    error_ts = to_int(error.get("ts"), 0)
    if error_ts <= 0:
        return None
    if int(time.time()) - error_ts > hot_rank_cache_manager.retry_cooldown_seconds:
        hot_rank_cache_manager.refresh_error = None
        return None
    return error


def build_hot_rank_cache_payload(result: dict[str, Any], workflow_id: str, workflow_name: str) -> dict[str, Any]:
    normalized_result = normalize_hot_rank_result(result)
    return {
        "cacheVersion": HOT_RANK_CACHE_VERSION,
        "fetchedAt": now_text(),
        "fetchedAtTs": int(time.time()),
        "workflow": {
            "id": workflow_id,
            "name": workflow_name,
        },
        "result": {
            "snapshot_title": str(normalized_result.get("snapshot_title", "今日热榜中心")),
            "generated_at": str(normalized_result.get("generated_at", "")),
            "debug": normalized_result.get("debug") if isinstance(normalized_result.get("debug"), dict) else {},
            "all_hot_list": normalized_result.get("all_hot_list") if isinstance(normalized_result.get("all_hot_list"), list) else [],
            "business_hot_list": normalized_result.get("business_hot_list") if isinstance(normalized_result.get("business_hot_list"), list) else [],
        },
    }


def build_hot_rank_response_content(
    cache_payload: dict[str, Any],
    all_limit: int,
    business_limit: int,
    *,
    from_cache: bool,
    stale: bool,
    refreshing: bool,
    warning: str = "",
) -> dict[str, Any]:
    raw_result = cache_payload.get("result") if isinstance(cache_payload.get("result"), dict) else {}
    result = normalize_hot_rank_result(raw_result)
    workflow = cache_payload.get("workflow") if isinstance(cache_payload.get("workflow"), dict) else {}
    all_hot_list = result.get("all_hot_list") if isinstance(result.get("all_hot_list"), list) else []
    business_hot_list = result.get("business_hot_list") if isinstance(result.get("business_hot_list"), list) else []

    return {
        "snapshotTitle": str(result.get("snapshot_title", "今日热榜中心")),
        "generatedAt": str(result.get("generated_at", "")),
        "debug": result.get("debug") if isinstance(result.get("debug"), dict) else {},
        "allHotList": deep_copy_json(all_hot_list[: max(1, all_limit)]),
        "businessHotList": deep_copy_json(business_hot_list[: max(1, business_limit)]),
        "workflow": {
            "id": str(workflow.get("id", "")),
            "name": str(workflow.get("name", "")),
        },
        "cache": {
            "fetchedAt": str(cache_payload.get("fetchedAt", "")),
            "ageSeconds": cache_age_seconds(cache_payload),
            "stale": stale,
            "refreshing": refreshing,
            "fromCache": from_cache,
            "warning": warning,
        },
    }


def build_hot_rank_placeholder(workflow_id: str, workflow_name: str, *, refreshing: bool, warning: str = "") -> dict[str, Any]:
    return {
        "snapshotTitle": "今日热榜中心",
        "generatedAt": "",
        "debug": {},
        "allHotList": [],
        "businessHotList": [],
        "workflow": {
            "id": workflow_id,
            "name": workflow_name,
        },
        "cache": {
            "fetchedAt": "",
            "ageSeconds": 0,
            "stale": False,
            "refreshing": refreshing,
            "fromCache": False,
            "warning": warning,
        },
    }


def contains_keyword(text: str, keyword: str) -> bool:
    return keyword.lower() in text.lower()


def collect_ai_keyword_hits(text: str) -> tuple[list[str], int]:
    normalized = clean_text(text).lower()
    hits: list[str] = []
    score = 0

    for keyword, weight in AI_KEYWORD_WEIGHTS.items():
        if keyword in normalized:
            hits.append(keyword)
            score += weight

    if re.search(r"(ai|人工智能|aigc|大模型|生成式|智能体|agent|自动化|数字人|机器人)", normalized):
        score += 2
    if re.search(r"(deepseek|openai|chatgpt|claude|gpt|通义|文心|豆包|copilot|cursor|sora|midjourney)", normalized):
        score += 2
    if re.search(r"(芯片|算力|gpu|npu|知识库|rag|向量)", normalized):
        score += 1

    return dedupe_strings(hits)[:8], score


def infer_ai_directions(text: str) -> list[str]:
    directions: list[str] = []
    for keywords, direction in AI_DIRECTION_RULES:
        if any(contains_keyword(text, keyword) for keyword in keywords):
            directions.append(direction)
    if not directions:
        directions.append("AI趋势")
    deduped: list[str] = []
    for direction in directions:
        if direction not in deduped:
            deduped.append(direction)
    return deduped[:4]


def collect_ai_anchor_hits(text: str) -> list[str]:
    normalized = clean_text(text).lower()
    hits = [keyword for keyword in AI_HARD_KEYWORDS if keyword in normalized]
    return dedupe_strings(hits)[:6]


def infer_ai_recommend_reason(text: str, directions: list[str], matched_keywords: list[str]) -> str:
    normalized = clean_text(text)
    if re.search(r"(监管|合规|治理|处罚|备案|安全)", normalized) and matched_keywords:
        return "这条热点和AI监管、合规边界或平台治理直接相关，适合做AI行业解读。"
    if re.search(r"(算力|芯片|gpu|npu|服务器|模型训练)", normalized):
        return "这条热点和AI基础设施、模型能力或产业链变化直接相关，适合做AI行业解读。"
    if re.search(r"(数字人|智能体|agent|自动化|工作流|机器人)", normalized):
        return "这条热点和AI工具、智能体或自动化应用直接相关，适合做AI行业解读。"
    if directions:
        return f"这条热点已经能往{'、'.join(directions[:2])}上延伸，适合拆成AI行业判断。"
    if matched_keywords:
        return f"这条热点和{'、'.join(matched_keywords[:2])}直接相关，适合做AI行业解读。"
    return ""


def infer_ai_recommended_angle(text: str, directions: list[str], reason: str) -> str:
    normalized = clean_text(text)
    if "AI营销" in directions:
        return "从AI营销和内容获客落地切入，判断接下来会带来什么变化。"
    if "AI自动化" in directions:
        return "从AI自动化和智能体落地切入，判断对企业效率和流程的影响。"
    if "AI数字人" in directions:
        return "从AI数字人和内容生产切入，判断这条变化会带来哪些新机会。"
    if "AI算力" in directions or re.search(r"(芯片|算力|gpu|npu)", normalized):
        return "从AI基础设施和产业链切入，判断接下来哪些方向会先受影响。"
    if "AI模型" in directions:
        return "从模型能力和AI工具演进切入，判断下一步的应用机会。"
    return reason


def clean_list_text(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    for value in values:
        text = clean_text(value)
        if text:
            cleaned.append(text)
    return cleaned


def hot_item_identity(item: dict[str, Any]) -> str:
    title = clean_text(item.get("title")).lower()
    url = clean_text(item.get("source_url")).lower()
    summary = clean_text(item.get("summary")).lower()
    if title and url:
        return f"{title}|{url}"
    return title or url or summary


def business_item_identity(item: dict[str, Any]) -> str:
    title = clean_text(item.get("title")).lower()
    url = clean_text(item.get("source_url")).lower()
    summary = clean_text(item.get("summary")).lower()
    if title and url:
        return f"{title}|{url}"
    return title or url or summary


def dedupe_items(items: list[dict[str, Any]], identity_getter) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in items:
        key = identity_getter(item)
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def normalize_hot_item(item: dict[str, Any]) -> dict[str, Any]:
    normalized = deep_copy_json(item)
    key_points = clean_list_text(item.get("key_points"))
    timeline = clean_list_text(item.get("timeline"))
    title = clean_text(item.get("title")) or (trim_text(key_points[0], 80) if key_points else "")
    why_hot = clean_text(item.get("why_hot"))
    business_reason = build_business_reason(item.get("business_reason"), item.get("boss_impact"))
    clean_content = build_clean_content(item.get("clean_content"), item.get("content"), item.get("summary"), title)
    summary = clean_text(item.get("summary")) or summarize_search_content(clean_content, max_length=220) or (trim_text(key_points[0], 220) if key_points else "")
    display_title = clean_text(item.get("display_title")) or build_display_title(title, summary, why_hot, clean_content)
    display_summary = clean_text(item.get("display_summary")) or build_display_summary(summary, why_hot, clean_content, title)
    quality_score, quality_status = assess_content_quality(clean_content, source_count=1)
    normalized.update(
        {
            "hot_id": clean_text(item.get("hot_id")),
            "title": title,
            "summary": summary,
            "display_title": display_title,
            "display_summary": display_summary,
            "publish_time": clean_text(item.get("publish_time")),
            "source_platform": clean_text(item.get("source_platform")),
            "media_name": clean_text(item.get("media_name")),
            "source_url": clean_text(item.get("source_url")),
            "content": clean_content,
            "clean_content": clean_content,
            "article_source": clean_text(item.get("article_source")),
            "article_url": clean_text(item.get("article_url")) or clean_text(item.get("source_url")),
            "topic_type": clean_text(item.get("topic_type")),
            "heat_score": max(0, min(100, to_int(item.get("heat_score"), 0))),
            "why_hot": why_hot or display_summary,
            "key_points": key_points or split_search_sentences(clean_content or summary, limit=3),
            "timeline": timeline,
            "public_impact": clean_text(item.get("public_impact")),
            "boss_impact": business_reason,
            "business_reason": business_reason,
            "quality_score": quality_score,
            "quality_status": quality_status,
        }
    )
    return normalized


def normalize_business_item(item: dict[str, Any]) -> dict[str, Any]:
    normalized = deep_copy_json(item)
    title = clean_text(item.get("title"))
    summary = clean_text(item.get("summary"))
    business_reason = build_business_reason(item.get("business_reason"), item.get("recommend_reason"), item.get("recommended_angle"))
    clean_content = build_clean_content(item.get("clean_content"), item.get("content"), summary, title)
    if not summary:
        summary = summarize_search_content(clean_content, max_length=220) or trim_text(title, 220)
    display_title = clean_text(item.get("display_title")) or build_display_title(title, summary, clean_content)
    display_summary = clean_text(item.get("display_summary")) or build_display_summary(summary, clean_content, title)
    quality_score, quality_status = assess_content_quality(clean_content, source_count=1)
    normalized.update(
        {
            "hot_id": clean_text(item.get("hot_id")),
            "title": title,
            "summary": summary,
            "display_title": display_title,
            "display_summary": display_summary,
            "publish_time": clean_text(item.get("publish_time")),
            "topic_type": clean_text(item.get("topic_type")),
            "business_relevance_score": max(0, min(100, to_int(item.get("business_relevance_score"), 0))),
            "recommend_reason": business_reason or clean_text(item.get("recommend_reason")),
            "recommended_angle": clean_text(item.get("recommended_angle")),
            "recommended_content_type": clean_text(item.get("recommended_content_type")),
            "bridge_directions": clean_list_text(item.get("bridge_directions")),
            "source_url": clean_text(item.get("source_url")),
            "content": clean_content,
            "clean_content": clean_content,
            "article_source": clean_text(item.get("article_source")),
            "article_url": clean_text(item.get("article_url")) or clean_text(item.get("source_url")),
            "business_reason": business_reason,
            "quality_score": quality_score,
            "quality_status": quality_status,
        }
    )
    return normalized


def sort_hot_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            -to_int(item.get("heat_score"), 0),
            clean_text(item.get("publish_time")),
            clean_text(item.get("title")),
        ),
        reverse=False,
    )


def sort_business_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            -to_int(item.get("business_relevance_score"), 0),
            clean_text(item.get("publish_time")),
            clean_text(item.get("title")),
        ),
        reverse=False,
    )


def is_aggregate_hot_item(item: dict[str, Any]) -> bool:
    title = clean_text(item.get("title"))
    summary = clean_text(item.get("summary"))
    key_points = clean_list_text(item.get("key_points"))
    if len(key_points) < 2:
        return False

    title_lower = title.lower()
    if any(keyword in title_lower for keyword in AGGREGATE_HOT_KEYWORDS):
        return True
    if title.count("、") >= 2 or title.count("，") >= 2 or "10条" in title or "15条" in title:
        return True
    if sum(1 for token in ("1.", "2.", "3.", "1、", "2、", "3、") if token in summary) >= 2:
        return True
    return False


def expand_hot_item(item: dict[str, Any]) -> list[dict[str, Any]]:
    normalized = normalize_hot_item(item)
    if not is_aggregate_hot_item(normalized):
        return [normalized]

    base_id = clean_text(normalized.get("hot_id")) or "hot"
    expanded: list[dict[str, Any]] = []
    for index, point in enumerate(clean_list_text(normalized.get("key_points"))):
        point_title = trim_text(point.rstrip("。；; "), 80)
        if len(point_title) < 6:
            continue
        expanded.append(
            {
                **normalized,
                "hot_id": f"{base_id}_split_{index + 1:02d}",
                "title": point_title,
                "summary": point_title,
                "key_points": [point_title],
                "heat_score": max(40, to_int(normalized.get("heat_score"), 0) - index * 3),
            }
        )

    return expanded or [normalized]


def hot_item_from_business(item: dict[str, Any], index: int) -> dict[str, Any]:
    normalized = normalize_business_item(item)
    directions = clean_list_text(normalized.get("bridge_directions"))
    summary = clean_text(normalized.get("summary")) or clean_text(normalized.get("recommend_reason"))
    return {
        "hot_id": clean_text(normalized.get("hot_id")) or f"hot_fill_{index + 1:02d}",
        "title": clean_text(normalized.get("title")),
        "summary": summary,
        "publish_time": clean_text(normalized.get("publish_time")),
        "source_platform": "",
        "media_name": "",
        "source_url": clean_text(normalized.get("source_url")),
        "content": clean_text(normalized.get("content")),
        "article_source": clean_text(normalized.get("article_source")),
        "article_url": clean_text(normalized.get("article_url")) or clean_text(normalized.get("source_url")),
        "topic_type": clean_text(normalized.get("topic_type")),
        "heat_score": max(45, min(95, to_int(normalized.get("business_relevance_score"), 0) - 3)),
        "why_hot": clean_text(normalized.get("recommend_reason")),
        "key_points": directions,
        "timeline": [],
        "public_impact": "",
        "boss_impact": clean_text(normalized.get("recommended_angle")) or clean_text(normalized.get("recommend_reason")),
    }


def infer_bridge_directions(text: str) -> list[str]:
    directions: list[str] = []
    for keywords, direction in BRIDGE_DIRECTION_RULES:
        if any(contains_keyword(text, keyword) for keyword in keywords):
            directions.append(direction)
    if not directions:
        directions.append("商业趋势")
    deduped: list[str] = []
    for direction in directions:
        if direction not in deduped:
            deduped.append(direction)
    return deduped[:4]


def infer_business_content_type(text: str) -> str:
    lowered = text.lower()
    if any(keyword in lowered for keyword in ["监管", "合规", "治理", "安全", "备案"]):
        return "AI政策"
    if any(keyword in lowered for keyword in ["agent", "智能体", "工作流", "自动化", "copilot"]):
        return "AI工具"
    if any(keyword in lowered for keyword in ["芯片", "算力", "gpu", "npu", "服务器", "大模型"]):
        return "AI产业链"
    if any(keyword in lowered for keyword in ["数字人", "机器人", "营销", "内容", "短视频"]):
        return "AI应用"
    return "AI趋势"


def infer_business_relevance_score(item: dict[str, Any]) -> int:
    text = " ".join(
        filter(
            None,
            [
                clean_text(item.get("title")),
                clean_text(item.get("summary")),
                clean_text(item.get("topic_type")),
                clean_text(item.get("boss_impact")),
                clean_text(item.get("why_hot")),
            ],
        )
    )
    score = max(20, min(92, to_int(item.get("heat_score"), 0)))
    matched_keywords, signal_score = collect_ai_keyword_hits(text)
    anchor_hits = collect_ai_anchor_hits(text)
    if anchor_hits:
        score = min(98, score + min(24, signal_score * 2))
    else:
        score = min(score, 38)
    return score


def is_business_relevant_hot_item(item: dict[str, Any]) -> bool:
    text = " ".join(
        filter(
            None,
            [
                clean_text(item.get("title")),
                clean_text(item.get("summary")),
                clean_text(item.get("topic_type")),
                clean_text(item.get("boss_impact")),
                clean_text(item.get("why_hot")),
            ],
        )
    )
    matched_keywords, signal_score = collect_ai_keyword_hits(text)
    anchor_hits = collect_ai_anchor_hits(text)
    title_text = " ".join(filter(None, [clean_text(item.get("title")), clean_text(item.get("summary"))])).lower()
    title_anchor_hits = [keyword for keyword in AI_HARD_KEYWORDS if keyword in title_text]
    return bool(title_anchor_hits) or (bool(anchor_hits) and (signal_score >= 6 or len(matched_keywords) >= 2))


def filter_ai_relevant_hot_ranks(hot_ranks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    relevant_items: list[dict[str, Any]] = []

    for item in hot_ranks:
        title_text = " ".join(filter(None, [clean_text(item.get("title")), clean_text(item.get("summary"))]))
        content_text = " ".join(filter(None, [clean_text(item.get("content")), clean_text(item.get("article_source"))]))
        merged_text = " ".join(filter(None, [title_text, content_text]))
        matched_keywords, signal_score = collect_ai_keyword_hits(merged_text)
        anchor_hits = collect_ai_anchor_hits(merged_text)
        title_anchor_hits = [keyword for keyword in AI_HARD_KEYWORDS if keyword in title_text.lower()]

        if not title_anchor_hits and not anchor_hits:
            continue
        if signal_score < 6 and len(matched_keywords) < 2:
            continue

        enriched_item = dict(item)
        enriched_item["matched_keywords"] = matched_keywords[:8]
        enriched_item["business_score"] = max(signal_score * 3, to_int(item.get("business_score"), 0))
        relevant_items.append(enriched_item)

    return sorted(
        relevant_items,
        key=lambda item: (
            -int(item.get("business_score", 0)),
            -len(clean_text(item.get("summary", ""))),
            int(item.get("rank", 9999)),
        ),
    )


def business_item_from_hot(item: dict[str, Any], index: int) -> dict[str, Any]:
    normalized = normalize_hot_item(item)
    text = " ".join(
        filter(
            None,
            [
                clean_text(normalized.get("title")),
                clean_text(normalized.get("summary")),
                clean_text(normalized.get("boss_impact")),
                clean_text(normalized.get("why_hot")),
            ],
        )
    )
    matched_keywords, _ = collect_ai_keyword_hits(text)
    directions = infer_ai_directions(text)
    reason = infer_ai_recommend_reason(text, directions, matched_keywords) or clean_text(normalized.get("why_hot")) or clean_text(normalized.get("summary"))
    recommended_angle = infer_ai_recommended_angle(text, directions, reason)
    return {
        "hot_id": clean_text(normalized.get("hot_id")) or f"biz_fill_{index + 1:02d}",
        "title": clean_text(normalized.get("title")),
        "summary": clean_text(normalized.get("summary")),
        "publish_time": clean_text(normalized.get("publish_time")),
        "topic_type": "AI行业热榜",
        "business_relevance_score": infer_business_relevance_score(normalized),
        "recommend_reason": reason,
        "recommended_angle": recommended_angle,
        "recommended_content_type": infer_business_content_type(text),
        "bridge_directions": directions,
        "source_url": clean_text(normalized.get("source_url")),
        "content": clean_text(normalized.get("content")),
        "article_source": clean_text(normalized.get("article_source")),
        "article_url": clean_text(normalized.get("article_url")) or clean_text(normalized.get("source_url")),
    }


def normalize_hot_rank_result(result: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        return {
            "snapshot_title": "今日热榜中心",
            "generated_at": "",
            "debug": {},
            "all_hot_list": [],
            "business_hot_list": [],
        }

    raw_all = result.get("all_hot_list") if isinstance(result.get("all_hot_list"), list) else []
    raw_business = result.get("business_hot_list") if isinstance(result.get("business_hot_list"), list) else []

    expanded_all: list[dict[str, Any]] = []
    for item in raw_all:
        if isinstance(item, dict):
            expanded_all.extend(expand_hot_item(item))
    all_hot_items = dedupe_items(sort_hot_items(expanded_all), hot_item_identity)

    if len(all_hot_items) < 5:
        for index, item in enumerate(raw_business):
            if not isinstance(item, dict):
                continue
            candidate = hot_item_from_business(item, index)
            key = hot_item_identity(candidate)
            if key and not any(hot_item_identity(existing) == key for existing in all_hot_items):
                all_hot_items.append(candidate)
            if len(all_hot_items) >= 5:
                break
        all_hot_items = dedupe_items(sort_hot_items(all_hot_items), hot_item_identity)

    business_candidates = [normalize_business_item(item) for item in raw_business if isinstance(item, dict)]
    for index, item in enumerate(all_hot_items):
        if is_business_relevant_hot_item(item):
            business_candidates.append(business_item_from_hot(item, index))

    business_items = dedupe_items(sort_business_items(business_candidates), business_item_identity)
    first_all_key = hot_item_identity(all_hot_items[0]) if all_hot_items else ""
    if first_all_key and len(business_items) > 1:
        business_items = sorted(business_items, key=lambda item: 1 if business_item_identity(item) == first_all_key else 0)

    debug = result.get("debug") if isinstance(result.get("debug"), dict) else {}
    next_debug = {
        **debug,
        "display_all_count": len(all_hot_items),
        "display_business_count": len(business_items),
    }

    return {
        **result,
        "snapshot_title": clean_text(result.get("snapshot_title")) or "今日热榜中心",
        "generated_at": clean_text(result.get("generated_at")),
        "debug": next_debug,
        "all_hot_list": all_hot_items,
        "business_hot_list": business_items,
    }


async def refresh_hot_rank_cache(*, force: bool) -> dict[str, Any]:
    cache = get_hot_rank_cache()
    if cache and hot_rank_cache_is_fresh(cache) and not force:
        return cache

    async with hot_rank_cache_manager.refresh_lock:
        cache = get_hot_rank_cache()
        if cache and hot_rank_cache_is_fresh(cache) and not force:
            return cache

        if not FREE_SCRAPERS_AVAILABLE:
            raise HTTPException(status_code=503, detail="免费热榜模块不可用，请检查 backend 依赖。")

        cache_payload = await asyncio.to_thread(
            build_free_hot_rank_cache_payload,
            limit_per_platform=max(10, HOT_RANK_DEFAULT_ALL_LIMIT // 2 + 4),
            display_all_limit=HOT_RANK_DEFAULT_ALL_LIMIT,
            display_business_limit=HOT_RANK_DEFAULT_BUSINESS_LIMIT,
        )
        hot_rank_cache_manager.cache = cache_payload
        hot_rank_cache_manager.refresh_error = None
        write_json(HOT_RANK_CACHE_PATH, cache_payload)
        return cache_payload


def start_hot_rank_refresh(*, force: bool) -> None:
    if not hot_rank_supports_background_refresh():
        return
    if hot_rank_cache_manager.refresh_task and not hot_rank_cache_manager.refresh_task.done():
        return

    async def runner() -> None:
        try:
            await refresh_hot_rank_cache(force=force)
        except Exception as error:  # pragma: no cover
            hot_rank_cache_manager.refresh_error = {
                "message": str(error),
                "ts": int(time.time()),
            }
            append_log(
                {
                    "time": now_text(),
                    "route": "background:hot-rank-refresh",
                    "status": 500,
                    "durationMs": 0,
                    "error": str(error),
                }
            )

    hot_rank_cache_manager.refresh_task = asyncio.create_task(runner())

    def clear_task(_: asyncio.Task[Any]) -> None:
        hot_rank_cache_manager.refresh_task = None

    hot_rank_cache_manager.refresh_task.add_done_callback(clear_task)


def has_chinese(text: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", text))


def strip_non_chinese_prefix(text: str) -> str:
    if not text:
        return ""
    if has_chinese(text):
        match = re.search(r"[\u4e00-\u9fff]", text)
        if match and match.start() > 24:
            return text[match.start() :].strip()
    return text


def remove_url_noise(text: str) -> str:
    if not text:
        return ""
    cleaned = URL_NOISE_PATTERN.sub(" ", text)
    cleaned = REFERENCE_MARK_PATTERN.sub(" ", cleaned)
    cleaned = HTML_TAG_PATTERN.sub(" ", cleaned)
    cleaned = re.sub(r"[\u0000-\u001f\u007f-\u009f\uE000-\uF8FF\uFFF0-\uFFFF�]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def text_dedupe_key(text: str) -> str:
    return re.sub(r"[\W_]+", "", clean_text(text).lower())


def reader_line_is_noise(text: str) -> bool:
    normalized = clean_text(text)
    if not normalized:
        return True
    if READER_WARNING_PATTERN.search(normalized):
        return True
    if READER_META_LINE_PATTERN.match(normalized):
        return True
    if READER_NAV_NOISE_PATTERN.search(normalized):
        return True
    if READER_CREDIT_LINE_PATTERN.match(normalized):
        return True
    if READER_SOCIAL_NOISE_PATTERN.search(normalized):
        return True
    if READER_PAGE_NOISE_PATTERN.search(normalized):
        return True
    if READER_INFOBAR_NOISE_PATTERN.search(normalized) and len(normalized) <= 220:
        return True
    if READER_FOOTER_NOISE_PATTERN.search(normalized) and len(normalized) <= 200:
        return True
    if READER_RANK_BOARD_PATTERN.search(normalized) and len(normalized) <= 180:
        return True
    if MARKDOWN_LINK_LINE_PATTERN.search(normalized):
        return True
    if "登录" in normalized and len(normalized) <= 24:
        return True
    if re.fullmatch(r"[=\-*#]{4,}", normalized):
        return True
    if normalized.startswith("* [") or normalized.startswith("["):
        return True
    if normalized.endswith("(") and len(normalized) <= 24:
        return True
    if re.match(r"^(?:[*-]\s*)?\[[^\]]{0,80}\]$", normalized):
        return True
    if re.match(r"^(?:[*-]\s*)?\[[^\]]{0,80}\]\([^)]*\)$", normalized):
        return True
    if re.match(r"^(?:[*-]\s*)?\[[^\]]{0,80}\]\([^)]*$", normalized):
        return True
    if normalized.count("[") + normalized.count("]") + normalized.count("(") + normalized.count(")") >= 3 and len(re.sub(r"[\[\]\(\)\*=\-\s]", "", normalized)) < 8:
        return True
    if normalized.count("[") + normalized.count("]") >= 4:
        return True
    if len(normalized) < 4:
        return True
    return False


def reader_sentence_is_noise(text: str) -> bool:
    normalized = clean_text(text)
    if not normalized:
        return True
    if reader_line_is_noise(normalized):
        return True
    if READER_COMMENTARY_NOISE_PATTERN.search(normalized):
        return True
    if READER_RANK_BOARD_PATTERN.search(normalized):
        return True
    if READER_INFOBAR_NOISE_PATTERN.search(normalized):
        return True
    if len(normalized) < 10:
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
        sentence = strip_reader_noise_fragments(remove_url_noise(part))
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


def chinese_ratio(text: str) -> float:
    sample = re.sub(r"\s+", "", text)
    if not sample:
        return 0.0
    chinese_count = sum(1 for char in sample if "\u4e00" <= char <= "\u9fff")
    return chinese_count / max(1, len(sample))


def normalize_search_text(value: Any, *, max_length: int) -> str:
    text = remove_url_noise(clean_text(value))
    text = strip_non_chinese_prefix(text)
    text = re.sub(r"[|｜]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -—_、,，。；;")
    return trim_text(text, max_length)


def clean_reader_content(value: Any, *, max_length: int) -> str:
    if value is None:
        return ""
    raw = html.unescape(str(value)).replace("\u3000", " ").replace("\xa0", " ")
    if not raw:
        return ""

    cleaned_lines: list[str] = []
    for line in raw.splitlines():
        normalized = remove_url_noise(clean_text(line))
        normalized = normalized.replace("* * *", " ").replace("|", " ").replace("｜", " ")
        normalized = strip_reader_noise_fragments(normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip(" -*#")
        normalized = dedupe_inline_sentences(normalized)
        if reader_line_is_noise(normalized):
            continue
        split_sentences = split_meaningful_sentences(normalized)
        if not split_sentences:
            continue
        cleaned_lines.extend(split_sentences)

    joined = "\n".join(dedupe_text_lines(cleaned_lines)).strip()
    if not joined:
        return ""
    if READER_WARNING_PATTERN.search(joined):
        return ""
    return trim_text(joined, max_length)


def summarize_search_content(value: Any, *, max_length: int) -> str:
    content = clean_reader_content(value, max_length=max_length * 4)
    if not content:
        return ""

    parts = [
        clean_text(part)
        for part in re.split(r"[。！？!?；;\n]", content)
        if clean_text(part)
    ]
    picked: list[str] = []
    seen_keys: set[str] = set()
    total_length = 0
    for part in parts:
        if reader_sentence_is_noise(part):
            continue
        key = text_dedupe_key(part)
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        picked.append(part)
        total_length += len(part)
        if len(picked) >= 2 or total_length >= max_length - 12:
            break

    summary = "。".join(picked) if picked else content
    if summary and not summary.endswith(("。", "！", "？", "!", "?")):
        summary += "。"
    return trim_text(summary, max_length)


def extract_item_field(item: dict[str, Any], field_names: tuple[str, ...], *, max_length: int, content: bool = False) -> str:
    for field_name in field_names:
        value = item.get(field_name)
        if value is None:
            continue
        text = clean_reader_content(value, max_length=max_length) if content else normalize_search_text(value, max_length=max_length)
        if text:
            return text
    return ""


def split_search_sentences(text: str, *, limit: int = 8) -> list[str]:
    sentences: list[str] = []
    seen_keys: set[str] = set()
    for chunk in re.split(r"[。！？!?；;\n]", clean_text(text)):
        sentence = remove_url_noise(clean_text(chunk)).strip(" -—_、,，。；;")
        if reader_sentence_is_noise(sentence):
            continue
        key = text_dedupe_key(sentence)
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        sentences.append(sentence)
        if len(sentences) >= limit:
            break
    return sentences


def infer_fact_pack_summary(topic_query: str, event_anchor: str, key_facts: list[str], time_clues: list[str]) -> str:
    parts: list[str] = []
    if event_anchor:
        parts.append(sentence_end(event_anchor))
    if key_facts:
        parts.append(sentence_end(key_facts[0]))
    if time_clues:
        parts.append(sentence_end(f"公开时间线里反复出现的节点包括{'；'.join(time_clues[:3])}"))
    summary = " ".join(parts[:2]).strip()
    return summary or f"已整理出与“{topic_query}”相关的公开事实线索。"


def infer_ambiguous_terms(*texts: str) -> list[str]:
    merged = " ".join(clean_text(text) for text in texts if clean_text(text))
    if not merged:
        return []

    candidates = [clean_text(match.group(1)) for match in QUOTE_TERM_PATTERN.finditer(merged)]
    filtered: list[str] = []
    for candidate in candidates:
        if len(candidate) < 2 or len(candidate) > 12:
            continue
        if candidate not in filtered:
            filtered.append(candidate)
    return filtered[:4]


def trim_text(text: str, max_length: int) -> str:
    if len(text) <= max_length:
        return text
    return text[: max_length - 1].rstrip(" ，。；;:：") + "…"


def sentence_end(text: str) -> str:
    value = clean_text(text).rstrip("，,；; ")
    if not value:
        return ""
    return value if value.endswith(("。", "！", "？", "!", "?")) else f"{value}。"


def collect_meaningful_sentences_from_values(*values: Any, limit: int = 8) -> list[str]:
    sentences: list[str] = []
    seen_keys: set[str] = set()

    for value in values:
        text = clean_text(value)
        if not text:
            continue
        for sentence in split_meaningful_sentences(text):
            key = text_dedupe_key(sentence)
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            sentences.append(sentence)
            if len(sentences) >= limit:
                return sentences

    return sentences


def build_display_title(*values: Any, max_length: int = DISPLAY_TITLE_MAX_LENGTH) -> str:
    for value in values:
        text = clean_text(value)
        if not text:
            continue
        sentence = collect_meaningful_sentences_from_values(text, limit=1)
        candidate = sentence[0] if sentence else text
        candidate = candidate.rstrip("，。；;:： ")
        if candidate:
            return trim_text(candidate, max_length)
    return ""


def build_display_summary(*values: Any, max_length: int = DISPLAY_SUMMARY_MAX_LENGTH) -> str:
    sentences = collect_meaningful_sentences_from_values(*values, limit=2)
    if not sentences:
        return ""
    candidate = sentences[0].rstrip("，。；;:： ")
    if len(candidate) < 14 and len(sentences) > 1:
        candidate = f"{candidate}，{sentences[1].rstrip('，。；;:： ')}"
    return trim_text(candidate, max_length)


def build_clean_content(*values: Any, max_length: int = SEARCH_CONTENT_MAX_LENGTH, sentence_limit: int = 12) -> str:
    sentences = collect_meaningful_sentences_from_values(*values, limit=sentence_limit)
    if not sentences:
        return ""
    content = "\n".join(sentence_end(sentence) for sentence in sentences if sentence)
    return trim_text(content, max_length)


def build_business_reason(*values: Any, max_length: int = BUSINESS_REASON_MAX_LENGTH) -> str:
    for value in values:
        text = clean_text(value)
        if not text:
            continue
        sentence = collect_meaningful_sentences_from_values(text, limit=1)
        candidate = sentence[0] if sentence else text
        candidate = candidate.rstrip("，。；;:： ")
        if candidate:
            return trim_text(candidate, max_length)
    return ""


def assess_content_quality(clean_content: str, *, source_count: int = 1) -> tuple[int, str]:
    normalized = clean_text(clean_content)
    if not normalized:
        return 0, "blocked"

    fact_sentences = split_search_sentences(normalized, limit=12)
    basic_sentences = [clean_text(part) for part in re.split(r"[。！？!?；;\n]", normalized) if len(clean_text(part)) >= 8]
    sentence_count = max(len(fact_sentences), len(basic_sentences[:12]))
    score = min(
        100,
        sentence_count * 12
        + min(24, len(normalized) // 40)
        + min(12, max(0, source_count - 1) * 4),
    )

    if sentence_count >= 2 and len(normalized) >= 70:
        return max(68, score), "ready"
    if sentence_count >= 1 and len(normalized) >= 35:
        return max(35, score), "lead_only"
    return min(28, score), "blocked"


def extract_hot_rank_query_terms(*texts: str, limit: int = 12) -> list[str]:
    terms: list[str] = []

    def push(term: str) -> None:
        normalized = clean_text(term)
        if (
            not normalized
            or normalized in HOT_RANK_QUERY_STOP_WORDS
            or len(normalized) < 2
            or normalized in terms
        ):
            return
        terms.append(normalized)

    for text in texts:
        normalized = clean_text(text)
        if not normalized:
            continue

        for token in re.findall(r"[\u4e00-\u9fff]{2,12}", normalized):
            push(token)
            if len(token) >= 4:
                for size in (2, 3, 4):
                    for index in range(0, len(token) - size + 1):
                        push(token[index : index + size])

        for token in re.findall(r"[A-Za-z][A-Za-z0-9_-]{1,18}", normalized):
            push(token.lower())

        for quoted in QUOTE_TERM_PATTERN.findall(normalized):
            push(quoted)

    return terms[:limit]


def build_hot_rank_detail_queries(title: str, summary: str) -> list[str]:
    base_title = clean_text(title)
    base_summary = clean_text(summary)
    queries: list[str] = []

    def push(query: str) -> None:
        normalized = clean_text(query)
        if not normalized or normalized in queries:
            return
        queries.append(normalized)

    if base_title:
        push(base_title)
        push(f"\"{base_title}\"")

    summary_sentences = collect_meaningful_sentences_from_values(base_summary, limit=2)
    summary_anchor = " ".join(summary_sentences[:2]).strip()
    if base_title and summary_anchor and summary_anchor != base_title:
        push(trim_text(f"{base_title} {summary_anchor}", 44))

    title_terms = extract_hot_rank_query_terms(base_title, limit=6)
    summary_terms = [
        term
        for term in extract_hot_rank_query_terms(summary_anchor, limit=8)
        if term not in title_terms
    ]
    if base_title and summary_terms:
        push(trim_text(f"{base_title} {' '.join(summary_terms[:3])}", 40))
    if base_title:
        push(trim_text(f"{base_title} 最新进展", 24))

    return queries[:3]


def score_hot_rank_search_candidate(item: dict[str, Any], title: str, summary: str) -> int:
    candidate_title = clean_text(item.get("title"))
    candidate_summary = clean_text(item.get("summary") or item.get("snippet"))
    candidate_content = clean_text(item.get("content") or item.get("clean_content"))
    candidate_source = clean_text(item.get("sitename") or item.get("source"))
    merged = " ".join(filter(None, [candidate_title, candidate_summary, candidate_content, candidate_source])).lower()

    base_title = clean_text(title)
    title_lower = base_title.lower()
    score = 0

    if candidate_title:
        score += 8
    if len(candidate_summary) >= 40:
        score += 8
    if len(candidate_content) >= 240:
        score += 10
    elif candidate_content:
        score += 4
    if candidate_source and any(keyword in candidate_source for keyword in OFFICIAL_SOURCE_KEYWORDS):
        score += 10

    if base_title:
        if title_lower in candidate_title.lower():
            score += 42
        elif title_lower in candidate_summary.lower():
            score += 26
        elif title_lower in candidate_content.lower():
            score += 16

    title_terms = extract_hot_rank_query_terms(base_title, limit=8)
    summary_terms = extract_hot_rank_query_terms(summary, limit=8)
    title_overlap_title = sum(1 for term in title_terms if term.lower() in candidate_title.lower())
    title_overlap_summary = sum(1 for term in title_terms if term.lower() in candidate_summary.lower())
    title_overlap_content = sum(1 for term in title_terms if term.lower() in candidate_content.lower())
    summary_overlap = sum(1 for term in summary_terms if term.lower() in merged)

    score += title_overlap_title * 10
    score += title_overlap_summary * 6
    score += title_overlap_content * 3
    score += summary_overlap * 2

    if base_title and len(base_title) <= 10 and title_lower not in candidate_title.lower() and title_overlap_title == 0:
        score -= 18
    elif base_title and len(base_title) > 10 and title_overlap_title == 0 and title_overlap_summary == 0:
        score -= 10

    if title_terms and title_overlap_title == 0 and title_overlap_summary == 0 and summary_overlap < 2:
        score -= 12

    return score


def hot_rank_detail_needs_enrichment(content: str, title: str, summary: str) -> bool:
    normalized = clean_text(content)
    if not hot_rank_detail_ready(normalized, title, summary):
        return True
    fact_sentences = split_search_sentences(normalized, limit=12)
    return len(normalized) < 220 or len(fact_sentences) < 4


def enrich_hot_rank_detail_from_search(title: str, summary: str, seed_content: str) -> dict[str, Any]:
    queries = build_hot_rank_detail_queries(title, summary)
    if not queries:
        return {}

    raw_candidates: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    for query in queries:
        try:
            search_results = search_with_content(query, max_results=3, fetch_content=True, content_limit=SEARCH_CONTENT_MAX_LENGTH)
        except Exception:
            continue
        for item in search_results:
            if not isinstance(item, dict):
                continue
            key = clean_text(item.get("url")) or clean_text(item.get("title")).lower()
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            raw_candidates.append(item)

    ranked_candidates: list[tuple[int, dict[str, Any]]] = []
    for item in raw_candidates:
        score = score_hot_rank_search_candidate(item, title, summary)
        if score < 22:
            continue
        ranked_candidates.append((score, item))

    ranked_candidates.sort(
        key=lambda pair: (
            -pair[0],
            -len(clean_text(pair[1].get("content") or pair[1].get("clean_content") or "")),
            -len(clean_text(pair[1].get("summary") or pair[1].get("snippet") or "")),
        )
    )

    normalized_sources = [
        item
        for item in (
            normalize_search_item(candidate, "热榜补全")
            for _, candidate in ranked_candidates[:6]
        )
        if item
    ]
    if not normalized_sources:
        return {}

    fact_pack = build_search_fact_pack(title, normalized_sources, [])
    packed_content = clean_text(fact_pack.get("cleanContent") or fact_pack.get("sourceText"))
    merged_content = build_clean_content(seed_content, packed_content, summary, title, max_length=2200, sentence_limit=18)
    final_content = merged_content or packed_content
    if not final_content:
        return {}

    best_source = normalized_sources[0]
    merged_summary = (
        summarize_search_content("\n".join(filter(None, [summary, fact_pack.get("summary"), packed_content])), max_length=220)
        or clean_text(fact_pack.get("summary"))
        or summary
        or trim_text(title, 220)
    )

    return {
        "content": final_content,
        "summary": merged_summary,
        "source_count": max(1, len(normalized_sources)),
        "article_source": clean_text(best_source.get("sitename")),
        "article_url": clean_text(best_source.get("url")),
    }


def normalize_search_item(item: dict[str, Any], source_platform: str) -> dict[str, Any] | None:
    title = normalize_search_text(item.get("title"), max_length=120)
    summary = extract_item_field(item, SUMMARY_FIELD_CANDIDATES, max_length=220)
    content = extract_item_field(item, CONTENT_FIELD_CANDIDATES, max_length=SEARCH_CONTENT_MAX_LENGTH, content=True)
    site_name = trim_text(clean_text(item.get("sitename")), 40)
    url = clean_text(item.get("url"))

    if title and not has_chinese(title) and chinese_ratio(title) < 0.25:
        title = ""
    if summary and not has_chinese(summary) and chinese_ratio(summary) < 0.2:
        summary = ""
    if content and not has_chinese(content) and chinese_ratio(content) < 0.2:
        content = ""
    if not summary and content:
        summary = summarize_search_content(content, max_length=220)
    if not title and summary and has_chinese(summary):
        title = trim_text(summary, 48)

    if not title and not summary and not content:
        return None

    clean_content = build_clean_content(content, summary, title)
    display_title = build_display_title(title, summary, clean_content)
    display_summary = build_display_summary(summary, clean_content, title)
    quality_score, quality_status = assess_content_quality(clean_content, source_count=1)

    ranking_score = 0
    if title:
        ranking_score += 1
    if summary:
        ranking_score += 2 if len(summary) > 60 else 1
    if clean_content:
        ranking_score += 2 if len(clean_content) > 300 else 1
    if url.startswith("http://") or url.startswith("https://"):
        ranking_score += 1
    if site_name and any(keyword in site_name for keyword in OFFICIAL_SOURCE_KEYWORDS):
        ranking_score += 3
    if source_platform == "全网搜索":
        ranking_score += 1

    return {
        "title": title,
        "summary": summary,
        "displayTitle": display_title,
        "displaySummary": display_summary,
        "content": clean_content,
        "cleanContent": clean_content,
        "sitename": site_name,
        "url": url,
        "sourcePlatform": source_platform,
        "qualityScore": max(ranking_score, quality_score),
        "qualityStatus": quality_status,
    }


def dedupe_search_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in items:
        key = clean_text(item.get("url")) or clean_text(item.get("title")).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return deduped


def extract_time_clues(text: str) -> list[str]:
    clues: list[str] = []
    normalized = clean_text(text)
    if not normalized:
        return clues

    for pattern in TIME_CLUE_PATTERNS:
        for match in pattern.finditer(normalized):
            clue = clean_text(match.group(0))
            if clue and clue not in clues:
                clues.append(clue)

    return clues[:6]


def fetch_reader_content(url: str, timeout: int = 8) -> str:
    if not url:
        return ""

    reader_url = f"https://r.jina.ai/{url}"

    def send_once() -> str:
        request = urllib.request.Request(
            reader_url,
            headers={
                "User-Agent": "Mozilla/5.0",
            },
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="ignore")

    try:
        raw = send_once()
    except Exception:
        return ""

    return clean_reader_content(raw, max_length=SEARCH_CONTENT_MAX_LENGTH)


async def enrich_search_items_with_content(items: list[dict[str, Any]], *, max_items: int = 5) -> list[dict[str, Any]]:
    candidates = [item for item in items if clean_text(item.get("url"))]
    if not candidates:
        return items

    ranked = sorted(
        candidates,
        key=lambda item: (
            -to_int(item.get("qualityScore"), 0),
            -len(clean_text(item.get("summary"))),
            clean_text(item.get("title")),
        ),
    )[:max_items]

    async def enrich_one(item: dict[str, Any]) -> None:
        if clean_text(item.get("content")):
            return
        content = await asyncio.to_thread(fetch_reader_content, clean_text(item.get("url")), 8)
        if not content:
            return
        item["content"] = content
        if not clean_text(item.get("summary")):
            item["summary"] = summarize_search_content(content, max_length=220)
        item["qualityScore"] = to_int(item.get("qualityScore"), 0) + (2 if len(content) > 300 else 1)

    await asyncio.gather(*(enrich_one(item) for item in ranked))
    return items


def build_search_fact_pack(topic_query: str, search_items: list[dict[str, Any]], toutiao_items: list[dict[str, Any]]) -> dict[str, Any]:
    merged = dedupe_search_items(search_items + toutiao_items)
    merged.sort(key=lambda item: (-to_int(item.get("qualityScore"), 0), -len(clean_text(item.get("content"))), -len(clean_text(item.get("summary"))), clean_text(item.get("title"))))

    sources = merged[:8]
    key_facts: list[str] = []
    seen_facts: set[str] = set()
    focus_titles: list[str] = []
    source_names: list[str] = []
    time_clues: list[str] = []

    for item in sources:
        title = clean_text(item.get("title"))
        if title and title not in focus_titles:
            focus_titles.append(title)

        site_name = clean_text(item.get("sitename"))
        if site_name and site_name not in source_names:
            source_names.append(site_name)

        text_pool = "\n".join(
            filter(
                None,
                [
                    clean_text(item.get("summary")),
                    clean_text(item.get("content")),
                    title,
                ],
            )
        )
        for fact in split_search_sentences(text_pool, limit=6):
            fact_key = text_dedupe_key(fact)
            if not fact_key or fact_key in seen_facts:
                continue
            seen_facts.add(fact_key)
            key_facts.append(fact)
            if len(key_facts) >= 6:
                break

        for clue in extract_time_clues(f"{title} {clean_text(item.get('summary'))} {clean_text(item.get('content'))}"):
            if clue not in time_clues:
                time_clues.append(clue)
            if len(time_clues) >= 4:
                break

        if len(key_facts) >= 6 and len(time_clues) >= 4:
            break

    event_anchor = focus_titles[0] if focus_titles else (key_facts[0] if key_facts else topic_query)
    merged_text = "\n".join(
        filter(
            None,
            [event_anchor, *focus_titles[:4], *key_facts[:6]],
        )
    )
    ambiguous_terms = infer_ambiguous_terms(merged_text)
    forbidden_expansions = [f"对“{term}”保持原词，不要擅自脑补具体场景或行业含义。" for term in ambiguous_terms]
    business_signals = infer_bridge_directions(" ".join([event_anchor, *key_facts, *focus_titles])) if key_facts or focus_titles else []
    core_conflict = ""
    conflict_text = " ".join([event_anchor, *key_facts[:4]])
    if re.search(r"(监管|合规|治理|处罚|封号|风险|边界)", conflict_text):
        core_conflict = "效率提升和使用边界之间的冲突正在被放大。"
    elif re.search(r"(暴跌|暴涨|冲突|战争|停运|换人|供应|油价)", conflict_text):
        core_conflict = "外部冲击正在改写市场预期和经营成本。"
    elif key_facts:
        core_conflict = sentence_end(key_facts[0]).rstrip("。")

    source_text_lines = dedupe_text_lines([event_anchor, *key_facts[:5]])
    source_text = "\n".join(sentence_end(line) for line in source_text_lines if line).strip()
    clean_content = build_clean_content(source_text, *key_facts[:6], *focus_titles[:3], max_length=1800, sentence_limit=10)
    summary = infer_fact_pack_summary(topic_query, event_anchor, key_facts, time_clues)
    display_event_anchor = build_display_title(event_anchor, topic_query)
    display_summary = build_display_summary(summary, clean_content, event_anchor)
    quality_score, quality_status = assess_content_quality(clean_content, source_count=len(sources))
    business_reason = build_business_reason(core_conflict, "；".join(business_signals[:2])) if core_conflict or business_signals else ""

    return {
        "topic": topic_query,
        "eventAnchor": display_event_anchor,
        "fullEventAnchor": event_anchor,
        "summary": display_summary,
        "displaySummary": display_summary,
        "keyFacts": key_facts,
        "focusTitles": focus_titles[:4],
        "timelineClues": time_clues[:4],
        "coreConflict": core_conflict,
        "businessSignals": business_signals,
        "ambiguousTerms": ambiguous_terms,
        "forbiddenExpansions": forbidden_expansions,
        "guardrailNote": "；".join(forbidden_expansions),
        "sourceText": clean_content or source_text,
        "cleanContent": clean_content or source_text,
        "businessReason": business_reason,
        "qualityScore": quality_score,
        "qualityStatus": quality_status,
        "sources": [
            {
                "title": item.get("title", ""),
                "summary": item.get("summary", ""),
                "displayTitle": item.get("displayTitle", ""),
                "displaySummary": item.get("displaySummary", ""),
                "content": item.get("content", ""),
                "cleanContent": item.get("cleanContent", item.get("content", "")),
                "sitename": item.get("sitename", ""),
                "url": item.get("url", ""),
                "sourcePlatform": item.get("sourcePlatform", ""),
                "qualityScore": item.get("qualityScore", 0),
                "qualityStatus": item.get("qualityStatus", ""),
            }
            for item in sources
        ],
    }




@app.get("/api/health")
async def health() -> dict[str, Any]:
    cache = get_hot_rank_cache()
    return {
        "ok": True,
        "configured": bool(CONFIG["apiKey"]),
        "proxy": "/api/generate-json",
        "compatRoute": "/api/chat/completions",
        "upstream": CONFIG["baseUrl"],
        "defaultModel": CONFIG["defaultModel"],
        "promptVersion": CONFIG["promptVersion"],
        "workflowMode": "free",
        "freeData": {
            "enabled": FREE_SCRAPERS_AVAILABLE,
            "hotRankRoute": "/api/free/hot-rank",
            "manualSearchRoute": "/api/free/manual-search",
            "workflowCompatRoutes": {
                "hotRank": "/api/workflows/hot-rank",
                "manualSearch": "/api/workflows/manual-search",
            },
            "hotRankCacheReady": isinstance(cache, dict),
            "hotRankCacheFresh": hot_rank_cache_is_fresh(cache),
        },
        "scriptLibrary": {
            "enabled": True,
            "dbPath": str(SCRIPT_LIBRARY_DB_PATH),
            "documentCount": count_script_documents(SCRIPT_LIBRARY_DB_PATH),
            "routes": {
                "list": "/api/library/scripts",
                "upsert": "/api/library/scripts",
                "detail": "/api/library/scripts/{originalId}",
                "text": "/api/library/scripts/{originalId}/text",
            },
        },
    }


@app.get("/api/logs/recent")
async def recent_logs() -> dict[str, Any]:
    if not LOG_FILE.exists():
        return {"items": []}

    lines = LOG_FILE.read_text(encoding="utf-8").splitlines()[-30:]
    items = [json.loads(line) for line in reversed(lines) if line.strip()]
    return {"items": items}


@app.get("/api/library/scripts")
async def list_library_scripts() -> dict[str, Any]:
    items = list_script_documents(SCRIPT_LIBRARY_DB_PATH)
    return {
        "items": items,
        "count": len(items),
        "dbPath": str(SCRIPT_LIBRARY_DB_PATH),
    }


@app.get("/api/library/sections")
async def list_library_sections(
    primary_direction: str = Query("", alias="primaryDirection"),
    secondary_direction: str = Query("", alias="secondaryDirection"),
    section_type: str = Query("", alias="sectionType"),
    limit: int = Query(300, ge=1, le=1000),
) -> dict[str, Any]:
    items = list_script_sections(
        SCRIPT_LIBRARY_DB_PATH,
        primary_direction=primary_direction,
        secondary_direction=secondary_direction,
        section_type=section_type,
        limit=limit,
    )
    return {
        "items": items,
        "count": len(items),
        "filters": {
            "primaryDirection": primary_direction,
            "secondaryDirection": secondary_direction,
            "sectionType": section_type,
            "limit": limit,
        },
    }


@app.post("/api/library/compose-candidates")
async def list_library_compose_candidates(request: Request) -> dict[str, Any]:
    payload = await read_request_json(request)
    theme = str(payload.get("theme") or "").strip()
    primary_direction = str(payload.get("primaryDirection") or "").strip()
    try:
        limit_per_slot = int(payload.get("limitPerSlot") or 18)
    except (TypeError, ValueError):
        limit_per_slot = 18

    if not theme:
        raise HTTPException(status_code=400, detail="theme is required")

    items = list_compose_candidates(
        SCRIPT_LIBRARY_DB_PATH,
        theme=theme,
        primary_direction=primary_direction,
        limit_per_slot=limit_per_slot,
    )
    return {
        "items": items,
        "count": len(items),
        "theme": theme,
        "primaryDirection": primary_direction,
        "filters": {
            "limitPerSlot": limit_per_slot,
        },
    }


@app.get("/api/library/scripts/{original_id}")
async def get_library_script(original_id: str) -> dict[str, Any]:
    document = fetch_script_document(original_id, SCRIPT_LIBRARY_DB_PATH)
    if document is None:
        raise HTTPException(status_code=404, detail="script document not found")
    return document


@app.get("/api/library/scripts/{original_id}/text")
async def get_library_script_text(original_id: str) -> dict[str, Any]:
    document = fetch_script_document(original_id, SCRIPT_LIBRARY_DB_PATH)
    if document is None:
        raise HTTPException(status_code=404, detail="script document not found")
    return {"originalId": original_id, "text": render_script_document_text(document)}


@app.post("/api/library/scripts")
async def upsert_library_script(request: Request) -> dict[str, Any]:
    payload = await read_request_json(request)
    try:
        document = upsert_script_document(payload, SCRIPT_LIBRARY_DB_PATH)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "ok": True,
        "document": document,
        "text": render_script_document_text(document),
    }


@app.post("/api/generate-json")
async def generate_json_endpoint(request: Request) -> JSONResponse:
    """Direct official Gemini API call with JSON output."""
    if not CONFIG["apiKey"]:
        raise HTTPException(status_code=500, detail="未配置 GEMINI_API_KEY 环境变量")

    body = await read_request_json(request)
    prompt = body.get("prompt", "")
    model = resolve_model_name(body.get("model"))
    max_tokens = body.get("max_tokens", 4096)

    if not prompt:
        raise HTTPException(status_code=400, detail="prompt 不能为空")

    try:
        result = await asyncio.to_thread(
            generate_json_with_gemini,
            prompt,
            api_key=CONFIG["apiKey"],
            model=model,
            max_output_tokens=max_tokens,
        )
        return JSONResponse(content={"result": result})
    except GeminiVideoError as exc:
        return JSONResponse(content={"error": {"message": str(exc)}}, status_code=500)
    except Exception as exc:
        return JSONResponse(content={"error": {"message": str(exc)}}, status_code=500)


@app.post("/api/chat/completions")
async def chat_completions(request: Request) -> JSONResponse:
    if not CONFIG["apiKey"]:
        raise HTTPException(status_code=500, detail="Backend Gemini config is missing API Key")

    def normalize_message_content(content: Any) -> str:
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    text_part = item.get("text")
                    if isinstance(text_part, str):
                        parts.append(text_part)
            return "".join(parts).strip()
        return str(content or "").strip()

    def build_prompt_from_messages(messages: list[dict[str, Any]]) -> str:
        prompt_parts: list[str] = []
        for message in messages:
            role = str(message.get("role") or "user").strip().lower() or "user"
            content = normalize_message_content(message.get("content"))
            if not content:
                continue
            prompt_parts.append(f"[{role}]\n{content}")
        return "\n\n".join(prompt_parts).strip()

    start = time.perf_counter()
    body = await read_request_json(request)
    prompt_version = request.headers.get("X-Prompt-Version", CONFIG["promptVersion"])
    task_entry = request.headers.get("X-Task-Entry", "unknown")
    model_name = resolve_model_name(body.get("model"))
    max_tokens = max(256, to_int(body.get("max_tokens", 4096), 4096))
    temperature_raw = body.get("temperature")
    try:
        temperature = float(temperature_raw) if temperature_raw is not None else None
    except (TypeError, ValueError):
        temperature = None
    messages = body.get("messages", [])
    if not isinstance(messages, list):
        raise HTTPException(status_code=400, detail="messages must be a list")

    prompt = build_prompt_from_messages([msg for msg in messages if isinstance(msg, dict)])
    if not prompt:
        raise HTTPException(status_code=400, detail="messages must not be empty")

    response_format = body.get("response_format")
    wants_json = isinstance(response_format, dict) and response_format.get("type") == "json_object"

    status_code = 200
    error_message = ""

    try:
        if wants_json:
            payload = await asyncio.to_thread(
                generate_json_with_gemini,
                prompt,
                api_key=CONFIG["apiKey"],
                model=model_name,
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
            content_text = json.dumps(payload, ensure_ascii=False)
        else:
            content_text = await asyncio.to_thread(
                generate_text_with_gemini,
                prompt,
                api_key=CONFIG["apiKey"],
                model=model_name,
                max_output_tokens=max_tokens,
                temperature=temperature,
            )

        response_payload = {
            "id": f"chatcmpl-{int(time.time() * 1000)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content_text},
                    "finish_reason": "stop",
                }
            ],
        }
        return JSONResponse(content=response_payload)
    except GeminiVideoError as exc:
        status_code = 500
        error_message = str(exc)
        return JSONResponse(content={"error": {"message": error_message}}, status_code=500)
    except HTTPException as exc:
        status_code = exc.status_code
        error_message = stringify_error(exc.detail)
        raise
    except Exception as error:  # pragma: no cover
        status_code = 500
        error_message = str(error)
        return JSONResponse(content={"error": {"message": error_message}}, status_code=500)
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        append_log(
            {
                "time": now_text(),
                "route": "/api/chat/completions",
                "model": model_name,
                "entryType": task_entry,
                "promptVersion": prompt_version,
                "status": status_code,
                "durationMs": duration_ms,
                "error": error_message,
            }
        )


@app.post("/api/workflows/hot_rank")
@app.post("/api/workflows/hot-rank")
async def workflow_hot_rank(request: Request) -> JSONResponse:
    body = await read_request_json(request)
    start = time.perf_counter()
    status = 200
    error_message = ""
    workflow_id = FREE_WORKFLOW_HOT_RANK["id"]
    workflow_name = FREE_WORKFLOW_HOT_RANK["name"]

    all_limit = to_int(body.get("allLimit", HOT_RANK_DEFAULT_ALL_LIMIT), HOT_RANK_DEFAULT_ALL_LIMIT)
    business_limit = to_int(body.get("businessLimit", HOT_RANK_DEFAULT_BUSINESS_LIMIT), HOT_RANK_DEFAULT_BUSINESS_LIMIT)
    force_refresh = to_bool(body.get("forceRefresh"), False)

    cache = get_hot_rank_cache()
    refreshing = hot_rank_cache_manager.refresh_task is not None and not hot_rank_cache_manager.refresh_task.done()
    recent_refresh_error = get_hot_rank_refresh_error()
    recent_refresh_warning = stringify_error(recent_refresh_error.get("message")) if recent_refresh_error else ""

    try:
        if hot_rank_should_refresh_inline(cache, force_refresh=force_refresh):
            try:
                fresh_cache = await refresh_hot_rank_cache(force=force_refresh or not hot_rank_cache_is_fresh(cache))
                return JSONResponse(
                    content=build_hot_rank_response_content(
                        fresh_cache,
                        all_limit,
                        business_limit,
                        from_cache=bool(cache),
                        stale=False,
                        refreshing=False,
                    )
                )
            except Exception as exc:
                inline_error = stringify_error(getattr(exc, "detail", str(exc)))
                if cache:
                    return JSONResponse(
                        content=build_hot_rank_response_content(
                            cache,
                            all_limit,
                            business_limit,
                            from_cache=True,
                            stale=True,
                            refreshing=False,
                            warning=inline_error,
                        )
                    )
                raise

        if force_refresh:
            if recent_refresh_error:
                recent_refresh_error = None
                hot_rank_cache_manager.refresh_error = None
                recent_refresh_warning = ""
            if not refreshing:
                start_hot_rank_refresh(force=True)
                refreshing = True
            if cache:
                return JSONResponse(
                    content=build_hot_rank_response_content(
                        cache,
                        all_limit,
                        business_limit,
                        from_cache=True,
                        stale=not hot_rank_cache_is_fresh(cache),
                        refreshing=True,
                        warning=recent_refresh_warning,
                    )
                )
            return JSONResponse(
                content=build_hot_rank_placeholder(
                    workflow_id,
                    workflow_name,
                    refreshing=True,
                    warning=recent_refresh_warning,
                )
            )

        if cache and not force_refresh:
            stale = not hot_rank_cache_is_fresh(cache)
            warning = recent_refresh_warning
            if stale and not refreshing and not recent_refresh_error:
                start_hot_rank_refresh(force=True)
                refreshing = True
            return JSONResponse(
                content=build_hot_rank_response_content(
                    cache,
                    all_limit,
                    business_limit,
                    from_cache=True,
                    stale=stale,
                    refreshing=refreshing,
                    warning=warning,
                )
            )

        if not cache and refreshing and not force_refresh:
            return JSONResponse(
                content=build_hot_rank_placeholder(
                    workflow_id,
                    workflow_name,
                    refreshing=True,
                )
            )

        if not cache and not force_refresh:
            if recent_refresh_error:
                return JSONResponse(
                    content=build_hot_rank_placeholder(
                        workflow_id,
                        workflow_name,
                        refreshing=False,
                        warning=recent_refresh_warning,
                    )
                )
            start_hot_rank_refresh(force=True)
            return JSONResponse(
                content=build_hot_rank_placeholder(
                    workflow_id,
                    workflow_name,
                    refreshing=True,
                )
            )

        fresh_cache = await refresh_hot_rank_cache(force=not cache)
        return JSONResponse(
            content=build_hot_rank_response_content(
                fresh_cache,
                all_limit,
                business_limit,
                from_cache=bool(cache),
                stale=False,
                refreshing=False,
            )
        )
    except HTTPException as exc:
        status = exc.status_code
        error_message = stringify_error(exc.detail)
        stale_cache = get_hot_rank_cache()
        if stale_cache:
            return JSONResponse(
                content=build_hot_rank_response_content(
                    stale_cache,
                    all_limit,
                    business_limit,
                    from_cache=True,
                    stale=True,
                    refreshing=refreshing,
                    warning=error_message,
                )
            )
        return JSONResponse(
            content=build_hot_rank_placeholder(
                workflow_id,
                workflow_name,
                refreshing=refreshing,
                warning=error_message,
            )
        )
    except Exception as exc:  # pragma: no cover
        status = 500
        error_message = str(exc)
        stale_cache = get_hot_rank_cache()
        if stale_cache:
            return JSONResponse(
                content=build_hot_rank_response_content(
                    stale_cache,
                    all_limit,
                    business_limit,
                    from_cache=True,
                    stale=True,
                    refreshing=refreshing,
                    warning=error_message,
                )
            )
        if not refreshing and hot_rank_supports_background_refresh():
            start_hot_rank_refresh(force=True)
            refreshing = True
        return JSONResponse(
            content=build_hot_rank_placeholder(
                workflow_id,
                workflow_name,
                refreshing=refreshing,
                warning=error_message,
            )
        )
    finally:
        append_log(
            {
                "time": now_text(),
                "route": "/api/workflows/hot-rank",
                "workflow": workflow_name,
                "status": status,
                "durationMs": round((time.perf_counter() - start) * 1000, 2),
                "error": error_message,
            }
        )


@app.post("/api/workflows/manual_search")
@app.post("/api/workflows/manual-search")
async def workflow_manual_search(request: Request) -> JSONResponse:
    body = await read_request_json(request)
    workflow_id = FREE_WORKFLOW_MANUAL_SEARCH["id"]
    workflow_name = FREE_WORKFLOW_MANUAL_SEARCH["name"]
    topic_query = clean_text(body.get("topicQuery") or body.get("topic_query") or "")
    start = time.perf_counter()
    status = 200
    error_message = ""
    max_results = min(20, max(5, to_int(body.get("count"), 8)))

    if not topic_query:
        raise HTTPException(status_code=400, detail="请输入要搜索的话题关键词")

    try:
        raw_search_results = search_with_content(topic_query, max_results=max_results, fetch_content=True, content_limit=SEARCH_CONTENT_MAX_LENGTH)
        search_data = [
            item
            for item in (
                normalize_search_item(result, "全网搜索")
                for result in raw_search_results
                if isinstance(result, dict)
            )
            if item
        ]
        await enrich_search_items_with_content(search_data, max_items=min(5, len(search_data)))
        toutiao_data: list[dict[str, Any]] = []
        fact_pack = build_search_fact_pack(topic_query, search_data, toutiao_data)

        return JSONResponse(
            content={
                "topicQuery": topic_query,
                "searchCode": 200,
                "searchMessage": "success",
                "searchData": [
                    {key: value for key, value in item.items() if key != "qualityScore"}
                    for item in search_data
                ],
                "toutiaoCode": 200,
                "toutiaoMessage": "disabled",
                "toutiaoData": [],
                "factPack": fact_pack,
                "workflow": {
                    "id": workflow_id,
                    "name": workflow_name,
                },
            }
        )
    except HTTPException:
        raise
    except Exception as exc:
        status = 500
        error_message = str(exc)
        raise HTTPException(status_code=500, detail=f"免费搜索兼容入口执行失败: {error_message}")
    finally:
        append_log(
            {
                "time": now_text(),
                "route": "/api/workflows/manual-search",
                "workflow": workflow_name,
                "topicQuery": topic_query,
                "status": status,
                "durationMs": round((time.perf_counter() - start) * 1000, 2),
                "error": error_message,
            }
        )


# ============================================================================
# 免费热榜和搜索接口
# ============================================================================

try:
    try:
        from .free_scrapers import (
            fetch_weibo_hot,
            fetch_zhihu_hot,
            fetch_baidu_hot,
            fetch_douyin_hot,
            fetch_all_hot_ranks,
            aggregate_hot_ranks,
            filter_business_relevant_hot_ranks,
            enrich_hot_ranks_with_content,
            discover_topic_context,
        )
        from .free_search import (
            search_duckduckgo,
            search_with_content,
            search_news,
            build_search_fact_pack as build_free_search_fact_pack
        )
    except ImportError:
        from free_scrapers import (
            fetch_weibo_hot,
            fetch_zhihu_hot,
            fetch_baidu_hot,
            fetch_douyin_hot,
            fetch_all_hot_ranks,
            aggregate_hot_ranks,
            filter_business_relevant_hot_ranks,
            enrich_hot_ranks_with_content,
            discover_topic_context,
        )
        from free_search import (
            search_duckduckgo,
            search_with_content,
            search_news,
            build_search_fact_pack as build_free_search_fact_pack
        )
    FREE_SCRAPERS_AVAILABLE = True
except ImportError as e:
    FREE_SCRAPERS_AVAILABLE = False
    print(f"警告: 免费爬虫模块导入失败: {e}")
    print("请确保在 backend 目录下运行，或运行: pip install -r backend/requirements.txt")


FREE_HOT_PLATFORM_ORDER = ("douyin", "weibo", "zhihu", "baidu")
FREE_HOT_PLATFORM_LABELS = {
    "douyin": "抖音",
    "weibo": "微博",
    "zhihu": "知乎",
    "baidu": "百度",
}


def free_hot_item_key(item: dict[str, Any]) -> str:
    title = clean_text(item.get("title")).lower()
    article_url = clean_text(item.get("article_url")).lower()
    url = clean_text(item.get("url")).lower()
    return article_url or url or title


def dedupe_free_hot_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    seen_titles: set[str] = set()

    for item in items:
        key = free_hot_item_key(item)
        title_key = re.sub(r"[^\w\u4e00-\u9fff]+", "", clean_text(item.get("title")).lower())
        if not key and not title_key:
            continue
        if key and key in seen:
            continue
        if title_key and title_key in seen_titles:
            continue
        if key:
            seen.add(key)
        if title_key:
            seen_titles.add(title_key)
        deduped.append(item)

    return deduped


def interleave_platform_hot_items(platform_buckets: dict[str, list[dict[str, Any]]], limit: int) -> list[dict[str, Any]]:
    rounds = max((len(items) for items in platform_buckets.values()), default=0)
    mixed: list[dict[str, Any]] = []

    for round_index in range(rounds):
        for platform in FREE_HOT_PLATFORM_ORDER:
            items = platform_buckets.get(platform, [])
            if round_index < len(items):
                mixed.append(items[round_index])
                if len(mixed) >= limit:
                    return mixed

    return mixed


def normalize_free_heat_score(raw_hot_value: Any, rank: int) -> int:
    digits = re.sub(r"\D", "", clean_text(raw_hot_value))
    score = 96 - max(0, rank - 1) * 2
    if digits:
        score += min(10, len(digits) + (2 if len(digits) >= 6 else 0))
    return max(50, min(98, score))


def infer_hot_boss_impact(text: str, directions: list[str], signal_score: int) -> str:
    normalized = clean_text(text)
    if re.search(r"(监管|合规|治理|处罚|封号|风险|边界)", normalized):
        return "这条变化和平台规则、使用边界、经营合规直接相关，适合继续往老板决策和执行动作上拆。"
    if re.search(r"(暴跌|暴涨|冲突|战争|停运|供应|油价|关税)", normalized):
        return "这类外部冲击会直接传导到经营成本、客户决策和市场预期，老板需要提前准备应对动作。"
    if signal_score >= 4 and directions:
        return f"这条热点已经能往{ '、'.join(directions[:2]) }上延伸，适合继续拆成老板能落地的经营判断。"
    return ""


def free_item_to_hot_item(item: dict[str, Any], index: int, generated_at: str) -> dict[str, Any]:
    title = clean_text(item.get("title"))
    summary = clean_text(item.get("summary")) or title
    content = clean_text(item.get("content")) or summary or title
    merged_text = " ".join(filter(None, [title, summary, content]))
    directions = infer_bridge_directions(merged_text)
    matched_keywords, signal_score = collect_business_keyword_hits(merged_text, BUSINESS_KEYWORD_WEIGHTS)
    key_points = split_search_sentences("\n".join(filter(None, [summary, content])), limit=3)
    timeline = extract_time_clues("\n".join(filter(None, [title, summary, content])))
    source_platform = clean_text(item.get("source_platform")).lower()
    platform_label = FREE_HOT_PLATFORM_LABELS.get(source_platform, clean_text(item.get("platform")) or source_platform or "热榜")
    article_source = clean_text(item.get("article_source"))
    topic_type = "平台热榜"
    if directions and signal_score >= 4:
        topic_type = f"{platform_label} · {'/'.join(directions[:2])}"

    boss_impact = infer_hot_boss_impact(merged_text, directions, signal_score)
    why_hot = summary or (key_points[0] if key_points else title)

    return {
        "hot_id": clean_text(item.get("article_url")) or clean_text(item.get("url")) or f"free_hot_{source_platform}_{index + 1:02d}",
        "title": title,
        "summary": summary,
        "content": content,
        "publish_time": generated_at,
        "source_platform": platform_label,
        "media_name": article_source or platform_label,
        "source_url": clean_text(item.get("article_url")) or clean_text(item.get("url")),
        "article_source": article_source,
        "article_url": clean_text(item.get("article_url")) or clean_text(item.get("url")),
        "topic_type": topic_type,
        "heat_score": normalize_free_heat_score(item.get("hot_value"), to_int(item.get("rank"), index + 1)),
        "why_hot": why_hot,
        "key_points": key_points[:3],
        "timeline": timeline[:3],
        "public_impact": "",
        "boss_impact": boss_impact,
    }


def hot_item_to_business_item(hot_item: dict[str, Any], index: int) -> dict[str, Any]:
    business_item = business_item_from_hot(hot_item, index)
    text = " ".join(
        filter(
            None,
            [
                clean_text(hot_item.get("title")),
                clean_text(hot_item.get("summary")),
                clean_text(hot_item.get("boss_impact")),
                clean_text(hot_item.get("why_hot")),
            ],
        )
    )
    matched_keywords, signal_score = collect_ai_keyword_hits(text)
    directions = infer_ai_directions(text)
    if matched_keywords:
        business_item["recommend_reason"] = clean_text(business_item.get("recommend_reason")) or infer_ai_recommend_reason(text, directions, matched_keywords)
    if signal_score:
        business_item["business_relevance_score"] = min(98, max(to_int(business_item.get("business_relevance_score"), 0), 55 + signal_score * 3))
    if not clean_list_text(business_item.get("bridge_directions")):
        business_item["bridge_directions"] = directions
    if not clean_text(business_item.get("recommended_angle")):
        business_item["recommended_angle"] = infer_ai_recommended_angle(text, directions, clean_text(business_item.get("recommend_reason")))
    business_item["topic_type"] = "AI行业热榜"
    if not clean_text(business_item.get("content")):
        business_item["content"] = clean_text(hot_item.get("content"))
    if not clean_text(business_item.get("article_source")):
        business_item["article_source"] = clean_text(hot_item.get("article_source"))
    if not clean_text(business_item.get("article_url")):
        business_item["article_url"] = clean_text(hot_item.get("article_url")) or clean_text(hot_item.get("source_url"))
    return business_item


def diversify_business_items(all_hot_list: list[dict[str, Any]], business_items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    top_all_keys = {hot_item_identity(item) for item in all_hot_list[:5]}
    distinct = [item for item in business_items if business_item_identity(item) not in top_all_keys]
    overlap = [item for item in business_items if business_item_identity(item) in top_all_keys]
    merged = dedupe_items(distinct + overlap, business_item_identity)
    return merged[:limit]


def enrich_platform_bucket(items: list[dict[str, Any]], max_items: int) -> list[dict[str, Any]]:
    if not items:
        return []
    return enrich_hot_ranks_with_content(items[:], max_items=max_items)


def build_free_hot_rank_cache_payload(
    *,
    limit_per_platform: int = 10,
    display_all_limit: int = HOT_RANK_DEFAULT_ALL_LIMIT,
    display_business_limit: int = HOT_RANK_DEFAULT_BUSINESS_LIMIT,
) -> dict[str, Any]:
    generated_at = now_text()
    platform_raw = fetch_all_hot_ranks(limit_per_platform, False)
    aggregated_seed = dedupe_free_hot_items(
        interleave_platform_hot_items(platform_raw, limit=limit_per_platform * max(2, len(FREE_HOT_PLATFORM_ORDER)))
    )
    enriched_aggregated = enrich_hot_ranks_with_content(
        aggregated_seed[: max(8, min(display_all_limit + 2, 10))],
        max_items=min(8, len(aggregated_seed)),
    )
    enriched_lookup = {free_hot_item_key(item): item for item in enriched_aggregated if free_hot_item_key(item)}

    platform_data: dict[str, list[dict[str, Any]]] = {}
    for platform in FREE_HOT_PLATFORM_ORDER:
        merged_items: list[dict[str, Any]] = []
        for item in platform_raw.get(platform, []) or []:
            merged_items.append(enriched_lookup.get(free_hot_item_key(item), item))
        platform_data[platform] = merged_items[:limit_per_platform]

    aggregated_free = dedupe_free_hot_items(
        [
            enriched_lookup.get(free_hot_item_key(item), item)
            for item in interleave_platform_hot_items(platform_data, limit=limit_per_platform * max(2, len(FREE_HOT_PLATFORM_ORDER)))
        ]
    )

    all_hot_list = [
        free_item_to_hot_item(item, index, generated_at)
        for index, item in enumerate(aggregated_free[: max(display_all_limit * 2, 16)])
    ]

    business_candidates_free = filter_ai_relevant_hot_ranks(aggregated_free)
    business_hot_list = [
        hot_item_to_business_item(free_item_to_hot_item(item, index, generated_at), index)
        for index, item in enumerate(business_candidates_free[: max(display_business_limit * 2, 16)])
    ]
    business_hot_list = diversify_business_items(all_hot_list, sort_business_items(business_hot_list), max(display_business_limit * 2, 12))

    result = normalize_hot_rank_result(
        {
            "snapshot_title": "今日热榜中心",
            "generated_at": generated_at,
            "debug": {
                "platform_count": len(platform_data),
                "all_candidates": len(aggregated_free),
                "business_candidates": len(business_candidates_free),
            },
            "all_hot_list": all_hot_list[: max(display_all_limit, 10)],
            "business_hot_list": business_hot_list[: max(display_business_limit, 6)],
        }
    )

    result["business_hot_list"] = sort_business_items(result.get("business_hot_list", []))

    return {
        "cacheVersion": HOT_RANK_CACHE_VERSION,
        "fetchedAt": generated_at,
        "fetchedAtTs": int(time.time()),
        "workflow": {
            "id": "free_scrapers",
            "name": "免费热榜引擎",
        },
        "result": result,
        "raw": {
            "platform_data": platform_data,
            "aggregated": aggregated_free,
            "business_aggregated": business_candidates_free,
        },
    }


def build_free_hot_rank_route_payload(
    cache_payload: dict[str, Any],
    *,
    platform: str,
    business_filter: bool,
    all_limit: int,
    business_limit: int,
    stale: bool,
    refreshing: bool,
    warning: str = "",
) -> dict[str, Any]:
    raw = cache_payload.get("raw") if isinstance(cache_payload.get("raw"), dict) else {}
    platform_data = raw.get("platform_data") if isinstance(raw.get("platform_data"), dict) else {}
    aggregated = raw.get("aggregated") if isinstance(raw.get("aggregated"), list) else []
    business_aggregated = raw.get("business_aggregated") if isinstance(raw.get("business_aggregated"), list) else []
    result = normalize_hot_rank_result(cache_payload.get("result") if isinstance(cache_payload.get("result"), dict) else {})

    payload = {
        "platform": platform,
        "generatedAt": clean_text(result.get("generated_at")) or clean_text(cache_payload.get("fetchedAt")),
        "snapshotTitle": clean_text(result.get("snapshot_title")) or "今日热榜中心",
        "debug": deep_copy_json(result.get("debug") if isinstance(result.get("debug"), dict) else {}),
        "data": deep_copy_json(platform_data),
        "aggregated": deep_copy_json(aggregated[: max(all_limit * 2, 16)]),
        "businessAggregated": deep_copy_json(business_aggregated[: max(business_limit * 2, 12)]),
        "allHotList": deep_copy_json(result.get("all_hot_list", [])[: max(1, all_limit)]),
        "businessHotList": deep_copy_json(result.get("business_hot_list", [])[: max(1, business_limit)]),
        "count": len(result.get("all_hot_list", [])),
        "business_filtered": business_filter,
        "content_enriched": True,
        "source": "free_scrapers",
        "cache": {
            "fetchedAt": clean_text(cache_payload.get("fetchedAt")),
            "ageSeconds": cache_age_seconds(cache_payload),
            "stale": stale,
            "refreshing": refreshing,
            "fromCache": True,
            "warning": warning,
        },
    }

    if platform != "all":
        current_items = platform_data.get(platform, []) if isinstance(platform_data, dict) else []
        if business_filter:
            current_items = filter_ai_relevant_hot_ranks(current_items)
        payload.update(
            {
                "data": deep_copy_json(current_items[: max(1, all_limit)]),
                "aggregated": deep_copy_json(current_items[: max(1, all_limit)]),
                "count": len(current_items[: max(1, all_limit)]),
            }
        )

    return payload


def is_search_style_hot_url(url: str) -> bool:
    normalized = clean_text(url).lower()
    if not normalized:
        return False
    return any(
        keyword in normalized
        for keyword in (
            "duckduckgo.com",
            "bing.com/search",
            "google.com/search",
            "news.google.com",
            "search.yahoo.com",
        )
    )


def looks_like_reader_error(text: str) -> bool:
    normalized = clean_text(text)
    if not normalized:
        return False
    return normalized.startswith("{") or "SecurityCompromiseError" in normalized or '"code":' in normalized or '"message":' in normalized


def hot_rank_detail_ready(content: str, title: str, summary: str) -> bool:
    normalized = clean_text(content)
    if not normalized:
        return False
    if READER_WARNING_PATTERN.search(normalized):
        return False
    if normalized in {clean_text(title), clean_text(summary)}:
        return False
    if has_chinese(title or summary) and chinese_ratio(normalized) < 0.18:
        return False
    fact_sentences = split_search_sentences(normalized, limit=10)
    basic_sentences = [clean_text(part) for part in re.split(r"[。！？!?；;\n]", normalized) if len(clean_text(part)) >= 8]
    sentence_count = max(len(fact_sentences), len(basic_sentences[:10]))
    return len(normalized) >= 140 and sentence_count >= 3


@app.post("/api/free/hot_rank/detail")
async def free_hot_rank_detail_underscore_redirect() -> JSONResponse:
    """旧路由重定向到新路由"""
    return RedirectResponse(url="/api/free/hot-rank/detail", status_code=308)


@app.post("/api/free/hot-rank/detail")
async def free_hot_rank_detail(request: Request) -> JSONResponse:
    if not FREE_SCRAPERS_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="免费热榜模块不可用，请检查 backend 依赖"
        )

    body = await read_request_json(request)
    title = clean_text(body.get("title"))
    summary = clean_text(body.get("summary"))
    content = clean_reader_content(body.get("content"), max_length=3200)
    source_url = clean_text(body.get("sourceUrl") or body.get("source_url") or body.get("articleUrl") or "")
    article_source = clean_text(body.get("articleSource") or body.get("article_source") or "")
    article_url = clean_text(body.get("articleUrl") or body.get("article_url") or source_url)
    source_count = 1 if content else 0

    if not title and not summary and not content:
        raise HTTPException(status_code=400, detail="请至少提供一个热榜标题或摘要")

    content_ready = hot_rank_detail_ready(content, title, summary)

    if not content_ready and source_url and not is_search_style_hot_url(source_url):
        fetched_content = clean_reader_content(await asyncio.to_thread(fetch_reader_content, source_url, 8), max_length=3200)
        if looks_like_reader_error(fetched_content):
            fetched_content = ""
        if fetched_content:
            content = fetched_content
            source_count = max(source_count, 1)
            content_ready = hot_rank_detail_ready(content, title, summary)

    if not content_ready and title:
        context = await asyncio.to_thread(discover_topic_context, title)
        if isinstance(context, dict):
            content = clean_reader_content(context.get("content"), max_length=3200) or content
            if looks_like_reader_error(content):
                content = ""
            summary = clean_text(context.get("summary")) or summary
            article_source = clean_text(context.get("article_source")) or article_source
            article_url = clean_text(context.get("article_url")) or article_url
            source_count = max(source_count, 1 if content else 0)
            content_ready = hot_rank_detail_ready(content, title, summary)

    if not content_ready and article_url and not is_search_style_hot_url(article_url):
        article_content = clean_reader_content(await asyncio.to_thread(fetch_reader_content, article_url, 8), max_length=3200)
        if looks_like_reader_error(article_content):
            article_content = ""
        if article_content:
            content = article_content
            source_count = max(source_count, 1)
            content_ready = hot_rank_detail_ready(content, title, summary)

    if title and hot_rank_detail_needs_enrichment(content, title, summary):
        enriched = await asyncio.to_thread(enrich_hot_rank_detail_from_search, title, summary, content)
        enriched_content = clean_reader_content(enriched.get("content"), max_length=3200)
        if enriched_content:
            content = enriched_content
            summary = clean_text(enriched.get("summary")) or summary
            article_source = clean_text(enriched.get("article_source")) or article_source
            article_url = clean_text(enriched.get("article_url")) or article_url
            source_url = article_url or source_url
            source_count = max(source_count, to_int(enriched.get("source_count"), 0))
            content_ready = hot_rank_detail_ready(content, title, summary)

    if content and (not summary or len(summary) > 280 or looks_like_reader_error(summary)):
        summary = summarize_search_content(content, max_length=220) or trim_text(summary or title, 220)

    if not content:
        content = summary or title

    clean_content = build_clean_content(content, summary, title, max_length=2200, sentence_limit=14)
    if not summary:
        summary = summarize_search_content(clean_content, max_length=220) or trim_text(title, 220)
    merged_text = " ".join(filter(None, [title, summary, clean_content]))
    directions = infer_bridge_directions(merged_text) if merged_text else []
    _, signal_score = collect_business_keyword_hits(merged_text, BUSINESS_KEYWORD_WEIGHTS)
    business_reason = infer_hot_boss_impact(merged_text, directions, signal_score) if merged_text else ""
    display_title = build_display_title(title, summary, clean_content)
    display_summary = build_display_summary(summary, clean_content, title)
    quality_score, quality_status = assess_content_quality(clean_content, source_count=max(source_count, 1))

    return JSONResponse(
        content={
            "title": title,
            "summary": summary or title,
            "display_title": display_title,
            "display_summary": display_summary,
            "content": clean_content or content,
            "clean_content": clean_content or content,
            "business_reason": business_reason,
            "quality_score": quality_score,
            "quality_status": quality_status,
            "source_url": source_url,
            "article_source": article_source,
            "article_url": article_url,
        }
    )


@app.get("/api/free/hot_rank")
async def free_hot_rank_underscore_redirect() -> JSONResponse:
    """旧路由重定向到新路由"""
    return RedirectResponse(url="/api/free/hot-rank", status_code=308)


@app.get("/api/free/hot-rank")
async def free_hot_rank(
    platform: str = "all",
    limit: int = 20,
    fetch_content: bool = Query(False, description="是否获取完整内容（使用 Jina Reader）"),
    enrich_content: bool = Query(False, description="是否增强内容（仅对前10条）"),
    business_filter: bool = Query(False, description="是否只返回业务相关内容"),
    force_refresh: bool = Query(False, description="是否强制刷新缓存"),
) -> JSONResponse:
    """
    免费热榜接口 - 支持微博、知乎、百度、抖音

    参数:
        platform: 平台名称 (weibo/zhihu/baidu/douyin/all)
        limit: 返回数量限制
        fetch_content: 是否获取完整内容（默认 False，避免超时）
        enrich_content: 是否增强内容（默认 False，仅对前10条使用 Jina Reader）
        business_filter: 是否只返回业务相关内容（默认 False）

    完全免费，无需 API Key
    """
    if not FREE_SCRAPERS_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="免费爬虫模块未安装，请运行: pip install -r backend/requirements.txt"
        )

    start = time.perf_counter()
    status = 200
    error_message = ""

    try:
        if platform not in {"weibo", "zhihu", "baidu", "douyin", "all"}:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的平台: {platform}，支持的平台: weibo/zhihu/baidu/douyin/all"
            )

        cache = get_hot_rank_cache()
        refreshing = hot_rank_cache_manager.refresh_task is not None and not hot_rank_cache_manager.refresh_task.done()
        recent_refresh_error = get_hot_rank_refresh_error()
        warning = stringify_error(recent_refresh_error.get("message")) if recent_refresh_error else ""

        if hot_rank_should_refresh_inline(cache, force_refresh=force_refresh):
            try:
                fresh_cache = await refresh_hot_rank_cache(force=force_refresh or not hot_rank_cache_is_fresh(cache))
                payload = build_free_hot_rank_route_payload(
                    fresh_cache,
                    platform=platform,
                    business_filter=business_filter,
                    all_limit=limit,
                    business_limit=HOT_RANK_DEFAULT_BUSINESS_LIMIT,
                    stale=False,
                    refreshing=False,
                    warning="",
                )
                payload["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
                return JSONResponse(content=payload)
            except Exception as exc:
                inline_error = stringify_error(getattr(exc, "detail", str(exc)))
                if cache:
                    payload = build_free_hot_rank_route_payload(
                        cache,
                        platform=platform,
                        business_filter=business_filter,
                        all_limit=limit,
                        business_limit=HOT_RANK_DEFAULT_BUSINESS_LIMIT,
                        stale=True,
                        refreshing=False,
                        warning=inline_error,
                    )
                    payload["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
                    return JSONResponse(content=payload)
                raise

        if force_refresh:
            if not refreshing:
                start_hot_rank_refresh(force=True)
                refreshing = True
            if cache:
                payload = build_free_hot_rank_route_payload(
                    cache,
                    platform=platform,
                    business_filter=business_filter,
                    all_limit=limit,
                    business_limit=HOT_RANK_DEFAULT_BUSINESS_LIMIT,
                    stale=not hot_rank_cache_is_fresh(cache),
                    refreshing=True,
                    warning=warning,
                )
                payload["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
                return JSONResponse(content=payload)

        if cache and hot_rank_cache_is_fresh(cache):
            payload = build_free_hot_rank_route_payload(
                cache,
                platform=platform,
                business_filter=business_filter,
                all_limit=limit,
                business_limit=HOT_RANK_DEFAULT_BUSINESS_LIMIT,
                stale=False,
                refreshing=refreshing,
                warning=warning,
            )
            payload["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
            return JSONResponse(content=payload)

        if cache and not hot_rank_cache_is_fresh(cache) and not refreshing:
            start_hot_rank_refresh(force=True)
            refreshing = True
            payload = build_free_hot_rank_route_payload(
                cache,
                platform=platform,
                business_filter=business_filter,
                all_limit=limit,
                business_limit=HOT_RANK_DEFAULT_BUSINESS_LIMIT,
                stale=True,
                refreshing=True,
                warning=warning,
            )
            payload["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
            return JSONResponse(content=payload)

        if cache and refreshing:
            payload = build_free_hot_rank_route_payload(
                cache,
                platform=platform,
                business_filter=business_filter,
                all_limit=limit,
                business_limit=HOT_RANK_DEFAULT_BUSINESS_LIMIT,
                stale=not hot_rank_cache_is_fresh(cache),
                refreshing=True,
                warning=warning,
            )
            payload["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
            return JSONResponse(content=payload)

        fresh_cache = await refresh_hot_rank_cache(force=True)
        payload = build_free_hot_rank_route_payload(
            fresh_cache,
            platform=platform,
            business_filter=business_filter,
            all_limit=limit,
            business_limit=HOT_RANK_DEFAULT_BUSINESS_LIMIT,
            stale=False,
            refreshing=False,
            warning="",
        )
        payload["durationMs"] = round((time.perf_counter() - start) * 1000, 2)
        return JSONResponse(content=payload)

    except HTTPException:
        raise
    except Exception as exc:
        status = 500
        error_message = str(exc)
        raise HTTPException(status_code=500, detail=f"热榜获取失败: {error_message}")
    finally:
        append_log({
            "time": now_text(),
            "route": "/api/free/hot-rank",
            "platform": platform,
            "status": status,
            "durationMs": round((time.perf_counter() - start) * 1000, 2),
            "error": error_message
        })


@app.post("/api/free/search")
async def free_search(request: Request) -> JSONResponse:
    """
    免费搜索接口 - 使用 DuckDuckGo

    请求体:
        {
            "query": "搜索关键词",
            "maxResults": 10,
            "fetchContent": true,
            "searchType": "web"  // web/news
        }

    完全免费，无需 API Key
    """
    if not FREE_SCRAPERS_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="免费搜索模块未安装，请运行: pip install -r backend/requirements.txt"
        )

    body = await read_request_json(request)
    query = clean_text(body.get("query", ""))
    max_results = min(50, max(1, to_int(body.get("maxResults"), 10)))
    fetch_content = to_bool(body.get("fetchContent"), False)
    search_type = body.get("searchType", "web")

    if not query:
        raise HTTPException(status_code=400, detail="请输入搜索关键词")

    start = time.perf_counter()
    status = 200
    error_message = ""

    try:
        if search_type == "news":
            results = search_news(query, max_results)
        else:
            if fetch_content:
                results = search_with_content(query, max_results, fetch_content=True, content_limit=1000)
            else:
                results = search_duckduckgo(query, max_results)

        return JSONResponse(content={
            "query": query,
            "searchType": search_type,
            "generatedAt": now_text(),
            "results": results,
            "count": len(results),
            "source": "duckduckgo",
            "durationMs": round((time.perf_counter() - start) * 1000, 2)
        })

    except Exception as exc:
        status = 500
        error_message = str(exc)
        raise HTTPException(status_code=500, detail=f"搜索失败: {error_message}")
    finally:
        append_log({
            "time": now_text(),
            "route": "/api/free/search",
            "query": query,
            "searchType": search_type,
            "status": status,
            "durationMs": round((time.perf_counter() - start) * 1000, 2),
            "error": error_message
        })


@app.post("/api/free/manual_search")
@app.post("/api/free/manual-search")
async def free_manual_search(request: Request) -> JSONResponse:
    """
    免费主题搜索接口 - 兼容历史工作流接口格式

    请求体:
        {
            "topicQuery": "搜索主题"
        }

    返回格式与历史工作流入口一致，可直接复用旧前端调用
    """
    if not FREE_SCRAPERS_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="免费搜索模块未安装，请运行: pip install -r backend/requirements.txt"
        )

    body = await read_request_json(request)
    topic_query = clean_text(body.get("topicQuery") or body.get("topic_query") or "")

    if not topic_query:
        raise HTTPException(status_code=400, detail="请输入要搜索的话题关键词")

    start = time.perf_counter()
    status = 200
    error_message = ""

    try:
        raw_search_results = search_with_content(topic_query, max_results=8, fetch_content=True, content_limit=SEARCH_CONTENT_MAX_LENGTH)
        search_results = [
            item
            for item in (
                normalize_search_item(result, "全网搜索")
                for result in raw_search_results
                if isinstance(result, dict)
            )
            if item
        ]
        await enrich_search_items_with_content(search_results, max_items=5)
        fact_pack = build_search_fact_pack(topic_query, search_results, [])

        # 构建与历史工作流兼容的返回格式
        return JSONResponse(content={
            "topicQuery": topic_query,
            "searchCode": 200,
            "searchMessage": "success",
            "searchData": [{key: value for key, value in item.items() if key != "qualityScore"} for item in search_results],
            "toutiaoCode": 200,
            "toutiaoMessage": "success",
            "toutiaoData": [],  # 免费版不提供头条搜索
            "factPack": fact_pack,
            "workflow": {
                "id": "free_search",
                "name": "免费搜索"
            },
            "source": "bing_news+duckduckgo",
            "durationMs": round((time.perf_counter() - start) * 1000, 2)
        })

    except Exception as exc:
        status = 500
        error_message = str(exc)
        raise HTTPException(status_code=500, detail=f"搜索失败: {error_message}")
    finally:
        append_log({
            "time": now_text(),
            "route": "/api/free/manual-search",
            "topicQuery": topic_query,
            "status": status,
            "durationMs": round((time.perf_counter() - start) * 1000, 2),
            "error": error_message
        })


# ============================================================================
# 静态文件服务 (必须在最后)
# ============================================================================

if (DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")


@app.post("/api/analyze-video")
async def analyze_video(
    file: UploadFile | None = File(default=None),
    mode: str = Form("FAST"),
    cachedUri: str | None = Form(default=None),
    model: str | None = Form(default=None),
    mimeType: str | None = Form(default=None),
) -> JSONResponse:
    if not CONFIG["apiKey"] or not CONFIG["baseUrl"]:
        raise HTTPException(status_code=500, detail="Backend Gemini config is missing API Key or Base URL")

    if file is None and not cachedUri:
        raise HTTPException(status_code=400, detail="Upload a full video file or provide an existing Gemini file URI")

    file_stream = None
    content_length = None
    mime_type = clean_text(mimeType) or "video/mp4"
    display_name = "uploaded-video"

    if file is not None:
        file_stream = file.file
        file_stream.seek(0, os.SEEK_END)
        content_length = file_stream.tell()
        file_stream.seek(0)
        mime_type = clean_text(file.content_type) or "video/mp4"
        display_name = clean_text(file.filename) or "uploaded-video"
        if not content_length:
            raise HTTPException(status_code=400, detail="Uploaded video file is empty")

    try:
        result = await asyncio.to_thread(
            analyze_video_with_gemini,
            api_key=CONFIG["apiKey"],
            base_url=CONFIG["baseUrl"],
            model=resolve_model_name(model),
            timeout_seconds=CONFIG["timeoutSeconds"],
            mode=mode,
            existing_file_uri=cachedUri,
            file_stream=file_stream,
            content_length=content_length,
            mime_type=mime_type,
            display_name=display_name,
        )
        return JSONResponse(content=result)
    except GeminiVideoError as exc:
        return JSONResponse(content={"error": {"message": str(exc)}}, status_code=500)


@app.post("/api/generate-sora-prompts")
async def generate_sora_prompts(
    file: UploadFile | None = File(default=None),
    existingFileUri: str | None = Form(default=None),
    analysisSummary: str = Form(default=""),
    count: int = Form(default=1),
    model: str | None = Form(default=None),
    mimeType: str | None = Form(default=None),
) -> JSONResponse:
    if not CONFIG["apiKey"] or not CONFIG["baseUrl"]:
        raise HTTPException(status_code=500, detail="Backend Gemini config is missing API Key or Base URL")

    if file is None and not existingFileUri:
        raise HTTPException(status_code=400, detail="Upload a full video file or provide an existing Gemini file URI")

    file_stream = None
    content_length = None
    mime_type = clean_text(mimeType) or "video/mp4"
    display_name = "uploaded-video"

    if file is not None:
        file_stream = file.file
        file_stream.seek(0, os.SEEK_END)
        content_length = file_stream.tell()
        file_stream.seek(0)
        mime_type = clean_text(file.content_type) or "video/mp4"
        display_name = clean_text(file.filename) or "uploaded-video"
        if not content_length:
            raise HTTPException(status_code=400, detail="Uploaded video file is empty")

    try:
        prompts = await asyncio.to_thread(
            generate_sora_prompts_with_gemini,
            api_key=CONFIG["apiKey"],
            base_url=CONFIG["baseUrl"],
            model=resolve_model_name(model),
            timeout_seconds=CONFIG["timeoutSeconds"],
            count=max(1, min(count, 5)),
            analysis_summary=analysisSummary,
            existing_file_uri=existingFileUri,
            file_stream=file_stream,
            content_length=content_length,
            mime_type=mime_type,
            display_name=display_name,
        )
        return JSONResponse(content={"prompts": prompts})
    except GeminiVideoError as exc:
        return JSONResponse(content={"error": {"message": str(exc)}}, status_code=500)


@app.post("/api/generate-viral-copies")
async def generate_viral_copies(request: Request) -> JSONResponse:
    """Generate multiple viral copy variants from a source script using official Gemini."""
    if not CONFIG["apiKey"]:
        raise HTTPException(status_code=500, detail="Backend Gemini config is missing API Key")

    body = await read_request_json(request)
    script = str(body.get("script", "")).strip()
    if not script:
        raise HTTPException(status_code=400, detail="script must not be empty")

    prompt = "\n".join([
        "You are a short-video copywriting expert.",
        "Create 3 clearly different viral short-video copy variants based on the source script.",
        "Return only a JSON array.",
        "Each item must be an object with a text field.",
        "Each copy should stay in Simplified Chinese and keep a strong hook, value delivery, and CTA.",
        "Do not copy the source script verbatim.",
        "Source script:",
        script,
        "Return format:",
        '[{"text":"variant 1"},{"text":"variant 2"},{"text":"variant 3"}]',
    ])

    try:
        parsed = await asyncio.to_thread(
            generate_json_with_gemini,
            prompt,
            api_key=CONFIG["apiKey"],
            model=resolve_model_name(body.get("model")),
            max_output_tokens=max(512, to_int(body.get("max_tokens", 3000), 3000)),
            temperature=0.9,
        )
        if not isinstance(parsed, list):
            raise ValueError("Gemini did not return a JSON array")

        copies = [str(item.get("text", "") if isinstance(item, dict) else item).strip() for item in parsed]
        copies = [item for item in copies if item]
        if not copies:
            raise ValueError("Gemini returned no usable copy variants")
        return JSONResponse(content={"copies": copies})
    except GeminiVideoError as exc:
        return JSONResponse(content={"error": {"message": str(exc)}}, status_code=500)


@app.post("/api/rewrite/analyze")
@app.post("/api/analyze-copy")
async def analyze_rewrite_copy(request: Request) -> JSONResponse:
    if not CONFIG["anthropicBaseUrl"] or not CONFIG["anthropicApiKey"]:
        raise HTTPException(
            status_code=500,
            detail="\u540e\u7aef\u672a\u914d\u7f6e Claude \u4eff\u5199\u670d\u52a1\uff0c\u8bf7\u8bbe\u7f6e ANTHROPIC_BASE_URL \u548c ANTHROPIC_API_KEY\u3002",
        )

    body = await read_request_json(request)
    original_copy = normalize_multiline_text(body.get("originalCopy") or body.get("original_copy"))
    if not original_copy:
        raise HTTPException(status_code=400, detail="\u539f\u59cb\u6587\u6848\u4e0d\u80fd\u4e3a\u7a7a\u3002")

    industry = clean_text(body.get("industry"))
    needs = clean_text(body.get("needs"))
    user_background = clean_text(body.get("userBackground") or body.get("user_background"))

    try:
        result = await asyncio.to_thread(
            analyze_copy_with_claude,
            original_copy=original_copy,
            industry=industry,
            needs=needs,
            user_background=user_background,
            api_key=CONFIG["anthropicApiKey"],
            base_url=CONFIG["anthropicBaseUrl"],
            model=resolve_rewrite_model_name(body.get("model")),
            timeout_seconds=max(20, min(CONFIG["timeoutSeconds"], 95)),
        )
        return JSONResponse(content=result)
    except AnthropicApiError as exc:
        return JSONResponse(content={"error": {"message": str(exc)}}, status_code=500)


@app.post("/api/rewrite/refine")
@app.post("/api/refine-copy")
async def refine_rewrite_copy(request: Request) -> JSONResponse:
    if not CONFIG["anthropicBaseUrl"] or not CONFIG["anthropicApiKey"]:
        raise HTTPException(
            status_code=500,
            detail="\u540e\u7aef\u672a\u914d\u7f6e Claude \u4eff\u5199\u670d\u52a1\uff0c\u8bf7\u8bbe\u7f6e ANTHROPIC_BASE_URL \u548c ANTHROPIC_API_KEY\u3002",
        )

    body = await read_request_json(request)
    current_result = body.get("currentResult") or body.get("current_result")
    user_instruction = clean_text(body.get("userInstruction") or body.get("user_instruction"))
    user_background = clean_text(body.get("userBackground") or body.get("user_background"))

    if not isinstance(current_result, dict):
        raise HTTPException(status_code=400, detail="\u5f53\u524d\u4eff\u5199\u7ed3\u679c\u683c\u5f0f\u4e0d\u6b63\u786e\u3002")
    if not user_instruction:
        raise HTTPException(status_code=400, detail="\u4f18\u5316\u6307\u4ee4\u4e0d\u80fd\u4e3a\u7a7a\u3002")

    try:
        result = await asyncio.to_thread(
            refine_copy_with_claude,
            current_result=current_result,
            user_instruction=user_instruction,
            user_background=user_background,
            api_key=CONFIG["anthropicApiKey"],
            base_url=CONFIG["anthropicBaseUrl"],
            model=resolve_rewrite_model_name(body.get("model")),
            timeout_seconds=max(20, min(CONFIG["timeoutSeconds"], 95)),
        )
        return JSONResponse(content=result)
    except AnthropicApiError as exc:
        return JSONResponse(content={"error": {"message": str(exc)}}, status_code=500)
    except Exception as exc:
        return JSONResponse(content={"error": {"message": str(exc)}}, status_code=500)


# SPA fallback 必须在所有 API 路由之后
@app.get("/{full_path:path}", response_model=None, include_in_schema=False)
async def spa_fallback(full_path: str):
    requested = DIST_DIR / full_path
    if full_path and requested.exists() and requested.is_file():
        return FileResponse(str(requested))

    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))

    return JSONResponse(
        content={"error": {"message": "未找到前端构建文件，请先运行 npm run build"}},
        status_code=404,
    )


def main() -> None:
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=CONFIG["port"],
        reload=False,
    )


if __name__ == "__main__":
    main()
