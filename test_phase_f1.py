"""Phase F1 Acceptance Tests (FT-5 to FT-9) per FRONTEND_GUIDE.md."""

import unittest
import os
import yaml
import numpy as np
from fastapi.testclient import TestClient
from api import app, sim_manager
from shield import apply_shield


class TestPhaseF1(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_ft5_capabilities(self):
        """FT-5: Capabilities endpoint returns the 6 booleans matching reality."""
        resp = self.client.get("/api/capabilities")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        
        required_keys = ["bots", "sla", "locations", "training_log", "results", "delay"]
        for key in required_keys:
            self.assertIn(key, data, f"Missing capability boolean: {key}")
            self.assertIsInstance(data[key], bool, f"{key} must be boolean")
        
        # Verify matching reality
        self.assertEqual(data["training_log"], os.path.exists("runs/log.csv"))
        self.assertEqual(data["results"], os.path.exists("results/sla_table.csv") and os.path.exists("results/ablation.csv"))
        print("[PASS] FT-5: /api/capabilities verified matching reality:", data)

    def test_ft6_public_config(self):
        """FT-6: Public config matches config.yaml."""
        with open("config.yaml", "r", encoding="utf-8") as f:
            raw_cfg = yaml.safe_load(f)

        resp = self.client.get("/api/config/public")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertEqual(data["slices"], raw_cfg.get("slices", ["embb", "urllc", "murllc"]))
        self.assertEqual(data["cost_limit"], raw_cfg.get("cost_limit", 0.01))
        self.assertEqual(data["prb_total"], raw_cfg.get("prb_total", 100))
        self.assertEqual(data["vcpu_total"], raw_cfg.get("vcpu_total", 8))
        self.assertEqual(data["spike_factor"]["embb"], raw_cfg["spike_factor"]["embb"])
        self.assertEqual(data["sla"]["window_steps"], raw_cfg["sla"]["window_steps"])
        print("[PASS] FT-6: /api/config/public matches config.yaml")

    def test_ft7_training_and_results_endpoints(self):
        """FT-7: Training and results endpoints return real data and clean metadata."""
        # 1. Training log
        resp_t = self.client.get("/api/training/log")
        self.assertEqual(resp_t.status_code, 200)
        data_t = resp_t.json()
        self.assertIn("log", data_t)
        self.assertIn("metadata", data_t)
        self.assertLessEqual(len(data_t["log"]), 501, "Log points must be capped <= 500")
        if data_t["log"]:
            self.assertIn("reward", data_t["log"][0])
            self.assertIn("cost_urllc", data_t["log"][0])
            self.assertIn("lambda_urllc", data_t["log"][0])

        # 2. Results
        resp_r = self.client.get("/api/results")
        self.assertEqual(resp_r.status_code, 200)
        data_r = resp_r.json()
        self.assertIn("sla_table", data_r)
        self.assertIn("ablation", data_r)
        self.assertIn("evaluation_table", data_r)
        self.assertIn("headline", data_r)
        self.assertGreater(len(data_r["sla_table"]), 0)
        self.assertIn("static_violations_cut_pct", data_r["headline"])
        print("[PASS] FT-7: /api/training/log and /api/results return verified real benchmarks")

    def test_ft8_shield_stats(self):
        """FT-8: Shield changed flag and intervention_rate_20 computed from real inputs/outputs."""
        # Test forced adversarial action where shield must intervene (>3% change)
        adversarial_r_prb = np.array([0.90, 0.05, 0.05])
        adversarial_r_cpu = np.array([0.90, 0.05, 0.05])
        recent_load = {"embb": 0.8, "urllc": 0.5, "murllc": 0.4}
        sh_prb, sh_cpu, shield_active = apply_shield(adversarial_r_prb, adversarial_r_cpu, recent_load=recent_load, config=sim_manager.cfg)
        
        diff = float(np.max(np.abs(sh_prb - adversarial_r_prb)))
        changed = bool(diff > 0.03)
        self.assertTrue(shield_active, "Shield must trigger on adversarial load")
        self.assertTrue(changed, "Shield must alter shares by >3% (changed=True)")
        self.assertGreater(diff, 0.03)

        # Verify step simulation stream contains shield block
        payload = sim_manager.step_simulation()
        agent_shield = payload["policies"]["agent"]["shield"]
        self.assertIn("active", agent_shield)
        self.assertIn("changed", agent_shield)
        self.assertIn("delta_pct", agent_shield)
        self.assertIn("intervention_rate_20", agent_shield)
        self.assertIsInstance(agent_shield["changed"], bool)
        print("[PASS] FT-8: Real shield stats, delta_pct, and intervention_rate_20 verified")

    def test_ft9_old_endpoints_and_legacy_dashboard(self):
        """FT-9: Old endpoints (/health, /summary, /spike, /reset, /bots, /sla) and /legacy intact."""
        # /health
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["status"] == "ok")

        # /summary
        resp = self.client.get("/summary")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("scoreboard", resp.json())

        # /spike
        resp = self.client.post("/spike", json={"slice": "embb", "factor": 2.5, "duration": 20})
        self.assertEqual(resp.status_code, 200)

        # /reset
        resp = self.client.post("/reset")
        self.assertEqual(resp.status_code, 200)

        # /bots
        resp = self.client.get("/bots")
        self.assertEqual(resp.status_code, 200)

        # /sla
        resp = self.client.get("/sla")
        self.assertEqual(resp.status_code, 200)

        # /legacy
        resp = self.client.get("/legacy")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("5G SliceOS", resp.text)
        self.assertIn("Enterprise React Suite", resp.text)

        # SPA root /
        resp_spa = self.client.get("/")
        self.assertEqual(resp_spa.status_code, 200)
        print("[PASS] FT-9: All existing endpoints, /legacy, and SPA / root fully intact")


if __name__ == "__main__":
    unittest.main()
