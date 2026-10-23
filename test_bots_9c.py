"""Acceptance test suite for Phase 9c: Bot API endpoints and WebSockets (BT-12, BT-13)."""

import sys
from fastapi.testclient import TestClient
from api import app, sim_manager

client = TestClient(app)


def test_bt12_api_valid():
    """BT-12: POST /bots add 20 URLLC: counts update, all 3 policies see change at same step."""
    print("Testing BT-12: Valid bot API operations...")

    # 1. GET /bots
    res = client.get("/bots")
    assert res.status_code == 200
    data = res.json()
    assert "counts" in data and "max" in data
    assert data["counts"]["urllc"] == 30
    print(f"[PASS] GET /bots: counts={data['counts']}, max={data['max']}")

    # 2. POST /bots add 20 URLLC
    res_post = client.post("/bots", json={"slice": "urllc", "count": 20, "mode": "add"})
    assert res_post.status_code == 200
    res_data = res_post.json()
    assert res_data["counts"]["urllc"] == 50
    assert res_data["clipped"] is False
    print(f"[PASS] POST /bots add 20 URLLC: new count={res_data['counts']['urllc']}")

    # Verify all 3 policies see identical bot count at the same step
    assert sim_manager.env_static.bot_counts["urllc"] == 50
    assert sim_manager.env_heuristic.bot_counts["urllc"] == 50
    assert sim_manager.env_agent.bot_counts["urllc"] == 50

    # 3. Verify step payload contains bots and bot_packets
    payload = sim_manager.step_simulation()
    assert "bots" in payload
    assert payload["bots"]["urllc"] == 50
    assert "bot_packets" in payload
    print(f"[PASS] step_simulation telemetry includes bots={payload['bots']} and bot_packets={payload['bot_packets']}")

    # 4. POST /reset restores default counts
    res_reset = client.post("/reset")
    assert res_reset.status_code == 200
    res_after = client.get("/bots").json()
    assert res_after["counts"]["urllc"] == 30
    print(f"[PASS] POST /reset successfully restored default URLLC bots (30)")


def test_bt13_api_invalid():
    """BT-13: Invalid inputs (bad slice, negative count, bad mode, missing fields) return 4xx."""
    print("\nTesting BT-13: Invalid bot API operations...")

    # Bad slice
    res1 = client.post("/bots", json={"slice": "cloud_gaming", "count": 10, "mode": "add"})
    assert res1.status_code == 400, f"Expected 400 for bad slice, got {res1.status_code}"
    print(f"[PASS] Rejected bad slice: status={res1.status_code}, error={res1.json()}")

    # Negative count
    res2 = client.post("/bots", json={"slice": "urllc", "count": -5, "mode": "add"})
    assert res2.status_code in [400, 422], f"Expected 4xx for negative count, got {res2.status_code}"
    print(f"[PASS] Rejected negative count: status={res2.status_code}")

    # Bad mode
    res3 = client.post("/bots", json={"slice": "urllc", "count": 10, "mode": "explode"})
    assert res3.status_code in [400, 422], f"Expected 4xx for bad mode, got {res3.status_code}"
    print(f"[PASS] Rejected bad mode: status={res3.status_code}")

    # Missing fields
    res4 = client.post("/bots", json={"count": 10})
    assert res4.status_code in [400, 422], f"Expected 4xx for missing slice field, got {res4.status_code}"
    print(f"[PASS] Rejected missing fields: status={res4.status_code}")

    # Verify server is still operational
    res_health = client.get("/health")
    assert res_health.status_code == 200
    print("[PASS] Server remains fully operational after handling invalid inputs")


if __name__ == "__main__":
    print("Running Phase 9c API Acceptance Tests...\n" + "=" * 60)
    test_bt12_api_valid()
    test_bt13_api_invalid()
    print("=" * 60 + "\nAll Phase 9c Tests PASSED!")
    sys.exit(0)
