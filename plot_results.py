"""Generate publication-quality comparison charts for 5G Slicing policies (results/scenarios_comparison.png)."""

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def generate_comparison_charts(csv_path: str = "results/evaluation_table.csv", out_png: str = "results/scenarios_comparison.png"):
    if not os.path.exists(csv_path):
        print(f"[WARN] {csv_path} not found.")
        return

    df = pd.read_csv(csv_path)
    scenarios = df["Scenario"].unique()
    policies = ["Static", "Heuristic", "Agent"]
    colors = {"Static": "#ef4444", "Heuristic": "#f59e0b", "Agent": "#10b981"}

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # 1. eMBB Throughput Ratio
    ax1 = axes[0]
    x = np.arange(len(scenarios))
    width = 0.25

    for i, pol in enumerate(policies):
        subset = df[df["Policy"] == pol]
        vals = [float(subset[subset["Scenario"] == sc]["eMBB Ratio Mean"].values[0]) if len(subset[subset["Scenario"] == sc]) > 0 else 0.0 for sc in scenarios]
        ax1.bar(x + (i - 1) * width, vals, width, label=pol, color=colors.get(pol, "#64748b"), alpha=0.85)

    ax1.set_title("eMBB Throughput Ratio by Scenario", fontsize=12, fontweight="bold")
    ax1.set_xticks(x)
    ax1.set_xticklabels(scenarios, rotation=15, ha="right")
    ax1.set_ylabel("Served / Demand Ratio")
    ax1.set_ylim(0.7, 1.05)
    ax1.grid(True, linestyle="--", alpha=0.4)
    ax1.legend(loc="lower left")

    # 2. Resource PRB Utilization
    ax2 = axes[1]
    for i, pol in enumerate(policies):
        subset = df[df["Policy"] == pol]
        vals = [float(subset[subset["Scenario"] == sc]["PRB Util Mean"].values[0]) if len(subset[subset["Scenario"] == sc]) > 0 else 0.0 for sc in scenarios]
        ax2.bar(x + (i - 1) * width, vals, width, label=pol, color=colors.get(pol, "#64748b"), alpha=0.85)

    ax2.set_title("Radio PRB Utilization by Scenario", fontsize=12, fontweight="bold")
    ax2.set_xticks(x)
    ax2.set_xticklabels(scenarios, rotation=15, ha="right")
    ax2.set_ylabel("PRB Utilization")
    ax2.set_ylim(0.3, 0.6)
    ax2.grid(True, linestyle="--", alpha=0.4)
    ax2.legend(loc="lower left")

    plt.suptitle("5G Network Slicing Benchmark: Static vs Heuristic vs RL Agent", fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(out_png, dpi=180)
    plt.close()
    print(f"[INFO] Saved comparison plot to {out_png}")


if __name__ == "__main__":
    generate_comparison_charts()
