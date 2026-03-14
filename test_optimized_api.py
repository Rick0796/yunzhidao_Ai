"""?????????? API?"""


def test_all_platforms_basic(client) -> None:
    response = client.get(
        "/api/free/hot-rank",
        params={"platform": "all", "limit": 5, "enrich_content": False, "business_filter": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "all"
    assert isinstance(data.get("data", {}), dict)
    assert isinstance(data.get("aggregated", []), list)


def test_business_filter(client) -> None:
    response = client.get(
        "/api/free/hot-rank",
        params={"platform": "all", "limit": 20, "enrich_content": False, "business_filter": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "all"
    assert isinstance(data.get("aggregated", []), list)


def test_content_enrichment(client) -> None:
    response = client.get(
        "/api/free/hot-rank",
        params={"platform": "all", "limit": 5, "enrich_content": True, "business_filter": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "all"
    assert isinstance(data.get("aggregated", []), list)


def test_single_platform(client) -> None:
    response = client.get(
        "/api/free/hot-rank",
        params={"platform": "baidu", "limit": 5, "enrich_content": False, "business_filter": False},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "baidu"
    assert isinstance(data.get("data", []), list)
