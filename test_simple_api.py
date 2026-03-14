"""?????? - ???????"""


def test_health(client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["workflowMode"] == "free"


def test_free_search(client) -> None:
    response = client.post("/api/free/search", json={"query": "AI", "maxResults": 3})
    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "AI"
    assert isinstance(data.get("results", []), list)
    assert data.get("count", 0) >= 0


def test_free_manual_search(client) -> None:
    response = client.post("/api/free/manual-search", json={"topicQuery": "AI"})
    assert response.status_code == 200
    data = response.json()
    assert data["topicQuery"] == "AI"
    assert isinstance(data.get("searchData", []), list)
    assert "factPack" in data


def test_old_endpoints(client) -> None:
    hot_rank_response = client.post("/api/workflows/hot-rank", json={"allLimit": 5, "businessLimit": 5})
    assert hot_rank_response.status_code == 200

    manual_search_response = client.post("/api/workflows/manual-search", json={"topicQuery": "test"})
    assert manual_search_response.status_code == 200
