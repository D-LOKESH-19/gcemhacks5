"""Paired evaluation of SLA-aware predictive lending (Phase L4).

Every policy runs on identical traffic (same seed, same scenario events). Metrics come from the
recorded step infos and `sla.py`; nothing here is tuned on the evaluation seeds.

Policies: static, heuristic_shield, agent_shield (original), enhanced, and ablations
enhanced_reactive, enhanced_no_return, enhanced_radio_only.
"""
import copy
import math
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yaml
from stable_baselines3 import PPO

import sla
from evaluate import SCENARIOS as BASE_SCENARIOS, PolicyWrapper, run_single_episode
from lender import EnhancedPolicy
from sim import SliceEnv

MODEL_PATH = "models/agent_pre_lending.zip"   # byte-identical to models/agent.zip
ONSET_LEN = 3                                  # steps counted after a burst/spike starts
ONSET_FACTOR = 2.0                             # arrivals above this multiple of the trailing mean mark an onset
ONSET_LOOKBACK = 10
SCENARIOS: Dict[str, Dict[str, Any]] = dict(BASE_SCENARIOS)
SCENARIOS["bots_5.0x"] = {"name": "Bots 5.0x Load (Overload)", "spike": None, "bots_scale": 5.0}

POLICY_ORDER = ["static", "heuristic_shield", "agent_shield", "enhanced",
                "enhanced_reactive", "enhanced_no_return", "enhanced_radio_only"]
ENH_VARIANTS = {
    "enhanced": {},
    "enhanced_reactive": {"mode": "reactive"},
    "enhanced_no_return": {"returns": False},
    "enhanced_radio_only": {"bottleneck_aware": False},
}


def load_cfg(path: str = "config.yaml") -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def lending_cfg(cfg: Dict[str, Any], **over: Any) -> Dict[str, Any]:
    """Copy of cfg with lending overrides; nested dicts are merged one level deep."""
    c = copy.deepcopy(cfg)
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(c["lending"].get(k), dict):
            c["lending"][k].update(v)
        else:
            c["lending"][k] = v
    return c


def make_policies(cfg: Dict[str, Any], names: Optional[List[str]] = None) -> Dict[str, Any]:
    """Build the requested policies. Enhanced variants share one PPO model object, each has its own lender."""
    names = names or POLICY_ORDER
    model = PPO.load(MODEL_PATH)
    pols: Dict[str, Any] = {}
    for n in names:
        if n == "static":
            pols[n] = PolicyWrapper("Static", "static", use_shield=False)
        elif n == "heuristic_shield":
            pols[n] = PolicyWrapper("Heuristic + Shield", "heuristic", use_shield=True)
        elif n == "agent_shield":
            pols[n] = PolicyWrapper("Agent + Shield", "rl", model_path=MODEL_PATH, use_shield=True)
        else:
            pols[n] = EnhancedPolicy(model, lending_cfg(cfg, **ENH_VARIANTS[n]))
    return pols


def onset_steps(hist: List[Dict[str, Any]], spike: Optional[Tuple[str, float, int]], s: str) -> Tuple[List[int], List[int]]:
    """Onset step indices of bursts/spikes in slice s and the union of the ONSET_LEN-step windows after them.

    Uses the (policy-independent) arrival trace plus the scenario's own spike start; this is evaluation
    bookkeeping only and is never visible to the predictor or lender."""
    arr = np.array([h["arrivals"][s] for h in hist], dtype=float)
    marks = set()
    if spike and spike[0] == s:
        marks.add(0)
    prev = False
    for t in range(ONSET_LOOKBACK, len(arr)):
        flag = arr[t] > ONSET_FACTOR * max(arr[t - ONSET_LOOKBACK:t].mean(), 1.0)
        if flag and not prev:
            marks.add(t)
        prev = flag
    steps = sorted({u for t in marks for u in range(t, min(len(arr), t + ONSET_LEN))})
    return sorted(marks), steps


def episode_metrics(hist: List[Dict[str, Any]], arrs: Dict[str, float], cfg: Dict[str, Any],
                    spike: Optional[Tuple[str, float, int]], lstats: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """All per-episode metrics for one policy run."""
    T = len(hist)
    m: Dict[str, Any] = {"steps": T}
    steps_cap = sum(arrs.values())
    m["feasible"] = bool(sla.is_feasible(steps_cap, SliceEnv(config=cfg).total_capacity * T, cfg))
    for s in ("urllc", "murllc"):
        arr = sum(h["arrivals"][s] for h in hist)
        vio = sum(h["violations"][s] for h in hist)
        m[f"viol_{s}"], m[f"arr_{s}"] = vio, arr
        m[f"rate_{s}"] = vio / arr if arr > 0 else 0.0
        marks, win = onset_steps(hist, spike, s)
        m[f"n_onsets_{s}"] = len(marks)
        m[f"onset_viol_{s}"] = sum(hist[t]["violations"][s] for t in win)
    m["viol_total"] = m["viol_urllc"] + m["viol_murllc"]
    m["onset_viol_total"] = m["onset_viol_urllc"] + m["onset_viol_murllc"]
    arr_um = m["arr_urllc"] + m["arr_murllc"]
    m["rate_um"] = m["viol_total"] / arr_um if arr_um > 0 else 0.0
    dem = [h["arrivals"]["embb"] + (hist[i - 1]["queue"]["embb"] if i else 0.0) for i, h in enumerate(hist)]
    served = [h["throughput"]["embb"] for h in hist]
    m["embb_ratio"] = sum(served) / sum(dem) if sum(dem) > 0 else 1.0
    emb_marks, emb_win = onset_steps(hist, spike, "embb") if spike and spike[0] == "embb" else ([], [])
    d_on = sum(dem[t] for t in emb_win)
    m["embb_onset_ratio"] = (sum(served[t] for t in emb_win) / d_on) if d_on > 0 else float("nan")
    P, C = cfg["prb_total"] * cfg["prb_rate"], cfg["vcpu_total"] * cfg["cpu_rate"]
    cap = served_all = 0.0
    for h in hist:
        for s in cfg["slices"]:
            cap += min(h["shares"]["prb"][s] * P, h["shares"]["vcpu"][s] * C)
            served_all += h["throughput"][s]
    m["util"] = served_all / cap if cap > 0 else 0.0
    st = sla.episode_status(hist, cfg)
    m["sla_met_all"] = bool(all(st[s]["met"] for s in ("urllc", "murllc", "embb")))
    m["sla_met_um"] = bool(st["urllc"]["met"] and st["murllc"]["met"])
    m["win_comp_um"] = sla.sla_compliance_rate([hist], cfg)
    for s in ("urllc", "murllc", "embb"):
        m[f"win_comp_{s}"] = sla.sla_compliance_rate([hist], cfg, slice_name=s)
    w = cfg["sla"]["window_steps"]
    worst = 0.0
    for a in range(0, T - w + 1):
        win = hist[a:a + w]
        wa = sum(h["arrivals"]["urllc"] + h["arrivals"]["murllc"] for h in win)
        wv = sum(h["violations"]["urllc"] + h["violations"]["murllc"] for h in win)
        worst = max(worst, wv / wa if wa > 0 else 0.0)
    m["worst_window"] = worst
    ls = lstats or {}
    m["loans_opened"] = ls.get("loans_opened", 0)
    m["loans_mean_amount"] = ls.get("mean_amount", 0.0)
    m["loans_mean_duration"] = ls.get("mean_duration_steps", 0.0)
    m["loans_mean_return_lag"] = ls.get("mean_return_lag_steps", 0.0)
    m["loans_recalls"] = ls.get("recalls", 0)
    m["loans_enlargements"] = ls.get("enlargements", 0)
    m["overload_frac"] = ls.get("overload_steps", 0) / max(1, ls.get("steps", T)) if lstats else 0.0
    return m


def run_matrix(policies: Dict[str, Any], scenarios: Dict[str, Dict[str, Any]], seeds: List[int],
               cfg: Dict[str, Any], progress: bool = True) -> pd.DataFrame:
    """Run every policy on every scenario and seed; assert identical traffic across policies."""
    env = SliceEnv(config=cfg)
    rows = []
    for sc_key, sc in scenarios.items():
        ref_arr: Dict[int, Dict[str, float]] = {}
        for pol_key, pol in policies.items():
            for seed in seeds:
                hist, arrs = run_single_episode(env, pol, sc, seed)
                if seed in ref_arr:
                    for s in env.slices:
                        assert math.isclose(arrs[s], ref_arr[seed][s], abs_tol=1e-6), f"traffic differs: {pol_key} {sc_key} {seed} {s}"
                else:
                    ref_arr[seed] = arrs
                ls = pol.lender.stats() if isinstance(pol, EnhancedPolicy) else None
                row = {"scenario": sc_key, "policy": pol_key, "seed": seed}
                row.update(episode_metrics(hist, arrs, cfg, sc.get("spike"), ls))
                rows.append(row)
        if progress:
            print(f"  scenario {sc_key} done ({len(policies)} policies x {len(seeds)} seeds)", flush=True)
    return pd.DataFrame(rows)


def paired_bootstrap(diffs: np.ndarray, n_boot: int = 5000, seed: int = 12345) -> Tuple[float, float, float]:
    """Mean of paired per-seed differences with a 95% bootstrap interval over seeds."""
    d = np.asarray(diffs, dtype=float)
    d = d[~np.isnan(d)]
    if d.size == 0:
        return float("nan"), float("nan"), float("nan")
    if np.all(d == d[0]):
        return float(d[0]), float(d[0]), float(d[0])
    rng = np.random.default_rng(seed)
    means = rng.choice(d, size=(n_boot, d.size), replace=True).mean(axis=1)
    return float(d.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


# metric -> (column, higher_is_better)
PAIRED_METRICS = {
    "viol_total": ("viol_total", False),
    "onset_viol_total": ("onset_viol_total", False),
    "rate_um": ("rate_um", False),
    "win_comp_um": ("win_comp_um", True),
    "embb_ratio": ("embb_ratio", True),
    "embb_onset_ratio": ("embb_onset_ratio", True),
    "util": ("util", True),
}
PAIRS = [("agent_shield", "enhanced"), ("static", "enhanced"), ("heuristic_shield", "enhanced"),
         ("enhanced_reactive", "enhanced"), ("enhanced_no_return", "enhanced"), ("enhanced_radio_only", "enhanced")]


def paired_table(ep: pd.DataFrame, pairs: List[Tuple[str, str]] = PAIRS) -> pd.DataFrame:
    """Per scenario: improvement of `comparator` over `baseline`, positive = comparator is better."""
    rows = []
    for sc, g in ep.groupby("scenario", sort=False):
        feas = bool(g["feasible"].all())
        for base, comp in pairs:
            if base not in set(g.policy) or comp not in set(g.policy):
                continue
            a = g[g.policy == base].set_index("seed").sort_index()
            b = g[g.policy == comp].set_index("seed").sort_index()
            assert list(a.index) == list(b.index)
            for name, (col, hib) in PAIRED_METRICS.items():
                diff = (b[col] - a[col]) if hib else (a[col] - b[col])
                mean, lo, hi = paired_bootstrap(diff.values)
                rows.append({"scenario": sc, "regime": "feasible" if feas else "overload", "baseline": base,
                             "comparator": comp, "metric": name, "baseline_mean": float(a[col].mean()),
                             "comparator_mean": float(b[col].mean()), "improvement": mean, "ci_lo": lo, "ci_hi": hi,
                             "n_seeds": int(diff.notna().sum()), "n_nonzero": int((diff.abs() > 1e-12).sum())})
    return pd.DataFrame(rows)


def summary_table(ep: pd.DataFrame) -> pd.DataFrame:
    """Per scenario x policy means over seeds with bootstrap CIs for the headline metrics."""
    rows = []
    for (sc, pol), g in ep.groupby(["scenario", "policy"], sort=False):
        r = {"scenario": sc, "policy": pol, "regime": "feasible" if g["feasible"].all() else "overload", "n_seeds": len(g)}
        for col in ("viol_total", "onset_viol_total", "rate_um", "embb_ratio", "util", "win_comp_um", "worst_window",
                    "loans_opened", "loans_mean_amount", "loans_mean_duration", "loans_mean_return_lag", "loans_recalls",
                    "overload_frac", "win_comp_urllc", "win_comp_murllc", "win_comp_embb", "rate_urllc", "rate_murllc"):
            v = g[col].values.astype(float)
            mean, lo, hi = paired_bootstrap(v)  # CI of the mean over seeds
            r[col], r[f"{col}_lo"], r[f"{col}_hi"] = float(v.mean()), lo, hi
        r["sla_met_all_pct"] = 100.0 * float(g["sla_met_all"].mean())
        r["sla_met_um_pct"] = 100.0 * float(g["sla_met_um"].mean())
        rows.append(r)
    return pd.DataFrame(rows)
