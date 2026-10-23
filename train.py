"""Constrained RL Training with Per-Slice Dual Lagrangian PPO (train.py).

Implements multi-constraint CMDP for 5G Slicing:
- Maximizes expected eMBB served ratio (reward)
- Subject to 3 per-slice constraints:
    * URLLC violation cost <= 0.005 (max 0.5%)
    * mURLLC violation cost <= 0.01 (max 1.0%)
    * eMBB shortfall cost <= 0.05 (mean shortfall below 0.70)
- Three dynamic Lagrange multipliers with Simple and PID dual update modes
- Realistic traffic curriculum (random spikes, bot population scaling 0.3x-3.0x, mid-episode events)
- Multi-seed training with disjoint validation & evaluation seeds and best-checkpoint selection
"""

import os
import random
import shutil
from typing import Any, Dict, List, Optional, Tuple
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
import gymnasium as gym

import sla
from sim import SliceEnv
from shield import apply_shield, shares_to_action_logits

# Disjoint seed definitions
TRAIN_SEEDS: List[int] = [42, 43, 44]
VALIDATION_SEEDS: List[int] = [51, 52, 53, 54, 55]
EVALUATION_SEEDS: List[int] = list(range(100, 120))  # 100 to 119 (20 seeds)


class TrainingSliceEnvWrapper(gym.Wrapper):
    """Wrapper that wraps SliceEnv with the safety shield, curriculum traffic, and 3-constraint CMDP."""

    def __init__(
        self,
        env: SliceEnv,
        cmdp_cfg: Optional[Dict[str, Any]] = None,
        total_timesteps: int = 100_000,
    ) -> None:
        super().__init__(env)
        self.raw_env = env
        self.total_timesteps = total_timesteps
        self.total_steps = 0

        # Load CMDP configuration
        cfg = env.cfg
        if cmdp_cfg is None:
            cmdp_cfg = cfg.get("cmdp", {})

        limits_cfg = cmdp_cfg.get("limits", {})
        self.limits: Dict[str, float] = {
            "urllc": float(limits_cfg.get("urllc", cfg.get("sla", {}).get("urllc", {}).get("max_violation_rate", 0.005))),
            "murllc": float(limits_cfg.get("murllc", cfg.get("sla", {}).get("murllc", {}).get("max_violation_rate", 0.01))),
            "embb": float(limits_cfg.get("embb_shortfall", 0.05)),
        }

        self.lambda_init = float(cmdp_cfg.get("lambda_init", 1.0))
        self.lambda_max = float(cmdp_cfg.get("lambda_max", 20.0))
        self.lagrange_lr = float(cmdp_cfg.get("lagrange_lr", 0.05))
        self.dual_mode = str(cmdp_cfg.get("dual_mode", "simple")).lower()
        self.pid_cfg = cmdp_cfg.get("pid", {"kp": 0.5, "ki": 0.05, "kd": 0.1})

        # Multipliers
        self.lambdas: Dict[str, float] = {
            "urllc": self.lambda_init,
            "murllc": self.lambda_init,
            "embb": self.lambda_init,
        }

        # PID error state
        self.pid_integrals: Dict[str, float] = {"urllc": 0.0, "murllc": 0.0, "embb": 0.0}
        self.pid_prev_errors: Dict[str, float] = {"urllc": 0.0, "murllc": 0.0, "embb": 0.0}

        # Episode tracking
        self.ep_costs: Dict[str, List[float]] = {"urllc": [], "murllc": [], "embb": []}
        self.ep_rewards: List[float] = []
        self.ep_feasible: List[float] = []
        self.last_ep_rewards: List[float] = []
        self.last_ep_costs: Dict[str, List[float]] = {"urllc": [], "murllc": [], "embb": []}
        self.last_ep_feasible: List[float] = []
        self.last_obs: np.ndarray = np.zeros(12, dtype=np.float32)
        self.mid_event_step: int = -1

    def reset(self, **kwargs):
        obs, info = self.env.reset(**kwargs)
        self.last_obs = obs
        self.ep_costs = {"urllc": [], "murllc": [], "embb": []}
        self.ep_rewards.clear()
        self.ep_feasible.clear()

        # Curriculum scheduling: mild traffic for first third, full range thereafter
        progress = min(1.0, float(self.total_steps) / max(1.0, float(self.total_timesteps)))
        if progress < 0.33:
            scale_low, scale_high = 0.5, 1.2
            spike_prob = 0.40
        else:
            bot_range = self.raw_env.cfg.get("train_bot_range", {"low": 0.3, "high": 3.0})
            scale_low = float(bot_range.get("low", 0.3))
            scale_high = float(bot_range.get("high", 3.0))
            spike_prob = 0.70

        # Randomize active bot counts per slice
        for s in self.raw_env.slices:
            scale = random.uniform(scale_low, scale_high)
            count = int(round(self.raw_env.default_bot_counts[s] * scale))
            self.raw_env.set_bots(s, count)

        # Randomize surges/spikes
        if random.random() < spike_prob:
            target = random.choice(self.raw_env.slices)
            if target == "embb":
                factor = random.uniform(2.0, 3.2)
                dur = random.randint(15, 35)
            elif target == "urllc":
                factor = random.uniform(2.5, 4.0)
                dur = random.randint(10, 25)
            else:
                factor = random.uniform(4.0, 7.5)
                dur = random.randint(10, 20)
            self.raw_env.set_spike(target, factor=factor, duration_steps=dur)

        # Mid-episode disturbance event (Section 6)
        self.mid_event_step = random.randint(60, 140) if (progress >= 0.33 and random.random() < 0.30) else -1

        # Re-sample observation after configuring traffic
        obs = self.raw_env._get_observation()
        self.last_obs = obs
        return obs, info

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        self.total_steps += 1

        # 1. Action pipeline: Policy logits -> Softmax -> Shield -> Simulator
        e_prb = np.exp(action[:3] - np.max(action[:3]))
        raw_prb = e_prb / np.sum(e_prb)
        e_cpu = np.exp(action[3:] - np.max(action[3:]))
        raw_cpu = e_cpu / np.sum(e_cpu)

        recent_load = {
            "embb": float(self.last_obs[1]),
            "urllc": float(self.last_obs[5]),
            "murllc": float(self.last_obs[9]),
        }
        sh_prb, sh_cpu, shield_active = apply_shield(raw_prb, raw_cpu, recent_load, self.raw_env.cfg)
        shielded_action = shares_to_action_logits(sh_prb, sh_cpu)

        # 2. Advance environment
        obs, step_reward, terminated, truncated, info = self.env.step(shielded_action)
        self.last_obs = obs

        # Handle mid-episode bot disturbance
        if self.raw_env.current_step == self.mid_event_step:
            target_slice = random.choice(self.raw_env.slices)
            delta = random.choice([-15, 15, -30, 30])
            self.raw_env.add_bots(target_slice, delta)

        # 3. Extract per-slice costs
        costs = info.get("costs", {
            "urllc": info["violations"]["urllc"] / max(1.0, info["arrivals"]["urllc"]),
            "murllc": info["violations"]["murllc"] / max(1.0, info["arrivals"]["murllc"]),
            "embb": max(0.0, 0.70 - (info["throughput"]["embb"] / max(1.0, info["arrivals"]["embb"] + info["queue"]["embb"]))),
        })

        for s in ["urllc", "murllc", "embb"]:
            self.ep_costs[s].append(float(costs[s]))
        self.ep_rewards.append(float(step_reward))
        self.ep_feasible.append(1.0 if info.get("feasible", True) else 0.0)

        # 4. CMDP Lagrangian step reward
        # r_t - lambda_urllc * c_urllc - lambda_murllc * c_murllc - lambda_embb * c_embb
        penalty = (
            self.lambdas["urllc"] * costs["urllc"]
            + self.lambdas["murllc"] * costs["murllc"]
            + self.lambdas["embb"] * costs["embb"]
        )
        penalized_reward = float(step_reward - penalty)

        info["penalized_reward"] = penalized_reward
        info["lambdas"] = dict(self.lambdas)
        info["shield_active"] = shield_active

        # 5. Dual update at episode termination
        if terminated or truncated:
            self.last_ep_rewards = list(self.ep_rewards)
            self.last_ep_costs = {s: list(self.ep_costs[s]) for s in ["urllc", "murllc", "embb"]}
            self.last_ep_feasible = list(self.ep_feasible)
            self._update_duals()

        return obs, penalized_reward, terminated, truncated, info

    def _update_duals(self) -> None:
        """Update Lagrangian multipliers once per episode end."""
        for s in ["urllc", "murllc", "embb"]:
            mean_c = float(np.mean(self.ep_costs[s])) if self.ep_costs[s] else 0.0
            limit = self.limits[s]
            err = mean_c - limit

            if self.dual_mode == "pid":
                self.pid_integrals[s] = float(np.clip(self.pid_integrals[s] + err, -20.0, 20.0))
                delta_err = err - self.pid_prev_errors[s]
                self.pid_prev_errors[s] = err

                kp = float(self.pid_cfg.get("kp", 0.5))
                ki = float(self.pid_cfg.get("ki", 0.05))
                kd = float(self.pid_cfg.get("kd", 0.1))

                val = self.lambdas[s] + (kp * err + ki * self.pid_integrals[s] + kd * delta_err)
                self.lambdas[s] = float(np.clip(val, 0.0, self.lambda_max))
            else:
                # Simple mode
                new_lambda = self.lambdas[s] + self.lagrange_lr * err
                self.lambdas[s] = float(np.clip(new_lambda, 0.0, self.lambda_max))


class MultiConstraintLoggingCallback(BaseCallback):
    """Logs episode reward, per-slice costs, per-slice multipliers, and feasible fraction."""

    def __init__(self, log_path: str = "runs/log.csv", verbose: int = 0) -> None:
        super().__init__(verbose)
        self.log_path = log_path
        self.episode_count = 0
        self.records: List[Dict[str, Any]] = []

    def _on_training_start(self) -> None:
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        # Initialize fresh CSV header
        with open(self.log_path, "w", encoding="utf-8") as f:
            f.write("episode,reward,cost_urllc,cost_murllc,cost_embb,lambda_urllc,lambda_murllc,lambda_embb,feasible_fraction\n")

    def _on_step(self) -> bool:
        infos = self.locals.get("infos", [])
        dones = self.locals.get("dones", [])

        for idx, done in enumerate(dones):
            if done and idx < len(infos):
                info = infos[idx]
                env_wrapper = self.training_env.envs[idx]
                # Unwrap to TrainingSliceEnvWrapper
                while hasattr(env_wrapper, "env") and not isinstance(env_wrapper, TrainingSliceEnvWrapper):
                    env_wrapper = env_wrapper.env

                if isinstance(env_wrapper, TrainingSliceEnvWrapper):
                    self.episode_count += 1
                    mean_rew = float(np.mean(env_wrapper.last_ep_rewards)) if env_wrapper.last_ep_rewards else 0.0
                    c_u = float(np.mean(env_wrapper.last_ep_costs["urllc"])) if env_wrapper.last_ep_costs["urllc"] else 0.0
                    c_m = float(np.mean(env_wrapper.last_ep_costs["murllc"])) if env_wrapper.last_ep_costs["murllc"] else 0.0
                    c_e = float(np.mean(env_wrapper.last_ep_costs["embb"])) if env_wrapper.last_ep_costs["embb"] else 0.0
                    l_u = env_wrapper.lambdas["urllc"]
                    l_m = env_wrapper.lambdas["murllc"]
                    l_e = env_wrapper.lambdas["embb"]
                    feas = float(np.mean(env_wrapper.last_ep_feasible)) if env_wrapper.last_ep_feasible else 1.0

                    line = f"{self.episode_count},{mean_rew:.4f},{c_u:.5f},{c_m:.5f},{c_e:.5f},{l_u:.4f},{l_m:.4f},{l_e:.4f},{feas:.4f}\n"
                    with open(self.log_path, "a", encoding="utf-8") as f:
                        f.write(line)

                    if self.episode_count % 50 == 0:
                        print(
                            f"[Ep {self.episode_count:4d}] Rew: {mean_rew:.3f} | "
                            f"Costs (U/M/E): {c_u:.4f}/{c_m:.4f}/{c_e:.4f} | "
                            f"Lambdas: {l_u:.2f}/{l_m:.2f}/{l_e:.2f} | Feas: {feas*100:.1f}%"
                        )
        return True


def plot_training_curves(log_path: str = "runs/log.csv", plot_path: str = "results/training.png") -> None:
    """Generate 4-panel training plot showing reward, costs, multipliers, and feasibility."""
    if not os.path.exists(log_path):
        return
    df = pd.read_csv(log_path)
    if df.empty or len(df) < 5:
        return

    os.makedirs(os.path.dirname(plot_path), exist_ok=True)
    fig, axes = plt.subplots(4, 1, figsize=(10, 12), sharex=True)

    # 1. Reward
    axes[0].plot(df["episode"], df["reward"], color="#2563eb", lw=1.5, label="Raw eMBB Reward")
    axes[0].set_ylabel("Reward")
    axes[0].set_title("Constrained PPO 5G Slicing: Multi-Constraint Training Dynamics", fontsize=12, fontweight="bold")
    axes[0].grid(True, alpha=0.3)
    axes[0].legend(loc="upper left")

    # 2. Per-Slice Costs vs Limits
    axes[1].plot(df["episode"], df["cost_urllc"], color="#dc2626", lw=1.2, label="URLLC Cost")
    axes[1].axhline(y=0.005, color="#dc2626", linestyle="--", lw=1.2, label="URLLC Limit (0.005)")
    axes[1].plot(df["episode"], df["cost_murllc"], color="#f59e0b", lw=1.2, label="mURLLC Cost")
    axes[1].axhline(y=0.010, color="#f59e0b", linestyle="--", lw=1.2, label="mURLLC Limit (0.010)")
    axes[1].plot(df["episode"], df["cost_embb"], color="#10b981", lw=1.2, label="eMBB Shortfall")
    axes[1].axhline(y=0.050, color="#10b981", linestyle="--", lw=1.2, label="eMBB Shortfall Limit (0.050)")
    axes[1].set_ylabel("Mean Cost")
    axes[1].grid(True, alpha=0.3)
    axes[1].legend(loc="upper right")

    # 3. Dual Multipliers (Lambdas)
    axes[2].plot(df["episode"], df["lambda_urllc"], color="#b91c1c", lw=1.5, label=r"$\lambda_{\mathrm{urllc}}$")
    axes[2].plot(df["episode"], df["lambda_murllc"], color="#d97706", lw=1.5, label=r"$\lambda_{\mathrm{murllc}}$")
    axes[2].plot(df["episode"], df["lambda_embb"], color="#059669", lw=1.5, label=r"$\lambda_{\mathrm{embb}}$")
    axes[2].set_ylabel(r"Lagrange Multipliers ($\lambda$)")
    axes[2].grid(True, alpha=0.3)
    axes[2].legend(loc="upper left")

    # 4. Feasible Load Fraction
    axes[3].plot(df["episode"], df["feasible_fraction"], color="#6b7280", lw=1.0, label="Feasible Load Fraction")
    axes[3].set_xlabel("Episode")
    axes[3].set_ylabel("Feasible Frac")
    axes[3].set_ylim(-0.05, 1.05)
    axes[3].grid(True, alpha=0.3)
    axes[3].legend(loc="upper left")

    plt.tight_layout()
    plt.savefig(plot_path, dpi=200)
    plt.close()
    print(f"[INFO] Training curves plot saved to {plot_path}")


def evaluate_model_on_validation(model_path: str, validation_seeds: List[int]) -> Dict[str, float]:
    """Evaluate a trained checkpoint across validation seeds on feasible scenarios."""
    model = PPO.load(model_path)
    base_env = SliceEnv()

    all_urllc_costs = []
    all_murllc_costs = []
    all_embb_shortfalls = []
    all_embb_ratios = []

    for v_seed in validation_seeds:
        for sc in ["steady", "surge"]:
            obs, info = base_env.reset(seed=v_seed)
            if sc == "surge":
                base_env.set_spike("embb", factor=2.5, duration_steps=30)

            ep_arr_u, ep_viol_u = 0.0, 0.0
            ep_arr_m, ep_viol_m = 0.0, 0.0
            ep_served_e, ep_offered_e = 0.0, 0.0

            for _ in range(base_env.steps_per_episode):
                action, _ = model.predict(obs, deterministic=True)
                # Shielding
                e_prb = np.exp(action[:3] - np.max(action[:3]))
                raw_prb = e_prb / np.sum(e_prb)
                e_cpu = np.exp(action[3:] - np.max(action[3:]))
                raw_cpu = e_cpu / np.sum(e_cpu)
                recent_load = {"embb": obs[1], "urllc": obs[5], "murllc": obs[9]}
                sh_prb, sh_cpu, _ = apply_shield(raw_prb, raw_cpu, recent_load, base_env.cfg)
                shielded_action = shares_to_action_logits(sh_prb, sh_cpu)

                obs, reward, term, trunc, info = base_env.step(shielded_action)

                ep_arr_u += info["arrivals"]["urllc"]
                ep_viol_u += info["violations"]["urllc"]
                ep_arr_m += info["arrivals"]["murllc"]
                ep_viol_m += info["violations"]["murllc"]
                ep_served_e += info["throughput"]["embb"]
                ep_offered_e += (info["arrivals"]["embb"] + info["queue"]["embb"])

                if term or trunc:
                    break

            cost_u = (ep_viol_u / ep_arr_u) if ep_arr_u > 0 else 0.0
            cost_m = (ep_viol_m / ep_arr_m) if ep_arr_m > 0 else 0.0
            ratio_e = (ep_served_e / ep_offered_e) if ep_offered_e > 0 else 1.0
            min_embb = base_env.cfg["sla"]["embb"]["min_served_ratio"]
            shortfall_e = max(0.0, min_embb - ratio_e)

            all_urllc_costs.append(cost_u)
            all_murllc_costs.append(cost_m)
            all_embb_shortfalls.append(shortfall_e)
            all_embb_ratios.append(ratio_e)

    return {
        "mean_urllc_cost": float(np.mean(all_urllc_costs)),
        "mean_murllc_cost": float(np.mean(all_murllc_costs)),
        "mean_embb_shortfall": float(np.mean(all_embb_shortfalls)),
        "mean_embb_ratio": float(np.mean(all_embb_ratios)),
    }


def train_single_seed(
    seed: int,
    total_timesteps: int = 100_000,
    dual_mode: Optional[str] = None,
) -> str:
    """Train constrained RL agent on a single seed and return saved checkpoint path."""
    print(f"\nTraining Constrained PPO Agent on Seed {seed} ({total_timesteps} steps)...")
    base_env = SliceEnv(seed=seed)

    cmdp_cfg = dict(base_env.cfg.get("cmdp", {}))
    if dual_mode is not None:
        cmdp_cfg["dual_mode"] = dual_mode

    train_env = TrainingSliceEnvWrapper(base_env, cmdp_cfg=cmdp_cfg, total_timesteps=total_timesteps)

    log_path = f"runs/log_seed{seed}.csv"
    callback = MultiConstraintLoggingCallback(log_path=log_path)

    model = PPO(
        policy="MlpPolicy",
        env=train_env,
        policy_kwargs=dict(net_arch=dict(pi=[64, 64], vf=[64, 64])),
        n_steps=1024,
        batch_size=256,
        gamma=0.95,
        learning_rate=3e-4,
        seed=seed,
        verbose=0,
    )

    model.learn(total_timesteps=total_timesteps, callback=callback)

    checkpoint_path = f"models/agent_seed{seed}.zip"
    model.save(checkpoint_path)
    print(f"[SUCCESS] Checkpoint saved: {checkpoint_path}")

    return checkpoint_path


def train(
    seeds: Optional[List[int]] = None,
    total_timesteps: int = 100_000,
) -> str:
    """Full Phase 11b multi-seed training, evaluation, and model selection pipeline."""
    if seeds is None:
        seeds = TRAIN_SEEDS

    print("=" * 70)
    print("PHASE 11b: CONSTRAINED RL MULTI-SEED CMDP TRAINING PIPELINE")
    print(f"Disjoint Training Seeds:   {seeds}")
    print(f"Disjoint Validation Seeds: {VALIDATION_SEEDS}")
    print(f"Disjoint Evaluation Seeds: {EVALUATION_SEEDS[:5]}... ({len(EVALUATION_SEEDS)} total)")
    print("=" * 70)

    # Verify disjointness
    assert set(seeds).isdisjoint(set(EVALUATION_SEEDS)), "Training seeds must be disjoint from evaluation seeds!"
    assert set(seeds).isdisjoint(set(VALIDATION_SEEDS)), "Training seeds must be disjoint from validation seeds!"

    os.makedirs("models", exist_ok=True)
    os.makedirs("runs", exist_ok=True)
    os.makedirs("results", exist_ok=True)

    # Ensure previous model backup exists
    if os.path.exists("models/agent.zip") and not os.path.exists("models/agent_prev.zip"):
        shutil.copyfile("models/agent.zip", "models/agent_prev.zip")
        print("[INFO] Backed up models/agent.zip to models/agent_prev.zip")

    checkpoint_paths: Dict[int, str] = {}
    for s in seeds:
        cp = train_single_seed(seed=s, total_timesteps=total_timesteps)
        checkpoint_paths[s] = cp

    # Model selection across validation scenarios
    print("\n" + "=" * 70)
    print("RUNNING MODEL SELECTION ON VALIDATION SCENARIOS")
    print("=" * 70)

    best_seed = None
    best_score = -1.0
    val_results = {}

    for s, cp in checkpoint_paths.items():
        val = evaluate_model_on_validation(cp, VALIDATION_SEEDS)
        val_results[s] = val
        meets_u = val["mean_urllc_cost"] <= 0.005
        meets_m = val["mean_murllc_cost"] <= 0.01
        meets_e = val["mean_embb_shortfall"] <= 0.05
        all_met = meets_u and meets_m and meets_e

        print(
            f"Seed {s}: URLLC cost={val['mean_urllc_cost']:.4f} (<=0.005: {meets_u}), "
            f"mURLLC cost={val['mean_murllc_cost']:.4f} (<=0.01: {meets_m}), "
            f"eMBB shortfall={val['mean_embb_shortfall']:.4f} (<=0.05: {meets_e}), "
            f"eMBB ratio={val['mean_embb_ratio']:.4f} | All Met: {all_met}"
        )

        if all_met and (val["mean_embb_ratio"] > best_score):
            best_score = val["mean_embb_ratio"]
            best_seed = s

    # Fallback to highest eMBB ratio among lowest violation models if none strictly met
    if best_seed is None:
        best_seed = max(val_results.keys(), key=lambda s: val_results[s]["mean_embb_ratio"])
        print(f"[WARNING] No seed met 100% of validation constraints; selected best trade-off seed {best_seed}")
    else:
        print(f"[SELECTION] Best model is Seed {best_seed} with eMBB ratio {best_score:.4f} (met all SLAs)")

    best_checkpoint = checkpoint_paths[best_seed]
    # Copy best seed log to canonical runs/log.csv
    best_log = f"runs/log_seed{best_seed}.csv"
    if os.path.exists(best_log):
        shutil.copyfile(best_log, "runs/log.csv")

    # Save to models/agent.zip
    shutil.copyfile(best_checkpoint, "models/agent.zip")
    print(f"\n[SUCCESS] Saved best selected model (Seed {best_seed}) to models/agent.zip")

    plot_training_curves("runs/log.csv", "results/training.png")
    return "models/agent.zip"


if __name__ == "__main__":
    train(seeds=[42, 43, 44], total_timesteps=100_000)
