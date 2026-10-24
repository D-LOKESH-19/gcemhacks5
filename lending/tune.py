"""Threshold tuning for lending on VALIDATION seeds only (Phase L4, LE-9).

Selection rule (fixed before running): among the grid, on feasible scenarios only,
  1. fewest URLLC+mURLLC violated packets, then
  2. highest mean eMBB served ratio, then
  3. fewest loans opened, then
  4. the config closest to the shipped defaults.
Evaluation seeds are never used here. Writes results/lending_tuning_val.csv and .json.
"""
import itertools
import json
import sys

import pandas as pd
import yaml

from lending.evaluation import SCENARIOS, lending_cfg, load_cfg, make_policies, run_matrix
from lending.seeds import LENDING_EVALUATION_SEEDS, LENDING_VALIDATION_SEEDS

GRID = {
    "risk.high": [0.2, 0.3, 0.5],
    "risk.confirm_steps": [1, 2],
    "forecast.ewma_alpha": [0.2, 0.4],
}
DEFAULTS = {"risk.high": 0.3, "risk.confirm_steps": 2, "forecast.ewma_alpha": 0.4}
FEASIBLE_SCENARIOS = ["steady", "embb_surge", "urllc_burst", "murllc_storm", "bots_0.3x", "bots_1.0x"]


def overrides(point: dict) -> dict:
    out: dict = {}
    for k, v in point.items():
        a, b = k.split(".")
        out.setdefault(a, {})[b] = v
    return out


def main() -> None:
    assert set(LENDING_VALIDATION_SEEDS).isdisjoint(LENDING_EVALUATION_SEEDS)
    print("validation (tuning) seeds:", LENDING_VALIDATION_SEEDS)
    print("evaluation seeds (NOT used here):", LENDING_EVALUATION_SEEDS)
    cfg = load_cfg()
    sc = {k: SCENARIOS[k] for k in FEASIBLE_SCENARIOS}
    rows = []
    for vals in itertools.product(*GRID.values()):
        point = dict(zip(GRID.keys(), vals))
        c = lending_cfg(cfg, **overrides(point))
        pols = make_policies(c, ["enhanced"])
        ep = run_matrix(pols, sc, LENDING_VALIDATION_SEEDS, c, progress=False)
        r = {**point, "viol_total": float(ep.viol_total.sum()), "onset_viol_total": float(ep.onset_viol_total.sum()),
             "embb_ratio": float(ep.embb_ratio.mean()), "loans_opened": float(ep.loans_opened.sum()),
             "sla_met_all_pct": 100.0 * float(ep.sla_met_all.mean()), "dist_to_default": sum(point[k] != DEFAULTS[k] for k in GRID)}
        rows.append(r)
        print(r, flush=True)
    df = pd.DataFrame(rows)
    df = df.sort_values(["viol_total", "embb_ratio", "loans_opened", "dist_to_default"], ascending=[True, False, True, True]).reset_index(drop=True)
    df.to_csv("results/lending_tuning_val.csv", index=False)
    best = {k: (int(df.loc[0, k]) if k == "risk.confirm_steps" else float(df.loc[0, k])) for k in GRID}
    json.dump({"validation_seeds": LENDING_VALIDATION_SEEDS, "evaluation_seeds_not_used": LENDING_EVALUATION_SEEDS,
               "scenarios": FEASIBLE_SCENARIOS, "grid": GRID, "chosen": best, "defaults": DEFAULTS},
              open("results/lending_tuning_val.json", "w"), indent=1)
    print("\nRanked:\n", df.to_string())
    print("\nCHOSEN:", best, "(defaults:", DEFAULTS, ")")


if __name__ == "__main__":
    main()
