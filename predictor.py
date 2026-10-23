"""Per-slice demand forecast and SLA-risk estimate for predictive lending (Phase L1).

No oracle: this module sees only past observable data handed in by the caller (arrivals, queues,
allocations, past violations) plus static pool constants from the config. It never imports the
simulator and never sees burst probabilities, bot schedules or future spikes.
"""
from collections import deque
from typing import Any, Deque, Dict, List, Optional

import numpy as np

SLICES = ("embb", "urllc", "murllc")
MIN_RESIDUALS = 10        # below this the output is flagged 'warming up' and a conservative margin is used
BURST_FACTOR = 3.0        # arrivals above this multiple of the recent level are flagged as a burst
BASE_ALPHA = 0.1          # slow EWMA of non-burst demand, the reference level for burst detection
BASE_FLOOR = 1.0          # packets; avoids flagging noise when the reference level is ~0
DEFAULT_BURST_LEN = 2.0   # steps; persistence assumed until a first burst has been observed
BURST_MAX_STEPS = 30      # a 'burst' this long is a regime change: the reference level is re-based
PSEUDO_COUNT = 0.5        # smoothing so risk is never exactly 0 or 1 without evidence


class SlicePredictor:
    """Forecast and risk state for one slice. All state is explicit and resettable."""

    def __init__(self, fcfg: Dict[str, Any], sla_scale: float = 1.0) -> None:
        self.sla_scale = float(sla_scale)  # share of demand that must be served for the SLA to hold (eMBB: min ratio)
        self.alpha = float(fcfg["ewma_alpha"])
        self.beta = float(fcfg["trend_beta"])
        self.damping = float(fcfg.get("trend_damping", 0.8))
        self.window = int(fcfg["residual_window"])
        self.quantile = float(fcfg["burst_quantile"])
        self.default_margin_fraction = float(fcfg["default_margin_fraction"])
        self.reset()

    def reset(self) -> None:
        """Clear all history."""
        self.n = 0
        self.level = 0.0
        self.trend = 0.0
        self.base = 0.0
        self.forecast = 0.0
        self.residuals: Deque[float] = deque(maxlen=self.window)
        self.in_burst = False
        self.burst_elapsed = 0
        self.burst_lengths: List[int] = []
        self.burst_flag = False

    def update(self, demand: float) -> None:
        """Ingest the demand observed this step (arrivals plus carried-over queue)."""
        x = max(0.0, float(demand))
        if self.n == 0:
            self.level = self.base = self.forecast = x
            self.n = 1
            self.burst_flag = False
            return

        self.residuals.append(x - self.forecast)
        is_burst = x > BURST_FACTOR * max(self.base, BASE_FLOOR)
        self.burst_flag = is_burst

        prev_level = self.level
        pred = prev_level + self.damping * self.trend
        self.level = self.alpha * x + (1.0 - self.alpha) * pred
        self.trend = self.beta * (self.level - prev_level) + (1.0 - self.beta) * self.damping * self.trend

        if is_burst:
            self.in_burst = True
            self.burst_elapsed += 1
            if self.burst_elapsed > BURST_MAX_STEPS:  # sustained shift, not a burst
                self.base, self.in_burst, self.burst_elapsed, self.burst_flag = self.level, False, 0, False
        else:
            if self.in_burst:
                self.burst_lengths.append(self.burst_elapsed)
                self.in_burst, self.burst_elapsed = False, 0
            self.base = BASE_ALPHA * x + (1.0 - BASE_ALPHA) * self.base

        fc = max(0.0, self.level + self.damping * self.trend)
        if self.in_burst:  # keep the burst level while the burst is expected to last (learned persistence)
            expected = float(np.mean(self.burst_lengths)) if self.burst_lengths else DEFAULT_BURST_LEN
            if self.burst_elapsed < expected:
                fc = max(fc, x)
        self.forecast = fc
        self.n += 1

    @property
    def warming_up(self) -> bool:
        return len(self.residuals) < MIN_RESIDUALS

    def margin(self) -> float:
        """Burst margin: high quantile of recent positive residuals, conservative until warmed up."""
        if self.warming_up:
            return self.default_margin_fraction * self.forecast
        res = np.asarray(self.residuals, dtype=float)
        pos = res[res > 0.0]
        return float(np.quantile(pos, self.quantile)) if pos.size else 0.0

    def risk_at(self, capacity: float) -> float:
        """P(SLA-relevant next-step demand > capacity) from the empirical residual distribution, in (0, 1)."""
        res = np.asarray(self.residuals, dtype=float)
        if res.size < MIN_RESIDUALS:  # pad with the conservative margin so early risk is not understated
            pad = np.full(MIN_RESIDUALS - res.size, self.default_margin_fraction * self.forecast)
            res = np.concatenate([res, pad])
        k = float(np.sum(self.sla_scale * (self.forecast + res) > capacity))
        return (k + PSEUDO_COUNT) / (res.size + 1.0)


class Predictor:
    """Three-slice predictor. Feed it one observation per step; read forecast, margin, risk, headroom."""

    def __init__(self, cfg: Dict[str, Any]) -> None:
        self.slices = tuple(cfg.get("slices", SLICES))
        self.prb_total = float(cfg["prb_total"])
        self.vcpu_total = float(cfg["vcpu_total"])
        self.prb_rate = float(cfg["prb_rate"])
        self.cpu_rate = float(cfg["cpu_rate"])
        fcfg = cfg["lending"]["forecast"]
        embb_ratio = float(cfg["sla"]["embb"]["min_served_ratio"])
        self.preds = {s: SlicePredictor(fcfg, embb_ratio if s == "embb" else 1.0) for s in self.slices}
        self.prev_queue = {s: 0.0 for s in self.slices}
        self.last: Dict[str, Dict[str, Any]] = {}

    def reset(self) -> None:
        """Clear predictor state (new episode or user reset)."""
        for p in self.preds.values():
            p.reset()
        self.prev_queue = {s: 0.0 for s in self.slices}
        self.last = {}

    def capacities(self, s: str, prb_share: float, cpu_share: float) -> Dict[str, float]:
        """Radio, compute and effective (minimum) capacity in packets per step for a slice."""
        radio = float(prb_share) * self.prb_total * self.prb_rate
        cpu = float(cpu_share) * self.vcpu_total * self.cpu_rate
        return {"radio": radio, "cpu": cpu, "effective": min(radio, cpu)}

    def update(
        self,
        arrivals: Dict[str, float],
        queues: Dict[str, float],
        prb_shares: Dict[str, float],
        cpu_shares: Dict[str, float],
        violations: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Ingest one finished step (observables only) and return per-slice outputs for the next step."""
        out: Dict[str, Dict[str, Any]] = {}
        for s in self.slices:
            p = self.preds[s]
            p.update(float(arrivals[s]) + self.prev_queue[s])
            self.prev_queue[s] = float(queues.get(s, 0.0))
            cap = self.capacities(s, prb_shares[s], cpu_shares[s])
            margin = p.margin()
            need = p.sla_scale * (p.forecast + margin)
            out[s] = {
                "forecast": p.forecast,
                "margin": margin,
                "risk": p.risk_at(cap["effective"]),
                "headroom_radio": cap["radio"] - need,
                "headroom_cpu": cap["cpu"] - need,
                "headroom": cap["effective"] - need,
                "capacity_radio": cap["radio"],
                "capacity_cpu": cap["cpu"],
                "warming_up": p.warming_up,
                "burst": p.burst_flag,
                "violations_last": float(violations[s]) if violations else 0.0,
            }
        self.last = out
        return out

    def update_from_info(self, info: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Convenience: read only the observable fields of an env step `info` dict."""
        return self.update(
            info["arrivals"], info["queue"], info["shares"]["prb"], info["shares"]["vcpu"], info.get("violations")
        )
