"""Phase L4 acceptance tests LE-1 to LE-10. Run AFTER lending_tune.py, lending_run_eval.py and lending_report.py.
Run: python test_files/test_lending_eval.py"""
import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd
import yaml

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

from lending_eval import SCENARIOS, load_cfg, make_policies, run_matrix, episode_metrics  # noqa: E402
from lending_seeds import LENDING_EVALUATION_SEEDS, LENDING_VALIDATION_SEEDS  # noqa: E402

R = "results"
results = []


def check(tid, ok, msg):
    results.append(bool(ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {tid}: {msg}")


ep = pd.read_csv(f"{R}/lending_episodes.csv")
pt = pd.read_csv(f"{R}/lending_paired.csv")
sm = pd.read_csv(f"{R}/lending_summary.csv")
ld = pd.read_csv(f"{R}/lending_loans.csv")
hl = json.load(open(f"{R}/lending_headline.json"))
pe = json.load(open(f"{R}/lending_predictor_eval.json"))
sd = json.load(open(f"{R}/lending_seeds.json"))
tu = json.load(open(f"{R}/lending_tuning_val.json"))
rep = open(f"{R}/lending_report.md", encoding="utf-8").read()
cfg = load_cfg()


def row(scn, base, comp, metric):
    r = pt[(pt.scenario == scn) & (pt.baseline == base) & (pt.comparator == comp) & (pt.metric == metric)]
    return r.iloc[0] if len(r) else None


def le1():
    s_a = sorted(ep[ep.policy == "agent_shield"].seed.unique())
    s_e = sorted(ep[ep.policy == "enhanced"].seed.unique())
    same_traffic = True
    for (sc, seed), g in ep.groupby(["scenario", "seed"]):
        same_traffic &= g[["arr_urllc", "arr_murllc"]].nunique().max() == 1
    ok_rows = all(row(sc, "agent_shield", "enhanced", "viol_total") is not None and row(sc, "agent_shield", "enhanced", "viol_total").n_seeds == 20 for sc in SCENARIOS)
    check("LE-1", s_a == s_e == LENDING_EVALUATION_SEEDS and same_traffic and ok_rows,
          f"Enhanced and original agent on the same {len(s_e)} held-out seeds {s_e[0]}..{s_e[-1]}; identical arrivals per (scenario, seed) across all 7 policies; paired CI for the violation difference in all {len(SCENARIOS)} scenarios")
    for sc in SCENARIOS:
        r = row(sc, "agent_shield", "enhanced", "viol_total")
        print(f"      {sc:13s} violations avoided: {r.improvement:+.4f} [{r.ci_lo:+.4f}, {r.ci_hi:+.4f}] (agent {r.baseline_mean:.3f} -> enhanced {r.comparator_mean:.3f}, {int(r.n_nonzero)}/20 seeds differ)")


def le2():
    regimes = {sc: ("feasible" if g.feasible.all() else "overload") for sc, g in ep.groupby("scenario")}
    print("      regimes:", regimes)
    ok = set(ep.scenario) == set(SCENARIOS) and set(hl["feasible_scenarios"]).isdisjoint(hl["overload_scenarios"]) \
        and set(hl["overload_scenarios"]) == {s for s, r in regimes.items() if r == "overload"} and "regime" in sm.columns
    check("LE-2", ok and len(hl["overload_scenarios"]) >= 1, f"all {len(SCENARIOS)} scenarios run; headline uses feasible ({len(hl['feasible_scenarios'])}) only; overload ({hl['overload_scenarios']}) reported separately")


def le3_5():
    for tid, base, label in (("LE-3", "enhanced_reactive", "predictive vs reactive"), ("LE-4", "enhanced_no_return", "returns vs no-return"), ("LE-5", "enhanced_radio_only", "bottleneck-aware vs radio-only")):
        ok = all(row(sc, base, "enhanced", m) is not None for sc in SCENARIOS for m in ("onset_viol_total", "embb_ratio", "util"))
        check(tid, ok, f"{label}: onset-window violations, eMBB ratio and utilization paired for all scenarios")
        for sc in SCENARIOS:
            parts = []
            for m in ("onset_viol_total", "embb_ratio", "util"):
                r = row(sc, base, "enhanced", m)
                parts.append(f"{m} {r.improvement:+.5f} [{r.ci_lo:+.5f}, {r.ci_hi:+.5f}]")
            print(f"      {sc:13s} " + " | ".join(parts))


def le6():
    need_ep = ["viol_urllc", "viol_murllc", "rate_urllc", "rate_murllc", "win_comp_urllc", "win_comp_murllc", "win_comp_embb", "win_comp_um",
               "onset_viol_urllc", "onset_viol_murllc", "onset_viol_total", "embb_ratio", "util", "worst_window", "sla_met_all", "loans_opened",
               "loans_mean_amount", "loans_mean_duration", "loans_mean_return_lag", "loans_recalls", "overload_frac"]
    miss = [c for c in need_ep if c not in ep.columns]
    nan_cols = [c for c in need_ep if ep[c].isna().any()]
    paired = set(pt.metric) >= {"viol_total", "onset_viol_total", "embb_ratio", "util", "win_comp_um"} and {"ci_lo", "ci_hi"} <= set(pt.columns)
    pred = {"brier", "brier_constant", "auc", "ece", "mae_forecast", "mae_naive"} <= set(pe["overall"])
    check("LE-6", not miss and not nan_cols and paired and pred and len(ld) > 0, f"all section-9 metrics computed and saved (missing {miss}, NaN in {nan_cols}); paired intervals, loan stats and predictor quality present")


def le7():
    o = pe["overall"]
    files = all(os.path.exists(f"{R}/lending_reliability_eval_{s}.csv") for s in ("all", "embb", "urllc", "murllc")) and os.path.exists(f"{R}/lending_reliability.png")
    print(f"      eval-seed predictor: Brier {o['brier']:.5f} vs constant {o['brier_constant']:.5f}, AUC {o['auc']:.4f}, ECE {o['ece']:.4f}, MAE {o['mae_forecast']:.2f} vs naive {o['mae_naive']:.2f}")
    for r in pe["by_slice"]:
        print(f"      {r['slice']:7s} Brier {r['brier']:.5f} vs {r['brier_constant']:.5f}  AUC {r['auc']:.4f}  ECE {r['ece']:.4f}  MAE {r['mae_forecast']:.2f} vs naive {r['mae_naive']:.2f}")
    check("LE-7", files and all(np.isfinite(o[k]) for k in ("brier", "auc", "ece", "mae_forecast")) and o["brier"] < o["brier_constant"] and pe["seeds"] == LENDING_EVALUATION_SEEDS,
          "reliability tables and plot, Brier, AUC and forecast error saved on the held-out seeds; overall Brier beats the constant-rate predictor")


def le8():
    low = rep.lower()
    forbidden = [p for p in ("all slas hold", "all slas are met", "guarantee", "five nines", "99.999") if p in low]
    has_overload_section = "## overload" in low and "protected first" in low
    ov_ok = True
    for sc in hl["overload_scenarios"]:
        g = sm[(sm.scenario == sc) & (sm.policy.isin(["agent_shield", "enhanced"]))]
        ov_ok &= len(g) == 2
    check("LE-8", not forbidden and has_overload_section and ov_ok,
          f"overload reported separately with the 'protected first' wording; no forbidden claims in the report (found {forbidden})")


def le9():
    t = set(tu["validation_seeds"])
    e = set(sd["evaluation_seeds"])
    print("      tuning/validation seeds :", tu["validation_seeds"])
    print("      evaluation seeds        :", sd["evaluation_seeds"])
    csv = pd.read_csv(f"{R}/lending_tuning_val.csv")
    c = yaml.safe_load(open("config.yaml"))["lending"]
    chosen = tu["chosen"]
    cfg_ok = c["risk"]["high"] == chosen["risk.high"] and c["risk"]["confirm_steps"] == chosen["risk.confirm_steps"] and c["forecast"]["ewma_alpha"] == chosen["forecast.ewma_alpha"]
    cfg_diff = subprocess.run(["git", "log", "--format=%h", "-S", "ewma_alpha", "--", "config.yaml"], capture_output=True, text=True).stdout.split()
    check("LE-9", t.isdisjoint(e) and t == set(LENDING_VALIDATION_SEEDS) and e == set(LENDING_EVALUATION_SEEDS) and set(tu["evaluation_seeds_not_used"]) == e and cfg_ok and len(csv) == 12,
          f"tuning grid (12 configs) used only validation seeds; the two lists are disjoint; config.yaml lending thresholds equal the tuned choice {chosen}")


def le10():
    files = [f"{R}/lending_{n}.csv" for n in ("episodes", "summary", "paired", "loans", "tuning_val", "predictor_eval")] + [f"{R}/lending_{n}.png" for n in ("paired", "onset", "ablation", "reliability")]
    ok_files = all(os.path.exists(f) and os.path.getsize(f) > 500 for f in files)
    # headline recomputed by hand from the raw episode CSV with plain loops
    feas = hl["feasible_scenarios"]
    rows = ep[ep.scenario.isin(feas)].to_dict("records")
    tot = {"agent_shield": 0.0, "enhanced": 0.0}
    for r in rows:
        if r["policy"] in tot:
            tot[r["policy"]] += r["viol_total"]
    n_seeds = len({r["seed"] for r in rows})
    h = hl["viol_total__enhanced_vs_agent_shield"]
    hand = (tot["agent_shield"] - tot["enhanced"]) / n_seeds
    hl_ok = abs(hand - h["improvement"]) < 1e-9 and abs(tot["enhanced"] / n_seeds - h["enhanced"]) < 1e-9 and abs(tot["agent_shield"] / n_seeds - h["baseline"]) < 1e-9
    print(f"      headline by hand: agent {tot['agent_shield'] / n_seeds:.4f}, enhanced {tot['enhanced'] / n_seeds:.4f} violated packets per seed over feasible scenarios; avoided {hand:+.4f} per seed (file: {h['improvement']:+.4f} [{h['ci_lo']:+.4f}, {h['ci_hi']:+.4f}])")
    # re-simulate three random episodes from scratch and compare with the CSV
    rng = np.random.default_rng(99)
    sim_ok = True
    for _ in range(3):
        i = int(rng.integers(0, len(ep)))
        r = ep.iloc[i]
        pols = make_policies(cfg, [r.policy])
        one = run_matrix(pols, {r.scenario: SCENARIOS[r.scenario]}, [int(r.seed)], cfg, progress=False).iloc[0]
        same = all(abs(one[c] - r[c]) < 1e-9 for c in ("viol_total", "embb_ratio", "util", "onset_viol_total", "loans_opened"))
        print(f"      re-simulated {r.scenario}/{r.policy}/seed {int(r.seed)}: matches CSV = {same}")
        sim_ok &= same
    check("LE-10", ok_files and hl_ok and sim_ok, "results/lending_*.csv and four plots exist; headline recomputed by hand matches; 3 random episodes re-simulated from scratch match the CSV")


if __name__ == "__main__":
    le1(); le2(); le3_5(); le6(); le7(); le8(); le9(); le10()
    print("=" * 60)
    print(f"{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)
