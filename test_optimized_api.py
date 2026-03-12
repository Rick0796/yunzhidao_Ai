"""
测试优化后的免费热榜 API
"""

import requests
import json

BASE_URL = "http://127.0.0.1:8787"


def test_all_platforms_basic():
    """测试所有平台基础热榜（不增强内容）"""
    print("\n=== 测试 1: 所有平台基础热榜 ===")
    try:
        response = requests.get(
            f"{BASE_URL}/api/free/hot-rank",
            params={
                "platform": "all",
                "limit": 5,
                "enrich_content": False,
                "business_filter": False
            },
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            print(f"OK 状态: 成功")
            print(f"  微博: {len(data['data']['weibo'])} 条")
            print(f"  知乎: {len(data['data']['zhihu'])} 条")
            print(f"  百度: {len(data['data']['baidu'])} 条")
            print(f"  抖音: {len(data['data']['douyin'])} 条")
            print(f"  聚合: {len(data['aggregated'])} 条")

            if data['aggregated']:
                print(f"\n  前3条热榜:")
                for i, item in enumerate(data['aggregated'][:3], 1):
                    print(f"    {i}. [{item['platform']}] {item['title'][:40]}...")

            return True
        else:
            print(f"FAIL 失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"ERROR 错误: {e}")
        return False


def test_business_filter():
    """测试业务筛选"""
    print("\n=== 测试 2: 业务关键词筛选 ===")
    try:
        response = requests.get(
            f"{BASE_URL}/api/free/hot-rank",
            params={
                "platform": "all",
                "limit": 20,
                "enrich_content": False,
                "business_filter": True
            },
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            print(f"OK 状态: 成功")
            print(f"  业务相关热榜: {len(data['aggregated'])} 条")

            if data['aggregated']:
                print(f"\n  业务相关内容:")
                for i, item in enumerate(data['aggregated'][:5], 1):
                    keywords = item.get('matched_keywords', [])
                    print(f"    {i}. [{item['platform']}] {item['title'][:40]}...")
                    print(f"       关键词: {', '.join(keywords[:3])}")
            else:
                print("  当前热榜中没有匹配业务关键词的内容")

            return True
        else:
            print(f"FAIL 失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"FAIL 错误: {e}")
        return False


def test_content_enrichment():
    """测试内容增强"""
    print("\n=== 测试 3: 内容增强（前3条）===")
    try:
        response = requests.get(
            f"{BASE_URL}/api/free/hot-rank",
            params={
                "platform": "all",
                "limit": 5,
                "enrich_content": True,
                "business_filter": False
            },
            timeout=60
        )

        if response.status_code == 200:
            data = response.json()
            print(f"OK 状态: 成功")
            print(f"  耗时: {data.get('durationMs', 0):.2f} ms")
            print(f"  内容已增强: {data.get('content_enriched', False)}")

            if data['aggregated']:
                print(f"\n  增强后的内容示例:")
                for i, item in enumerate(data['aggregated'][:2], 1):
                    print(f"    {i}. [{item['platform']}] {item['title'][:40]}...")
                    summary = item.get('summary', '')
                    if summary and summary != item['title']:
                        print(f"       摘要: {summary[:80]}...")
                    else:
                        print(f"       摘要: (使用标题)")

            return True
        else:
            print(f"FAIL 失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"FAIL 错误: {e}")
        return False


def test_single_platform():
    """测试单个平台"""
    print("\n=== 测试 4: 单个平台（百度）===")
    try:
        response = requests.get(
            f"{BASE_URL}/api/free/hot-rank",
            params={
                "platform": "baidu",
                "limit": 5,
                "enrich_content": False,
                "business_filter": False
            },
            timeout=20
        )

        if response.status_code == 200:
            data = response.json()
            print(f"OK 状态: 成功")
            print(f"  百度热搜: {len(data['data'])} 条")

            if data['data']:
                print(f"\n  百度热搜前3条:")
                for i, item in enumerate(data['data'][:3], 1):
                    print(f"    {i}. {item['title'][:50]}...")
                    print(f"       热度: {item['hot_value']}")

            return True
        else:
            print(f"FAIL 失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"FAIL 错误: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("测试优化后的免费热榜 API")
    print("=" * 60)

    results = []

    # 测试 1: 基础热榜
    results.append(("基础热榜", test_all_platforms_basic()))

    # 测试 2: 业务筛选
    results.append(("业务筛选", test_business_filter()))

    # 测试 3: 内容增强
    results.append(("内容增强", test_content_enrichment()))

    # 测试 4: 单个平台
    results.append(("单个平台", test_single_platform()))

    # 总结
    print("\n" + "=" * 60)
    print("测试总结:")
    print("=" * 60)
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {name}: {status}")

    all_passed = all(passed for _, passed in results)
    if all_passed:
        print("\nOK 所有测试通过!")
    else:
        print("\nFAIL 部分测试失败")
