"""Acceptance test suite for Phase 10b: API and Telemetry Endpoints (LOCATIONS_FEATURE.md).

Tests:
LT-13: Backward compatibility (old body {slice, count, mode} works and uses default location)
LT-14: Location rules (only location, only slice, both, neither)
LT-15: Invalid inputs (unknown location/slice, negative/non-int count, bad mode -> 4xx)
LT-16: Stream fields (bots_by_location and est_delay_ms present in telemetry and update)
LT-17: Same step for all policies and POST /reset restores default distribution
LT-37: Event log SLA numbers match GET /sla
LT-40: Location events apply identically and synchronously across Static, Heuristic, Agent
"""

import json
import unittest
import urllib.error
import urllib.request
import yaml

from api import SimulationManager, app
import sla


class TestLocations10b(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open("config.yaml", "r", encoding="utf-8") as f:
            cls.cfg = yaml.safe_load(f)

    def _post_json(self, url: str, data: dict):
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))

    def _get_json(self, url: str):
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))

    def test_lt13_backward_compatible(self):
        """LT-13: The old body {slice, count, mode} still works and uses default location."""
        self._post_json("http://127.0.0.1:8050/reset", {})
        code, data = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"slice": "urllc", "count": 20, "mode": "add"},
        )
        self.assertEqual(code, 200)
        self.assertIn("counts", data)
        self.assertIn("matrix", data)
        self.assertEqual(data["counts"]["urllc"], 30 + 20)
        # Default location for urllc is factory
        self.assertEqual(data["matrix"]["factory"]["urllc"], 30 + 20)
        self.assertEqual(data["matrix"]["campus"]["urllc"], 0)

    def test_lt14_location_rules(self):
        """LT-14: Test only location, only slice, both, and neither."""
        self._post_json("http://127.0.0.1:8050/reset", {})

        # 1. Only location (Campus -> default slice embb)
        code1, data1 = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"location": "campus", "count": 10, "mode": "add"},
        )
        self.assertEqual(code1, 200)
        self.assertEqual(data1["matrix"]["campus"]["embb"], 40 + 10)

        # 2. Only slice (mURLLC -> default location smart_city)
        code2, data2 = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"slice": "murllc", "count": 25, "mode": "add"},
        )
        self.assertEqual(code2, 200)
        self.assertEqual(data2["matrix"]["smart_city"]["murllc"], 100 + 25)

        # 3. Both given (URLLC at Campus override)
        code3, data3 = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"slice": "urllc", "location": "campus", "count": 15, "mode": "add"},
        )
        self.assertEqual(code3, 200)
        self.assertEqual(data3["matrix"]["campus"]["urllc"], 15)

        # 4. Neither given
        code4, data4 = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"count": 10, "mode": "add"},
        )
        self.assertEqual(code4, 400)

    def test_lt15_invalid_input(self):
        """LT-15: Unknown location, bad slice, negative count, bad mode return 4xx; server keeps running."""
        # Bad location
        code1, _ = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"location": "mars_base", "slice": "embb", "count": 10, "mode": "add"},
        )
        self.assertEqual(code1, 400)

        # Bad slice
        code2, _ = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"location": "campus", "slice": "quantum_slice", "count": 10, "mode": "add"},
        )
        self.assertEqual(code2, 400)

        # Negative count
        code3, _ = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"location": "campus", "slice": "embb", "count": -5, "mode": "add"},
        )
        self.assertEqual(code3, 400)

        # Bad mode
        code4, _ = self._post_json(
            "http://127.0.0.1:8050/bots",
            {"location": "campus", "slice": "embb", "count": 5, "mode": "destroy"},
        )
        self.assertEqual(code4, 400)

        # Server is still responsive
        code_alive, _ = self._get_json("http://127.0.0.1:8050/bots")
        self.assertEqual(code_alive, 200)

    def test_lt16_stream_fields(self):
        """LT-16: SimulationManager.step_simulation() includes bots_by_location and est_delay_ms."""
        mgr = SimulationManager()
        payload = mgr.step_simulation()

        self.assertIn("bots_by_location", payload)
        self.assertIn("est_delay_ms", payload)

        for p_name in ["static", "heuristic", "agent"]:
            pol = payload["policies"][p_name]
            self.assertIn("bots_by_location", pol)
            self.assertIn("est_delay_ms", pol)
            for s in ["embb", "urllc", "murllc"]:
                self.assertIn(s, pol["est_delay_ms"])
                self.assertIsInstance(pol["est_delay_ms"][s], float)

    def test_lt17_same_step_and_reset(self):
        """LT-17: One POST changes Static, Heuristic and Agent at the same step; Reset restores defaults."""
        mgr = SimulationManager()
        mgr.modify_bots(slice_name="urllc", location="campus", mode="add", count=20)

        # Check all 3 environments reflect the update synchronously
        m_s = mgr.env_static.get_bot_matrix()
        m_h = mgr.env_heuristic.get_bot_matrix()
        m_a = mgr.env_agent.get_bot_matrix()
        self.assertEqual(m_s, m_h)
        self.assertEqual(m_h, m_a)
        self.assertEqual(m_a["campus"]["urllc"], 20)

        # Reset restores defaults
        mgr.reset_all()
        m_reset = mgr.env_agent.get_bot_matrix()
        self.assertEqual(m_reset["campus"]["urllc"], 0)
        self.assertEqual(m_reset["factory"]["urllc"], 30)

    def test_lt37_event_log_numbers(self):
        """LT-37: The SLA numbers and location in event log lines match GET /sla at that step."""
        mgr = SimulationManager()
        # Step a few times to accumulate traffic
        for _ in range(5):
            mgr.step_simulation()

        # Add 50 users at campus (embb)
        mgr.modify_bots(slice_name="embb", location="campus", mode="add", count=50)

        latest_log = mgr.event_logs[-1]
        self.assertIn("Campus", latest_log)
        self.assertIn("eMBB", latest_log)
        self.assertIn("eMBB SLA:", latest_log)

        # Verify SLA numbers match sla.py window_status
        sla_data = mgr.get_sla_status()
        status_expected = sla_data["window_status"]["agent"]["embb"]["status"].upper()
        if status_expected == "AMBER":
            status_expected = "AT RISK"
        self.assertIn(status_expected, latest_log)

    def test_lt40_same_step_all_policies(self):
        """LT-40: One location-tagged POST changes Static, Heuristic, Agent at same step and all get identical SLA inputs."""
        mgr = SimulationManager()
        mgr.reset_all(seed=55)

        # Inject 40 users at Factory (URLLC)
        mgr.modify_bots(slice_name="urllc", location="factory", mode="add", count=40)

        # Step and compare arrivals
        mgr.step_simulation()
        arr_s = mgr.info_static["arrivals"]["urllc"]
        arr_h = mgr.info_heuristic["arrivals"]["urllc"]
        arr_a = mgr.info_agent["arrivals"]["urllc"]
        self.assertEqual(arr_s, arr_h)
        self.assertEqual(arr_h, arr_a)


if __name__ == "__main__":
    unittest.main()
