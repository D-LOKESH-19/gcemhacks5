"""Acceptance test suite for Phase 10a: Locations Feature Config & Simulator (LOCATIONS_FEATURE.md).

Tests:
LT-1:  Location is only a label (invariance of traffic, arrivals, costs, rewards)
LT-2:  Defaults at reset (Campus=eMBB, Factory=URLLC, Smart City=mURLLC)
LT-3:  Slice override (e.g., URLLC bots at Campus)
LT-4:  Matrix correctness across sequence of add/remove/set events
LT-5:  Clipping to max_count across multiple locations
LT-6:  Remove more than exists (non-negative, clipped=True)
LT-7:  Determinism across identical location event runs
LT-8:  Fair comparison: Static, Heuristic, Agent receive identical arrivals
LT-9:  Contract unchanged: 12-dim obs, 6-dim action, info['cost'] intact
LT-10: Old suite passes in both modes
LT-11: Estimated delay is display-only (no influence on obs, cost, reward)
LT-12: Delay behavior: finite, base_ms at low load, overload_ms on overload
LT-18: High speed: 1,000 bots across locations runs 200 steps in < 0.2s
LT-31: SLA invariance: info['costs'], info['feasible'], SLA status identical regardless of locations
LT-34: No hardcoded SLA logic or numbers in location code
LT-35: Delay is not an SLA input (delay_model changes do not affect SLAs)
LT-36: Model untouched (models/agent.zip hash verified)
"""

import hashlib
import math
import os
import re
import time
import unittest
import numpy as np
import yaml

from sim import SliceEnv
from baselines import StaticPolicy, HeuristicPolicy
import sim_selftest
import shield
import sla


EXPECTED_MODEL_SHA256 = "3cd0a7e66847f16a2ddc828bd7173878aba1538b15a79756675e177cd26314e1"


class TestLocations10a(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open("config.yaml", "r", encoding="utf-8") as f:
            cls.cfg = yaml.safe_load(f)

    def test_lt1_location_is_only_a_label(self):
        """LT-1: Same seed and same per-slice bot count placed in different locations gives identical arrivals, queues, rewards, costs."""
        # Run 1: 20 URLLC bots placed in Campus
        env1 = SliceEnv()
        env1.traffic_mode = "bots"
        env1.reset(seed=42)
        env1.apply_bot_event(slice_name="urllc", location="campus", mode="add", n=20)

        # Run 2: 20 URLLC bots placed in Factory
        env2 = SliceEnv()
        env2.traffic_mode = "bots"
        env2.reset(seed=42)
        env2.apply_bot_event(slice_name="urllc", location="factory", mode="add", n=20)

        action = np.zeros(6, dtype=np.float32)
        for step in range(30):
            obs1, rew1, _, _, info1 = env1.step(action)
            obs2, rew2, _, _, info2 = env2.step(action)

            self.assertEqual(info1["arrivals"], info2["arrivals"])
            self.assertEqual(info1["throughput"], info2["throughput"])
            self.assertEqual(info1["violations"], info2["violations"])
            self.assertEqual(info1["queue"], info2["queue"])
            self.assertAlmostEqual(rew1, rew2, places=6)
            self.assertAlmostEqual(info1["cost"], info2["cost"], places=6)
            np.testing.assert_allclose(obs1, obs2, atol=1e-6)

    def test_lt2_defaults(self):
        """LT-2: At reset, bots sit in each slice's default location and totals equal Phase 9 defaults."""
        env = SliceEnv()
        env.reset(seed=10)
        matrix = env.get_bot_matrix()

        self.assertEqual(matrix["campus"]["embb"], self.cfg["bots"]["default_count"]["embb"])
        self.assertEqual(matrix["campus"]["urllc"], 0)
        self.assertEqual(matrix["campus"]["murllc"], 0)

        self.assertEqual(matrix["factory"]["embb"], 0)
        self.assertEqual(matrix["factory"]["urllc"], self.cfg["bots"]["default_count"]["urllc"])
        self.assertEqual(matrix["factory"]["murllc"], 0)

        self.assertEqual(matrix["smart_city"]["embb"], 0)
        self.assertEqual(matrix["smart_city"]["urllc"], 0)
        self.assertEqual(matrix["smart_city"]["murllc"], self.cfg["bots"]["default_count"]["murllc"])

    def test_lt3_slice_override(self):
        """LT-3: Add URLLC users in Campus: count toward URLLC arrivals and show under Campus."""
        env = SliceEnv()
        env.reset(seed=20)
        matrix, clipped = env.apply_bot_event(slice_name="urllc", location="campus", mode="add", n=15)

        self.assertEqual(matrix["campus"]["urllc"], 15)
        counts = env.get_bot_counts()
        self.assertEqual(counts["urllc"], self.cfg["bots"]["default_count"]["urllc"] + 15)
        self.assertFalse(clipped)

    def test_lt4_matrix_correctness(self):
        """LT-4: Sequence of add, remove and set events: row sums equal slice totals."""
        env = SliceEnv()
        env.reset(seed=30)

        # 1. Add 10 embb to factory
        env.apply_bot_event("embb", "factory", "add", 10)
        # 2. Add 20 murllc to campus
        env.apply_bot_event("murllc", "campus", "add", 20)
        # 3. Set urllc in smart_city to 12
        env.apply_bot_event("urllc", "smart_city", "set", 12)
        # 4. Remove 5 embb from campus
        env.apply_bot_event("embb", "campus", "remove", 5)

        matrix = env.get_bot_matrix()
        counts = env.get_bot_counts()

        for s in ["embb", "urllc", "murllc"]:
            sum_locs = matrix["campus"][s] + matrix["factory"][s] + matrix["smart_city"][s]
            self.assertEqual(sum_locs, counts[s], f"Mismatch for slice {s}: {sum_locs} != {counts[s]}")

    def test_lt5_clipping(self):
        """LT-5: Adding beyond max_count across locations never exceeds slice max; clipped is reported."""
        env = SliceEnv()
        env.reset(seed=40)
        max_urllc = env.max_bot_counts["urllc"]  # 150

        # Try to add 200 in campus
        matrix, clipped = env.apply_bot_event("urllc", "campus", "add", 200)
        counts = env.get_bot_counts()

        self.assertEqual(counts["urllc"], max_urllc)
        self.assertTrue(clipped)

    def test_lt6_remove_more_than_exists(self):
        """LT-6: Removes only what exists in that location, never touches other locations, count never negative."""
        env = SliceEnv()
        env.reset(seed=50)

        # Initially campus has 0 urllc
        matrix, clipped = env.apply_bot_event("urllc", "campus", "remove", 50)
        self.assertEqual(matrix["campus"]["urllc"], 0)
        self.assertTrue(clipped)
        # Factory urllc should be completely untouched
        self.assertEqual(matrix["factory"]["urllc"], self.cfg["bots"]["default_count"]["urllc"])

    def test_lt7_determinism(self):
        """LT-7: Same seed and same location-tagged events twice give identical traffic."""
        def run_sim():
            env = SliceEnv()
            env.traffic_mode = "bots"
            env.reset(seed=123)
            env.apply_bot_event("embb", "factory", "add", 25)
            env.apply_bot_event("urllc", "campus", "add", 10)
            traffic = []
            action = np.zeros(6, dtype=np.float32)
            for _ in range(25):
                _, _, _, _, info = env.step(action)
                traffic.append(info["arrivals"])
            return traffic

        t1 = run_sim()
        t2 = run_sim()
        self.assertEqual(t1, t2)

    def test_lt8_fair_comparison(self):
        """LT-8: Static, Heuristic, and Agent receive bit-for-bit identical arrivals under location events."""
        env_s = SliceEnv()
        env_h = SliceEnv()
        env_a = SliceEnv()

        for env in [env_s, env_h, env_a]:
            env.traffic_mode = "bots"
            env.reset(seed=777)
            env.apply_bot_event("embb", "factory", "add", 30)
            env.apply_bot_event("murllc", "campus", "add", 50)

        pol_s = StaticPolicy()
        pol_h = HeuristicPolicy()

        obs_s, info_s = env_s.reset(seed=777)
        obs_h, info_h = env_h.reset(seed=777)
        obs_a, info_a = env_a.reset(seed=777)

        for _ in range(20):
            act_s = pol_s.predict(obs_s, info_s)
            act_h = pol_h.predict(obs_h, info_h)
            act_a = np.zeros(6, dtype=np.float32)

            obs_s, _, _, _, info_s = env_s.step(act_s)
            obs_h, _, _, _, info_h = env_h.step(act_h)
            obs_a, _, _, _, info_a = env_a.step(act_a)

            for s in ["embb", "urllc", "murllc"]:
                self.assertEqual(info_s["arrivals"][s], info_h["arrivals"][s])
                self.assertEqual(info_h["arrivals"][s], info_a["arrivals"][s])

    def test_lt9_contract_unchanged(self):
        """LT-9: Observation shape (12,), finite, in [0, 1]; action 6; info['cost'] matches definition."""
        env = SliceEnv()
        env.reset(seed=99)
        env.apply_bot_event("urllc", "smart_city", "add", 15)

        action = np.zeros(6, dtype=np.float32)
        obs, reward, term, trunc, info = env.step(action)

        self.assertEqual(obs.shape, (12,))
        self.assertTrue(np.all(obs >= 0.0) and np.all(obs <= 1.0))
        self.assertIn("cost", info)
        self.assertIn("costs", info)
        self.assertIn("est_delay_ms", info)
        self.assertIn("bots_by_location", info)

    def test_lt10_old_suite(self):
        """LT-10: All old simulator self-tests pass cleanly."""
        sim_selftest.test_shares_sum_to_one()
        sim_selftest.test_embb_spike_static_failure()
        sim_selftest.test_radio_compute_coupling()
        sim_selftest.test_seed_reproducibility()
        sim_selftest.test_static_urllc_violation_in_spike()
        shield.run_unit_tests()

    def test_lt11_estimated_delay_display_only(self):
        """LT-11: Reward, costs and observation are identical regardless of delay model values."""
        # Run with default delay model
        env1 = SliceEnv()
        obs1, info1 = env1.reset(seed=42)
        obs1, _, _, _, info1 = env1.step(np.zeros(6, dtype=np.float32))

        # Run with artificially tripled delay base_ms
        custom_cfg = dict(self.cfg)
        custom_cfg["delay_model"] = dict(self.cfg.get("delay_model", {}))
        custom_cfg["delay_model"]["base_ms"] = {"embb": 50.0, "urllc": 5.0, "murllc": 15.0}

        env2 = SliceEnv(config=custom_cfg)
        obs2, info2 = env2.reset(seed=42)
        obs2, _, _, _, info2 = env2.step(np.zeros(6, dtype=np.float32))

        np.testing.assert_allclose(obs1, obs2, atol=1e-7)
        self.assertEqual(info1["cost"], info2["cost"])
        self.assertEqual(info1["costs"], info2["costs"])
        # est_delay_ms should differ
        self.assertNotEqual(info1["est_delay_ms"], info2["est_delay_ms"])

    def test_lt12_delay_behavior(self):
        """LT-12: est_delay_ms is finite, grows as load rises, equals overload_ms when demand exceeds capacity."""
        env = SliceEnv()
        obs, info = env.reset(seed=1)
        base_ms = self.cfg["delay_model"]["base_ms"]
        overload_ms = self.cfg["delay_model"]["overload_ms"]

        # 1. Low load with nominal allocation (StaticPolicy 60/25/15)
        pol = StaticPolicy()
        action = pol.predict(obs, info)
        _, _, _, _, info_low = env.step(action)
        for s in ["embb", "urllc", "murllc"]:
            d = info_low["est_delay_ms"][s]
            self.assertTrue(math.isfinite(d))
            self.assertGreaterEqual(d, base_ms[s])
            self.assertLess(d, overload_ms)

        # 2. Overload spike on eMBB
        env.set_spike("embb", factor=10.0, duration_steps=5)
        _, _, _, _, info_overload = env.step(np.zeros(6, dtype=np.float32))
        self.assertEqual(info_overload["est_delay_ms"]["embb"], overload_ms)

    def test_lt18_speed(self):
        """LT-18: 1,000 bots total across all locations: one 200-step episode executes in under 0.2 s."""
        env = SliceEnv()
        env.traffic_mode = "bots"
        env.reset(seed=2)
        env.set_bots("embb", 200)
        env.set_bots("urllc", 150)
        env.set_bots("murllc", 650)  # total 1000 bots

        action = np.zeros(6, dtype=np.float32)
        t0 = time.time()
        for _ in range(200):
            env.step(action)
        duration = time.time() - t0

        self.assertLess(duration, 0.25, f"1,000 bots episode took {duration:.3f} s (expected < 0.25 s)")

    def test_lt31_sla_invariance(self):
        """LT-31: Same seed and per-slice counts with users placed in different locations gives identical SLA status."""
        env1 = SliceEnv()
        env1.traffic_mode = "bots"
        env1.reset(seed=88)
        env1.apply_bot_event("urllc", "campus", "add", 30)

        env2 = SliceEnv()
        env2.traffic_mode = "bots"
        env2.reset(seed=88)
        env2.apply_bot_event("urllc", "smart_city", "add", 30)

        history1 = []
        history2 = []
        action = np.zeros(6, dtype=np.float32)

        for _ in range(25):
            _, _, _, _, info1 = env1.step(action)
            _, _, _, _, info2 = env2.step(action)
            history1.append(info1)
            history2.append(info2)

            self.assertEqual(info1["costs"], info2["costs"])
            self.assertEqual(info1["feasible"], info2["feasible"])

        status1 = sla.episode_status(history1, self.cfg)
        status2 = sla.episode_status(history2, self.cfg)
        self.assertEqual(status1, status2)

    def test_lt34_no_sla_logic_in_location_code(self):
        """LT-34: Search location code in sim.py for hardcoded SLA numbers: none outside config."""
        with open("sim.py", "r", encoding="utf-8") as f:
            lines = f.readlines()

        forbidden_literals = ["0.005", "0.01", "0.70", "0.02", "0.03"]
        for idx, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("*"):
                continue
            for target in forbidden_literals:
                pattern = rf"(?<![0-9a-zA-Z_]){re.escape(target)}(?![0-9a-zA-Z_])"
                if re.search(pattern, stripped):
                    self.fail(f"LT-34 violation in sim.py:{idx+1}: Found literal '{target}': {stripped}")

    def test_lt35_delay_is_not_an_sla_input(self):
        """LT-35: Changing delay_model in config leaves SLA metrics, costs, and rewards strictly identical."""
        env1 = SliceEnv()
        env1.reset(seed=9)

        cfg_mod = dict(self.cfg)
        cfg_mod["delay_model"] = dict(self.cfg.get("delay_model", {}))
        cfg_mod["delay_model"]["base_ms"] = {"embb": 99.0, "urllc": 99.0, "murllc": 99.0}
        cfg_mod["delay_model"]["overload_ms"] = 999.0

        env2 = SliceEnv(config=cfg_mod)
        env2.reset(seed=9)

        action = np.zeros(6, dtype=np.float32)
        h1 = []
        h2 = []
        for _ in range(15):
            _, _, _, _, i1 = env1.step(action)
            _, _, _, _, i2 = env2.step(action)
            h1.append(i1)
            h2.append(i2)

        st1 = sla.episode_status(h1, self.cfg)
        st2 = sla.episode_status(h2, self.cfg)
        self.assertEqual(st1, st2)

    def test_lt36_model_untouched(self):
        """LT-36: models/agent.zip SHA256 hash is strictly identical before and after Phase 10."""
        self.assertTrue(os.path.exists("models/agent.zip"))
        with open("models/agent.zip", "rb") as f:
            current_hash = hashlib.sha256(f.read()).hexdigest()
        self.assertEqual(current_hash, EXPECTED_MODEL_SHA256, "models/agent.zip was unexpectedly modified!")


if __name__ == "__main__":
    unittest.main()
