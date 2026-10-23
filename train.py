"""Constrained RL Training with Lagrangian Relaxation for 5G Slicing (train.py).

Trains a PPO agent with a dynamic Lagrangian multiplier to maximize eMBB throughput
subject to strict URLLC/mURLLC violation limits, under randomized traffic surges.
"""

import os
import random
from typing import Any, Dict, List, Optional
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback
import gymnasium as gym

from sim import SliceEnv
from shield import apply_shield, shares_to_action_logits


class TrainingSliceEnvWrapper(gym.Wrapper):
    """Wrapper that injects randomized traffic spikes and applies the Lagrangian penalty."""

    def __init__(self, env: SliceEnv, lagrange_lr: float = 0.05, cost_limit: float = 0.01) -> None:
        super().__init__(env)
        self.raw_env = env
        self.lagrange_lr = lagrange_lr
        self.cost_limit = cost_limit
        self.lambda_param: float = 0.0
        self.episode_costs: List[float] = []
        self.episode_raw_rewards: List[float] = []

    def reset(self, **kwargs):
        obs, info = self.env.reset(**kwargs)
        self.episode_costs.clear()
        self.episode_raw_rewards.clear()

        # Randomize spikes during training to prepare policy for surges
        if random.random() < 0.60:
            target_slice = random.choice(["embb", "urllc", "murllc"])
            if target_slice == "embb":
                factor = random.uniform(2.0, 3.2)
                duration = random.randint(15, 35)
            elif target_slice == "urllc":
                factor = random.uniform(2.5, 4.0)
                duration = random.randint(10, 25)
            else:
                factor = random.uniform(4.0, 8.0)
                duration = random.randint(5, 15)

            self.raw_env.set_spike(target_slice, factor, duration)

        return obs, info

    def step(self, action: np.ndarray):
        # Apply safety shield during action execution
        prb_logits = action[:3]
        vcpu_logits = action[3:]

        e_prb = np.exp(prb_logits - np.max(prb_logits))
        raw_prb = e_prb / np.sum(e_prb)
        e_cpu = np.exp(vcpu_logits - np.max(vcpu_logits))
        raw_cpu = e_cpu / np.sum(e_cpu)

        recent_load = {
            "embb": self.raw_env.smoothed_arrivals["embb"] / max(1.0, self.raw_env.current_prb_shares[0] * 1200.0),
            "urllc": self.raw_env.smoothed_arrivals["urllc"] / max(1.0, self.raw_env.current_prb_shares[1] * 1200.0),
            "murllc": self.raw_env.smoothed_arrivals["murllc"] / max(1.0, self.raw_env.current_prb_shares[2] * 1200.0),
        }

        shielded_prb, shielded_cpu, _ = apply_shield(raw_prb, raw_cpu, recent_load)
        effective_action = shares_to_action_logits(shielded_prb, shielded_cpu)

        obs, raw_reward, terminated, truncated, info = self.env.step(effective_action)

        step_cost = info["cost"]
        self.episode_raw_rewards.append(raw_reward)
        self.episode_costs.append(step_cost)

        # Lagrangian reward: R_train = R - lambda * Cost
        train_reward = float(raw_reward - self.lambda_param * step_cost)

        if terminated or truncated:
            ep_mean_cost = float(np.mean(self.episode_costs)) if self.episode_costs else 0.0
            # Update lambda: lambda = max(0, lambda + lr * (mean_cost - cost_limit))
            self.lambda_param = max(
                0.0, self.lambda_param + self.lagrange_lr * (ep_mean_cost - self.cost_limit)
            )

        info["lagrange_lambda"] = self.lambda_param
        info["raw_reward"] = raw_reward

        return obs, train_reward, terminated, truncated, info


class LagrangianLoggingCallback(BaseCallback):
    """Logs episode metrics (reward, cost, lambda) to CSV."""

    def __init__(self, log_path: str = "runs/log.csv", verbose: int = 0):
        super().__init__(verbose)
        self.log_path = log_path
        self.records: List[Dict[str, Any]] = []
        os.makedirs(os.path.dirname(log_path), exist_ok=True)

    def _on_step(self) -> bool:
        infos = self.locals.get("infos", [])
        for inf in infos:
            if "step" in inf and inf["step"] >= 200:
                self.records.append({
                    "timestep": self.num_timesteps,
                    "lambda": inf.get("lagrange_lambda", 0.0),
                    "cost": inf.get("cost", 0.0),
                    "reward": inf.get("raw_reward", 0.0),
                    "violation_rate": inf.get("violation_rate", 0.0),
                })
        return True

    def _on_training_end(self) -> None:
        if self.records:
            df = pd.DataFrame(self.records)
            df.to_csv(self.log_path, index=False)
            print(f"[INFO] Logged {len(df)} episode records to {self.log_path}")


def plot_training_curves(log_csv: str = "runs/log.csv", output_png: str = "results/training.png"):
    """Plot and save training convergence curves."""
    if not os.path.exists(log_csv):
        return

    df = pd.read_csv(log_csv)
    if len(df) == 0:
        return

    os.makedirs(os.path.dirname(output_png), exist_ok=True)
    fig, axes = plt.subplots(3, 1, figsize=(9, 8), sharex=True)

    # 1. Reward
    axes[0].plot(df["timestep"], df["reward"].rolling(window=10, min_periods=1).mean(), color="#1f77b4", lw=2)
    axes[0].set_ylabel("eMBB Reward")
    axes[0].set_title("5G Slicing Lagrangian PPO Training Convergence", fontsize=14, fontweight="bold")
    axes[0].grid(True, linestyle="--", alpha=0.5)

    # 2. Cost vs Limit
    axes[1].plot(df["timestep"], df["violation_rate"].rolling(window=10, min_periods=1).mean(), color="#d62728", lw=2, label="Violation Rate")
    axes[1].axhline(y=0.01, color="black", linestyle="--", lw=1.5, label="SLA Cost Limit (0.01)")
    axes[1].set_ylabel("Cost / Violation Rate")
    axes[1].legend(loc="upper right")
    axes[1].grid(True, linestyle="--", alpha=0.5)

    # 3. Lambda Multiplier
    axes[2].plot(df["timestep"], df["lambda"], color="#ff7f0e", lw=2)
    axes[2].set_ylabel("Lagrangian λ")
    axes[2].set_xlabel("Environment Timesteps")
    axes[2].grid(True, linestyle="--", alpha=0.5)

    plt.tight_layout()
    plt.savefig(output_png, dpi=150)
    plt.close()
    print(f"[INFO] Saved training convergence curve to {output_png}")


def train(total_timesteps: int = 100_000, seed: int = 42) -> str:
    """Train Lagrangian PPO agent on CPU and save checkpoint."""
    print("=" * 60)
    print(f"Starting Constrained RL Training ({total_timesteps} timesteps)...")
    print("=" * 60)

    os.makedirs("models", exist_ok=True)
    os.makedirs("runs", exist_ok=True)
    os.makedirs("results", exist_ok=True)

    base_env = SliceEnv(seed=seed)
    train_env = TrainingSliceEnvWrapper(base_env, lagrange_lr=0.05, cost_limit=0.01)

    callback = LagrangianLoggingCallback(log_path="runs/log.csv")

    model = PPO(
        policy="MlpPolicy",
        env=train_env,
        policy_kwargs=dict(net_arch=dict(pi=[64, 64], vf=[64, 64])),
        n_steps=1024,
        batch_size=256,
        gamma=0.95,
        learning_rate=3e-4,
        seed=seed,
        verbose=1,
    )

    model.learn(total_timesteps=total_timesteps, callback=callback)

    model_path = "models/agent.zip"
    model.save(model_path)
    print(f"\n[SUCCESS] Model saved to {model_path}")

    plot_training_curves("runs/log.csv", "results/training.png")
    return model_path


if __name__ == "__main__":
    train(total_timesteps=100_000)
