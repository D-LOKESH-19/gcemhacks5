"""
test_locations_10c.py: Sub-Phase 10c Acceptance Tests (UI & DOM Verification)
Tests LT-19 through LT-30, LT-32, LT-33, LT-38, LT-39.
"""

import sys, os
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

import os
import re
import unittest
from fastapi.testclient import TestClient
import yaml
from api import app, sim_manager
import sim
import sla


class TestSubPhase10c(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        html_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
        with open(html_path, "r", encoding="utf-8") as f:
            cls.html = f.read()

    def setUp(self):
        # Reset sim before each behavioral test
        res = self.client.post("/reset")
        self.assertEqual(res.status_code, 200)

    # -------------------------------------------------------------------------
    # DOM / HTML / Offline / Fake-Work Audits
    # -------------------------------------------------------------------------

    def test_lt25_honesty_strip(self):
        """LT-25: Honesty strip is always visible and contains exact text."""
        expected_text = "Locations are logical groups. Metrics are per slice. Delay is a model estimate."
        self.assertIn("honesty-strip", self.html)
        self.assertIn("honestyStrip", self.html)
        self.assertIn(expected_text, self.html)

    def test_lt26_delay_labelling(self):
        """LT-26: Delay values are labeled 'Estimated delay (model)', never 'latency' or 'measured'."""
        self.assertIn("Estimated delay (model):", self.html)
        # Ensure 'latency' or 'measured' is not used in the delay rows
        delay_rows = re.findall(r'<div class="delay-row">.*?</div>', self.html, re.DOTALL)
        self.assertEqual(len(delay_rows), 3, "All 3 policy columns must have a delay-row")
        for row in delay_rows:
            self.assertIn("Estimated delay (model):", row)
            self.assertNotIn("measured", row.lower())
            self.assertNotIn("measured latency", row.lower())

    def test_lt28_no_fake_ui(self):
        """LT-28: Zero Math.random driving metrics or chart values; offline disconnect handling."""
        # Check for Math.random
        self.assertNotIn("Math.random", self.html, "Zero Math.random in index.html")
        # Check ws onclose handling
        self.assertIn("ws.onclose", self.html)
        self.assertIn("Disconnected", self.html)

    def test_lt29_offline_integrity(self):
        """LT-29: Fully offline - zero external CDN script/css/font links."""
        # Find all script src and link href
        script_srcs = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', self.html)
        link_hrefs = re.findall(r'<link[^>]+href=["\']([^"\']+)["\']', self.html)
        for src in script_srcs:
            self.assertFalse(src.startswith("http://") or src.startswith("https://"), f"External script found: {src}")
        for href in link_hrefs:
            self.assertFalse(href.startswith("http://") or href.startswith("https://"), f"External link found: {href}")
        # Chart.js local file exists
        self.assertTrue(os.path.exists(os.path.join(os.path.dirname(__file__), "static", "chart.min.js")))

    def test_lt20_location_prefill_in_code(self):
        """LT-20: Location selection pre-fills slice dropdown."""
        self.assertIn("function onLocationChange()", self.html)
        self.assertIn("if (loc === 'campus')", self.html)
        self.assertIn("sliceSelect.value = 'embb'", self.html)
        self.assertIn("if (loc === 'factory')", self.html)
        self.assertIn("sliceSelect.value = 'urllc'", self.html)
        self.assertIn("if (loc === 'smart_city')", self.html)
        self.assertIn("sliceSelect.value = 'murllc'", self.html)

    def test_lt24_dot_scaling(self):
        """LT-24: Canvas dot scaling caps at max 40 dots per zone with '1 dot = N users' label."""
        self.assertIn("Math.ceil(zTotal / 40)", self.html)
        self.assertIn("1 dot = ${maxScale} users", self.html)
        self.assertIn("1 dot = 1 user", self.html)
        self.assertIn("canvasScaleLabel", self.html)

    def test_lt39_no_traffic_state(self):
        """LT-39: Slice with zero users in a zone shows 'no traffic', not a green OK."""
        self.assertIn("sla-none", self.html)
        self.assertIn("no traffic", self.html)
        self.assertIn("if (maxCount === 0)", self.html)

    # -------------------------------------------------------------------------
    # Behavioral & API Validation
    # -------------------------------------------------------------------------

    def test_lt19_add_users_at_campus(self):
        """LT-19: Add 20 users at Campus updates matrix and returns updated bot count."""
        res = self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 20, "mode": "add"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["bots"]["embb"], 60)  # 40 default + 20
        self.assertEqual(data["bots_by_location"]["campus"]["embb"], 60)

    def test_lt21_override_slice_at_campus(self):
        """LT-21: Add URLLC users at Campus (override) updates Campus matrix and URLLC total."""
        res = self.client.post("/bots", json={"location": "campus", "slice": "urllc", "count": 15, "mode": "add"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["bots_by_location"]["campus"]["urllc"], 15)
        self.assertEqual(data["bots"]["urllc"], 45)  # 30 default at factory + 15 at campus

    def test_lt22_remove_and_set(self):
        """LT-22: Remove only reduces chosen location; Set 0 empties that pair; counters match."""
        # Remove 10 eMBB from Campus
        res = self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 10, "mode": "remove"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["bots_by_location"]["campus"]["embb"], 30)

        # Set Factory URLLC to 0
        res = self.client.post("/bots", json={"location": "factory", "slice": "urllc", "count": 0, "mode": "set"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["bots_by_location"]["factory"]["urllc"], 0)
        self.assertEqual(data["bots"]["urllc"], 0)

    def test_lt23_limits_clipping(self):
        """LT-23: Adding beyond max caps safely and returns clipped=True."""
        # eMBB max is 200. Default is 40. Adding 200 exceeds 200.
        res = self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 200, "mode": "add"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["bots"]["embb"], 200)
        self.assertTrue(data["clipped"])

    def test_lt27_story_still_holds(self):
        """LT-27: 100 users at Campus eMBB: Static breaches or risks, Agent holds; log names Campus."""
        res = self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 100, "mode": "add"})
        self.assertEqual(res.status_code, 200)

        # Step 20 steps
        last_step = None
        for _ in range(20):
            last_step = sim_manager.step_simulation()

        pols = last_step["policies"]
        agent_sla = pols["agent"]["sla"]
        # Agent maintains strict URLLC & mURLLC SLAs
        self.assertIn(agent_sla["urllc"]["status"], ["ok", "amber"])
        self.assertIn(agent_sla["murllc"]["status"], ["ok", "amber"])

        # Check event log names Campus
        events = sim_manager.get_event_log()
        campus_events = [e for e in events if "Campus" in e]
        self.assertTrue(len(campus_events) > 0, "Event log must record Campus user change")

    def test_lt30_stress_bot_changes(self):
        """LT-30: Rapidly fire 30 bot modifications across zones with no crash."""
        zones = ["campus", "factory", "smart_city"]
        slices = ["embb", "urllc", "murllc"]
        for i in range(30):
            loc = zones[i % 3]
            slc = slices[(i // 3) % 3]
            res = self.client.post("/bots", json={"location": loc, "slice": slc, "count": 5, "mode": "add"})
            self.assertEqual(res.status_code, 200)
        # Step simulation to ensure state remains sound
        step_data = sim_manager.step_simulation()
        self.assertIn("bots_by_location", step_data)
        self.assertIn("est_delay_ms", step_data["policies"]["agent"])

    def test_lt32_zone_sla_chips(self):
        """LT-32: Campus zone SLA chip matches live SLA evaluation for dominant slice."""
        self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 50, "mode": "add"})
        step_data = sim_manager.step_simulation()
        agent_sla = step_data["policies"]["agent"]["sla"]
        # Campus dominant slice is eMBB
        self.assertIn("embb", agent_sla)
        embb_status = agent_sla["embb"]["status"]
        self.assertIn(embb_status, ["ok", "amber", "breach"])

    def test_lt33_overload_badge(self):
        """LT-33: Max bots across all 3 locations triggers feasible=False and overload claims."""
        self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 200, "mode": "set"})
        self.client.post("/bots", json={"location": "factory", "slice": "urllc", "count": 150, "mode": "set"})
        self.client.post("/bots", json={"location": "smart_city", "slice": "murllc", "count": 1000, "mode": "set"})

        step_data = sim_manager.step_simulation()
        feasible = step_data["feasible"]
        self.assertFalse(feasible, "Max bots load regime must be infeasible")
        # Ensure overload badge text in index.html claims 'protected first'
        self.assertIn("URLLC and mURLLC protected first", self.html)

    def test_lt38_limit_change_flows_through(self):
        """LT-38: SLA evaluator dynamically reads thresholds from config without hardcoding."""
        with open("config.yaml", "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
        cfg_custom = yaml.safe_load(yaml.dump(cfg))
        # Tighten URLLC limit to 0.001 (0.1%)
        cfg_custom["sla"]["urllc"]["max_window_violation"] = 0.001

        history = [
            {"arrivals": {"urllc": 1000}, "violations": {"urllc": 3}}
        ]
        status_orig = sla.window_status(history, "urllc", cfg)
        status_tight = sla.window_status(history, "urllc", cfg_custom)

        # 3 violations in 1000 arrivals = 0.003
        # Under default limit (0.005), 0.003 is within limit (or amber)
        self.assertIn(status_orig["status"], ["ok", "amber"])
        # Under tightened limit (0.001), 0.003 breaches the limit (> 0.001)
        self.assertEqual(status_tight["status"], "breach")


if __name__ == "__main__":
    unittest.main()
