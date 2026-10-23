# Predictive lending: pitch notes, demo script and jury answers

Written for: the two people presenting the project and answering jury questions. Every number below comes from `results/lending_report.md` and `document/TEST_LOG.md` (Phase L4 to L6); re-derive it with the commands in the README before you quote it.

## 1. What we can honestly say

**Problem (30 s).** Network slices share one radio pool and one edge compute pool. Static reservations waste capacity, and reactive controllers only act after a deadline has been missed. When the network truly lacks capacity, nobody tells the operator.

**Solution (30 s).** We forecast SLA risk from recent traffic only, lend the bottleneck resource (radio or compute) to the slice at risk while protecting everyone else's minimum, return it step by step when the burst is over, and say so with numbers when the capacity is not there.

**The three claims, with what the evidence actually shows**

| Claim | Evidence (20 held-out seeds, 8 scenarios, paired, 95% intervals) | What to say |
| --- | --- | --- |
| 1. Fewer onset-window violations than the original agent and than reactive lending | Identical on every seed. Both have 0.112 violated packets per seed in feasible scenarios; the single violation is 2.24 packets at step 2 of one storm run. | **Do not claim this.** Say: "In our simulator the shielded agent already holds URLLC and mURLLC, so lending has nothing left to avoid. We measured that honestly." |
| 2. Capacity is returned, utilization and eMBB throughput recover | Loans return step by step (storm: 23 steps mean duration). With returns, utilization and eMBB ratio equal the original agent's (0.3785 vs 0.3784; 0.99983 vs 0.99983). | Say: "Lent capacity comes back and the system returns to the original operating point." Do **not** say it improves utilization or throughput. |
| 3. Calibrated risk and honest overload | Brier 0.00397 vs 0.07029 for a constant predictor, AUC 0.9989, calibration error 0.015. Overload flagged with exact numbers; "URLLC and mURLLC protected first". | **This is the strong claim.** Mention the caveats: risk is conservative, and the demand forecast beats a naive last-value forecast only for URLLC. |

**Safe sentences**
- "We forecast the risk of an SLA miss from past traffic only, and the forecast is calibrated: when it says 90 to 100 percent, a miss follows 99.1 percent of the time (held-out seeds). That top bin is mostly sustained overload, not burst-onset prediction, and the middle bins are conservative: we over-predict there. A burst whose first step has no warning cannot be foreseen."
- "When capacity is not there we say so: the unfunded amount is shown, URLLC and mURLLC are protected first, eMBB degrades."
- "Versus a static split, URLLC and mURLLC violations drop from 111.7 to 0.112 packets per seed, thanks to the constrained RL agent and the hard shield."
- "The lender is an add-on: with it switched off the system is bit-for-bit the original."

**Do not say**
- "Lending reduces SLA violations compared with our RL agent" (measured: no difference).
- "Guaranteed", "five nines", "all SLAs hold under overload", "1 ms measured latency".
- "Validated on a real network" (slice-level simulator only; ns-3 is future work).

## 2. Why there is no gain, in two sentences

The shield's floors (15% plus 1.2 x load) already give URLLC and mURLLC plenty of capacity, so they have no violations to prevent; and they sit at those floors, so they have nothing to lend to eMBB, which is where an SLA is missed (surge 0.63 served vs 0.70 required; 3x bots 0.17). The standard scenarios also start spikes at step 0, before the predictor has any history.

## 3. Demo script (about 90 seconds, run in the React app, Allocation page, Enhanced tab)

Preparation: `uvicorn api:app`, open `/allocation`, click **Enhanced (Lending)**, press Reset, wait 20 s (the gauges read low, no loans).

| Time | Action | What the audience sees | Say |
| --- | --- | --- | --- |
| 0:00 | Nominal load | all three gauges green, no loans | "Risk is a forecast from past traffic only. Everything is calm, so the lender does nothing." |
| 0:15 | Press **mURLLC storm** (Live page button, or `POST /spike`) | mURLLC gauge jumps past the 30% line; a dashed arrow eMBB to mURLLC appears, cells turn striped with a clock; the ledger shows "opened ... forecast 214+margin 180 vs capacity 128" | "It lends only the bottleneck resource, from the slice with spare capacity, and writes down why." |
| 0:35 | Switch to the Live page scoreboard | Static shows violations; Agent and Enhanced hold at zero | "Static fails. Our shielded agent and Enhanced hold. We do not claim Enhanced beats the agent: both hold, we measured that." |
| 0:50 | Back to Allocation | the loan shrinks step by step; ledger shows "returned" lines | "After the burst the capacity is returned gradually, no flapping." |
| 1:05 | Traffic page: set eMBB bots to the maximum (or Add Bots) | overload banner: "lendable 0.0 PRB, need 80.6 PRB ... URLLC and mURLLC protected first" | "When capacity truly is not there we say so with numbers. We never claim every SLA holds." |
| 1:20 | Results page, section "Innovation: predictive lending" | takeaway sentence, paired table, calibration chart | "Held-out seeds, paired intervals, thresholds tuned on separate seeds. The strong result is the calibration." |

If a step misbehaves, the section 5 fallbacks apply.

## 4. Likely jury questions

- **"Is this just a heuristic?"** It is a model-based layer: a forecast with a residual-quantile margin, an empirical risk estimate that is calibrated (Brier skill 0.94), a loan lifecycle with hysteresis, recall and time limits, and overload admission. We compare it against a reactive version and the original agent with paired statistics.
- **"Does lending beat your RL agent?"** Not in this simulator: identical on all 20 held-out seeds, and we explain why (the shield already protects URLLC and mURLLC, and has no spare capacity to lend to eMBB). We kept the evaluation as it was and reported it.
- **"So what is the contribution?"** A calibrated, history-only risk estimate; bottleneck-aware loans with a safe lifecycle; honest overload admission; and an evaluation that would have shown a gain had there been one. It is a layer that works with any policy.
- **"Does it work in a real network?"** We validated it in a slice-level simulator. Radio-level validation (ns-3) is future work.
- **"Why not retrain the RL agent with the lender in the loop?"** That is the natural next step; the lender works with any policy today.
- **"Can you guarantee the SLA?"** We protect minimums and flag overload; we never claim guarantees under overload.
- **"Is it overfitted to your simulator?"** The predictor sees only past traffic and thresholds were tuned on separate seeds; the tuning grid was flat, so there is little to overfit. We have not tested on other simulators.
- **"Your eMBB SLA is missed in the surge. Can lending fix that?"** Not within the shield's floors. Letting the lender relax a floor for an idle donor is a design change we have not approved or tested.

## 5. Fallbacks and what exists

- Screenshots of the storm, overload, 1920 and 1366 layouts and the Results section are regenerated by `node test_files/test_lending_ui.cjs` into `results/lending_ui_*.png` (git-ignored). A **screen recording was not produced** in this work; record one from the script above before the demo if you want a video fallback.
- If the live loop stalls: Results page and `results/lending_report.md` carry every number; the classic dashboard remains at `/legacy`.
- A 30-minute soak (random spikes and bot changes, headless browser) is in `results/lending_soak.json`.

## 6. Options that need a decision

1. A **mid-episode storm scenario** (spike at step 60, after predictor warm-up) as a clearly labelled supplementary, post-hoc analysis. It is the fairest test of onset prediction, but it was not in the pre-registered scenario set.
2. Letting the lender **relax a shield floor for an idle donor**, which is where unused capacity could reach eMBB. It changes the safety story and needs explicit approval.
3. **Training the agent with the lender in the loop.**
