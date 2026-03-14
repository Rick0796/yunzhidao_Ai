#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""???????"""

from backend.main import CONFIG


def test_backend(client) -> None:
    assert CONFIG["baseUrl"]
    assert CONFIG["defaultModel"]
    assert CONFIG["port"] > 0

    response = client.get("/api/health")
    assert response.status_code == 200

    data = response.json()
    assert data["ok"] is True
    assert data["upstream"] == CONFIG["baseUrl"]
    assert data["defaultModel"] == CONFIG["defaultModel"]
    assert "freeData" in data
    assert "scriptLibrary" in data
