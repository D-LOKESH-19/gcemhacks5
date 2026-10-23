"""5G Slice-Level Network Simulator Environment (SliceEnv).

Simulates joint radio (PRB) and compute (vCPU) allocation across eMBB,
URLLC, and mURLLC slices under dynamic traffic and surges.
"""

from typing import Any, Dict, List, Optional, Tuple
import gymnasium as gym
from gymnasium import spaces
import numpy as np
import yaml


class SliceEnv(gym.Env):
    """Gymnasium environment simulating 5G network slicing with radio and compute constraints."""

    metadata = {"render_modes": ["human"]}

    def __init__(
        self,
        config: Optional[Dict[str, Any]] = None,
        config_path: str = "config.yaml",
        seed: Optional[int] = None,
    ) -> None:
        super().__init__()

        if config is not None:
            self.cfg = config
        else:
            with open(config_path, "r", encoding="utf-8") as f:
                self.cfg = yaml.safe_load(f)

        # Simulation parameters
        self.steps_per_episode: int = int(self.cfg.get("steps_per_episode", 200))
        self.prb_total: float = float(self.cfg.get("prb_total", 100))
        self.vcpu_total: float = float(self.cfg.get("vcpu_total", 8))
        self.prb_rate: float = float(self.cfg.get("prb_rate", 12))
        self.cpu_rate: float = float(self.cfg.get("cpu_rate", 200))
        self.slices: List[str] = list(self.cfg.get("slices", ["embb", "urllc", "murllc"]))
        self.num_slices: int = len(self.slices)

        self.arrival_mean: Dict[str, float] = {
            s: float(self.cfg["arrival_mean"][s]) for s in self.slices
        }
        self.spike_factor: Dict[str, float] = {
            s: float(self.cfg.get("spike_factor", {}).get(s, 2.5)) for s in self.slices
        }
        self.queue_max: Dict[str, float] = {
            s: float(self.cfg["queue_max"][s]) for s in self.slices
        }
        self.cost_limit: float = float(self.cfg.get("cost_limit", 0.01))
        self.lagrange_lr: float = float(self.cfg.get("lagrange_lr", 0.05))

        # Action space: 6 floats in [-1, 1] (3 PRB logits, 3 vCPU logits)
        self.action_space = spaces.Box(
            low=-1.0, high=1.0, shape=(6,), dtype=np.float32
        )

        # Observation space: 12 floats in [0, 1]
        # For each slice: [queue/queue_max, smoothed_load, prb_share, vcpu_share]
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(12,), dtype=np.float32
        )

        # RNG
        self._seed = seed
        self.np_random, _ = gym.utils.seeding.np_random(seed)

        # Internal state tracking
        self.current_step: int = 0
        self.queues: Dict[str, float] = {s: 0.0 for s in self.slices}
        self.smoothed_arrivals: Dict[str, float] = {s: self.arrival_mean[s] for s in self.slices}
        self.current_prb_shares = np.array([1.0 / self.num_slices] * self.num_slices, dtype=np.float32)
        self.current_vcpu_shares = np.array([1.0 / self.num_slices] * self.num_slices, dtype=np.float32)

        # Active spike control: {slice: (multiplier, remaining_steps)}
        self.active_spikes: Dict[str, Tuple[float, int]] = {}

        # Burst states for stochastic background bursts
        self.embb_burst_remaining: int = 0
        self.murllc_burst_remaining: int = 0

        # Episode-level metrics
        self.lambda_param: float = 0.0
        self.episode_costs: List[float] = []
        self.episode_rewards: List[float] = []

    def set_spike(self, slice_name: str, factor: float, duration_steps: int) -> None:
        """Trigger an external traffic spike on a specific slice."""
        if slice_name in self.slices and duration_steps > 0:
            self.active_spikes[slice_name] = (float(factor), int(duration_steps))

    def reset(
        self, *, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """Reset environment to initial state."""
        super().reset(seed=seed)
        if seed is not None:
            self._seed = seed
            self.np_random, _ = gym.utils.seeding.np_random(seed)

        self.current_step = 0
        self.queues = {s: 0.0 for s in self.slices}
        self.smoothed_arrivals = {s: self.arrival_mean[s] for s in self.slices}
        self.active_spikes.clear()
        self.embb_burst_remaining = 0
        self.murllc_burst_remaining = 0
        self.episode_costs.clear()
        self.episode_rewards.clear()

        # Initial equal shares
        self.current_prb_shares = np.array([1.0 / self.num_slices] * self.num_slices, dtype=np.float32)
        self.current_vcpu_shares = np.array([1.0 / self.num_slices] * self.num_slices, dtype=np.float32)

        obs = self._get_observation()
        info = self._get_info(
            arrivals={s: 0.0 for s in self.slices},
            served={s: 0.0 for s in self.slices},
            violations={s: 0.0 for s in self.slices},
            step_cost=0.0,
            step_reward=0.0,
        )
        return obs, info

    def _softmax(self, x: np.ndarray) -> np.ndarray:
        """Stable softmax calculation."""
        e_x = np.exp(x - np.max(x))
        return e_x / np.sum(e_x)

    def _generate_arrivals(self) -> Dict[str, float]:
        """Generate stochastic traffic arrivals for the current step."""
        arrivals: Dict[str, float] = {}

        # 1. eMBB: Poisson(mean * spike_multiplier) + 5% chance of 1.5x burst for 5 steps
        embb_mult = 1.0
        if "embb" in self.active_spikes and self.active_spikes["embb"][1] > 0:
            factor, remaining = self.active_spikes["embb"]
            embb_mult *= factor
            self.active_spikes["embb"] = (factor, remaining - 1)
        elif self.embb_burst_remaining > 0:
            embb_mult *= 1.5
            self.embb_burst_remaining -= 1
        elif self.np_random.random() < 0.05:
            self.embb_burst_remaining = 5
            embb_mult *= 1.5

        embb_lam = max(1.0, self.arrival_mean["embb"] * embb_mult)
        arrivals["embb"] = float(self.np_random.poisson(lam=embb_lam))

        # 2. URLLC: Poisson with periodic sinusoid (period 20, amp 30%) + active spike
        urllc_periodic = 1.0 + 0.3 * np.sin(2.0 * np.pi * self.current_step / 20.0)
        urllc_mult = urllc_periodic
        if "urllc" in self.active_spikes and self.active_spikes["urllc"][1] > 0:
            factor, remaining = self.active_spikes["urllc"]
            urllc_mult *= factor
            self.active_spikes["urllc"] = (factor, remaining - 1)

        urllc_lam = max(1.0, self.arrival_mean["urllc"] * urllc_mult)
        arrivals["urllc"] = float(self.np_random.poisson(lam=urllc_lam))

        # 3. mURLLC: Poisson baseline + 2% chance of 7x burst for 3 steps + active spike
        murllc_mult = 1.0
        if "murllc" in self.active_spikes and self.active_spikes["murllc"][1] > 0:
            factor, remaining = self.active_spikes["murllc"]
            murllc_mult *= factor
            self.active_spikes["murllc"] = (factor, remaining - 1)
        elif self.murllc_burst_remaining > 0:
            murllc_mult *= 7.0
            self.murllc_burst_remaining -= 1
        elif self.np_random.random() < 0.02:
            self.murllc_burst_remaining = 3
            murllc_mult *= 7.0

        murllc_lam = max(1.0, self.arrival_mean["murllc"] * murllc_mult)
        arrivals["murllc"] = float(self.np_random.poisson(lam=murllc_lam))

        return arrivals

    def step(
        self, action: np.ndarray
    ) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """Advance simulation by 1 step (100 ms)."""
        self.current_step += 1

        # Parse action logits or direct share vectors
        action = np.asarray(action, dtype=np.float32)
        if len(action) == 6:
            prb_shares = self._softmax(action[:3])
            vcpu_shares = self._softmax(action[3:])
        else:
            raise ValueError(f"Action must have length 6, got {len(action)}")

        self.current_prb_shares = prb_shares
        self.current_vcpu_shares = vcpu_shares

        # 1. Arrivals
        arrivals = self._generate_arrivals()

        # Update EMA smoothed arrivals (alpha = 0.3)
        for s in self.slices:
            self.smoothed_arrivals[s] = 0.7 * self.smoothed_arrivals[s] + 0.3 * arrivals[s]

        # 2. Capacities (Radio & Compute coupling)
        served: Dict[str, float] = {}
        violations: Dict[str, float] = {}
        dropped: Dict[str, float] = {}

        for idx, s in enumerate(self.slices):
            radio_cap = self.current_prb_shares[idx] * self.prb_total * self.prb_rate
            cpu_cap = self.current_vcpu_shares[idx] * self.vcpu_total * self.cpu_rate
            effective_cap = min(radio_cap, cpu_cap)

            demand = self.queues[s] + arrivals[s]
            served_packets = min(demand, effective_cap)
            served[s] = float(served_packets)

            if s == "embb":
                # Queue carryover up to queue_max
                leftover = demand - served_packets
                max_q = self.queue_max["embb"]
                self.queues["embb"] = min(max_q, leftover)
                dropped["embb"] = max(0.0, leftover - max_q)
                violations["embb"] = dropped["embb"]
            else:
                # URLLC & mURLLC: strict deadline, no queue carryover
                self.queues[s] = 0.0
                unserved = max(0.0, arrivals[s] - served_packets)
                violations[s] = float(unserved)
                dropped[s] = float(unserved)

        # 3. Reward & Cost calculation
        embb_demand = arrivals["embb"] + self.queues["embb"]
        step_reward = served["embb"] / max(1.0, embb_demand)
        step_reward = float(np.clip(step_reward, 0.0, 1.0))

        urllc_murllc_arrivals = arrivals["urllc"] + arrivals["murllc"]
        urllc_murllc_violations = violations["urllc"] + violations["murllc"]
        if urllc_murllc_arrivals > 0:
            step_cost = urllc_murllc_violations / urllc_murllc_arrivals
        else:
            step_cost = 0.0
        step_cost = float(np.clip(step_cost, 0.0, 1.0))

        self.episode_rewards.append(step_reward)
        self.episode_costs.append(step_cost)

        # Gymnasium termination / truncation
        terminated = self.current_step >= self.steps_per_episode
        truncated = False

        # Lagrangian update at episode end
        if terminated:
            mean_cost = float(np.mean(self.episode_costs)) if self.episode_costs else 0.0
            self.lambda_param = max(
                0.0, self.lambda_param + self.lagrange_lr * (mean_cost - self.cost_limit)
            )

        obs = self._get_observation()
        info = self._get_info(
            arrivals=arrivals,
            served=served,
            violations=violations,
            step_cost=step_cost,
            step_reward=step_reward,
        )

        return obs, step_reward, terminated, truncated, info

    def _get_observation(self) -> np.ndarray:
        """Construct the 12-dimensional normalized observation vector."""
        obs = []
        for idx, s in enumerate(self.slices):
            # 1. Queue ratio (0 for slices with queue_max == 0)
            q_max = self.queue_max[s]
            q_ratio = (self.queues[s] / q_max) if q_max > 0 else 0.0
            q_ratio = float(np.clip(q_ratio, 0.0, 1.0))

            # 2. Smoothed load (EMA arrivals / slice capacity)
            radio_cap = self.current_prb_shares[idx] * self.prb_total * self.prb_rate
            cpu_cap = self.current_vcpu_shares[idx] * self.vcpu_total * self.cpu_rate
            eff_cap = max(1.0, min(radio_cap, cpu_cap))
            smoothed_load = float(np.clip(self.smoothed_arrivals[s] / eff_cap, 0.0, 1.0))

            # 3. Current PRB share
            prb_s = float(np.clip(self.current_prb_shares[idx], 0.0, 1.0))

            # 4. Current vCPU share
            vcpu_s = float(np.clip(self.current_vcpu_shares[idx], 0.0, 1.0))

            obs.extend([q_ratio, smoothed_load, prb_s, vcpu_s])

        return np.array(obs, dtype=np.float32)

    def _get_info(
        self,
        arrivals: Dict[str, float],
        served: Dict[str, float],
        violations: Dict[str, float],
        step_cost: float,
        step_reward: float,
    ) -> Dict[str, Any]:
        """Construct detailed info dictionary for telemetry and dashboard."""
        urllc_murllc_arr = arrivals["urllc"] + arrivals["murllc"]
        urllc_murllc_viol = violations["urllc"] + violations["murllc"]
        violation_rate = (urllc_murllc_viol / urllc_murllc_arr) if urllc_murllc_arr > 0 else 0.0

        return {
            "step": self.current_step,
            "cost": float(step_cost),
            "reward": float(step_reward),
            "lambda": float(self.lambda_param),
            "violation_rate": float(violation_rate),
            "violations": {s: float(violations[s]) for s in self.slices},
            "throughput": {s: float(served[s]) for s in self.slices},
            "arrivals": {s: float(arrivals[s]) for s in self.slices},
            "shares": {
                "prb": {s: float(self.current_prb_shares[i]) for i, s in enumerate(self.slices)},
                "vcpu": {s: float(self.current_vcpu_shares[i]) for i, s in enumerate(self.slices)},
            },
            "queue": {s: float(self.queues[s]) for s in self.slices},
        }
