"""????????????"""


def test_health(client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True


def test_free_hot_rank_weibo(client) -> None:
    response = client.get("/api/free/hot-rank", params={"platform": "weibo", "limit": 5})
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "weibo"
    assert isinstance(data.get("data", []), list)


def test_free_hot_rank_zhihu(client) -> None:
    response = client.get("/api/free/hot-rank", params={"platform": "zhihu", "limit": 5})
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "zhihu"
    assert isinstance(data.get("data", []), list)


def test_free_hot_rank_baidu(client) -> None:
    response = client.get("/api/free/hot-rank", params={"platform": "baidu", "limit": 5})
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "baidu"
    assert isinstance(data.get("data", []), list)


def test_free_hot_rank_douyin(client) -> None:
    response = client.get("/api/free/hot-rank", params={"platform": "douyin", "limit": 5})
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "douyin"
    assert isinstance(data.get("data", []), list)


def test_free_hot_rank_all(client) -> None:
    response = client.get("/api/free/hot-rank", params={"platform": "all", "limit": 5})
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "all"
    assert isinstance(data.get("aggregated", []), list)
    assert isinstance(data.get("data", {}), dict)


def test_free_search(client) -> None:
    response = client.post("/api/free/search", json={"query": "AI??", "maxResults": 5, "fetchContent": False})
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "AI??"
    assert isinstance(data.get("results", []), list)


def test_free_manual_search(client) -> None:
    response = client.post("/api/free/manual-search", json={"topicQuery": "????"})
    assert response.status_code == 200
    data = response.json()
    assert data["topicQuery"] == "????"
    assert isinstance(data.get("searchData", []), list)
    assert "factPack" in data


def test_workflow_compat_endpoints(client) -> None:
    hot_rank_response = client.post("/api/workflows/hot-rank", json={"allLimit": 5, "businessLimit": 5})
    assert hot_rank_response.status_code == 200

    manual_search_response = client.post("/api/workflows/manual-search", json={"topicQuery": "??"})
    assert manual_search_response.status_code == 200
