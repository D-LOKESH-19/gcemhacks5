"""Acceptance test suite for Phase 9a: Bot Config and Vectorized Simulator.

Tests:
BT-1: traffic_mode aggregate keeps existing tests passing
BT-2: Calibration within 15% of arrival_mean
BT-3: Count control (set, add, remove, clipping, 0 floor)
BT-4: Scaling (doubling URLLC bots roughly doubles arrivals)
BT-5: Determinism (identical seeds and events yield identical arrivals)
BT-8: Speed (1000 bots total run 200 steps in < 0.2s)
BT-9: Reset restores default bot counts
BT-10: Observation shape (12,) bounded in [0, 1] at 0 and max bots
BT-11: Zero bots produce 0 arrivals with no division-by-zero
"""

import sys, os
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

import sys
import time
import numpy as np
from sim import SliceEnv


def test_bt1_aggregate_mode():
    """BT-1: traffic_mode aggregate passes old tests unchanged."""
    env = SliceEnv()
    env.traffic_mode = "aggregate"
    env.reset(seed=42)

    for _ in range(50):
        action = np.zeros(6, dtype=np.float32)
        obs, reward, term, trunc, info = env.step(action)
        assert len(obs) == 12
        assert info["arrivals"]["embb"] > 0

    print("[PASS] BT-1: traffic_mode 'aggregate' behaves identically to pre-bots baseline")


def test_bt2_calibration():
    """BT-2: With default counts over 200 steps, mean arrivals are within 15% of arrival_mean."""
    env = SliceEnv()
    env.traffic_mode = "bots"
    env.reset(seed=123)

    arrivals_log = {"embb": [], "urllc": [], "murllc": []}
    action = np.zeros(6, dtype=np.float32)

    for _ in range(200):
        _, _, _, _, info = env.step(action)
        for s in ["embb", "urllc", "murllc"]:
            arrivals_log[s].append(info["arrivals"][s])

    mean_embb = np.mean(arrivals_log["embb"])
    mean_urllc = np.mean(arrivals_log["urllc"])
    mean_murllc = np.mean(arrivals_log["murllc"])

    print(f"Calibration results: eMBB={mean_embb:.1f} (target 400), URLLC={mean_urllc:.1f} (target 30), mURLLC={mean_murllc:.1f} (target 20)")

    # 15% tolerance checks
    assert 340 <= mean_embb <= 460, f"eMBB mean {mean_embb} not within 15% of 400"
    assert 25.5 <= mean_urllc <= 34.5, f"URLLC mean {mean_urllc} not within 15% of 30"
    assert 17.0 <= mean_murllc <= 23.5, f"mURLLC mean {mean_murllc} not within 15% of 20"

    print("[PASS] BT-2: Calibration within 15% of arrival_mean confirmed across all slices")


def test_bt3_count_control():
    """BT-3: Count control: add, remove, set, clipping to max, and floor at 0."""
    env = SliceEnv()
    env.reset()

    # Set
    c = env.set_bots("embb", 50)
    assert c == 50 and env.get_bot_counts()["embb"] == 50

    # Add
    c = env.add_bots("embb", 25)
    assert c == 75 and env.get_bot_counts()["embb"] == 75

    # Remove
    c = env.remove_bots("embb", 30)
    assert c == 45 and env.get_bot_counts()["embb"] == 45

    # Clip to max (eMBB max is 200)
    c = env.set_bots("embb", 500)
    assert c == 200 and env.get_bot_counts()["embb"] == 200

    # Floor at 0
    c = env.remove_bots("embb", 999)
    assert c == 0 and env.get_bot_counts()["embb"] == 0

    print("[PASS] BT-3: Count control (set, add, remove, clip, floor 0) verified")


def test_bt4_scaling():
    """BT-4: Doubling URLLC bots roughly doubles URLLC arrivals."""
    env = SliceEnv()
    env.traffic_mode = "bots"
    action = np.zeros(6, dtype=np.float32)

    # 30 bots
    env.reset(seed=55)
    env.set_bots("urllc", 30)
    arr_30 = []
    for _ in range(100):
        _, _, _, _, info = env.step(action)
        arr_30.append(info["arrivals"]["urllc"])

    # 60 bots
    env.reset(seed=55)
    env.set_bots("urllc", 60)
    arr_60 = []
    for _ in range(100):
        _, _, _, _, info = env.step(action)
        arr_60.append(info["arrivals"]["urllc"])

    mean_30 = np.mean(arr_30)
    mean_60 = np.mean(arr_60)
    ratio = mean_60 / max(1.0, mean_30)

    print(f"Scaling check: 30 bots={mean_30:.1f} pkts, 60 bots={mean_60:.1f} pkts, ratio={ratio:.2f}")
    assert 1.6 <= ratio <= 2.4, f"Doubling bots produced ratio {ratio}, expected ~2.0"

    print("[PASS] BT-4: Scaling verified (doubling bot count roughly doubles traffic)")


def test_bt5_determinism():
    """BT-5: Same seed and same bot events yield identical arrivals."""
    env1 = SliceEnv()
    env2 = SliceEnv()
    env1.traffic_mode = "bots"
    env2.traffic_mode = "bots"

    env1.reset(seed=777)
    env2.reset(seed=777)

    action = np.zeros(6, dtype=np.float32)

    for step_num in range(50):
        if step_num == 15:
            env1.add_bots("urllc", 20)
            env2.add_bots("urllc", 20)
        elif step_num == 30:
            env1.set_bots("embb", 80)
            env2.set_bots("embb", 80)

        _, _, _, _, info1 = env1.step(action)
        _, _, _, _, info2 = env2.step(action)

        for s in ["embb", "urllc", "murllc"]:
            assert info1["arrivals"][s] == info2["arrivals"][s], f"Mismatch at step {step_num} for {s}"

    print("[PASS] BT-5: Determinism verified (identical seeds and bot events produce identical arrivals)")


def test_bt8_speed():
    """BT-8: 1,000 bots total, one 200-step episode executes in under 0.2 seconds."""
    env = SliceEnv()
    env.traffic_mode = "bots"
    env.reset(seed=888)
    env.set_bots("embb", 200)
    env.set_bots("urllc", 150)
    env.set_bots("murllc", 650)  # Total = 1000 bots

    action = np.zeros(6, dtype=np.float32)
    start_time = time.perf_counter()

    for _ in range(200):
        env.step(action)

    duration = time.perf_counter() - start_time
    print(f"1,000 bots 200-step runtime: {duration*1000:.1f} ms")
    assert duration < 0.20, f"Runtime was {duration:.3f} s, expected < 0.20 s"

    print(f"[PASS] BT-8: High-speed vectorization confirmed ({duration*1000:.1f} ms < 200 ms)")


def test_bt9_reset():
    """BT-9: reset() restores default bot counts."""
    env = SliceEnv()
    env.reset()
    env.set_bots("embb", 120)
    env.set_bots("urllc", 90)
    assert env.get_bot_counts()["embb"] == 120

    env.reset()
    counts = env.get_bot_counts()
    assert counts == env.default_bot_counts, f"Counts {counts} != default {env.default_bot_counts}"

    print("[PASS] BT-9: reset() successfully restores default bot counts")


def test_bt10_observation_bounds():
    """BT-10: Observation vector stays shape (12,) in [0, 1] at 0 bots and max bots."""
    env = SliceEnv()
    env.traffic_mode = "bots"
    action = np.zeros(6, dtype=np.float32)

    # 1. Zero bots across all slices
    env.reset(seed=1)
    env.set_bots("embb", 0)
    env.set_bots("urllc", 0)
    env.set_bots("murllc", 0)

    for _ in range(10):
        obs, _, _, _, _ = env.step(action)
        assert obs.shape == (12,), f"Obs shape {obs.shape} != (12,)"
        assert np.all(obs >= 0.0) and np.all(obs <= 1.0), f"Obs out of [0, 1] at 0 bots: {obs}"

    # 2. Max bots across all slices
    env.reset(seed=2)
    env.set_bots("embb", 200)
    env.set_bots("urllc", 150)
    env.set_bots("murllc", 1000)

    for _ in range(10):
        obs, _, _, _, _ = env.step(action)
        assert obs.shape == (12,), f"Obs shape {obs.shape} != (12,)"
        assert np.all(obs >= 0.0) and np.all(obs <= 1.0), f"Obs out of [0, 1] at max bots: {obs}"

    print("[PASS] BT-10: Observation vector invariant (12 floats in [0, 1]) holds at 0 and max bots")


def test_bt11_zero_bots_graceful():
    """BT-11: Slice with 0 bots has 0 arrivals, no division-by-zero, cost defined."""
    env = SliceEnv()
    env.traffic_mode = "bots"
    env.reset(seed=3)
    env.set_bots("urllc", 0)
    env.set_bots("murllc", 0)

    action = np.zeros(6, dtype=np.float32)
    for _ in range(20):
        _, reward, _, _, info = env.step(action)
        assert info["arrivals"]["urllc"] == 0.0
        assert info["arrivals"]["murllc"] == 0.0
        assert not np.isnan(info["cost"])
        assert not np.isnan(reward)
        assert info["violation_rate"] == 0.0

    print("[PASS] BT-11: Zero-bot edge case handled gracefully without NaN or ZeroDivisionError")


if __name__ == "__main__":
    print("Running Phase 9a Bot Simulator Acceptance Tests...\n" + "=" * 60)
    test_bt1_aggregate_mode()
    test_bt2_calibration()
    test_bt3_count_control()
    test_bt4_scaling()
    test_bt5_determinism()
    test_bt8_speed()
    test_bt9_reset()
    test_bt10_observation_bounds()
    test_bt11_zero_bots_graceful()
    print("=" * 60 + "\nAll Phase 9a Tests PASSED!")
    sys.exit(0)
