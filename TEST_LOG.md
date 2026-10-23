# 5G SliceOS Verification & Test Log

This document records the automated verification logs across development phases, including Phase 11 Core Upgrade (SLAs and Constrained RL).

---

## Sub-Phase 11a: SLA Module & Simulator Additions (SM-1 to SM-14)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_sla_11a.py`
- **Result**: **14/14 PASSED**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **SM-1** | Config present | All `sla` and `cmdp` keys loaded properly | **PASSED** | P0 |
| **SM-2** | URLLC metric | 1/400 gives 0.0025 (met=True); 3/400 gives 0.0075 (met=False) | **PASSED** | P0 |
| **SM-3** | mURLLC metric | 3/400 gives 0.0075 (met=True); 5/400 gives 0.0125 (met=False) | **PASSED** | P0 |
| **SM-4** | eMBB metric | Served ratio 0.75 meets SLA (met=True); 0.65 breaches (met=False) | **PASSED** | P0 |
| **SM-5** | Window logic | Local burst inside 20-step window gives breach even if episode average meets SLA | **PASSED** | P0 |
| **SM-6** | Status levels | <80% limit gives 'ok', 80-100% gives 'amber', >100% gives 'breach' | **PASSED** | P0 |
| **SM-7** | No arrivals | Zero traffic gives 0.0 violation rate without ZeroDivisionError or NaNs | **PASSED** | P0 |
| **SM-8** | Feasible flag | Offered load > 90% of capacity flags feasible=False; <= 90% flags True | **PASSED** | P0 |
| **SM-9** | info costs | Step info contains 'costs' for urllc, murllc, embb in [0, 1] | **PASSED** | P0 |
| **SM-10** | Cost math | Per-slice costs match exact mathematical definitions | **PASSED** | P0 |
| **SM-11** | Contract intact | 12-dim observation, 6-dim action, scalar info['cost'] intact | **PASSED** | P0 |
| **SM-12** | Old regression | Full regression suite passes in both traffic modes | **PASSED** | P0 |
| **SM-13** | Pure functions | sla.py functions are pure with zero mutable global state | **PASSED** | P1 |
| **SM-14** | Single source | sla.py and sim.py have zero hardcoded SLA target literals | **PASSED** | P1 |

---

## Sub-Phase 11b: Multi-Constraint CMDP RL Training (SM-15 to SM-24)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_sla_11b.py`
- **Seeds**: Training `[42, 43, 44]`, Validation `[51, 52, 53, 54, 55]`, Evaluation `[100, ..., 119]` (strictly disjoint)
- **Result**: **10/10 PASSED**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **SM-15** | Training runs | 3 seed checkpoints generated (>50 KB), no crash | **PASSED** | P0 |
| **SM-16** | Log content | `runs/log.csv` has reward, 3 costs, 3 lambdas, feasible fraction (501 eps) | **PASSED** | P0 |
| **SM-17** | Lambda behavior | Multipliers bounded in [0, 20.0], zero NaNs/Infs | **PASSED** | P0 |
| **SM-18** | Constraint control | Last 20% feasible: URLLC=0.0001 (<=0.005), mURLLC=0.0001 (<=0.01), eMBB=0.0134 (<=0.05) | **PASSED** | P0 |
| **SM-19** | Held-out seeds | Training, validation, and evaluation seed sets strictly disjoint | **PASSED** | P0 |
| **SM-20** | Training traffic | Randomized spikes, bot counts (0.3x-3.0x), and mid-episode disturbances | **PASSED** | P1 |
| **SM-21** | Model selection | Best checkpoint selected based on SLA feasibility + max eMBB ratio | **PASSED** | P1 |
| **SM-22** | Model backup | `models/agent_prev.zip` intact; new `models/agent.zip` verified | **PASSED** | P1 |
| **SM-23** | Inference test | Model loads and predicts reliably across 1,000 random observations | **PASSED** | P0 |
| **SM-24** | PID dual mode | PID dual mode executes without numerical divergence | **PASSED** | P2 |

---

## Sub-Phase 11c: Evaluation & Ablations (SM-25 to SM-33)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_sla_11c.py`
- **Seeds**: 20 held-out disjoint evaluation seeds `[100, ..., 119]`
- **Result**: **9/9 PASSED**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **SM-25** | Traffic synchrony | Bit-for-bit identical arrivals across all evaluated policies per seed | **PASSED** | P0 |
| **SM-26** | Output tables | `results/sla_table.csv` and `results/ablation.csv` generated | **PASSED** | P0 |
| **SM-27** | Bootstrap CI95 | 95% bootstrap confidence intervals computed around mean violation rates | **PASSED** | P1 |
| **SM-28** | Agent meets SLAs | Agent achieves 100.0% window compliance across all feasible scenarios | **PASSED** | P0 |
| **SM-29** | Beats Static | Static breaches in mURLLC storm (VR=0.0082, worst window=0.2147); Agent=0.0000 | **PASSED** | P0 |
| **SM-30** | Ablation (a) breach | Unconstrained PPO without shield breaches SLA in storm (VR=0.0079, worst window=0.2107) | **PASSED** | P1 |
| **SM-31** | Ablation (c) comparison | Heuristic+Shield holds SLA (0.0000 VR); delivers identical 0.6394 eMBB surge ratio | **PASSED** | P1 |
| **SM-32** | Overload partition | 6 feasible vs 1 overload (Bots 3.0x) partitioned and reported separately | **PASSED** | P0 |
| **SM-33** | Headline numbers | Agent meets SLAs in 100.0% of windows vs 99.2% for Static (recomputed from CSV) | **PASSED** | P0 |

---
