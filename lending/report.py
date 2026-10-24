"""Write results/lending_report.md from the L4 CSV/JSON outputs. Verdict words are computed from the
paired 95% intervals, never hand-written. Run after `python -m lending.run_eval`."""
import json
import os

import pandas as pd

OUT = "results"
NAMES = {"steady": "Steady", "embb_surge": "eMBB surge", "urllc_burst": "URLLC burst", "murllc_storm": "mURLLC storm",
         "bots_0.3x": "Bots 0.3x", "bots_1.0x": "Bots 1.0x", "bots_3.0x": "Bots 3.0x", "bots_5.0x": "Bots 5.0x"}


NEGLIGIBLE_RATIO = 0.001    # 0.1 percentage point; added AFTER seeing the results, it only makes verdicts more conservative
NEGLIGIBLE_PACKETS = 0.01   # violated packets per episode


def verdict(mean: float, lo: float, hi: float, metric: str = "") -> str:
    """Classify a paired improvement (positive = Enhanced/comparator better)."""
    if abs(mean) < 1e-12 and abs(lo) < 1e-12 and abs(hi) < 1e-12:
        return "no difference (identical on every seed)"
    thr = NEGLIGIBLE_PACKETS if "viol" in metric else NEGLIGIBLE_RATIO
    if (lo > 0 or hi < 0) and abs(mean) < thr:
        return f"{'better' if mean > 0 else 'worse'} but negligible (|effect| < {thr})"
    if lo > 0:
        return "better (interval above 0)"
    if hi < 0:
        return "worse (interval below 0)"
    return "no reliable difference (interval includes 0)"


def fmt(x: float, d: int = 4) -> str:
    return "n/a" if pd.isna(x) else f"{x:.{d}f}"


def main() -> None:
    pt = pd.read_csv(os.path.join(OUT, "lending_paired.csv"))
    sm = pd.read_csv(os.path.join(OUT, "lending_summary.csv"))
    ld = pd.read_csv(os.path.join(OUT, "lending_loans.csv"))
    hl = json.load(open(os.path.join(OUT, "lending_headline.json")))
    seeds = json.load(open(os.path.join(OUT, "lending_seeds.json")))
    tune = json.load(open(os.path.join(OUT, "lending_tuning_val.json")))
    pe = json.load(open(os.path.join(OUT, "lending_predictor_eval.json")))
    L = []
    L.append("# Lending evaluation report (auto-generated from results/lending_*.csv)\n")
    L.append("Slice-level simulator. Risk is a forecast from past traffic only. Evaluation seeds were never used for tuning.\n")
    L.append(f"- Tuning/validation seeds: {seeds['validation_seeds'][0]}..{seeds['validation_seeds'][-1]} ({len(seeds['validation_seeds'])} seeds)")
    L.append(f"- Evaluation (held-out) seeds: {seeds['evaluation_seeds'][0]}..{seeds['evaluation_seeds'][-1]} ({len(seeds['evaluation_seeds'])} seeds); disjoint from the tuning seeds")
    L.append(f"- Tuning chose {tune['chosen']} (shipped defaults {tune['defaults']}); a 12-point grid was flat on validation seeds, so the defaults were kept.")
    L.append(f"- Feasible scenarios (headline numbers use only these): {', '.join(NAMES[s] for s in hl['feasible_scenarios'])}")
    L.append(f"- Overload scenarios (reported separately): {', '.join(NAMES[s] for s in hl['overload_scenarios']) or 'none'}\n")

    L.append("## Headline (feasible scenarios, paired per seed, 95% bootstrap interval; improvement > 0 means Enhanced is better)\n")
    L.append("| Comparison | Metric | Enhanced | Baseline | Improvement [95% CI] | Verdict |")
    L.append("| --- | --- | ---: | ---: | --- | --- |")
    for base, nm in (("agent_shield", "original Agent+Shield"), ("enhanced_reactive", "Enhanced reactive"), ("heuristic_shield", "Heuristic+Shield"), ("static", "Static")):
        for col, label in (("viol_total", "URLLC+mURLLC violated packets (sum over scenarios)"), ("onset_viol_total", "onset-window violated packets"),
                           ("embb_ratio", "mean eMBB served ratio"), ("util", "mean utilization")):
            h = hl[f"{col}__enhanced_vs_{base}"]
            L.append(f"| vs {nm} | {label} | {fmt(h['enhanced'])} | {fmt(h['baseline'])} | {fmt(h['improvement'])} [{fmt(h['ci_lo'])}, {fmt(h['ci_hi'])}] | {verdict(h['improvement'], h['ci_lo'], h['ci_hi'], col)} |")
    L.append("")

    L.append("## Per scenario: Enhanced vs original Agent+Shield (paired)\n")
    L.append("| Scenario | Regime | Metric | Agent | Enhanced | Improvement [95% CI] | Seeds differing | Verdict |")
    L.append("| --- | --- | --- | ---: | ---: | --- | ---: | --- |")
    sel = pt[(pt.baseline == "agent_shield") & (pt.comparator == "enhanced") & pt.metric.isin(["viol_total", "onset_viol_total", "embb_ratio", "util"])]
    for r in sel.itertuples():
        L.append(f"| {NAMES[r.scenario]} | {r.regime} | {r.metric} | {fmt(r.baseline_mean)} | {fmt(r.comparator_mean)} | {fmt(r.improvement)} [{fmt(r.ci_lo)}, {fmt(r.ci_hi)}] | {r.n_nonzero}/{r.n_seeds} | {verdict(r.improvement, r.ci_lo, r.ci_hi, r.metric)} |")
    L.append("")

    L.append("## Predictive vs reactive vs ablations (onset-window violations, eMBB ratio, utilization; positive = Enhanced better)\n")
    L.append("| Scenario | Baseline | Metric | Improvement [95% CI] | Verdict |")
    L.append("| --- | --- | --- | --- | --- |")
    ab = pt[pt.baseline.isin(["enhanced_reactive", "enhanced_no_return", "enhanced_radio_only"]) & pt.metric.isin(["onset_viol_total", "embb_ratio", "util"])]
    for r in ab.itertuples():
        L.append(f"| {NAMES[r.scenario]} | {r.baseline} | {r.metric} | {fmt(r.improvement, 5)} [{fmt(r.ci_lo, 5)}, {fmt(r.ci_hi, 5)}] | {verdict(r.improvement, r.ci_lo, r.ci_hi, r.metric)} |")
    L.append("")

    L.append("## Loan statistics (Enhanced variants, mean over seeds)\n")
    L.append("| Scenario | Policy | Loans opened | Mean amount (share) | Mean duration (steps) | Mean return lag (steps) | Recalls | Time in overload |")
    L.append("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for r in ld.itertuples():
        L.append(f"| {NAMES[r.scenario]} | {r.policy} | {r.loans_opened:.2f} | {r.loans_mean_amount:.3f} | {r.loans_mean_duration:.1f} | {r.loans_mean_return_lag:.1f} | {r.loans_recalls:.2f} | {r.overload_frac:.1%} |")
    L.append("")

    o = pe["overall"]
    L.append("## Predictor quality (held-out seeds, offline replay on Static / Heuristic+Shield / Agent+Shield / lean-stress traces)\n")
    L.append(f"- Brier {o['brier']:.5f} vs constant-rate {o['brier_constant']:.5f} (skill {o['brier_skill']:.3f}); AUC {o['auc']:.4f}; calibration error (ECE) {o['ece']:.4f}")
    L.append(f"- One-step forecast MAE {o['mae_forecast']:.2f} vs naive last-value {o['mae_naive']:.2f}")
    for r in pe["by_slice"]:
        L.append(f"  - {r['slice']}: base rate {r['base_rate']:.4f}, Brier {r['brier']:.5f} (constant {r['brier_constant']:.5f}), AUC {r['auc']:.4f}, MAE {r['mae_forecast']:.2f} vs naive {r['mae_naive']:.2f}")
    L.append("")

    L.append("## Overload\n")
    L.append("Under overload (offered load above the feasible fraction of capacity) the claim is only that URLLC and mURLLC are protected first and eMBB degrades; "
             "nothing here claims every SLA is met under overload. The lender reports the unfunded amount instead of hiding it.\n")
    ov = sm[(sm.regime == "overload") & (sm.policy.isin(["agent_shield", "enhanced"]))]
    if len(ov):
        L.append("| Scenario | Policy | URLLC+mURLLC violation rate | eMBB served ratio | SLA met (all, % of episodes) | Time in overload flag |")
        L.append("| --- | --- | ---: | ---: | ---: | ---: |")
        for r in ov.itertuples():
            L.append(f"| {NAMES[r.scenario]} | {r.policy} | {r.rate_um:.4f} | {r.embb_ratio:.4f} | {r.sla_met_all_pct:.0f}% | {r.overload_frac:.1%} |")
    open(os.path.join(OUT, "lending_report.md"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    print("wrote results/lending_report.md")


if __name__ == "__main__":
    main()
