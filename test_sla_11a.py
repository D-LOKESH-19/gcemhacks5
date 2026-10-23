"""Acceptance Tests for Phase 11a: SLA Module & Simulator Additions (SM-1 to SM-14).

Verifies Section 10.1 of SLA_RL_SPEC.md:
- SM-1: Config present and valid
- SM-2: URLLC metric calculation and episode compliance
- SM-3: mURLLC metric calculation and episode compliance
- SM-4: eMBB metric calculation and episode compliance
- SM-5: 20-step window logic vs episode average
- SM-6: Status levels ('ok', 'amber', 'breach')
- SM-7: Zero arrivals edge case
- SM-8: Feasible load flag calculation
- SM-9: info['costs'] present, finite, and in [0, 1]
- SM-10: Costs match exact mathematical definitions
- SM-11: Interface contract backward compatibility
- SM-12: Old simulator and shield test suites
- SM-13: Pure functions without global state
- SM-14: Single source of truth audit
"""

import math
import os
import re
import sys
import yaml
import numpy as np

import sla
from sim import SliceEnv
import sim_selftest
import shield


def test_sm1_config():
    print("Testing SM-1: Config present...")
    with open("config.yaml", "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    # Check SLA section
    assert "sla" in cfg, "Missing 'sla' section in config.yaml"
    sla_cfg = cfg["sla"]
    assert sla_cfg["window_steps"] == 20, f"Expected window_steps=20, got {sla_cfg.get('window_steps')}"
    assert sla_cfg["embb"]["min_served_ratio"] == 0.70
    assert sla_cfg["urllc"]["max_violation_rate"] == 0.005
    assert sla_cfg["urllc"]["max_window_violation"] == 0.02
    assert sla_cfg["murllc"]["max_violation_rate"] == 0.01
    assert sla_cfg["murllc"]["max_window_violation"] == 0.03
    assert sla_cfg["feasible_load_fraction"] == 0.90
    assert sla_cfg["amber_fraction"] == 0.80

    # Check CMDP section
    assert "cmdp" in cfg, "Missing 'cmdp' section in config.yaml"
    cmdp_cfg = cfg["cmdp"]
    assert cmdp_cfg["limits"]["embb_shortfall"] == 0.05
    assert cmdp_cfg["limits"]["urllc"] == 0.005
    assert cmdp_cfg["limits"]["murllc"] == 0.01
    assert cmdp_cfg["lambda_init"] == 1.0
    assert cmdp_cfg["lambda_max"] == 20.0
    assert cmdp_cfg["lagrange_lr"] == 0.05
    assert cmdp_cfg["dual_mode"] in ["simple", "pid"]
    assert "pid" in cmdp_cfg
    assert cmdp_cfg["pid"]["kp"] == 0.5
    assert cmdp_cfg["pid"]["ki"] == 0.05
    assert cmdp_cfg["pid"]["kd"] == 0.1

    # Check legacy compatibility
    assert "cost_limit" in cfg
    print("[PASS] SM-1: Config sections 'sla' and 'cmdp' verified")


def test_sm2_urllc_metric():
    print("Testing SM-2: URLLC metric...")
    cfg = sla.load_config()
    # 1 violation in 400 packets -> 0.0025, met=True
    h1 = [{"arrivals": {"urllc": 400.0}, "violations": {"urllc": 1.0}}]
    res1 = sla.episode_status(h1, cfg)["urllc"]
    assert math.isclose(res1["metric"], 0.0025, abs_tol=1e-5), f"Expected 0.0025, got {res1['metric']}"
    assert res1["met"] is True, f"Expected met=True for 0.0025, got {res1['met']}"

    # 3 violations in 400 packets -> 0.0075, met=False
    h2 = [{"arrivals": {"urllc": 400.0}, "violations": {"urllc": 3.0}}]
    res2 = sla.episode_status(h2, cfg)["urllc"]
    assert math.isclose(res2["metric"], 0.0075, abs_tol=1e-5), f"Expected 0.0075, got {res2['metric']}"
    assert res2["met"] is False, f"Expected met=False for 0.0075, got {res2['met']}"
    print("[PASS] SM-2: URLLC metric gives 0.0025 (met=True) and 0.0075 (met=False)")


def test_sm3_murllc_metric():
    print("Testing SM-3: mURLLC metric...")
    cfg = sla.load_config()
    # 3 violations in 400 packets -> 0.0075 <= 0.01 -> met=True
    h1 = [{"arrivals": {"murllc": 400.0}, "violations": {"murllc": 3.0}}]
    res1 = sla.episode_status(h1, cfg)["murllc"]
    assert math.isclose(res1["metric"], 0.0075, abs_tol=1e-5)
    assert res1["met"] is True

    # 5 violations in 400 packets -> 0.0125 > 0.01 -> met=False
    h2 = [{"arrivals": {"murllc": 400.0}, "violations": {"murllc": 5.0}}]
    res2 = sla.episode_status(h2, cfg)["murllc"]
    assert math.isclose(res2["metric"], 0.0125, abs_tol=1e-5)
    assert res2["met"] is False
    print("[PASS] SM-3: mURLLC metric verified against 1.0% limit (0.0075 met=True, 0.0125 met=False)")


def test_sm4_embb_metric():
    print("Testing SM-4: eMBB metric...")
    cfg = sla.load_config()
    # Served ratio 0.75 -> met=True
    h1 = [{"throughput": {"embb": 75.0}, "arrivals": {"embb": 100.0}, "queue": {"embb": 0.0}}]
    res1 = sla.episode_status(h1, cfg)["embb"]
    assert math.isclose(res1["metric"], 0.75, abs_tol=1e-5)
    assert res1["met"] is True, f"Expected met=True for 0.75, got {res1['met']}"

    # Served ratio 0.65 -> met=False
    h2 = [{"throughput": {"embb": 65.0}, "arrivals": {"embb": 100.0}, "queue": {"embb": 0.0}}]
    res2 = sla.episode_status(h2, cfg)["embb"]
    assert math.isclose(res2["metric"], 0.65, abs_tol=1e-5)
    assert res2["met"] is False, f"Expected met=False for 0.65, got {res2['met']}"
    print("[PASS] SM-4: eMBB metric 0.75 meets SLA (met=True) and 0.65 breaches (met=False)")


def test_sm5_window_logic():
    print("Testing SM-5: Window logic...")
    cfg = sla.load_config()
    # Create 200-step history where episode average is fine (e.g. 0.0025 <= 0.005),
    # but inside one 20-step window violations burst to 5.0% (> 2.0% window limit).
    history = []
    # 180 quiet steps: 200 arrivals, 0 violations
    for _ in range(180):
        history.append({"arrivals": {"urllc": 200.0}, "violations": {"urllc": 0.0}})
    # 20 burst steps: 200 arrivals, 10 violations each step (5% violation rate in this window)
    burst_window = []
    for _ in range(20):
        step = {"arrivals": {"urllc": 200.0}, "violations": {"urllc": 10.0}}
        history.append(step)
        burst_window.append(step)

    # Episode check
    ep = sla.episode_status(history, cfg)["urllc"]
    # Total arrivals = 180*200 + 20*200 = 40,000. Total viol = 200.
    # Metric = 200 / 40,000 = 0.0050 <= 0.005 -> met=True
    assert ep["met"] is True, f"Episode average should be met, got {ep['metric']}"

    # Window check on the burst window
    win = sla.window_status(burst_window, "urllc", cfg)
    assert win["value"] == 0.05, f"Expected window value 0.05, got {win['value']}"
    assert win["status"] == "breach", f"Expected 'breach' for window, got {win['status']}"
    print("[PASS] SM-5: Window logic catches local burst breach despite compliant episode average")


def test_sm6_status_levels():
    print("Testing SM-6: Status levels...")
    cfg = sla.load_config()
    limit = 0.02
    amber_frac = 0.80

    s_ok = sla.get_status_level(0.010, limit, amber_fraction=amber_frac, higher_is_better=False)
    assert s_ok == "ok", f"Expected ok, got {s_ok}"

    s_amber = sla.get_status_level(0.018, limit, amber_fraction=amber_frac, higher_is_better=False)
    assert s_amber == "amber", f"Expected amber, got {s_amber}"

    s_breach = sla.get_status_level(0.025, limit, amber_fraction=amber_frac, higher_is_better=False)
    assert s_breach == "breach", f"Expected breach, got {s_breach}"
    print("[PASS] SM-6: Status levels strictly yield 'ok' (<80%), 'amber' (80-100%), and 'breach' (>100%)")


def test_sm7_no_arrivals():
    print("Testing SM-7: No arrivals edge case...")
    cfg = sla.load_config()
    empty_step = [{"arrivals": {"urllc": 0.0, "murllc": 0.0, "embb": 0.0}, "violations": {"urllc": 0.0, "murllc": 0.0, "embb": 0.0}}]
    ep = sla.episode_status(empty_step, cfg)
    for s in ["urllc", "murllc", "embb"]:
        assert not math.isnan(ep[s]["metric"]), f"Metric is NaN for {s}"
        assert ep[s]["met"] is True, f"Zero traffic should meet SLA trivially, got {ep[s]['met']}"

    win = sla.window_status(empty_step, "urllc", cfg)
    assert win["value"] == 0.0
    assert win["status"] == "ok"
    print("[PASS] SM-7: Zero arrivals handled cleanly without division by zero or NaNs")


def test_sm8_feasible_flag():
    print("Testing SM-8: Feasible flag...")
    cfg = sla.load_config()
    cap = 1000.0
    # Capacity is 1000. 90% is 900.
    assert sla.is_feasible(850.0, cap, cfg) is True
    assert sla.is_feasible(900.0, cap, cfg) is True
    assert sla.is_feasible(901.0, cap, cfg) is False
    assert sla.is_feasible(1100.0, cap, cfg) is False
    print("[PASS] SM-8: Feasible flag correctly separates <=90% (True) from >90% (False)")


def test_sm9_info_costs():
    print("Testing SM-9: info['costs'] present...")
    env = SliceEnv(seed=42)
    obs, info = env.reset()
    assert "costs" in info, "Missing 'costs' in reset info"
    assert "feasible" in info, "Missing 'feasible' in reset info"

    for step_num in range(20):
        action = np.zeros(6, dtype=np.float32)
        obs, reward, term, trunc, info = env.step(action)
        assert "costs" in info, f"Step {step_num}: Missing 'costs' in step info"
        costs = info["costs"]
        for s in ["urllc", "murllc", "embb"]:
            c = costs[s]
            assert isinstance(c, float)
            assert not math.isnan(c)
            assert not math.isinf(c)
            assert 0.0 <= c <= 1.0, f"Cost out of range: {s}={c}"
        assert isinstance(info["feasible"], bool)
    print("[PASS] SM-9: info['costs'] present across all slices, finite, bounded in [0, 1]")


def test_sm10_costs_match_definitions():
    print("Testing SM-10: Costs match definitions...")
    env = SliceEnv(seed=123)
    env.reset()
    for _ in range(10):
        action = np.random.uniform(-1, 1, size=6).astype(np.float32)
        obs, reward, term, trunc, info = env.step(action)
        # Verify URLLC cost definition
        arr_u = info["arrivals"]["urllc"]
        viol_u = info["violations"]["urllc"]
        expected_u = (viol_u / arr_u) if arr_u > 0 else 0.0
        assert math.isclose(info["costs"]["urllc"], expected_u, abs_tol=1e-5)

        # Verify mURLLC cost definition
        arr_m = info["arrivals"]["murllc"]
        viol_m = info["violations"]["murllc"]
        expected_m = (viol_m / arr_m) if arr_m > 0 else 0.0
        assert math.isclose(info["costs"]["murllc"], expected_m, abs_tol=1e-5)

        # Verify eMBB shortfall cost definition
        demand_e = info["arrivals"]["embb"] + info["queue"]["embb"]
        served_e = info["throughput"]["embb"]
        ratio_e = (served_e / demand_e) if demand_e > 0 else 1.0
        min_served = env.cfg["sla"]["embb"]["min_served_ratio"]
        expected_e = max(0.0, min_served - ratio_e) if demand_e > 0 else 0.0
        assert math.isclose(info["costs"]["embb"], expected_e, abs_tol=1e-5)
    print("[PASS] SM-10: All per-slice costs exactly match their mathematical definitions")


def test_sm11_old_contract():
    print("Testing SM-11: Old contract intact...")
    env = SliceEnv(seed=777)
    obs, info = env.reset()
    assert obs.shape == (12,), f"Expected obs shape (12,), got {obs.shape}"
    assert "cost" in info, "Missing old scalar 'cost' in info"

    action = np.zeros(6, dtype=np.float32)
    obs, reward, term, trunc, info = env.step(action)
    assert obs.shape == (12,)
    assert 0.0 <= reward <= 1.0
    # Old scalar cost is (urllc_viol + murllc_viol) / (urllc_arr + murllc_arr)
    arr_um = info["arrivals"]["urllc"] + info["arrivals"]["murllc"]
    viol_um = info["violations"]["urllc"] + info["violations"]["murllc"]
    expected_old_cost = (viol_um / arr_um) if arr_um > 0 else 0.0
    assert math.isclose(info["cost"], expected_old_cost, abs_tol=1e-5)
    print("[PASS] SM-11: 12-dim observation, 6-dim action, and scalar info['cost'] intact")


def test_sm12_old_suite():
    print("Testing SM-12: Running old simulator and shield regression tests...")
    sim_selftest.test_shares_sum_to_one()
    sim_selftest.test_embb_spike_static_failure()
    sim_selftest.test_radio_compute_coupling()
    sim_selftest.test_seed_reproducibility()
    sim_selftest.test_static_urllc_violation_in_spike()
    shield.run_unit_tests()
    print("[PASS] SM-12: Old simulator and shield suites fully passed")


def test_sm13_pure_functions():
    print("Testing SM-13: sla.py pure functions...")
    cfg = sla.load_config()
    h = [
        {"arrivals": {"urllc": 100.0, "murllc": 50.0, "embb": 500.0},
         "violations": {"urllc": 1.0, "murllc": 0.0, "embb": 0.0},
         "throughput": {"embb": 400.0}, "queue": {"embb": 100.0}}
    ]
    res1 = sla.episode_status(h, cfg)
    res2 = sla.episode_status(h, cfg)
    assert res1 == res2, "sla.episode_status produced different outputs for same input"

    w1 = sla.window_status(h, "urllc", cfg)
    w2 = sla.window_status(h, "urllc", cfg)
    assert w1 == w2, "sla.window_status produced different outputs for same input"
    print("[PASS] SM-13: Pure functions verified (no global mutable state)")


def test_sm14_single_source_of_truth():
    print("Testing SM-14: Single source of truth audit...")
    # Audit sla.py and sim.py to ensure zero hardcoded SLA targets (0.005, 0.01, 0.70, 0.02)
    # Target files to audit
    files_to_check = ["sla.py", "sim.py"]
    forbidden_literals = ["0.005", "0.01", "0.70", "0.02"]

    for fname in files_to_check:
        with open(fname, "r", encoding="utf-8") as f:
            lines = f.readlines()
        for idx, line in enumerate(lines):
            # Ignore comments and docstrings
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith('"""') or stripped.startswith("*"):
                continue
            for target in forbidden_literals:
                # Look for standalone number literal
                pattern = rf"(?<![0-9a-zA-Z_]){re.escape(target)}(?![0-9a-zA-Z_])"
                if re.search(pattern, stripped):
                    raise AssertionError(
                        f"SM-14 Violation in {fname}:{idx+1}: Found hardcoded SLA literal '{target}': {stripped}"
                    )

    print("[PASS] SM-14: Audit confirmed zero hardcoded SLA numbers in sla.py and sim.py")


def run_all_11a_tests():
    print("=" * 60)
    print("RUNNING SUB-PHASE 11a ACCEPTANCE TESTS (SM-1 TO SM-14)")
    print("=" * 60)
    test_sm1_config()
    test_sm2_urllc_metric()
    test_sm3_murllc_metric()
    test_sm4_embb_metric()
    test_sm5_window_logic()
    test_sm6_status_levels()
    test_sm7_no_arrivals()
    test_sm8_feasible_flag()
    test_sm9_info_costs()
    test_sm10_costs_match_definitions()
    test_sm11_old_contract()
    test_sm12_old_suite()
    test_sm13_pure_functions()
    test_sm14_single_source_of_truth()
    print("=" * 60)
    print("ALL SUB-PHASE 11a ACCEPTANCE TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    run_all_11a_tests()
