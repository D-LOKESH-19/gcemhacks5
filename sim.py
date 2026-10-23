"""5G Slice-Level Network Simulator Environment (SliceEnv) with Phase 9 Bots Support.

Simulates joint radio (PRB) and compute (vCPU) allocation across eMBB,
URLLC, and mURLLC slices under aggregate traffic or dynamic bot populations.
"""

from typing import Any, Dict, List, Optional, Tuple
import gymnasium as gym
from gymnasium import spaces
import numpy as np
import yaml

import sla


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
        self.cost_limit: float = float(self.cfg["cost_limit"])
        self.lagrange_lr: float = float(self.cfg.get("lagrange_lr", 0.05))

        # Total capacities & SLA parameters
        self.total_radio_cap: float = self.prb_total * self.prb_rate
        self.total_cpu_cap: float = self.vcpu_total * self.cpu_rate
        self.total_capacity: float = min(self.total_radio_cap, self.total_cpu_cap)
        self.embb_min_served_ratio: float = float(
            self.cfg["sla"]["embb"]["min_served_ratio"]
        )

        # Traffic mode: "aggregate" or "bots"
        self.traffic_mode: str = str(self.cfg.get("traffic_mode", "bots"))

        # Bot model configuration
        self.bots_cfg: Dict[str, Any] = self.cfg.get("bots", {})
        self.default_bot_counts: Dict[str, int] = {
            s: int(self.bots_cfg.get("default_count", {}).get(s, 40 if s == "embb" else (30 if s == "urllc" else 100)))
            for s in self.slices
        }
        self.max_bot_counts: Dict[str, int] = {
            s: int(self.bots_cfg.get("max_count", {}).get(s, 200 if s == "embb" else (150 if s == "urllc" else 1000)))
            for s in self.slices
        }

        # Action space: 6 floats in [-1, 1] (3 PRB logits, 3 vCPU logits)
        self.action_space = spaces.Box(
            low=-1.0, high=1.0, shape=(6,), dtype=np.float32
        )

        # Observation space: 12 floats in [0, 1]
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(12,), dtype=np.float32
        )

        # RNG
        self._seed = seed
        self.np_random, _ = gym.utils.seeding.np_random(seed)

        # Vectorized Bot States
        self.bot_counts: Dict[str, int] = dict(self.default_bot_counts)
        self.embb_bot_on: np.ndarray = np.zeros(0, dtype=bool)
        self.urllc_bot_phase: np.ndarray = np.zeros(0, dtype=np.float32)
        self.murllc_bot_burst_left: np.ndarray = np.zeros(0, dtype=np.int32)
        self._init_bot_states()

        # Internal state tracking
        self.current_step: int = 0
        self.queues: Dict[str, float] = {s: 0.0 for s in self.slices}
        self.smoothed_arrivals: Dict[str, float] = {s: self.arrival_mean[s] for s in self.slices}
        self.current_prb_shares = np.array([1.0 / self.num_slices] * self.num_slices, dtype=np.float32)
        self.current_vcpu_shares = np.array([1.0 / self.num_slices] * self.num_slices, dtype=np.float32)

        # Active spike control: {slice: (multiplier, remaining_steps)}
        self.active_spikes: Dict[str, Tuple[float, int]] = {}

        # Burst states for stochastic background bursts (aggregate mode)
        self.embb_burst_remaining: int = 0
        self.murllc_burst_remaining: int = 0

        # Episode-level metrics
        self.lambda_param: float = 0.0
        self.episode_costs: List[float] = []
        self.episode_rewards: List[float] = []

    def _init_bot_states(self) -> None:
        """Initialize vectorized internal states for all active bots."""
        # eMBB: ON/OFF state (steady state probability ~0.4 ON)
        n_embb = self.bot_counts["embb"]
        if n_embb > 0:
            p_on_init = self.bots_cfg.get("embb", {}).get("p_on", 0.2) / max(
                1e-4,
                self.bots_cfg.get("embb", {}).get("p_on", 0.2) + self.bots_cfg.get("embb", {}).get("p_off", 0.3)
            )
            self.embb_bot_on = self.np_random.random(size=n_embb) < p_on_init
        else:
            self.embb_bot_on = np.zeros(0, dtype=bool)

        # URLLC: Random phase in [0, 2*pi]
        n_urllc = self.bot_counts["urllc"]
        if n_urllc > 0:
            self.urllc_bot_phase = self.np_random.uniform(0.0, 2.0 * np.pi, size=n_urllc).astype(np.float32)
        else:
            self.urllc_bot_phase = np.zeros(0, dtype=np.float32)

        # mURLLC: Burst remaining steps
        n_murllc = self.bot_counts["murllc"]
        if n_murllc > 0:
            self.murllc_bot_burst_left = np.zeros(n_murllc, dtype=np.int32)
        else:
            self.murllc_bot_burst_left = np.zeros(0, dtype=np.int32)

    def set_bots(self, slice_name: str, count: int) -> int:
        """Set bot count for a slice, clipping to [0, max_count]. Returns updated count."""
        if slice_name not in self.slices:
            return 0

        max_c = self.max_bot_counts[slice_name]
        new_count = int(np.clip(int(count), 0, max_c))
        old_count = self.bot_counts[slice_name]
        self.bot_counts[slice_name] = new_count

        diff = new_count - old_count
        if slice_name == "embb":
            if diff > 0:
                new_states = self.np_random.random(size=diff) < 0.40
                self.embb_bot_on = np.concatenate([self.embb_bot_on, new_states])
            elif diff < 0:
                self.embb_bot_on = self.embb_bot_on[:new_count]
        elif slice_name == "urllc":
            if diff > 0:
                new_phases = self.np_random.uniform(0.0, 2.0 * np.pi, size=diff).astype(np.float32)
                self.urllc_bot_phase = np.concatenate([self.urllc_bot_phase, new_phases])
            elif diff < 0:
                self.urllc_bot_phase = self.urllc_bot_phase[:new_count]
        elif slice_name == "murllc":
            if diff > 0:
                new_bursts = np.zeros(diff, dtype=np.int32)
                self.murllc_bot_burst_left = np.concatenate([self.murllc_bot_burst_left, new_bursts])
            elif diff < 0:
                self.murllc_bot_burst_left = self.murllc_bot_burst_left[:new_count]

        return new_count

    def add_bots(self, slice_name: str, n: int) -> int:
        """Add n bots to a slice. Returns updated count."""
        return self.set_bots(slice_name, self.bot_counts.get(slice_name, 0) + int(n))

    def remove_bots(self, slice_name: str, n: int) -> int:
        """Remove n bots from a slice. Returns updated count."""
        return self.set_bots(slice_name, max(0, self.bot_counts.get(slice_name, 0) - int(n)))

    def get_bot_counts(self) -> Dict[str, int]:
        """Return current bot count dictionary."""
        return dict(self.bot_counts)

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

        # Reset bot counts to defaults
        self.bot_counts = dict(self.default_bot_counts)
        self._init_bot_states()

        # Initial equal shares
        self.current_prb_shares = np.array([1.0 / self.num_slices] * self.num_slices, dtype=np.float32)
        self.current_vcpu_shares = np.array([1.0 / self.num_slices] * self.num_slices, dtype=np.float32)

        obs = self._get_observation()
        info = self._get_info(
            arrivals={s: 0.0 for s in self.slices},
            bot_packets={s: 0.0 for s in self.slices},
            served={s: 0.0 for s in self.slices},
            violations={s: 0.0 for s in self.slices},
            step_cost=0.0,
            step_reward=0.0,
            step_costs={s: 0.0 for s in self.slices},
            is_step_feasible=True,
        )
        return obs, info

    def _softmax(self, x: np.ndarray) -> np.ndarray:
        """Stable softmax calculation."""
        e_x = np.exp(x - np.max(x))
        return e_x / np.sum(e_x)

    def _generate_bot_arrivals(self) -> Tuple[Dict[str, float], Dict[str, float]]:
        """Generate vectorized arrivals from individual bot populations."""
        bot_pkts: Dict[str, float] = {}

        # 1. eMBB bots: Two-state Markov ON/OFF model
        n_embb = self.bot_counts["embb"]
        if n_embb > 0:
            embb_cfg = self.bots_cfg.get("embb", {})
            p_on = embb_cfg.get("p_on", 0.20)
            p_off = embb_cfg.get("p_off", 0.30)
            rate_on = embb_cfg.get("rate_on", 25.0)

            # State transition
            sw_on = (~self.embb_bot_on) & (self.np_random.random(size=n_embb) < p_on)
            sw_off = self.embb_bot_on & (self.np_random.random(size=n_embb) < p_off)
            self.embb_bot_on[sw_on] = True
            self.embb_bot_on[sw_off] = False

            # Active bots generate Poisson packets
            active_count = int(np.count_nonzero(self.embb_bot_on))
            if active_count > 0:
                pkts = self.np_random.poisson(lam=rate_on, size=active_count)
                bot_pkts["embb"] = float(np.sum(pkts))
            else:
                bot_pkts["embb"] = 0.0
        else:
            bot_pkts["embb"] = 0.0

        # 2. URLLC bots: Periodic timing with jitter
        n_urllc = self.bot_counts["urllc"]
        if n_urllc > 0:
            urllc_cfg = self.bots_cfg.get("urllc", {})
            period = urllc_cfg.get("period_steps", 10)
            # Periodic modulation: rate = 1.0 * (1 + 0.3*sin(2*pi*t/period + phase))
            rates = 1.0 + 0.3 * np.sin(2.0 * np.pi * self.current_step / period + self.urllc_bot_phase)
            rates = np.clip(rates, 0.1, 2.0)
            pkts_urllc = self.np_random.poisson(lam=rates)
            bot_pkts["urllc"] = float(np.sum(pkts_urllc))
        else:
            bot_pkts["urllc"] = 0.0

        # 3. mURLLC bots: Rare storm bursts
        n_murllc = self.bot_counts["murllc"]
        if n_murllc > 0:
            murllc_cfg = self.bots_cfg.get("murllc", {})
            p_burst = float(murllc_cfg.get("p_burst", 2 / 100))
            burst_len = murllc_cfg.get("burst_len", 3)
            rate_burst = murllc_cfg.get("rate_burst", 3.33)

            # Trigger new bursts for quiet bots
            new_bursts = (self.murllc_bot_burst_left == 0) & (self.np_random.random(size=n_murllc) < p_burst)
            self.murllc_bot_burst_left[new_bursts] = burst_len

            # Active bursting bots
            bursting = self.murllc_bot_burst_left > 0
            burst_count = int(np.count_nonzero(bursting))
            if burst_count > 0:
                pkts_m = self.np_random.poisson(lam=rate_burst, size=burst_count)
                bot_pkts["murllc"] = float(np.sum(pkts_m))
            else:
                bot_pkts["murllc"] = 0.0

            # Decrement burst remaining
            self.murllc_bot_burst_left[bursting] -= 1
        else:
            bot_pkts["murllc"] = 0.0

        # Apply active slice spikes
        final_arrivals: Dict[str, float] = {}
        for s in self.slices:
            mult = 1.0
            if s in self.active_spikes and self.active_spikes[s][1] > 0:
                factor, remaining = self.active_spikes[s]
                mult = factor
                self.active_spikes[s] = (factor, remaining - 1)
            final_arrivals[s] = float(int(round(bot_pkts[s] * mult)))

        return final_arrivals, bot_pkts

    def _generate_aggregate_arrivals(self) -> Tuple[Dict[str, float], Dict[str, float]]:
        """Generate baseline aggregate Poisson arrivals (Phases 0-8 backward compatibility)."""
        arrivals: Dict[str, float] = {}

        # 1. eMBB
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

        # 2. URLLC
        urllc_periodic = 1.0 + 0.3 * np.sin(2.0 * np.pi * self.current_step / 20.0)
        urllc_mult = urllc_periodic
        if "urllc" in self.active_spikes and self.active_spikes["urllc"][1] > 0:
            factor, remaining = self.active_spikes["urllc"]
            urllc_mult *= factor
            self.active_spikes["urllc"] = (factor, remaining - 1)

        urllc_lam = max(1.0, self.arrival_mean["urllc"] * urllc_mult)
        arrivals["urllc"] = float(self.np_random.poisson(lam=urllc_lam))

        # 3. mURLLC
        murllc_mult = 1.0
        if "murllc" in self.active_spikes and self.active_spikes["murllc"][1] > 0:
            factor, remaining = self.active_spikes["murllc"]
            murllc_mult *= factor
            self.active_spikes["murllc"] = (factor, remaining - 1)
        elif self.murllc_burst_remaining > 0:
            murllc_mult *= 7.0
            self.murllc_burst_remaining -= 1
        elif self.np_random.random() < float(self.bots_cfg.get("murllc", {}).get("p_burst", 2 / 100)):
            self.murllc_burst_remaining = 3
            murllc_mult *= 7.0

        murllc_lam = max(1.0, self.arrival_mean["murllc"] * murllc_mult)
        arrivals["murllc"] = float(self.np_random.poisson(lam=murllc_lam))

        return arrivals, dict(arrivals)

    def step(
        self, action: np.ndarray
    ) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """Advance simulation by 1 step (100 ms)."""
        self.current_step += 1

        action = np.asarray(action, dtype=np.float32)
        if len(action) == 6:
            prb_shares = self._softmax(action[:3])
            vcpu_shares = self._softmax(action[3:])
        else:
            raise ValueError(f"Action must have length 6, got {len(action)}")

        self.current_prb_shares = prb_shares
        self.current_vcpu_shares = vcpu_shares

        # Generate arrivals according to active mode
        if self.traffic_mode == "bots":
            arrivals, bot_packets = self._generate_bot_arrivals()
        else:
            arrivals, bot_packets = self._generate_aggregate_arrivals()

        # Update EMA smoothed arrivals
        for s in self.slices:
            self.smoothed_arrivals[s] = 0.7 * self.smoothed_arrivals[s] + 0.3 * arrivals[s]

        # Capacities & Service
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
                leftover = demand - served_packets
                max_q = self.queue_max["embb"]
                self.queues["embb"] = min(max_q, leftover)
                dropped["embb"] = max(0.0, leftover - max_q)
                violations["embb"] = dropped["embb"]
            else:
                self.queues[s] = 0.0
                unserved = max(0.0, arrivals[s] - served_packets)
                violations[s] = float(unserved)
                dropped[s] = float(unserved)

        # Reward & Cost
        embb_demand = arrivals["embb"] + self.queues["embb"]
        step_reward = (served["embb"] / embb_demand) if embb_demand > 0 else 1.0
        step_reward = float(np.clip(step_reward, 0.0, 1.0))

        urllc_murllc_arr = arrivals["urllc"] + arrivals["murllc"]
        urllc_murllc_viol = violations["urllc"] + violations["murllc"]
        step_cost = (urllc_murllc_viol / urllc_murllc_arr) if urllc_murllc_arr > 0 else 0.0
        step_cost = float(np.clip(step_cost, 0.0, 1.0))

        self.episode_rewards.append(step_reward)
        self.episode_costs.append(step_cost)

        terminated = self.current_step >= self.steps_per_episode
        truncated = False

        if terminated:
            mean_cost = float(np.mean(self.episode_costs)) if self.episode_costs else 0.0
            self.lambda_param = max(
                0.0, self.lambda_param + self.lagrange_lr * (mean_cost - self.cost_limit)
            )

        # Per-slice costs (Section 5)
        urllc_cost = (violations["urllc"] / arrivals["urllc"]) if arrivals["urllc"] > 0 else 0.0
        murllc_cost = (violations["murllc"] / arrivals["murllc"]) if arrivals["murllc"] > 0 else 0.0
        embb_ratio = (served["embb"] / embb_demand) if embb_demand > 0 else 1.0
        embb_cost = max(0.0, self.embb_min_served_ratio - embb_ratio) if embb_demand > 0 else 0.0
        step_costs = {
            "urllc": float(np.clip(urllc_cost, 0.0, 1.0)),
            "murllc": float(np.clip(murllc_cost, 0.0, 1.0)),
            "embb": float(np.clip(embb_cost, 0.0, 1.0)),
        }

        # Feasible load check across all slices
        offered_load = float(sum(arrivals.values()) + self.queues["embb"])
        is_step_feasible = sla.is_feasible(offered_load, self.total_capacity, self.cfg)

        obs = self._get_observation()
        info = self._get_info(
            arrivals=arrivals,
            bot_packets=bot_packets,
            served=served,
            violations=violations,
            step_cost=step_cost,
            step_reward=step_reward,
            step_costs=step_costs,
            is_step_feasible=is_step_feasible,
        )

        return obs, step_reward, terminated, truncated, info

    def _get_observation(self) -> np.ndarray:
        """Construct the 12-dimensional normalized observation vector."""
        obs = []
        for idx, s in enumerate(self.slices):
            q_max = self.queue_max[s]
            q_ratio = (self.queues[s] / q_max) if q_max > 0 else 0.0
            q_ratio = float(np.clip(q_ratio, 0.0, 1.0))

            radio_cap = self.current_prb_shares[idx] * self.prb_total * self.prb_rate
            cpu_cap = self.current_vcpu_shares[idx] * self.vcpu_total * self.cpu_rate
            eff_cap = max(1.0, min(radio_cap, cpu_cap))
            smoothed_load = float(np.clip(self.smoothed_arrivals[s] / eff_cap, 0.0, 1.0))

            prb_s = float(np.clip(self.current_prb_shares[idx], 0.0, 1.0))
            vcpu_s = float(np.clip(self.current_vcpu_shares[idx], 0.0, 1.0))

            obs.extend([q_ratio, smoothed_load, prb_s, vcpu_s])

        return np.array(obs, dtype=np.float32)

    def _get_info(
        self,
        arrivals: Dict[str, float],
        bot_packets: Dict[str, float],
        served: Dict[str, float],
        violations: Dict[str, float],
        step_cost: float,
        step_reward: float,
        step_costs: Optional[Dict[str, float]] = None,
        is_step_feasible: bool = True,
    ) -> Dict[str, Any]:
        """Construct detailed info dictionary for telemetry and dashboard."""
        urllc_murllc_arr = arrivals["urllc"] + arrivals["murllc"]
        urllc_murllc_viol = violations["urllc"] + violations["murllc"]
        violation_rate = (urllc_murllc_viol / urllc_murllc_arr) if urllc_murllc_arr > 0 else 0.0

        if step_costs is None:
            step_costs = {s: 0.0 for s in self.slices}

        return {
            "step": self.current_step,
            "cost": float(step_cost),
            "costs": {s: float(step_costs.get(s, 0.0)) for s in self.slices},
            "feasible": bool(is_step_feasible),
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
            "bots": self.get_bot_counts(),
            "bot_packets": {s: float(bot_packets[s]) for s in self.slices},
        }
