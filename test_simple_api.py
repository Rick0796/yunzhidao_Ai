"""
简单测试脚本 - 测试免费接口
"""

import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8787"


def test_health():
    """测试健康检查"""
    print("\n=== Health Check ===")
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            print("OK: Backend is running")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_free_search():
    """测试免费搜索"""
    print("\n=== Free Search Test ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/free/search",
            json={"query": "AI", "maxResults": 3},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Results: {data.get('count', 0)} items")
            for i, item in enumerate(data.get('results', [])[:2], 1):
                title = item.get('title', '')
                print(f"  {i}. {title[:50]}...")
            return True
        else:
            print(f"Error: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_free_manual_search():
    """测试免费主题搜索"""
    print("\n=== Free Manual Search Test ===")
    try:
        response = requests.post(
            f"{BASE_URL}/api/free/manual-search",
            json={"topicQuery": "AI"},
            timeout=30
        )
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Topic: {data.get('topicQuery')}")
            print(f"Results: {len(data.get('searchData', []))} items")
            fact_pack = data.get('factPack', {})
            print(f"Fact Pack: {fact_pack.get('topic', '')}")
            return True
        else:
            print(f"Error: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"Error: {e}")
        return False


def test_old_endpoints():
    """测试原有接口是否正常"""
    print("\n=== Old Endpoints Test ===")

    # 测试热榜接口（会降级到免费接口）
    try:
        response = requests.post(
            f"{BASE_URL}/api/workflows/hot-rank",
            json={"allLimit": 5, "businessLimit": 5},
            timeout=30
        )
        print(f"Hot Rank Status: {response.status_code}")
        if response.status_code == 200:
            print("OK: Hot rank endpoint works")
        else:
            print(f"Warning: {response.text[:100]}")
    except Exception as e:
        print(f"Hot Rank Error: {e}")

    # 测试搜索接口（会降级到免费接口）
    try:
        response = requests.post(
            f"{BASE_URL}/api/workflows/manual-search",
            json={"topicQuery": "test"},
            timeout=30
        )
        print(f"Manual Search Status: {response.status_code}")
        if response.status_code == 200:
            print("OK: Manual search endpoint works")
        else:
            print(f"Warning: {response.text[:100]}")
    except Exception as e:
        print(f"Manual Search Error: {e}")


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Free API Endpoints")
    print("=" * 60)

    results = []

    # 测试健康检查
    if not test_health():
        print("\nBackend is not running! Please start it first:")
        print("  python backend/main.py")
        sys.exit(1)

    # 测试免费搜索
    results.append(("Free Search", test_free_search()))

    # 测试免费主题搜索
    results.append(("Free Manual Search", test_free_manual_search()))

    # 测试原有接口
    test_old_endpoints()

    # 总结
    print("\n" + "=" * 60)
    print("Test Summary:")
    print("=" * 60)
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {name}: {status}")

    all_passed = all(passed for _, passed in results)
    if all_passed:
        print("\nAll tests passed!")
        sys.exit(0)
    else:
        print("\nSome tests failed!")
        sys.exit(1)
