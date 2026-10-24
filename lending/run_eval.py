"""Run the full Phase L4 evaluation on the HELD-OUT seeds and write results/lending_*.csv, plots and headline.

Usage: python -m lending.run_eval
Thresholds must already be frozen in config.yaml (tuned on validation seeds by lending.tune).
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import lending.calibration as lc
from lending.evaluation import (POLICY_ORDER, SCENARIOS, load_cfg, make_policies, paired_bootstrap, paired_table,
                          run_matrix, summary_table)
from lending.seeds import LENDING_EVALUATION_SEEDS, LENDING_VALIDATION_SEEDS

OUT = "results"
BG, FG, MUTED, GRID = "#0F172A", "#E2E8F0", "#94A3B8", "#334155"
POL_STYLE = {   # project policy colours + hatch as secondary encoding (Agent vs Enhanced is a deutan-CVD WARN)
    "static": ("#F87171", ""), "heuristic_shield": ("#CBD5E1", ".."), "agent_shield": ("#34D399", "//"),
    "enhanced": ("#F472B6", "\\\\"), "enhanced_reactive": ("#F472B6", "++"), "enhanced_no_return": ("#F472B6", "oo"),
    "enhanced_radio_only": ("#F472B6", "--"),
}
POL_LABEL = {"static": "Static", "heuristic_shield": "Heuristic+Shield", "agent_shield": "Agent+Shield (original)",
             "enhanced": "Enhanced", "enhanced_reactive": "Enhanced reactive", "enhanced_no_return": "Enhanced no-return",
             "enhanced_radio_only": "Enhanced radio-only"}
SLICE_COLOR = {"embb": "#22D3EE", "urllc": "#F59E0B", "murllc": "#A78BFA", "all": "#E2E8F0"}


def style(ax):
    ax.set_facecolor(BG)
    for sp in ax.spines.values():
        sp.set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=9)
    ax.xaxis.label.set_color(MUTED)
    ax.yaxis.label.set_color(MUTED)
    ax.title.set_color(FG)
    ax.grid(color=GRID, linewidth=0.6, alpha=0.6)
    ax.set_axisbelow(True)


def sc_label(sc: str, regime: dict) -> str:
    return SCENARIOS[sc]["name"] + (" [overload]" if regime[sc] == "overload" else "")


def plot_paired(pt: pd.DataFrame, regime: dict, path: str) -> None:
    """Paired improvement of Enhanced over the original agent. Axes are fixed to a meaningful range so a
    zero effect looks like zero; the exact mean and interval are printed on every row."""
    sel = pt[(pt.baseline == "agent_shield") & (pt.comparator == "enhanced")]
    scs = list(dict.fromkeys(sel.scenario))
    fig, axes = plt.subplots(1, 2, figsize=(13.5, 5.6), facecolor=BG, sharey=True)
    for ax, metric, title, scale, lim, fmt in ((axes[0], "viol_total", "URLLC+mURLLC violated packets avoided (per episode)", 1.0, 0.5, "{:+.4f}"),
                                               (axes[1], "embb_ratio", "eMBB served ratio change (percentage points)", 100.0, 0.5, "{:+.5f}")):
        style(ax)
        d = sel[sel.metric == metric].set_index("scenario").loc[scs]
        y = np.arange(len(scs))[::-1]
        ax.barh(y, d.improvement * scale, height=0.45, color="#F472B6", hatch="\\\\", edgecolor=BG, linewidth=0)
        ax.errorbar(d.improvement * scale, y, xerr=[(d.improvement - d.ci_lo) * scale, (d.ci_hi - d.improvement) * scale],
                    fmt="o", color=FG, ms=4, ecolor=FG, capsize=3, linewidth=1.2)
        for yy, r in zip(y, d.itertuples()):
            ax.text(lim * 0.97, yy, f"{fmt.format(r.improvement * scale)} [{fmt.format(r.ci_lo * scale)}, {fmt.format(r.ci_hi * scale)}]",
                    ha="right", va="center", color=MUTED, fontsize=8)
        ax.axvline(0, color=FG, linewidth=1)
        ax.set_xlim(-lim, lim)
        ax.set_yticks(y)
        ax.set_yticklabels([sc_label(s, regime) for s in scs], color=FG, fontsize=9)
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("right of 0 = Enhanced better", fontsize=8)
    fig.suptitle("Enhanced minus original Agent+Shield, paired over held-out seeds 8000-8019 (dot = mean, whiskers = 95% paired CI; axes fixed to +/-0.5)",
                 color=FG, fontsize=10.5)
    fig.tight_layout()
    fig.savefig(path, dpi=130, facecolor=BG)
    plt.close(fig)


def plot_onset(sm: pd.DataFrame, regime: dict, path: str) -> None:
    pols = ["static", "agent_shield", "enhanced_reactive", "enhanced"]
    scs = list(dict.fromkeys(sm.scenario))
    fig, ax = plt.subplots(figsize=(11, 5.6), facecolor=BG)
    style(ax)
    h = 0.8 / len(pols)
    for k, p in enumerate(pols):
        d = sm[sm.policy == p].set_index("scenario").loc[scs]
        y = np.arange(len(scs))[::-1] + (k - (len(pols) - 1) / 2) * h
        ax.barh(y, d.onset_viol_total, height=h * 0.9, color=POL_STYLE[p][0], hatch=POL_STYLE[p][1], edgecolor=BG, linewidth=0, label=POL_LABEL[p])
    ax.set_yticks(np.arange(len(scs))[::-1])
    ax.set_yticklabels([sc_label(s, regime) for s in scs], color=FG, fontsize=9)
    ax.set_xscale("symlog", linthresh=1)
    ax.set_xlabel("URLLC+mURLLC violated packets in the first 3 steps after each burst/spike start (mean per episode, symlog axis)")
    ax.set_title("Onset-window violations", fontsize=11)
    ax.legend(facecolor=BG, edgecolor=GRID, labelcolor=FG, fontsize=8, loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=130, facecolor=BG)
    plt.close(fig)


def plot_ablation(sm: pd.DataFrame, regime: dict, path: str) -> None:
    pols = ["enhanced", "enhanced_reactive", "enhanced_no_return", "enhanced_radio_only", "agent_shield"]
    mk = {"enhanced": "o", "enhanced_reactive": "s", "enhanced_no_return": "^", "enhanced_radio_only": "D", "agent_shield": "P"}
    scs = list(dict.fromkeys(sm.scenario))
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.2), facecolor=BG, sharey=True)
    for ax, col, title in ((axes[0], "embb_ratio", "eMBB served ratio"), (axes[1], "util", "Resource utilization (served / effective capacity)")):
        style(ax)
        for p in pols:
            d = sm[sm.policy == p].set_index("scenario").loc[scs]
            y = np.arange(len(scs))[::-1]
            ax.errorbar(d[col], y, xerr=[d[col] - d[f"{col}_lo"], d[f"{col}_hi"] - d[col]], fmt=mk[p], color=POL_STYLE[p][0],
                        mfc=POL_STYLE[p][0] if p in ("enhanced", "agent_shield") else BG, ms=6, capsize=2, linewidth=0.9, label=POL_LABEL[p])
        ax.set_yticks(np.arange(len(scs))[::-1])
        ax.set_yticklabels([sc_label(s, regime) for s in scs], color=FG, fontsize=9)
        ax.set_title(title, fontsize=10)
    h, l = axes[1].get_legend_handles_labels()
    fig.legend(h, l, facecolor=BG, edgecolor=GRID, labelcolor=FG, fontsize=8, loc="lower center", ncol=len(pols))
    fig.suptitle("Ablations (mean over held-out seeds, whiskers 95% bootstrap CI)", color=FG, fontsize=12)
    fig.tight_layout(rect=(0, 0.07, 1, 1))
    fig.savefig(path, dpi=130, facecolor=BG)
    plt.close(fig)


def plot_reliability(path: str) -> None:
    fig, ax = plt.subplots(figsize=(6.4, 6.0), facecolor=BG)
    style(ax)
    ax.plot([0, 1], [0, 1], color=MUTED, linestyle="--", linewidth=1, label="perfect calibration")
    for s in ("all", "embb", "urllc", "murllc"):
        t = pd.read_csv(os.path.join(OUT, f"lending_reliability_eval_{s}.csv")).dropna(subset=["observed_freq"])
        ax.plot(t.mean_predicted, t.observed_freq, marker="o", ms=4, linewidth=1.6 if s == "all" else 1.0,
                color=SLICE_COLOR[s], label={"all": "all slices", "embb": "eMBB", "urllc": "URLLC", "murllc": "mURLLC"}[s])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.set_xlabel("predicted risk (bin mean)")
    ax.set_ylabel("observed next-step SLA miss frequency")
    ax.set_title("Predictor reliability on held-out seeds\n(risk is a forecast from past traffic only)", fontsize=10)
    ax.legend(facecolor=BG, edgecolor=GRID, labelcolor=FG, fontsize=8, loc="upper left")
    fig.tight_layout()
    fig.savefig(path, dpi=130, facecolor=BG)
    plt.close(fig)


def headline(ep: pd.DataFrame, regime: dict) -> dict:
    """Pooled paired headline numbers, feasible scenarios only (per-seed sums, paired bootstrap over seeds)."""
    feas = [s for s, r in regime.items() if r == "feasible"]
    f = ep[ep.scenario.isin(feas)]
    out = {"feasible_scenarios": feas, "overload_scenarios": [s for s, r in regime.items() if r != "feasible"], "n_seeds": int(f.seed.nunique())}
    for col, hib in (("viol_total", False), ("onset_viol_total", False), ("embb_ratio", True), ("util", True), ("win_comp_um", True)):
        agg = "sum" if "viol" in col else "mean"
        per = f.groupby(["policy", "seed"])[col].agg(agg).unstack(0)
        for base in ("agent_shield", "static", "heuristic_shield", "enhanced_reactive"):
            d = (per["enhanced"] - per[base]) if hib else (per[base] - per["enhanced"])
            m, lo, hi = paired_bootstrap(d.values)
            out[f"{col}__enhanced_vs_{base}"] = {"improvement": m, "ci_lo": lo, "ci_hi": hi, "enhanced": float(per["enhanced"].mean()), "baseline": float(per[base].mean())}
    return out


def plots_only() -> None:
    """Re-render the plots from the saved CSVs (no simulation)."""
    pt = pd.read_csv(os.path.join(OUT, "lending_paired.csv"))
    sm = pd.read_csv(os.path.join(OUT, "lending_summary.csv"))
    regime = json.load(open(os.path.join(OUT, "lending_regime.json")))["regime"]
    plot_paired(pt, regime, os.path.join(OUT, "lending_paired.png"))
    plot_onset(sm, regime, os.path.join(OUT, "lending_onset.png"))
    plot_ablation(sm, regime, os.path.join(OUT, "lending_ablation.png"))
    plot_reliability(os.path.join(OUT, "lending_reliability.png"))


def main() -> None:
    import sys
    if "--plots-only" in sys.argv:
        return plots_only()
    cfg = load_cfg()
    seeds = LENDING_EVALUATION_SEEDS
    assert set(seeds).isdisjoint(LENDING_VALIDATION_SEEDS)
    print("tuning/validation seeds:", LENDING_VALIDATION_SEEDS)
    print("evaluation seeds:      ", seeds)
    print("lending config in use: ", json.dumps(cfg["lending"]))
    json.dump({"validation_seeds": LENDING_VALIDATION_SEEDS, "evaluation_seeds": seeds, "lending_config": cfg["lending"]},
              open(os.path.join(OUT, "lending_seeds.json"), "w"), indent=1)
    ep = run_matrix(make_policies(cfg), SCENARIOS, seeds, cfg)
    ep.to_csv(os.path.join(OUT, "lending_episodes.csv"), index=False)
    regime = {sc: ("feasible" if g.feasible.all() else "overload") for sc, g in ep.groupby("scenario", sort=False)}
    sm = summary_table(ep)
    sm.to_csv(os.path.join(OUT, "lending_summary.csv"), index=False)
    pt = paired_table(ep)
    pt.to_csv(os.path.join(OUT, "lending_paired.csv"), index=False)
    loans = sm[sm.policy.str.startswith("enhanced")][["scenario", "policy", "regime", "loans_opened", "loans_mean_amount", "loans_mean_duration",
                                                      "loans_mean_return_lag", "loans_recalls", "overload_frac"]]
    loans.to_csv(os.path.join(OUT, "lending_loans.csv"), index=False)
    hl = headline(ep, regime)
    json.dump(hl, open(os.path.join(OUT, "lending_headline.json"), "w"), indent=1)
    summ = lc.run(seeds, "eval")
    json.dump({"regime": regime}, open(os.path.join(OUT, "lending_regime.json"), "w"), indent=1)
    plot_paired(pt, regime, os.path.join(OUT, "lending_paired.png"))
    plot_onset(sm, regime, os.path.join(OUT, "lending_onset.png"))
    plot_ablation(sm, regime, os.path.join(OUT, "lending_ablation.png"))
    plot_reliability(os.path.join(OUT, "lending_reliability.png"))
    print(json.dumps({k: v for k, v in hl.items() if k.endswith("agent_shield")}, indent=1))
    print("predictor (eval seeds):", json.dumps(summ["overall"]))
    print("regimes:", regime)


if __name__ == "__main__":
    main()
