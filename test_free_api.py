"""
测试免费热榜和搜索接口
"""

import requests
import json


BASE_URL = "http://127.0.0.1:8787"


def test_health():
    """测试健康检查"""
    print("\n=== 测试健康检查 ===")
    response = requests.get(f"{BASE_URL}/api/health")
    print(f"状态码: {response.status_code}")
    print(f"响应: {json.dumps(response.json(), ensure_ascii=False, indent=2)}")


def test_free_hot_rank_weibo():
    """测试微博热搜"""
    print("\n=== 测试微博热搜 ===")
    response = requests.get(f"{BASE_URL}/api/free/hot-rank?platform=weibo&limit=5")
    print(f"状态码: {response.status_code}")
    data = response.json()
    print(f"获取到 {data.get('count', 0)} 条微博热搜")
    if data.get('data'):
        print("前3条:")
        for item in data['data'][:3]:
            print(f"  {item.get('rank')}. {item.get('title')} - {item.get('hot_value')}")


def test_free_hot_rank_zhihu():
    """测试知乎热榜"""
    print("\n=== 测试知乎热榜 ===")
    response = requests.get(f"{BASE_URL}/api/free/hot-rank?platform=zhihu&limit=5")
    print(f"状态码: {response.status_code}")
    data = response.json()
    print(f"获取到 {data.get('count', 0)} 条知乎热榜")
    if data.get('data'):
        print("前3条:")
        for item in data['data'][:3]:
            print(f"  {item.get('rank')}. {item.get('title')} - {item.get('hot_value')}")


def test_free_hot_rank_baidu():
    """测试百度热搜"""
    print("\n=== 测试百度热搜 ===")
    response = requests.get(f"{BASE_URL}/api/free/hot-rank?platform=baidu&limit=5")
    print(f"状态码: {response.status_code}")
    data = response.json()
    print(f"获取到 {data.get('count', 0)} 条百度热搜")
    if data.get('data'):
        print("前3条:")
        for item in data['data'][:3]:
            print(f"  {item.get('rank')}. {item.get('title')} - {item.get('hot_value')}")


def test_free_hot_rank_douyin():
    """测试抖音热榜"""
    print("\n=== 测试抖音热榜 ===")
    response = requests.get(f"{BASE_URL}/api/free/hot-rank?platform=douyin&limit=5")
    print(f"状态码: {response.status_code}")
    data = response.json()
    print(f"获取到 {data.get('count', 0)} 条抖音热榜")
    if data.get('data'):
        print("前3条:")
        for item in data['data'][:3]:
            print(f"  {item.get('rank')}. {item.get('title')} - {item.get('hot_value')}")


def test_free_hot_rank_all():
    """测试所有平台热榜"""
    print("\n=== 测试所有平台热榜 ===")
    response = requests.get(f"{BASE_URL}/api/free/hot-rank?platform=all&limit=5")
    print(f"状态码: {response.status_code}")
    data = response.json()
    print(f"聚合结果: {len(data.get('aggregated', []))} 条")
    for platform, items in data.get('data', {}).items():
        print(f"{platform}: {len(items)} 条")


def test_free_search():
    """测试免费搜索"""
    print("\n=== 测试免费搜索 ===")
    response = requests.post(
        f"{BASE_URL}/api/free/search",
        json={
            "query": "AI获客",
            "maxResults": 5,
            "fetchContent": False
        }
    )
    print(f"状态码: {response.status_code}")
    data = response.json()
    print(f"获取到 {data.get('count', 0)} 条搜索结果")
    if data.get('results'):
        print("前3条:")
        for item in data['results'][:3]:
            print(f"  - {item.get('title')}")
            print(f"    {item.get('url')}")


def test_free_manual_search():
    """测试免费主题搜索（兼容历史工作流入口）"""
    print("\n=== 测试免费主题搜索 ===")
    response = requests.post(
        f"{BASE_URL}/api/free/manual-search",
        json={
            "topicQuery": "人工智能"
        }
    )
    print(f"状态码: {response.status_code}")
    data = response.json()
    print(f"搜索主题: {data.get('topicQuery')}")
    print(f"搜索结果: {len(data.get('searchData', []))} 条")
    print(f"Fact Pack: {data.get('factPack', {}).get('topic')}")


def test_workflow_compat_endpoints():
    """测试历史工作流兼容入口是否正常"""
    print("\n=== 测试历史工作流兼容入口 ===")

    # 测试热榜接口
    try:
        response = requests.post(
            f"{BASE_URL}/api/workflows/hot-rank",
            json={"allLimit": 5, "businessLimit": 5}
        )
        print(f"兼容热榜接口状态码: {response.status_code}")
        if response.status_code == 200:
            print("✅ 兼容热榜接口正常")
        else:
            print(f"⚠️ 兼容热榜接口返回: {response.status_code}")
    except Exception as e:
        print(f"⚠️ 兼容热榜接口异常: {e}")

    # 测试搜索接口
    try:
        response = requests.post(
            f"{BASE_URL}/api/workflows/manual-search",
            json={"topicQuery": "测试"}
        )
        print(f"兼容搜索接口状态码: {response.status_code}")
        if response.status_code == 200:
            print("✅ 兼容搜索接口正常")
        else:
            print(f"⚠️ 兼容搜索接口返回: {response.status_code}")
    except Exception as e:
        print(f"⚠️ 兼容搜索接口异常: {e}")


if __name__ == "__main__":
    print("开始测试免费热榜和搜索接口...")
    print("=" * 60)

    try:
        test_health()
        test_free_hot_rank_weibo()
        test_free_hot_rank_zhihu()
        test_free_hot_rank_baidu()
        test_free_hot_rank_douyin()
        test_free_hot_rank_all()
        test_free_search()
        test_free_manual_search()
        test_workflow_compat_endpoints()

        print("\n" + "=" * 60)
        print("✅ 所有测试完成！")

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
