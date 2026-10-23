"""Evaluation harness for 5G Slicing policies (Static, Heuristic, and RL Agent).

Evaluates policies on 4 standardized benchmark scenarios across multiple random seeds,
logs performance metrics, and outputs formatted comparison tables and CSVs.
"""

import os
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from sim import SliceEnv
from baselines import StaticPolicy, HeuristicPolicy


SCENARIOS = {
    "steady": {
        "name": "Steady Load",
        "description": "Baseline nominal Poisson arrivals across all slices",
        "spike": None,
    },
    "embb_surge": {
        "name": "eMBB Surge",
        "description": "2.5x surge for 30 steps",
        "spike": ("embb", 2.5, 30, 50),  # (slice, factor, duration, start_step)
    },
    "urllc_burst": {
        "name": "URLLC Burst",
        "description": "3.0x burst for 20 steps",
        "spike": ("urllc", 3.0, 20, 60),
    },
    "murllc_storm": {
        "name": "mURLLC Storm",
        "description": "7.0x storm for 10 steps",
        "spike": ("murllc", 7.0, 10, 70),
    },
}


def load_agent_policy(model_path: str = "models/agent.zip"):
    """Load trained PPO agent if available, with safety shield applied."""
    if not os.path.exists(model_path):
        return None
    try:
        from stable_baselines3 import PPO
        from shield import apply_shield, shares_to_action_logits
        model = PPO.load(model_path)

        class ShieldedAgent:
            def __init__(self, rl_model):
                self.model = rl_model

            def predict(self, obs: np.ndarray, info: Optional[Dict[str, Any]] = None) -> np.ndarray:
                action, _ = self.model.predict(obs, deterministic=True)
                # Apply shield
                raw_prb = np.exp(action[:3] - np.max(action[:3]))
                raw_prb /= np.sum(raw_prb)
                raw_cpu = np.exp(action[3:] - np.max(action[3:]))
                raw_cpu /= np.sum(raw_cpu)

                recent_load = {
                    "embb": obs[1],
                    "urllc": obs[5],
                    "murllc": obs[9],
                }
                sh_prb, sh_cpu, _ = apply_shield(raw_prb, raw_cpu, recent_load)
                return shares_to_action_logits(sh_prb, sh_cpu)

        return ShieldedAgent(model)
    except Exception as e:
        print(f"[WARN] Could not load agent from {model_path}: {e}")
        return None


def run_scenario_episode(
    env: SliceEnv,
    policy: Any,
    scenario_cfg: Dict[str, Any],
    seed: int,
) -> Dict[str, float]:
    """Execute a single episode under a specific scenario and policy."""
    obs, info = env.reset(seed=seed)
    if hasattr(policy, "reset"):
        policy.reset()

    spike_info = scenario_cfg.get("spike")

    step_violation_rates: List[float] = []
    embb_throughput_ratios: List[float] = []
    prb_utilizations: List[float] = []
    cpu_utilizations: List[float] = []
    total_violations = {"embb": 0.0, "urllc": 0.0, "murllc": 0.0}
    total_arrivals = {"embb": 0.0, "urllc": 0.0, "murllc": 0.0}

    for step_num in range(1, env.steps_per_episode + 1):
        # Trigger scheduled spike if defined
        if spike_info is not None:
            slice_name, factor, duration, start_step = spike_info
            if step_num == start_step:
                env.set_spike(slice_name, factor, duration)

        action = policy.predict(obs, info)
        obs, reward, terminated, truncated, info = env.step(action)

        step_violation_rates.append(info["violation_rate"])
        embb_demand = info["arrivals"]["embb"] + info["queue"]["embb"]
        embb_ratio = (info["throughput"]["embb"] / embb_demand) if embb_demand > 0 else 1.0
        embb_throughput_ratios.append(embb_ratio)

        for s in env.slices:
            total_violations[s] += info["violations"][s]
            total_arrivals[s] += info["arrivals"][s]

        # Utilization
        total_served = sum(info["throughput"].values())
        tot_prb_cap = env.prb_total * env.prb_rate
        tot_cpu_cap = env.vcpu_total * env.cpu_rate
        prb_utilizations.append(total_served / tot_prb_cap)
        cpu_utilizations.append(total_served / tot_cpu_cap)

        if terminated or truncated:
            break

    urllc_murllc_arr = total_arrivals["urllc"] + total_arrivals["murllc"]
    urllc_murllc_viol = total_violations["urllc"] + total_violations["murllc"]
    cum_violation_rate = (urllc_murllc_viol / urllc_murllc_arr) if urllc_murllc_arr > 0 else 0.0

    return {
        "cum_violation_rate": cum_violation_rate,
        "p99_violation_rate": float(np.percentile(step_violation_rates, 99)),
        "mean_embb_ratio": float(np.mean(embb_throughput_ratios)),
        "mean_prb_util": float(np.mean(prb_utilizations)),
        "mean_cpu_util": float(np.mean(cpu_utilizations)),
        "total_urllc_viol": total_violations["urllc"],
        "total_murllc_viol": total_violations["murllc"],
        "total_embb_viol": total_violations["embb"],
    }


def evaluate_all(num_seeds: int = 10, output_dir: str = "results") -> pd.DataFrame:
    """Run evaluation across all scenarios and available policies."""
    os.makedirs(output_dir, exist_ok=True)
    env = SliceEnv()

    policies: Dict[str, Any] = {
        "Static": StaticPolicy(),
        "Heuristic": HeuristicPolicy(),
    }

    agent = load_agent_policy("models/agent.zip")
    if agent is not None:
        policies["Agent"] = agent

    records = []

    for sc_key, sc_cfg in SCENARIOS.items():
        print(f"\nEvaluating Scenario: {sc_cfg['name']} ({num_seeds} seeds)...")
        for pol_name, pol_obj in policies.items():
            ep_metrics: List[Dict[str, float]] = []
            for seed in range(100, 100 + num_seeds):
                metrics = run_scenario_episode(env, pol_obj, sc_cfg, seed=seed)
                ep_metrics.append(metrics)

            viol_rates = [m["cum_violation_rate"] for m in ep_metrics]
            p99_viols = [m["p99_violation_rate"] for m in ep_metrics]
            embb_ratios = [m["mean_embb_ratio"] for m in ep_metrics]
            prb_utils = [m["mean_prb_util"] for m in ep_metrics]

            records.append({
                "Scenario": sc_cfg["name"],
                "Policy": pol_name,
                "Violation Rate Mean": f"{np.mean(viol_rates):.4f}",
                "Violation Rate CI95": f"±{1.96 * np.std(viol_rates)/np.sqrt(num_seeds):.4f}",
                "p99 Violation Rate": f"{np.mean(p99_viols):.4f}",
                "eMBB Ratio Mean": f"{np.mean(embb_ratios):.4f}",
                "PRB Util Mean": f"{np.mean(prb_utils):.4f}",
            })

    df = pd.DataFrame(records)
    csv_path = os.path.join(output_dir, "evaluation_table.csv")
    df.to_csv(csv_path, index=False)
    print("\n" + "=" * 80)
    print("5G SLICING POLICY EVALUATION SUMMARY")
    print("=" * 80)
    print(df.to_string(index=False))
    print("=" * 80)
    print(f"Results saved to {csv_path}")

    return df


if __name__ == "__main__":
    evaluate_all(num_seeds=5)
