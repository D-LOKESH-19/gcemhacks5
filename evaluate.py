"""Comprehensive SLA and RL Model Evaluation & Ablation Suite (evaluate.py).

Implements Section 7 of SLA_RL_SPEC.md:
- Evaluates 4 primary policies: Static, Heuristic, Heuristic + Shield, and RL Agent (Full)
- Evaluates 4 model ablations:
    (a) Unconstrained PPO (no shield)
    (b) Constrained PPO without shield
    (c) Shield without RL (Heuristic + Shield)
    (d) Full Model: Constrained PPO with shield
- Benchmarks 7 scenarios across 20 held-out seeds (range 100..119, strictly disjoint from training)
- Synchronized traffic generation ensuring bit-for-bit identical arrivals across all policies
- Calculates 95% bootstrap confidence intervals, window compliance rates, and worst-window metrics
- Reports feasible vs. overload scenarios separately using sla.py
- Generates results/sla_table.csv, results/ablation.csv, and comparison charts
"""

import math
import os
import shutil
from typing import Any, Dict, List, Optional, Tuple
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from stable_baselines3 import PPO

import sla
from sim import SliceEnv
from baselines import StaticPolicy, HeuristicPolicy
from shield import apply_shield, shares_to_action_logits

# 20 strictly held-out evaluation seeds (disjoint from training seeds [42, 43, 44] and validation seeds [51..55])
EVALUATION_SEEDS: List[int] = list(range(100, 120))

SCENARIOS: Dict[str, Dict[str, Any]] = {
    "steady": {
        "name": "Steady Load",
        "spike": None,
        "bots_scale": 1.0,
    },
    "embb_surge": {
        "name": "eMBB Surge",
        "spike": ("embb", 2.5, 30),
        "bots_scale": 1.0,
    },
    "urllc_burst": {
        "name": "URLLC Burst",
        "spike": ("urllc", 3.0, 20),
        "bots_scale": 1.0,
    },
    "murllc_storm": {
        "name": "mURLLC Storm",
        "spike": ("murllc", 7.0, 10),
        "bots_scale": 1.0,
    },
    "bots_0.3x": {
        "name": "Bots 0.3x Load",
        "spike": None,
        "bots_scale": 0.3,
    },
    "bots_1.0x": {
        "name": "Bots 1.0x Load",
        "spike": None,
        "bots_scale": 1.0,
    },
    "bots_3.0x": {
        "name": "Bots 3.0x Load (Stress)",
        "spike": None,
        "bots_scale": 3.0,
    },
}


class PolicyWrapper:
    """Standardized policy wrapper supporting raw baseline, shielded baseline, and RL agents."""

    def __init__(self, name: str, policy_type: str, model_path: Optional[str] = None, use_shield: bool = True) -> None:
        self.name = name
        self.policy_type = policy_type
        self.use_shield = use_shield
        self.model = None

        if policy_type == "static":
            self.base_policy = StaticPolicy()
        elif policy_type == "heuristic":
            self.base_policy = HeuristicPolicy()
        elif policy_type == "rl":
            if model_path and os.path.exists(model_path):
                self.model = PPO.load(model_path)
            else:
                raise FileNotFoundError(f"Model checkpoint not found: {model_path}")
        else:
            raise ValueError(f"Unknown policy type: {policy_type}")

    def predict(self, obs: np.ndarray, info: Dict[str, Any], cfg: Dict[str, Any]) -> np.ndarray:
        if self.policy_type in ["static", "heuristic"]:
            raw_action = self.base_policy.predict(obs, info)
            if not self.use_shield:
                return raw_action

            # Softmax to shares
            e_prb = np.exp(raw_action[:3] - np.max(raw_action[:3]))
            raw_prb = e_prb / np.sum(e_prb)
            e_cpu = np.exp(raw_action[3:] - np.max(raw_action[3:]))
            raw_cpu = e_cpu / np.sum(e_cpu)

            recent_load = {"embb": float(obs[1]), "urllc": float(obs[5]), "murllc": float(obs[9])}
            sh_prb, sh_cpu, _ = apply_shield(raw_prb, raw_cpu, recent_load, cfg)
            return shares_to_action_logits(sh_prb, sh_cpu)

        elif self.policy_type == "rl":
            action, _ = self.model.predict(obs, deterministic=True)
            if not self.use_shield:
                return action

            e_prb = np.exp(action[:3] - np.max(action[:3]))
            raw_prb = e_prb / np.sum(e_prb)
            e_cpu = np.exp(action[3:] - np.max(action[3:]))
            raw_cpu = e_cpu / np.sum(e_cpu)

            recent_load = {"embb": float(obs[1]), "urllc": float(obs[5]), "murllc": float(obs[9])}
            sh_prb, sh_cpu, _ = apply_shield(raw_prb, raw_cpu, recent_load, cfg)
            return shares_to_action_logits(sh_prb, sh_cpu)


def load_agent_policy(model_path: str = "models/agent.zip") -> Optional[PPO]:
    """Load SB3 PPO model or return None if not found (backward compatibility)."""
    if os.path.exists(model_path):
        return PPO.load(model_path)
    return None


def run_scenario_episode(env: SliceEnv, policy: Any, scenario_cfg: Dict[str, Any], seed: Optional[int] = None) -> Dict[str, Any]:
    """Execute one simulation episode and return summary metrics (backward compatibility)."""
    if seed is not None:
        obs, info = env.reset(seed=seed)
    else:
        obs, info = env.reset()

    spike = scenario_cfg.get("spike")
    if spike:
        slice_name, factor, dur = spike
        env.set_spike(slice_name, factor=factor, duration_steps=dur)

    total_viol = 0.0
    total_arr = 0.0
    embb_ratios = []

    for _ in range(env.steps_per_episode):
        if hasattr(policy, "policy"):  # SB3 model
            action, _ = policy.predict(obs, deterministic=True)
        elif hasattr(policy, "predict"):
            action = policy.predict(obs, info)
        else:
            action = np.zeros(6, dtype=np.float32)

        obs, reward, term, trunc, info = env.step(action)
        v_step = info["violations"]["urllc"] + info["violations"]["murllc"]
        a_step = info["arrivals"]["urllc"] + info["arrivals"]["murllc"]
        total_viol += v_step
        total_arr += a_step

        embb_dem = info["arrivals"]["embb"] + info["queue"]["embb"]
        r = (info["throughput"]["embb"] / embb_dem) if embb_dem > 0 else 1.0
        embb_ratios.append(r)

        if term or trunc:
            break

    return {
        "cum_violation_rate": (total_viol / total_arr) if total_arr > 0 else 0.0,
        "mean_embb_ratio": float(np.mean(embb_ratios)) if embb_ratios else 1.0,
    }


def run_single_episode(
    env: SliceEnv,
    policy: PolicyWrapper,
    scenario_cfg: Dict[str, Any],
    seed: int,
) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    """Execute one simulation episode and return full step history and total arrivals."""
    obs, info = env.reset(seed=seed)

    # Scale bots if requested
    scale = scenario_cfg.get("bots_scale", 1.0)
    if scale != 1.0:
        for s in env.slices:
            default_count = env.default_bot_counts[s]
            new_count = int(round(default_count * scale))
            env.set_bots(s, new_count)
        obs = env._get_observation()

    # Trigger spike if requested
    spike = scenario_cfg.get("spike")
    if spike:
        slice_name, factor, dur = spike
        env.set_spike(slice_name, factor=factor, duration_steps=dur)

    history: List[Dict[str, Any]] = []
    total_arrivals: Dict[str, float] = {s: 0.0 for s in env.slices}

    for _ in range(env.steps_per_episode):
        action = policy.predict(obs, info, env.cfg)
        obs, reward, term, trunc, info = env.step(action)
        history.append(info)

        for s in env.slices:
            total_arrivals[s] += info["arrivals"][s]

        if term or trunc:
            break

    return history, total_arrivals


def compute_bootstrap_ci(values: List[float], n_bootstrap: int = 1000, alpha: float = 0.05) -> Tuple[float, float]:
    """Calculate 95% bootstrap confidence interval around the sample mean."""
    if not values:
        return 0.0, 0.0
    arr = np.array(values, dtype=np.float64)
    if len(arr) == 1 or np.all(arr == arr[0]):
        return float(arr[0]), float(arr[0])

    rng = np.random.default_rng(12345)
    boot_means = []
    n = len(arr)
    for _ in range(n_bootstrap):
        sample = rng.choice(arr, size=n, replace=True)
        boot_means.append(float(np.mean(sample)))

    low = float(np.percentile(boot_means, 100.0 * (alpha / 2.0)))
    high = float(np.percentile(boot_means, 100.0 * (1.0 - alpha / 2.0)))
    return low, high


def evaluate_policies_and_scenarios(
    policies: Dict[str, PolicyWrapper],
    scenarios: Dict[str, Dict[str, Any]],
    seeds: List[int],
) -> pd.DataFrame:
    """Run full matrix evaluation, ensuring identical traffic and reporting per-slice SLA metrics."""
    env = SliceEnv()
    cfg = env.cfg

    records = []

    for sc_key, sc_cfg in scenarios.items():
        sc_name = sc_cfg["name"]
        print(f"\nEvaluating Scenario: {sc_name} across {len(seeds)} held-out seeds...")

        # Store arrivals per seed to guarantee SM-25 (traffic synchrony)
        scenario_arrivals: Dict[int, Dict[str, float]] = {}

        for pol_name, pol_obj in policies.items():
            ep_histories: List[List[Dict[str, Any]]] = []
            ep_violation_rates: List[float] = []
            ep_urllc_rates: List[float] = []
            ep_murllc_rates: List[float] = []
            ep_embb_ratios: List[float] = []
            ep_p99_viols: List[float] = []
            ep_worst_windows: List[float] = []
            ep_feasibility: List[bool] = []
            ep_sla_met: List[bool] = []

            for seed in seeds:
                hist, arrs = run_single_episode(env, pol_obj, sc_cfg, seed=seed)
                ep_histories.append(hist)

                # Verify traffic synchrony
                if seed not in scenario_arrivals:
                    scenario_arrivals[seed] = arrs
                else:
                    for s in env.slices:
                        assert math.isclose(arrs[s], scenario_arrivals[seed][s], abs_tol=1e-4), (
                            f"SM-25 FAILED: Policy {pol_name} received different arrivals on seed {seed} for {s}"
                        )

                # Episode status via sla.py
                ep_status = sla.episode_status(hist, cfg)
                u_met = ep_status["urllc"]["met"]
                m_met = ep_status["murllc"]["met"]
                e_met = ep_status["embb"]["met"]
                ep_sla_met.append(bool(u_met and m_met and e_met))

                # Violation rates
                arr_u = sum(step["arrivals"]["urllc"] for step in hist)
                viol_u = sum(step["violations"]["urllc"] for step in hist)
                arr_m = sum(step["arrivals"]["murllc"] for step in hist)
                viol_m = sum(step["violations"]["murllc"] for step in hist)
                arr_um = arr_u + arr_m
                viol_um = viol_u + viol_m

                vr = (viol_um / arr_um) if arr_um > 0 else 0.0
                ep_violation_rates.append(float(vr))
                ep_urllc_rates.append(float(viol_u / arr_u) if arr_u > 0 else 0.0)
                ep_murllc_rates.append(float(viol_m / arr_m) if arr_m > 0 else 0.0)

                # eMBB ratio
                served_e = sum(step["throughput"]["embb"] for step in hist)
                offered_e = sum(step["arrivals"]["embb"] + step["queue"]["embb"] for step in hist)
                embb_ratio = (served_e / offered_e) if offered_e > 0 else 1.0
                ep_embb_ratios.append(float(embb_ratio))

                # Step-level p99 violation
                step_viols = [step["violation_rate"] for step in hist]
                ep_p99_viols.append(float(np.percentile(step_viols, 99)))

                # Worst 20-step window
                worst_win = 0.0
                win_len = cfg.get("sla", {}).get("window_steps", 20)
                for w_start in range(0, len(hist) - win_len + 1):
                    w = hist[w_start : w_start + win_len]
                    w_arr = sum(step["arrivals"]["urllc"] + step["arrivals"]["murllc"] for step in w)
                    w_viol = sum(step["violations"]["urllc"] + step["violations"]["murllc"] for step in w)
                    w_rate = (w_viol / w_arr) if w_arr > 0 else 0.0
                    if w_rate > worst_win:
                        worst_win = w_rate
                ep_worst_windows.append(float(worst_win))

                # Feasibility check
                tot_arr = sum(arrs.values())
                tot_cap = env.total_capacity * env.steps_per_episode
                ep_feasibility.append(sla.is_feasible(tot_arr, tot_cap, cfg))

            # Aggregations across seeds
            mean_vr = float(np.mean(ep_violation_rates))
            ci_low, ci_high = compute_bootstrap_ci(ep_violation_rates)
            ci_margin = float((ci_high - ci_low) / 2.0)

            sla_met_pct = float(np.mean(ep_sla_met) * 100.0)
            window_comp_rate = float(sla.sla_compliance_rate(ep_histories, cfg) * 100.0)
            mean_embb = float(np.mean(ep_embb_ratios))
            p99_viol = float(np.mean(ep_p99_viols))
            worst_w = float(np.max(ep_worst_windows))
            is_feasible_regime = bool(np.all(ep_feasibility))

            records.append({
                "Scenario": sc_name,
                "Policy": pol_name,
                "Feasible": "Feasible" if is_feasible_regime else "Overload",
                "SLA Met (%)": f"{sla_met_pct:.1f}%",
                "Violation Rate Mean": f"{mean_vr:.4f}",
                "Violation Rate CI95": f"[{ci_low:.4f}, {ci_high:.4f}]",
                "Window Compliance Rate": f"{window_comp_rate:.1f}%",
                "p99 Violation Rate": f"{p99_viol:.4f}",
                "Mean eMBB Ratio": f"{mean_embb:.4f}",
                "Worst Window": f"{worst_w:.4f}",
                "_mean_vr_num": mean_vr,
                "_ci_margin_num": ci_margin,
                "_embb_ratio_num": mean_embb,
                "_window_comp_num": window_comp_rate,
                "_sla_met_num": sla_met_pct,
            })

    return pd.DataFrame(records)


def plot_sla_comparison(df_primary: pd.DataFrame, plot_path: str = "results/sla_comparison.png") -> None:
    """Generate grouped comparison bar charts for primary policies."""
    scenarios = df_primary["Scenario"].unique()
    policies = df_primary["Policy"].unique()

    fig, axes = plt.subplots(2, 1, figsize=(12, 9))

    x = np.arange(len(scenarios))
    width = 0.8 / len(policies)

    # 1. Violation Rate Bar Chart
    colors = {"Static": "#ef4444", "Heuristic": "#f59e0b", "Heuristic + Shield": "#3b82f6", "Agent": "#10b981"}
    for i, pol in enumerate(policies):
        sub = df_primary[df_primary["Policy"] == pol]
        rates = [float(sub[sub["Scenario"] == sc]["_mean_vr_num"].values[0]) for sc in scenarios]
        errs = [float(sub[sub["Scenario"] == sc]["_ci_margin_num"].values[0]) for sc in scenarios]
        axes[0].bar(x + i * width, rates, width, label=pol, color=colors.get(pol, None), yerr=errs, capsize=3)

    axes[0].axhline(y=0.010, color="black", linestyle="--", lw=1.2, label="SLA Max Limit (1.0%)")
    axes[0].set_ylabel("Mean Violation Rate")
    axes[0].set_title("5G Slicing: URLLC/mURLLC Violation Rates by Policy (20 Held-Out Seeds with 95% CI)", fontweight="bold")
    axes[0].set_xticks(x + width * (len(policies) - 1) / 2)
    axes[0].set_xticklabels(scenarios, rotation=15, ha="right")
    axes[0].grid(True, alpha=0.3)
    axes[0].legend(loc="upper left")

    # 2. eMBB Throughput Ratio Bar Chart
    for i, pol in enumerate(policies):
        sub = df_primary[df_primary["Policy"] == pol]
        ratios = [float(sub[sub["Scenario"] == sc]["_embb_ratio_num"].values[0]) for sc in scenarios]
        axes[1].bar(x + i * width, ratios, width, label=pol, color=colors.get(pol, None))

    axes[1].axhline(y=0.70, color="black", linestyle="--", lw=1.2, label="eMBB SLA Target (0.70)")
    axes[1].set_ylabel("eMBB Served Ratio")
    axes[1].set_title("eMBB Served Ratio by Policy across Scenarios", fontweight="bold")
    axes[1].set_xticks(x + width * (len(policies) - 1) / 2)
    axes[1].set_xticklabels(scenarios, rotation=15, ha="right")
    axes[1].set_ylim(0.0, 1.05)
    axes[1].grid(True, alpha=0.3)
    axes[1].legend(loc="lower left")

    plt.tight_layout()
    os.makedirs(os.path.dirname(plot_path), exist_ok=True)
    plt.savefig(plot_path, dpi=200)
    plt.close()
    print(f"[INFO] SLA comparison plot saved to {plot_path}")


def plot_ablation_comparison(df_ablation: pd.DataFrame, plot_path: str = "results/ablation_comparison.png") -> None:
    """Generate comparison bar chart for the 4 model ablations."""
    scenarios = df_ablation["Scenario"].unique()
    policies = df_ablation["Policy"].unique()

    fig, axes = plt.subplots(2, 1, figsize=(12, 9))
    x = np.arange(len(scenarios))
    width = 0.8 / len(policies)

    colors = [
        "#ef4444",  # (a) Unconstrained (No Shield)
        "#f97316",  # (b) Constrained PPO (No Shield)
        "#3b82f6",  # (c) Shield without RL (Heuristic + Shield)
        "#10b981",  # (d) Full Model (Constrained PPO + Shield)
    ]

    for i, pol in enumerate(policies):
        sub = df_ablation[df_ablation["Policy"] == pol]
        rates = [float(sub[sub["Scenario"] == sc]["_mean_vr_num"].values[0]) for sc in scenarios]
        axes[0].bar(x + i * width, rates, width, label=pol, color=colors[i % len(colors)])

    axes[0].axhline(y=0.010, color="black", linestyle="--", lw=1.2, label="SLA Limit (0.01)")
    axes[0].set_ylabel("Mean Violation Rate")
    axes[0].set_title("Ablation Study: Violation Rates Across Model Variants", fontweight="bold")
    axes[0].set_xticks(x + width * (len(policies) - 1) / 2)
    axes[0].set_xticklabels(scenarios, rotation=15, ha="right")
    axes[0].grid(True, alpha=0.3)
    axes[0].legend(loc="upper left")

    for i, pol in enumerate(policies):
        sub = df_ablation[df_ablation["Policy"] == pol]
        ratios = [float(sub[sub["Scenario"] == sc]["_embb_ratio_num"].values[0]) for sc in scenarios]
        axes[1].bar(x + i * width, ratios, width, label=pol, color=colors[i % len(colors)])

    axes[1].axhline(y=0.70, color="black", linestyle="--", lw=1.2, label="eMBB Target (0.70)")
    axes[1].set_ylabel("eMBB Served Ratio")
    axes[1].set_title("Ablation Study: eMBB Served Ratios Across Model Variants", fontweight="bold")
    axes[1].set_xticks(x + width * (len(policies) - 1) / 2)
    axes[1].set_xticklabels(scenarios, rotation=15, ha="right")
    axes[1].set_ylim(0.0, 1.05)
    axes[1].grid(True, alpha=0.3)
    axes[1].legend(loc="lower left")

    plt.tight_layout()
    os.makedirs(os.path.dirname(plot_path), exist_ok=True)
    plt.savefig(plot_path, dpi=200)
    plt.close()
    print(f"[INFO] Ablation comparison plot saved to {plot_path}")


def run_full_evaluation(seeds: Optional[List[int]] = None, output_dir: str = "results") -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Execute complete Phase 11c evaluation and ablation suite."""
    if seeds is None:
        seeds = EVALUATION_SEEDS

    os.makedirs(output_dir, exist_ok=True)

    print("=" * 80)
    print("PHASE 11c: 5G SLICING FULL SLA EVALUATION & ABLATION STUDY")
    print(f"Held-out Disjoint Evaluation Seeds ({len(seeds)}): {seeds}")
    print("=" * 80)

    # 1. Primary Policies
    primary_policies: Dict[str, PolicyWrapper] = {
        "Static": PolicyWrapper("Static", "static", use_shield=False),
        "Heuristic": PolicyWrapper("Heuristic", "heuristic", use_shield=False),
        "Heuristic + Shield": PolicyWrapper("Heuristic + Shield", "heuristic", use_shield=True),
        "Agent": PolicyWrapper("Agent", "rl", model_path="models/agent.zip", use_shield=True),
    }

    # 2. Ablations (Section 7)
    # (a) Unconstrained PPO (no shield, lambdas=0)
    # (b) Constrained PPO without shield
    # (c) Shield without RL (Heuristic + Shield)
    # (d) Full Model: Constrained PPO with shield
    ablation_policies: Dict[str, PolicyWrapper] = {
        "(a) Unconstrained (No Shield)": PolicyWrapper(
            "(a) Unconstrained", "rl", model_path="models/agent_unconstrained.zip", use_shield=False
        ),
        "(b) Constrained PPO (No Shield)": PolicyWrapper(
            "(b) Constrained (No Shield)", "rl", model_path="models/agent.zip", use_shield=False
        ),
        "(c) Shield without RL": PolicyWrapper(
            "(c) Shield without RL", "heuristic", use_shield=True
        ),
        "(d) Full Model": PolicyWrapper(
            "(d) Full Model", "rl", model_path="models/agent.zip", use_shield=True
        ),
    }

    # Run Primary Evaluation
    print("\n--- RUNNING PRIMARY POLICY EVALUATION (Static, Heuristic, Heuristic+Shield, Agent) ---")
    df_primary = evaluate_policies_and_scenarios(primary_policies, SCENARIOS, seeds)
    sla_table_path = os.path.join(output_dir, "sla_table.csv")
    # Save clean presentation columns to CSV
    export_cols = [
        "Scenario", "Policy", "Feasible", "SLA Met (%)", "Violation Rate Mean",
        "Violation Rate CI95", "Window Compliance Rate", "p99 Violation Rate",
        "Mean eMBB Ratio", "Worst Window"
    ]
    df_primary[export_cols].to_csv(sla_table_path, index=False)
    print(f"\n[SAVED] results/sla_table.csv saved successfully ({len(df_primary)} rows)")

    # Run Ablation Study
    print("\n--- RUNNING MODEL ABLATION STUDY (4 Variants) ---")
    df_ablation = evaluate_policies_and_scenarios(ablation_policies, SCENARIOS, seeds)
    ablation_table_path = os.path.join(output_dir, "ablation.csv")
    df_ablation[export_cols].to_csv(ablation_table_path, index=False)
    print(f"\n[SAVED] results/ablation.csv saved successfully ({len(df_ablation)} rows)")

    # Generate charts
    plot_sla_comparison(df_primary, os.path.join(output_dir, "sla_comparison.png"))
    plot_ablation_comparison(df_ablation, os.path.join(output_dir, "ablation_comparison.png"))

    # Print Summary Tables
    print("\n" + "=" * 95)
    print("TABLE 1: PRIMARY POLICY SLA EVALUATION SUMMARY (sla_table.csv)")
    print("=" * 95)
    print(df_primary[export_cols].to_string(index=False))

    print("\n" + "=" * 95)
    print("TABLE 2: ABLATION STUDY SUMMARY (ablation.csv)")
    print("=" * 95)
    print(df_ablation[export_cols].to_string(index=False))
    print("=" * 95)

    # Compute and display headline numbers from feasible scenarios
    feasible_sub = df_primary[df_primary["Feasible"] == "Feasible"]
    agent_feas = feasible_sub[feasible_sub["Policy"] == "Agent"]
    static_feas = feasible_sub[feasible_sub["Policy"] == "Static"]
    heur_sh_feas = feasible_sub[feasible_sub["Policy"] == "Heuristic + Shield"]

    agent_win_pct = agent_feas["_window_comp_num"].mean()
    static_win_pct = static_feas["_window_comp_num"].mean()
    agent_embb_mean = agent_feas["_embb_ratio_num"].mean()
    heur_sh_embb_mean = heur_sh_feas["_embb_ratio_num"].mean()
    embb_gain_pct = ((agent_embb_mean - heur_sh_embb_mean) / max(0.01, heur_sh_embb_mean)) * 100.0

    print("\n" + "=" * 80)
    print("HEADLINE NUMBERS (Feasible Scenarios Only):")
    print(
        f"* Agent meets all SLAs in {agent_win_pct:.1f}% of windows vs {static_win_pct:.1f}% for Static."
    )
    print(
        f"* Agent serves +{embb_gain_pct:.1f}% more eMBB traffic than Heuristic + Shield "
        f"({agent_embb_mean:.4f} vs {heur_sh_embb_mean:.4f})."
    )
    print("=" * 80)

    return df_primary, df_ablation


if __name__ == "__main__":
    run_full_evaluation(seeds=EVALUATION_SEEDS)
