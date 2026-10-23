"""Offline predictor evaluation on recorded traces (L1; reused by L4 for LE-7).

Replays recorded episodes through `Predictor` and compares the risk at step t with whether the SLA
was actually missed at step t+1. Violation outcome: URLLC/mURLLC any violated packet; eMBB served
ratio below the SLA minimum. Run: python lending_calibration.py [--eval]  (default: validation seeds)
"""
import json
import os
import sys
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
import yaml

from evaluate import SCENARIOS, PolicyWrapper, run_single_episode
from lending_seeds import LENDING_EVALUATION_SEEDS, LENDING_VALIDATION_SEEDS
from predictor import Predictor
from shield import shares_to_action_logits
from sim import SliceEnv

N_BINS = 10


def load_cfg(path: str = "config.yaml") -> Dict[str, Any]:
    with open(path, "r") as f:
        return yaml.safe_load(f)


class LeanStaticPolicy:
    """Calibration stress policy only (not an operator policy): tight URLLC/mURLLC compute so that
    bursts really cause violations. Gives the risk estimate positive events to be scored against."""

    PRB = np.array([0.90, 0.05, 0.05])
    CPU = np.array([0.94, 0.03, 0.03])

    def predict(self, obs: np.ndarray, info: Dict[str, Any], cfg: Dict[str, Any]) -> np.ndarray:
        return shares_to_action_logits(self.PRB, self.CPU)


def make_policies() -> Dict[str, Any]:
    """Original policies plus a lean stress set; traces differ in allocation, which changes capacity and risk."""
    return {
        "lean_static_stress": LeanStaticPolicy(),
        "static": PolicyWrapper("Static", "static", use_shield=False),
        "heuristic_shield": PolicyWrapper("Heuristic+Shield", "heuristic", use_shield=True),
        "agent_shield": PolicyWrapper("Agent+Shield", "rl", model_path="models/agent_pre_lending.zip", use_shield=True),
    }


def pairs_from_history(hist: List[Dict[str, Any]], cfg: Dict[str, Any]) -> Dict[str, Dict[str, np.ndarray]]:
    """Per slice: forecast error pairs and (risk_t, violated_{t+1}) pairs from one recorded episode."""
    pred = Predictor(cfg)
    min_ratio = float(cfg["sla"]["embb"]["min_served_ratio"])
    slices = list(cfg["slices"])
    outs = [pred.update_from_info(info) for info in hist]
    res: Dict[str, Dict[str, List[float]]] = {s: {"risk": [], "y": [], "fc_err": [], "naive_err": []} for s in slices}
    prev_q = {s: 0.0 for s in slices}
    demands = []
    for info in hist:
        demands.append({s: info["arrivals"][s] + prev_q[s] for s in slices})
        prev_q = {s: info["queue"][s] for s in slices}
    for t in range(len(hist) - 1):
        for s in slices:
            nxt = hist[t + 1]
            if s == "embb":
                d = demands[t + 1][s]
                y = float(d > 0 and nxt["throughput"][s] / d < min_ratio)
            else:
                y = float(nxt["violations"][s] > 0)
            res[s]["risk"].append(outs[t][s]["risk"])
            res[s]["y"].append(y)
            res[s]["fc_err"].append(abs(demands[t + 1][s] - outs[t][s]["forecast"]))
            res[s]["naive_err"].append(abs(demands[t + 1][s] - demands[t][s]))
    return {s: {k: np.asarray(v) for k, v in d.items()} for s, d in res.items()}


def auc_score(risk: np.ndarray, y: np.ndarray) -> float:
    """ROC AUC by rank statistic with average ranks for ties; nan if one class is absent."""
    pos, neg = int(y.sum()), int((1 - y).sum())
    if pos == 0 or neg == 0:
        return float("nan")
    _, inv, counts = np.unique(risk, return_inverse=True, return_counts=True)
    ends = np.cumsum(counts)
    avg_rank = ends - (counts - 1) / 2.0  # average 1-based rank of each tie group
    ranks = avg_rank[inv]
    return float((ranks[y == 1].sum() - pos * (pos + 1) / 2.0) / (pos * neg))


def reliability_table(risk: np.ndarray, y: np.ndarray) -> pd.DataFrame:
    """Predicted-risk bins versus observed next-step violation frequency."""
    edges = np.linspace(0.0, 1.0, N_BINS + 1)
    idx = np.clip(np.digitize(risk, edges[1:-1], right=False), 0, N_BINS - 1)
    rows = []
    for b in range(N_BINS):
        m = idx == b
        n = int(m.sum())
        rows.append({
            "bin_lo": edges[b], "bin_hi": edges[b + 1], "n": n,
            "mean_predicted": float(risk[m].mean()) if n else np.nan,
            "observed_freq": float(y[m].mean()) if n else np.nan,
        })
    return pd.DataFrame(rows)


def summarize(risk: np.ndarray, y: np.ndarray, fc_err: np.ndarray, naive_err: np.ndarray) -> Dict[str, Any]:
    """Brier vs constant-rate baseline, AUC, expected calibration error, forecast error vs naive."""
    n = len(y)
    base = float(y.mean()) if n else float("nan")
    brier = float(np.mean((risk - y) ** 2)) if n else float("nan")
    brier_const = float(np.mean((base - y) ** 2)) if n else float("nan")
    tab = reliability_table(risk, y)
    ece = float(sum(r.n * abs(r.mean_predicted - r.observed_freq) for r in tab.itertuples() if r.n) / max(n, 1))
    return {
        "n": n, "base_rate": base, "brier": brier, "brier_constant": brier_const,
        "brier_skill": (1.0 - brier / brier_const) if brier_const and brier_const > 0 else float("nan"),
        "auc": auc_score(risk, y), "ece": ece,
        "mae_forecast": float(fc_err.mean()), "mae_naive": float(naive_err.mean()),
    }


def collect(seeds: List[int], cfg: Dict[str, Any]) -> Dict[Tuple[str, str], Dict[str, Dict[str, list]]]:
    """Run every policy x scenario x seed once and return pooled pairs keyed by (policy, scenario)."""
    pooled: Dict[Tuple[str, str], Dict[str, Dict[str, list]]] = {}
    for pol_key, pol in make_policies().items():
        for sc_key, sc in SCENARIOS.items():
            acc = {s: {"risk": [], "y": [], "fc_err": [], "naive_err": []} for s in cfg["slices"]}
            for seed in seeds:
                hist, _ = run_single_episode(SliceEnv(), pol, sc, seed)
                for s, d in pairs_from_history(hist, cfg).items():
                    for k, v in d.items():
                        acc[s][k].append(v)
            pooled[(pol_key, sc_key)] = acc
    return pooled


def run(seeds: List[int], tag: str, out_dir: str = "results") -> Dict[str, Any]:
    """Compute and save the calibration report for the given seeds."""
    cfg = load_cfg()
    pooled = collect(seeds, cfg)
    rows, summary = [], {}
    all_by_slice: Dict[str, Dict[str, list]] = {s: {"risk": [], "y": [], "fc_err": [], "naive_err": []} for s in cfg["slices"]}
    for (pol, sc), acc in pooled.items():
        for s, d in acc.items():
            cat = {k: np.concatenate(v) for k, v in d.items()}
            row = {"policy": pol, "scenario": sc, "slice": s, **summarize(**cat)}
            rows.append(row)
            for k, v in cat.items():
                all_by_slice[s][k].append(v)
    pooled_rows = []
    overall = {k: [] for k in ("risk", "y", "fc_err", "naive_err")}
    for s, d in all_by_slice.items():
        cat = {k: np.concatenate(v) for k, v in d.items()}
        pooled_rows.append({"slice": s, **summarize(**cat)})
        tab = reliability_table(cat["risk"], cat["y"])
        tab.insert(0, "slice", s)
        tab.to_csv(os.path.join(out_dir, f"lending_reliability_{tag}_{s}.csv"), index=False)
        for k in overall:
            overall[k].append(cat[k])
    cat_all = {k: np.concatenate(v) for k, v in overall.items()}
    tab_all = reliability_table(cat_all["risk"], cat_all["y"])
    tab_all.insert(0, "slice", "all")
    tab_all.to_csv(os.path.join(out_dir, f"lending_reliability_{tag}_all.csv"), index=False)
    summary = {"seeds": seeds, "overall": summarize(**cat_all), "by_slice": pooled_rows}
    pd.DataFrame(rows).to_csv(os.path.join(out_dir, f"lending_predictor_{tag}.csv"), index=False)
    with open(os.path.join(out_dir, f"lending_predictor_{tag}.json"), "w") as f:
        json.dump(summary, f, indent=1)
    return summary


if __name__ == "__main__":
    use_eval = "--eval" in sys.argv
    seeds = LENDING_EVALUATION_SEEDS if use_eval else LENDING_VALIDATION_SEEDS
    tag = "eval" if use_eval else "val"
    print(f"{tag} seeds: {seeds}")
    s = run(seeds, tag)
    print(json.dumps(s["overall"], indent=1))
    print(pd.DataFrame(s["by_slice"]).round(4).to_string())
