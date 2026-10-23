"""Baseline policies for 5G Slicing: Static and Demand-Proportional Heuristic.

Provides baseline policies that plug directly into SliceEnv.
"""

from typing import Any, Dict, List, Optional, Tuple
import numpy as np


def shares_to_action_logits(prb_shares: np.ndarray, vcpu_shares: np.ndarray) -> np.ndarray:
    """Convert PRB and vCPU shares (which sum to 1) into 6D action logits for SliceEnv."""
    prb_shares = np.asarray(prb_shares, dtype=np.float32)
    vcpu_shares = np.asarray(vcpu_shares, dtype=np.float32)

    # Clip to avoid log(0)
    eps = 1e-7
    prb_logits = np.log(np.clip(prb_shares, eps, 1.0))
    vcpu_logits = np.log(np.clip(vcpu_shares, eps, 1.0))

    # Shift logits into [-1.0, 1.0] range while preserving relative softmax probabilities
    prb_logits -= np.mean(prb_logits)
    vcpu_logits -= np.mean(vcpu_logits)

    return np.concatenate([prb_logits, vcpu_logits], dtype=np.float32)


class StaticPolicy:
    """Static resource allocation baseline with fixed 60/25/15 PRB and vCPU split."""

    def __init__(self, shares: Tuple[float, float, float] = (0.60, 0.25, 0.15)) -> None:
        self.shares = np.array(shares, dtype=np.float32)
        self.shares /= np.sum(self.shares)
        self.static_action = shares_to_action_logits(self.shares, self.shares)

    def predict(self, obs: np.ndarray, info: Optional[Dict[str, Any]] = None) -> np.ndarray:
        """Return constant static action logits."""
        return self.static_action


class HeuristicPolicy:
    """Dynamic demand-proportional heuristic with safety floors for URLLC and mURLLC."""

    def __init__(
        self,
        floor_urllc: float = 0.15,
        floor_murllc: float = 0.15,
        smoothing_factor: float = 0.3,
    ) -> None:
        self.floor_urllc = floor_urllc
        self.floor_murllc = floor_murllc
        self.alpha = smoothing_factor
        self.smoothed_demand: Dict[str, float] = {"embb": 400.0, "urllc": 30.0, "murllc": 20.0}

    def reset(self) -> None:
        self.smoothed_demand = {"embb": 400.0, "urllc": 30.0, "murllc": 20.0}

    def predict(self, obs: np.ndarray, info: Optional[Dict[str, Any]] = None) -> np.ndarray:
        """Compute shares proportional to current queue + smoothed demand, applying floors."""
        if info is not None and "arrivals" in info:
            arrivals = info["arrivals"]
            queue = info.get("queue", {"embb": 0.0, "urllc": 0.0, "murllc": 0.0})
        else:
            # Fallback to estimate from obs if info not supplied
            arrivals = self.smoothed_demand
            queue = {"embb": obs[0] * 2000.0, "urllc": 0.0, "murllc": 0.0}

        # Update smoothed demand
        for s in ["embb", "urllc", "murllc"]:
            self.smoothed_demand[s] = (
                (1.0 - self.alpha) * self.smoothed_demand[s] + self.alpha * arrivals.get(s, 0.0)
            )

        # Raw demand calculation
        embb_dem = queue.get("embb", 0.0) + self.smoothed_demand["embb"]
        urllc_dem = self.smoothed_demand["urllc"]
        murllc_dem = self.smoothed_demand["murllc"]

        total_dem = max(1e-6, embb_dem + urllc_dem + murllc_dem)
        raw_embb = embb_dem / total_dem
        raw_urllc = urllc_dem / total_dem
        raw_murllc = murllc_dem / total_dem

        # Apply floors
        share_urllc = max(self.floor_urllc, raw_urllc)
        share_murllc = max(self.floor_murllc, raw_murllc)

        reserved = share_urllc + share_murllc
        if reserved >= 0.90:
            # Prevent starvation of eMBB
            scale = 0.85 / reserved
            share_urllc *= scale
            share_murllc *= scale
            share_embb = 0.15
        else:
            share_embb = 1.0 - (share_urllc + share_murllc)

        shares = np.array([share_embb, share_urllc, share_murllc], dtype=np.float32)
        shares /= np.sum(shares)

        # Apply same proportional shares to both radio PRBs and edge vCPUs
        return shares_to_action_logits(shares, shares)
