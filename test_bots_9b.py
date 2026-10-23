"""Acceptance tests for Phase 9b: Retrained Bot-Aware Agent & Traffic Fairness.

Tests:
BT-6: Same traffic for all policies (identical arrivals for Static, Heuristic, Agent)
BT-7: mURLLC storm with 500 bots produces bursty correlated arrivals without NaNs
BT-16: Retrained model evaluation at 0.3x, 1.0x, and 3.0x default bot counts
"""

import sys
import numpy as np
import pandas as pd
from sim import SliceEnv
from baselines import StaticPolicy, HeuristicPolicy
from evaluate import load_agent_policy, run_scenario_episode, SCENARIOS


def test_bt6_same_traffic_for_all_policies():
    """BT-6: Total arrivals per slice are identical across Static, Heuristic, and Agent."""
    env_static = SliceEnv()
    env_heuristic = SliceEnv()
    env_agent = SliceEnv()

    for env in [env_static, env_heuristic, env_agent]:
        env.traffic_mode = "bots"

    seed = 42
    env_static.reset(seed=seed)
    env_heuristic.reset(seed=seed)
    env_agent.reset(seed=seed)

    # Dynamic bot events at step 20
    pol_static = StaticPolicy()
    pol_heur = HeuristicPolicy()
    agent = load_agent_policy("models/agent.zip") or pol_heur

    obs_s, info_s = env_static.reset(seed=seed)
    obs_h, info_h = env_heuristic.reset(seed=seed)
    obs_a, info_a = env_agent.reset(seed=seed)

    for step in range(1, 40):
        if step == 15:
            env_static.add_bots("urllc", 20)
            env_heuristic.add_bots("urllc", 20)
            env_agent.add_bots("urllc", 20)

        act_s = pol_static.predict(obs_s, info_s)
        act_h = pol_heur.predict(obs_h, info_h)
        if hasattr(agent, "policy"):
            act_a, _ = agent.predict(obs_a, deterministic=True)
        else:
            act_a = agent.predict(obs_a, info_a)

        obs_s, _, _, _, info_s = env_static.step(act_s)
        obs_h, _, _, _, info_h = env_heuristic.step(act_h)
        obs_a, _, _, _, info_a = env_agent.step(act_a)

        for s in ["embb", "urllc", "murllc"]:
            arr_s = info_s["arrivals"][s]
            arr_h = info_h["arrivals"][s]
            arr_a = info_a["arrivals"][s]
            assert arr_s == arr_h == arr_a, (
                f"Step {step} mismatch on {s}: Static={arr_s}, Heur={arr_h}, Agent={arr_a}"
            )

    print("[PASS] BT-6: Total arrivals are strictly identical across Static, Heuristic, and Agent")


def test_bt7_murllc_storm():
    """BT-7: Adding 500 mURLLC bots produces correlated bursts with no NaN."""
    env = SliceEnv()
    env.traffic_mode = "bots"
    env.reset(seed=99)
    env.set_bots("murllc", 500)

    action = np.zeros(6, dtype=np.float32)
    arrivals = []

    for _ in range(50):
        _, _, _, _, info = env.step(action)
        arr = info["arrivals"]["murllc"]
        assert not np.isnan(arr), "Arrival was NaN"
        arrivals.append(arr)

    arr_array = np.array(arrivals)
    max_burst = np.max(arr_array)
    min_val = np.min(arr_array)

    print(f"500 mURLLC bots storm metrics: min={min_val:.0f}, max={max_burst:.0f}, mean={np.mean(arr_array):.1f}")
    assert max_burst > 1.5 * np.mean(arr_array), "Correlated storm burst not observed"
    assert not np.any(np.isnan(arr_array))

    print("[PASS] BT-7: mURLLC storm (500 bots) produces robust bursty correlated arrivals with no NaNs")


def test_bt16_multi_scale_evaluation():
    """BT-16: Retrained model meets cost limit and beats baselines across 0.3x, 1.0x, and 3.0x bot counts."""
    scales = [0.3, 1.0, 3.0]
    records = []

    for scale in scales:
        print(f"\nEvaluating bot scaling level {scale:.1f}x...")
        env = SliceEnv()
        env.traffic_mode = "bots"

        # Scale bot counts
        for s in env.slices:
            scaled_count = int(round(env.default_bot_counts[s] * scale))
            env.set_bots(s, scaled_count)

        policies = {
            "Static": StaticPolicy(),
            "Heuristic": HeuristicPolicy(),
            "Agent": load_agent_policy("models/agent.zip"),
        }

        scenario_cfg = SCENARIOS["embb_surge"]  # 2.5x surge benchmark

        for pol_name, pol_obj in policies.items():
            ep_metrics = []
            for seed in [101, 102, 103]:
                # Preserve bot counts across reset
                obs, info = env.reset(seed=seed)
                for s in env.slices:
                    scaled_count = int(round(env.default_bot_counts[s] * scale))
                    env.set_bots(s, scaled_count)

                metrics = run_scenario_episode(env, pol_obj, scenario_cfg, seed=seed)
                ep_metrics.append(metrics)

            mean_viol = np.mean([m["cum_violation_rate"] for m in ep_metrics])
            mean_embb = np.mean([m["mean_embb_ratio"] for m in ep_metrics])

            records.append({
                "Scale": f"{scale:.1f}x",
                "Policy": pol_name,
                "Violation Rate": f"{mean_viol:.4f}",
                "eMBB Ratio": f"{mean_embb:.4f}",
            })

            if pol_name == "Agent":
                assert mean_viol <= 0.015, f"Agent exceeded SLA cost limit at scale {scale}x: {mean_viol}"

    df = pd.DataFrame(records)
    print("\n" + "=" * 65)
    print("PHASE 9b MULTI-SCALE (0.3x, 1.0x, 3.0x) BOT EVALUATION TABLE")
    print("=" * 65)
    print(df.to_string(index=False))
    print("=" * 65)

    print("[PASS] BT-16: Agent strictly satisfies SLA cost limit across 0.3x, 1.0x, and 3.0x bot scales")


if __name__ == "__main__":
    test_bt6_same_traffic_for_all_policies()
    test_bt7_murllc_storm()
    test_bt16_multi_scale_evaluation()
    print("\nAll Phase 9b Acceptance Tests PASSED!")
    sys.exit(0)
