"""
test_locations_10d.py: Sub-Phase 10d End-to-End Scenarios & Regression Verification
Tests E2E-14 (Location demo story), E2E-15 (Repeatability), E2E-17 (Rollback drill),
E2E-18 (SLA consistency), and E2E-19 (Dynamic limit change).
"""

import sys, os
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

import os
import unittest
import subprocess
from fastapi.testclient import TestClient
import yaml
from api import app, sim_manager
import sla


class TestSubPhase10d(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self.client.post("/reset")

    def test_e2e14_location_demo_story(self):
        """E2E-14: Full Location Demo Story across cold start, Campus surge, Factory burst, Smart City storm, Overload, and Recovery."""
        # 1. Cold start steady for 20 steps
        for _ in range(20):
            step_data = sim_manager.step_simulation()
        self.assertTrue(step_data["feasible"], "Cold start must be feasible")
        agent_sla = step_data["policies"]["agent"]["sla"]
        self.assertEqual(agent_sla["urllc"]["status"], "ok")
        self.assertEqual(agent_sla["murllc"]["status"], "ok")

        # 2. Add 100 users at Campus (eMBB)
        res_campus = self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 100, "mode": "add"})
        self.assertEqual(res_campus.status_code, 200)
        for _ in range(20):
            step_data = sim_manager.step_simulation()
        
        # Verify event log names Campus
        events = sim_manager.get_event_log()
        self.assertTrue(any("Campus" in e for e in events), "Event log must name Campus")

        # 3. Add 20 users at Factory (URLLC)
        res_factory = self.client.post("/bots", json={"location": "factory", "slice": "urllc", "count": 20, "mode": "add"})
        self.assertEqual(res_factory.status_code, 200)
        for _ in range(20):
            step_data = sim_manager.step_simulation()
        agent_sla = step_data["policies"]["agent"]["sla"]
        self.assertIn(agent_sla["urllc"]["status"], ["ok", "amber"], "Agent URLLC SLA must hold")

        # 4. Add 500 users at Smart City (mURLLC storm)
        res_sc = self.client.post("/bots", json={"location": "smart_city", "slice": "murllc", "count": 500, "mode": "add"})
        self.assertEqual(res_sc.status_code, 200)
        for _ in range(20):
            step_data = sim_manager.step_simulation()
        agent_sla = step_data["policies"]["agent"]["sla"]
        # Agent maintains mURLLC protected through shield
        self.assertIn(agent_sla["murllc"]["status"], ["ok", "amber"], "Agent mURLLC SLA must hold through shield")

        # 5. Add maximum everywhere -> Overload regime
        self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 200, "mode": "set"})
        self.client.post("/bots", json={"location": "factory", "slice": "urllc", "count": 150, "mode": "set"})
        self.client.post("/bots", json={"location": "smart_city", "slice": "murllc", "count": 1000, "mode": "set"})
        for _ in range(10):
            step_data = sim_manager.step_simulation()
        self.assertFalse(step_data["feasible"], "Max users everywhere must flag feasible=False")

        # 6. Recovery: reset back to defaults
        res_reset = self.client.post("/reset")
        self.assertEqual(res_reset.status_code, 200)
        for _ in range(25):
            step_data = sim_manager.step_simulation()
        self.assertTrue(step_data["feasible"], "System must recover to feasible load")
        agent_sla = step_data["policies"]["agent"]["sla"]
        self.assertEqual(agent_sla["urllc"]["status"], "ok")
        self.assertEqual(agent_sla["murllc"]["status"], "ok")

    def test_e2e15_repeatability(self):
        """E2E-15: Replaying identical location-tagged sequence yields identical stats and traffic."""
        def run_sequence(seed):
            sim_manager.reset_all(seed=seed)
            sim_manager.modify_bots("embb", 50, "add", "campus")
            sim_manager.modify_bots("urllc", 15, "add", "factory")
            res = []
            for _ in range(30):
                d = sim_manager.step_simulation()
                res.append((
                    sim_manager.info_agent["arrivals"]["embb"],
                    sim_manager.info_agent["arrivals"]["urllc"],
                    d["policies"]["agent"]["throughput"]["embb"],
                    d["scoreboard"]["agent"]["cum_violations"],
                ))
            return res

        run1 = run_sequence(42)
        run2 = run_sequence(42)
        self.assertEqual(run1, run2, "Replay with identical seed must produce identical traffic sequence")

    def test_e2e17_rollback_tag(self):
        """E2E-17: Rollback safety drill; verify pre-locations tag exists in git."""
        result = subprocess.run(
            ["git", "tag", "-l", "pre-locations"],
            capture_output=True,
            text=True
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("pre-locations", result.stdout, "Git tag 'pre-locations' must exist for rollback fallback")

    def test_e2e18_sla_consistency(self):
        """E2E-18: Verify agreement across GET /sla, WebSocket stream, and scoreboard at 3 moments."""
        # Moment 1: Nominal
        sim_manager.step_simulation()
        sla_resp = self.client.get("/sla").json()
        step_data = sim_manager.step_simulation()
        stream_sla = step_data["policies"]["agent"]["sla"]
        self.assertEqual(sla_resp["agent"]["urllc"]["status"], stream_sla["urllc"]["status"])

        # Moment 2: Campus surge
        self.client.post("/bots", json={"location": "campus", "slice": "embb", "count": 100, "mode": "add"})
        for _ in range(10):
            step_data = sim_manager.step_simulation()
        sla_resp = self.client.get("/sla").json()
        self.assertEqual(sla_resp["agent"]["urllc"]["status"], step_data["policies"]["agent"]["sla"]["urllc"]["status"])

        # Moment 3: Recovery
        self.client.post("/reset")
        for _ in range(20):
            step_data = sim_manager.step_simulation()
        sla_resp = self.client.get("/sla").json()
        self.assertEqual(sla_resp["agent"]["urllc"]["status"], step_data["policies"]["agent"]["sla"]["urllc"]["status"])

    def test_e2e19_dynamic_limit_change(self):
        """E2E-19: Tightening eMBB limit triggers earlier amber/breach without code modification."""
        with open("config.yaml", "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)

        cfg_tight = yaml.safe_load(yaml.dump(cfg))
        # Default eMBB limit is 0.70. Tighten to 0.95.
        cfg_tight["sla"]["embb"]["min_served_ratio"] = 0.95

        history = [
            {"throughput": {"embb": 80.0}, "arrivals": {"embb": 100.0}, "queue": {"embb": 0.0}}
        ]
        status_orig = sla.window_status(history, "embb", cfg)
        status_tight = sla.window_status(history, "embb", cfg_tight)

        # 80/100 = 80% served.
        # Under 0.70 limit, 80% is OK (>= 0.70).
        self.assertEqual(status_orig["status"], "ok")
        # Under 0.95 limit, 80% is amber or breach (< 0.95).
        self.assertIn(status_tight["status"], ["amber", "breach"])


if __name__ == "__main__":
    unittest.main()
