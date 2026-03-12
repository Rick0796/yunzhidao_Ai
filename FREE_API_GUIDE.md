# 免费热榜和搜索功能使用指南

## 新增功能

我们新增了**完全免费**的热榜和搜索功能，无需任何 API Key，专门针对中国内地平台。

### 支持的平台

- ✅ **微博热搜** - 实时热搜榜
- ✅ **知乎热榜** - 知乎热门话题
- ✅ **百度热搜** - 百度实时热点
- ✅ **抖音热榜** - 抖音热门话题
- ✅ **DuckDuckGo 搜索** - 全网搜索（支持中文）

## 安装依赖

```bash
pip install -r backend/requirements.txt
```

新增依赖:
- `beautifulsoup4` - 网页解析
- `duckduckgo-search` - 免费搜索
- `lxml` - HTML 解析器

## API 接口

### 1. 免费热榜接口

**获取单个平台热榜**

```bash
GET /api/free/hot-rank?platform=weibo&limit=20
```

参数:
- `platform`: 平台名称 (weibo/zhihu/baidu/douyin/all)
- `limit`: 返回数量限制 (默认 20)

返回示例:
```json
{
  "platform": "weibo",
  "generatedAt": "2026-03-11 10:00:00",
  "data": [
    {
      "title": "热搜标题",
      "url": "https://...",
      "hot_value": "1234567",
      "rank": 1,
      "platform": "微博",
      "source_platform": "weibo"
    }
  ],
  "count": 20,
  "source": "free_scrapers"
}
```

**获取所有平台热榜**

```bash
GET /api/free/hot-rank?platform=all&limit=20
```

返回所有平台的热榜数据，并提供聚合结果。

### 2. 免费搜索接口

**基础搜索**

```bash
POST /api/free/search
Content-Type: application/json

{
  "query": "AI获客",
  "maxResults": 10,
  "fetchContent": false,
  "searchType": "web"
}
```

参数:
- `query`: 搜索关键词（必填）
- `maxResults`: 最大结果数（默认 10，最大 50）
- `fetchContent`: 是否获取完整内容（默认 false）
- `searchType`: 搜索类型（web/news，默认 web）

返回示例:
```json
{
  "query": "AI获客",
  "searchType": "web",
  "generatedAt": "2026-03-11 10:00:00",
  "results": [
    {
      "title": "搜索结果标题",
      "url": "https://...",
      "snippet": "摘要内容...",
      "source": "来源网站"
    }
  ],
  "count": 10,
  "source": "duckduckgo"
}
```

**获取完整内容**

设置 `fetchContent: true` 会使用 Jina Reader 自动清理网页内容，返回干净的 Markdown 格式。

### 3. 免费主题搜索接口（兼容历史工作流入口）

```bash
POST /api/free/manual-search
Content-Type: application/json

{
  "topicQuery": "人工智能"
}
```

此接口返回格式与历史工作流入口一致，可以直接复用旧前端调用。

返回示例:
```json
{
  "topicQuery": "人工智能",
  "searchCode": 200,
  "searchMessage": "success",
  "searchData": [...],
  "toutiaoCode": 200,
  "toutiaoMessage": "success",
  "toutiaoData": [],
  "factPack": {
    "topic": "人工智能",
    "summary": "摘要...",
    "keyFacts": ["事实1", "事实2"],
    "sourceText": "完整文本...",
    "sources": [...]
  },
  "workflow": {
    "id": "free_search",
    "name": "免费搜索"
  }
}
```

## 测试

运行测试脚本:

```bash
# 确保后端服务已启动
python backend/main.py

# 在另一个终端运行测试
python test_free_api.py
```

## 与历史工作流入口的关系

### 保留历史工作流入口

原有的工作流入口**继续保留**，但现在统一走免费实现:
- `/api/workflows/hot-rank` - 热榜兼容入口
- `/api/workflows/manual-search` - 搜索兼容入口

### 新增免费接口

新增的免费接口作为**补充选项**:
- `/api/free/hot-rank` - 免费热榜
- `/api/free/search` - 免费搜索
- `/api/free/manual-search` - 免费主题搜索（兼容历史工作流格式）

### 如何选择

**使用免费接口**:
- 完全免费
- 无需 API Key
- 支持更多平台（微博、知乎、百度、抖音）
- 适合测试和开发

**使用工作流兼容入口**:
- 保留旧路由，不用改老前端路径
- 实际仍然走免费热榜和免费搜索
- 适合平滑迁移

## 前端集成

### 方式 1: 直接替换

如果想完全使用免费接口，修改前端调用:

```typescript
// 原来
const response = await fetch('/api/workflows/hot-rank', {...});

// 改为
const response = await fetch('/api/free/hot-rank?platform=all', {...});
```

### 方式 2: 继续走兼容入口

如果前端暂时不想改路由，可以继续调用历史工作流入口:

```typescript
async function fetchHotRank() {
  return await fetch('/api/workflows/hot-rank', {...});
}
```

### 方式 3: 用户选择

在设置中让用户选择使用哪个数据源。

## 注意事项

### 爬虫限制

- 微博、知乎、百度、抖音都有反爬机制
- 建议设置合理的请求间隔
- 不要频繁请求同一平台
- 建议使用缓存机制

### 内容质量

- 免费爬虫获取的是公开数据
- 内容完整度取决于网页结构
- 抖音热榜可能需要额外处理

### 稳定性

- 网页结构变化可能导致爬虫失效
- 建议定期检查和更新爬虫代码
- 可以同时使用多个数据源作为备份

## 故障排查

### 依赖安装失败

```bash
# 使用国内镜像
pip install -r backend/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 爬虫返回空数据

1. 检查网络连接
2. 检查目标网站是否可访问
3. 查看后端日志中的错误信息
4. 尝试更新 User-Agent

### 搜索失败

1. 确认 `duckduckgo-search` 已正确安装
2. 检查网络是否能访问 DuckDuckGo
3. 尝试使用代理

## 未来优化

- [ ] 添加请求缓存机制
- [ ] 支持更多平台（B站、小红书等）
- [ ] 优化抖音反爬处理
- [ ] 添加内容质量评分
- [ ] 支持自定义爬虫规则

## 联系方式

如有问题，请查看:
1. 后端日志: `runtime/api_requests.jsonl`
2. 测试脚本: `test_free_api.py`
3. 源代码: `backend/free_scrapers.py` 和 `backend/free_search.py`
