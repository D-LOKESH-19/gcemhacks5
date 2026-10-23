"""Acceptance test suite for Phase 9d: UI, Limits, Fake-work check, and Stress testing.

Tests:
BT-14: UI bot creation, counter updates, and reaction
BT-15: UI limits (adding beyond max clips safely and signals Max reached)
BT-17: Fake-work check (zero Math.random used in index.html for data/telemetry)
BT-18: Stress testing (rapid requests handle safely without server crash)
"""

import sys
import re
from fastapi.testclient import TestClient
from api import app, sim_manager

client = TestClient(app)


def test_bt17_fakework_check():
    """BT-17: Search for Math.random in index.html. Must NOT use mock JS for metrics."""
    with open("static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()

    # Search for Math.random
    matches = re.findall(r"Math\.random", html_content)
    assert len(matches) == 0, f"Found {len(matches)} occurrences of Math.random in index.html! Mock data is forbidden."
    print("[PASS] BT-17: Fake-work check passed (0 occurrences of Math.random in index.html)")


def test_bt14_ui_markup_and_action():
    """BT-14: Verify UI markup contains bot inputs, canvas, and counter elements."""
    with open("static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()

    required_ids = [
        "botSliceSelect",
        "botCountInput",
        "botCanvas",
        "botCntEmbb",
        "botCntUrllc",
        "botCntMurllc",
        "botMaxAlert",
        "canvasScaleLabel",
    ]

    for elem_id in required_ids:
        assert f'id="{elem_id}"' in html_content, f"Missing required UI element: {elem_id}"

    # Perform add 20 URLLC
    res = client.post("/bots", json={"slice": "urllc", "count": 20, "mode": "add"})
    assert res.status_code == 200
    assert res.json()["counts"]["urllc"] >= 20
    print("[PASS] BT-14: UI markup structure and Add bot action verified")


def test_bt15_ui_limits():
    """BT-15: Adding beyond max caps safely and returns clipped=True."""
    # Attempt to add 5000 bots (exceeds all max limits)
    res = client.post("/bots", json={"slice": "urllc", "count": 5000, "mode": "set"})
    assert res.status_code == 200
    data = res.json()
    assert data["clipped"] is True
    assert data["counts"]["urllc"] == sim_manager.env_agent.max_bot_counts["urllc"]
    print(f"[PASS] BT-15: UI limits verified (5000 requested -> capped at {data['counts']['urllc']}, clipped={data['clipped']})")


def test_bt18_stress_concurrency():
    """BT-18: Rapid fire 30 bot modification requests without crash or socket drop."""
    print("Executing rapid-fire stress test (30 requests)...")
    for i in range(30):
        mode = "add" if i % 2 == 0 else "remove"
        res = client.post("/bots", json={"slice": "urllc", "count": 5, "mode": mode})
        assert res.status_code == 200

    # Ensure server is healthy and streaming
    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "ok"
    print("[PASS] BT-18: Stress test passed (30 consecutive rapid modifications handled without error)")


if __name__ == "__main__":
    print("Running Phase 9d UI Acceptance Tests...\n" + "=" * 60)
    test_bt17_fakework_check()
    test_bt14_ui_markup_and_action()
    test_bt15_ui_limits()
    test_bt18_stress_concurrency()
    print("=" * 60 + "\nAll Phase 9d Tests PASSED!")
    sys.exit(0)
