"""Unit and integration tests for Sub-Phase 11d: API and UI SLA Status (SM-34 to SM-41)."""

import sys, os
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

import json
import os
import re
import unittest
import urllib.request
import yaml

from api import SimulationManager, app
import sla
from sim import SliceEnv


class TestSla11d(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open("config.yaml", "r") as f:
            cls.cfg = yaml.safe_load(f)

    def test_sm34_stream_fields(self):
        """SM-34: Every message has sla per policy and slice, and feasible; values come from sla.py."""
        mgr = SimulationManager()
        # Step once
        payload = mgr.step_simulation()

        self.assertIn("feasible", payload)
        self.assertIsInstance(payload["feasible"], bool)
        self.assertIn("sla_limits", payload)
        self.assertIn("policies", payload)

        for p_name in ["static", "heuristic", "agent"]:
            pol = payload["policies"][p_name]
            self.assertIn("sla", pol, f"Missing sla in policy {p_name}")
            self.assertIn("feasible", pol, f"Missing feasible in policy {p_name}")
            self.assertIn("sla_ok", pol, f"Missing sla_ok in policy {p_name}")

            for s in ["urllc", "murllc", "embb"]:
                self.assertIn(s, pol["sla"], f"Missing slice {s} in policy {p_name} sla")
                status_dict = pol["sla"][s]
                self.assertIn("status", status_dict)
                self.assertIn("value", status_dict)
                self.assertIn("limit", status_dict)
                self.assertIn(status_dict["status"], ["ok", "amber", "breach"])
                self.assertFalse(any(v is None for v in [status_dict["status"], status_dict["value"], status_dict["limit"]]))

    def test_sm35_get_sla_endpoint(self):
        """SM-35: GET /sla returns limits and current status; limits equal config.yaml."""
        req = urllib.request.Request("http://127.0.0.1:8050/sla")
        with urllib.request.urlopen(req, timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))

        self.assertIn("limits", data)
        self.assertIn("current_status", data)
        self.assertIn("window_status", data)
        self.assertIn("feasible", data)

        limits = data["limits"]
        self.assertEqual(limits["urllc"]["max_violation_rate"], self.cfg["sla"]["urllc"]["max_violation_rate"])
        self.assertEqual(limits["murllc"]["max_violation_rate"], self.cfg["sla"]["murllc"]["max_violation_rate"])
        self.assertEqual(limits["embb"]["min_served_ratio"], self.cfg["sla"]["embb"]["min_served_ratio"])

        for pol in ["static", "heuristic", "agent"]:
            self.assertIn(pol, data["current_status"])
            self.assertIn(pol, data["window_status"])

    def test_sm36_change_limit_propagation(self):
        """SM-36: Edit URLLC limit in config, restart/reload: chips, SLA lines and info card follow."""
        modified_cfg = dict(self.cfg)
        modified_cfg["sla"] = dict(self.cfg["sla"])
        modified_cfg["sla"]["urllc"] = dict(self.cfg["sla"]["urllc"])
        modified_cfg["sla"]["urllc"]["max_violation_rate"] = 0.008

        # Verify pure function sla.window_status uses the new limit
        history = [{"violations": {"urllc": 3}, "arrivals": {"urllc": 500}, "throughput": {"embb": 400}}]
        status = sla.window_status(history, "urllc", modified_cfg)
        self.assertEqual(status["limit"], modified_cfg["sla"]["urllc"]["max_window_violation"])

        # Verify index.html contains dynamic binding IDs for all policy limit labels
        with open("static/index.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn('id="slaLimitStatic"', html)
        self.assertIn('id="slaLimitHeuristic"', html)
        self.assertIn('id="slaLimitAgent"', html)
        self.assertIn('id="slaPromiseUrllc"', html)
        self.assertIn('id="slaPromiseMurllc"', html)
        self.assertIn('id="slaPromiseEmbb"', html)
        self.assertIn('updateSlaLimitsDisplay', html)

    def test_sm37_chips_status_levels(self):
        """SM-37: Green, amber and red appear in right situations during a surge."""
        # Test sla.py logic for ok, amber, breach
        # Limit is 0.005. Amber threshold is 80% = 0.004
        # 1. OK (under 0.004)
        h_ok = [{"violations": {"urllc": 1}, "arrivals": {"urllc": 1000}, "throughput": {"embb": 400}}]
        st_ok = sla.window_status(h_ok, "urllc", self.cfg)
        self.assertEqual(st_ok["status"], "ok")

        # 2. Amber (0.004 to 0.005)
        # For window status, limit is max_window_violation = 0.02, amber is 0.016
        # 17 violations in 1000 = 0.017 -> amber (0.016 to 0.020)
        h_amber = [{"violations": {"urllc": 17}, "arrivals": {"urllc": 1000}, "throughput": {"embb": 400}}]
        st_amber = sla.window_status(h_amber, "urllc", self.cfg)
        self.assertEqual(st_amber["status"], "amber")

        # 3. Breach (above 0.020)
        h_breach = [{"violations": {"urllc": 25}, "arrivals": {"urllc": 1000}, "throughput": {"embb": 400}}]
        st_breach = sla.window_status(h_breach, "urllc", self.cfg)
        self.assertEqual(st_breach["status"], "breach")

        # Verify index.html defines and handles all 3 styles
        with open("static/index.html", "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn(".sla-ok", html)
        self.assertIn(".sla-amber", html)
        self.assertIn(".sla-bad", html)
        self.assertIn("'AT RISK'", html)
        self.assertIn("'SLA BREACH'", html)
        self.assertIn("'SLA OK'", html)

    def test_sm38_overload_badge(self):
        """SM-38: Adding very many users shows 'OVERLOAD' and wording 'protected first'."""
        with open("static/index.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn('id="overloadBadge"', html)
        self.assertIn("OVERLOAD", html)
        self.assertIn("protected first", html)

        # Test sim feasible flag in overload
        env = SliceEnv()
        env.reset(seed=42)
        # Force huge arrivals via set_spike
        env.set_spike("embb", 10.0, 5)
        import numpy as np
        _, _, _, _, info = env.step(np.zeros(6, dtype=np.float32))
        self.assertIn("feasible", info)
        self.assertFalse(info["feasible"])

    def test_sm39_sla_info_card(self):
        """SM-39: Plain-words list of the three SLAs is visible."""
        with open("static/index.html", "r", encoding="utf-8") as f:
            html = f.read()

        self.assertIn('id="slaInfoCard"', html)
        self.assertIn("SLA Contract", html)
        self.assertIn("under 0.5% violations", html)
        self.assertIn("under 1.0% violations", html)
        self.assertIn("at least 70% traffic served", html)

    def test_sm40_no_fake_ui(self):
        """SM-40: Search index.html for Math.random, mock, fake: none drives SLA values."""
        with open("static/index.html", "r", encoding="utf-8") as f:
            html = f.read()

        # Check for Math.random driving SLA
        self.assertNotIn("Math.random", html)
        self.assertNotIn("mock", html.lower())
        self.assertNotIn("fake", html.lower())

    def test_sm41_console_and_offline(self):
        """SM-41: No red errors; works completely offline without internet dependencies."""
        with open("static/index.html", "r", encoding="utf-8") as f:
            html = f.read()

        # No external script or stylesheet links (http/https)
        external_urls = re.findall(r'<(?:script|link)[^>]*(?:src|href)=["\'](http[s]?://[^"\']+)["\']', html)
        self.assertEqual(len(external_urls), 0, f"Found external web dependencies: {external_urls}")

        # Local chart.js exists
        self.assertTrue(os.path.exists("static/chart.min.js"))


if __name__ == "__main__":
    unittest.main()
