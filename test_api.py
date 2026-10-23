"""Acceptance test for api.py endpoints (Phase 5)."""

import sys
from fastapi.testclient import TestClient
from api import app, sim_manager

client = TestClient(app)


def test_api():
    print("Testing FastAPI endpoints...\n" + "=" * 50)

    # 1. Health check
    res_health = client.get("/health")
    assert res_health.status_code == 200, f"Health check failed: {res_health.status_code}"
    print(f"[PASS] /health: {res_health.json()}")

    # 2. Summary
    res_summary = client.get("/summary")
    assert res_summary.status_code == 200, f"Summary check failed: {res_summary.status_code}"
    print(f"[PASS] /summary: step={res_summary.json()['step']}, scenario={res_summary.json()['scenario']}")

    # 3. Spike injection
    res_spike = client.post("/spike", json={"slice": "embb", "factor": 2.5, "duration": 20})
    assert res_spike.status_code == 200, f"Spike injection failed: {res_spike.status_code}"
    print(f"[PASS] /spike: {res_spike.json()}")

    # 4. Simulation step telemetry verification
    payload = sim_manager.step_simulation()
    assert "policies" in payload, "Missing policies in step telemetry"
    assert "static" in payload["policies"]
    assert "heuristic" in payload["policies"]
    assert "agent" in payload["policies"]
    print(f"[PASS] step_simulation telemetry: step={payload['step']}, policies={list(payload['policies'].keys())}")

    # 5. Reset
    res_reset = client.post("/reset")
    assert res_reset.status_code == 200, f"Reset failed: {res_reset.status_code}"
    print(f"[PASS] /reset: {res_reset.json()}")

    print("=" * 50 + "\nAll API acceptance checks PASSED!")


if __name__ == "__main__":
    test_api()
    sys.exit(0)
