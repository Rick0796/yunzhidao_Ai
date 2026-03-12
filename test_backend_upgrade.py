from backend.main import build_search_fact_pack, normalize_hot_rank_result, normalize_search_item
from backend.free_scrapers import filter_business_relevant_hot_ranks


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_fact_pack_upgrade() -> None:
    raw_items = [
        {
            "title": "两会回应AI“龙虾”风险",
            "summary": "节目集中讨论AI“龙虾”应用风险、AI替代工作与网约车监管。",
            "content": "3月11日节目中，代表委员回应AI“龙虾”应用风险。这里的“龙虾”是一个项目代称，公开线索没有进一步解释具体场景。节目还讨论了AI会不会替代工作，以及平台监管边界。",
            "sitename": "央视新闻",
            "url": "https://example.com/a",
        },
        {
            "title": "代表委员继续回应AI替代工作争议",
            "summary": "讨论重点转向算法边界、平台监管和司机权益保障。",
            "content": "公开信息显示，讨论没有停留在技术热闹层面，而是转到真实行业应用边界、平台责任和劳动者权益。",
            "sitename": "人民日报",
            "url": "https://example.com/b",
        },
    ]

    search_items = [normalize_search_item(item, "全网搜索") for item in raw_items]
    search_items = [item for item in search_items if item]
    fact_pack = build_search_fact_pack("AI龙虾风险", search_items, [])

    assert_true(bool(fact_pack.get("eventAnchor")), "事实包缺少事件锚点")
    assert_true(len(fact_pack.get("keyFacts", [])) >= 2, "事实包关键事实太少")
    assert_true("当前热点是" not in fact_pack.get("sourceText", ""), "事实包仍然带说明腔标签")
    assert_true(bool(fact_pack.get("sources", [{}])[0].get("content")), "事实包来源没有正文内容")
    assert_true("保持原词" in fact_pack.get("guardrailNote", ""), "事实包没有生成歧义保护")


def test_business_hot_split() -> None:
    result = normalize_hot_rank_result(
        {
            "snapshot_title": "今日热榜中心",
            "generated_at": "2026-03-11 12:00",
            "debug": {},
            "all_hot_list": [
                {
                    "hot_id": "hot_001",
                    "title": "中国女足三连胜",
                    "summary": "体育赛事持续升温。",
                    "publish_time": "2026-03-11 10:00",
                    "topic_type": "体育",
                    "heat_score": 95,
                },
                {
                    "hot_id": "hot_002",
                    "title": "两会回应AI监管与平台治理",
                    "summary": "公开讨论集中在AI风险、平台监管和经营边界。",
                    "publish_time": "2026-03-11 11:00",
                    "topic_type": "科技·监管",
                    "heat_score": 83,
                    "boss_impact": "企业需要关注AI合规和平台规则变化。",
                },
                {
                    "hot_id": "hot_003",
                    "title": "国际油价24小时暴跌30%",
                    "summary": "外部冲击带来供应链和成本波动。",
                    "publish_time": "2026-03-11 09:00",
                    "topic_type": "财经",
                    "heat_score": 80,
                    "boss_impact": "外贸和能源企业需要重算成本。",
                },
            ],
            "business_hot_list": [],
        }
    )

    all_titles = [item.get("title") for item in result.get("all_hot_list", [])]
    business_titles = [item.get("title") for item in result.get("business_hot_list", [])]

    assert_true(len(all_titles) >= 3, "全网热榜样本不足")
    assert_true(len(business_titles) >= 1, "行业热榜没有筛出结果")
    assert_true(business_titles != all_titles[: len(business_titles)], "行业热榜仍然和全网热榜前列完全一致")
    assert_true("中国女足三连胜" not in business_titles, "明显非业务热点被误筛进了行业热榜")


def test_free_business_filter() -> None:
    sample = [
        {"title": "中国女足三连胜", "summary": "体育赛事升温", "content": "体育焦点"},
        {"title": "抖音加码AI违规内容治理", "summary": "平台打击AI色情内容，强调合规边界", "content": "AI治理、平台监管、内容合规成为焦点"},
        {"title": "创业公司批量上线数字人获客系统", "summary": "AI获客、流量转化和企业增长被反复提及", "content": "数字人、获客、客户转化、企业增长"},
    ]

    filtered = filter_business_relevant_hot_ranks(sample, ["ai", "获客", "流量", "企业", "合规"])
    titles = [item.get("title") for item in filtered]

    assert_true("中国女足三连胜" not in titles, "业务筛选误收了普通体育热点")
    assert_true("抖音加码AI违规内容治理" in titles, "平台治理类业务热点没有被筛出")
    assert_true("创业公司批量上线数字人获客系统" in titles, "AI获客类业务热点没有被筛出")


if __name__ == "__main__":
    test_fact_pack_upgrade()
    test_business_hot_split()
    test_free_business_filter()
    print("backend upgrade checks passed")
