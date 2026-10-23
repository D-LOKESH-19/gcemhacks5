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

## Sub-Phase 11d: API and UI SLA Status (SM-34 to SM-41)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_sla_11d.py`
- **Result**: **8/8 PASSED**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **SM-34** | Stream fields | WebSocket telemetry contains per-policy & per-slice `sla`, `feasible`, and `sla_limits` from `sla.py` | **PASSED** | P0 |
| **SM-35** | `GET /sla` | Endpoint returns complete limits, current episode status, window status matching `config.yaml` | **PASSED** | P1 |
| **SM-36** | Change limit | Limit changes in config dynamically propagate to chips, chart labels, and info card | **PASSED** | P0 |
| **SM-37** | Dynamic chips | Chips cleanly transition between green 'SLA OK', amber 'AT RISK' (>=80%), and red 'SLA BREACH' | **PASSED** | P0 |
| **SM-38** | Overload badge | Overload condition (>90% cap) toggles '#overloadBadge' with 'URLLC & mURLLC protected first' | **PASSED** | P1 |
| **SM-39** | SLA info card | Plain-words contract promises visible for URLLC (<0.5%), mURLLC (<1.0%), and eMBB (>=70%) | **PASSED** | P1 |
| **SM-40** | No fake UI | Zero `Math.random`, `mock`, or `fake` driving SLA metrics in `static/index.html` | **PASSED** | P0 |
| **SM-41** | Console & offline | No console errors; operates completely offline with local `static/chart.min.js` | **PASSED** | P0 |

---

## Sub-Phase 10a: Locations Config & Simulator (LT-1 to LT-12, LT-18, LT-31, LT-34 to LT-36)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_locations_10a.py`
- **Result**: **17/17 PASSED**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **LT-1** | Location is label | Users in different locations produce identical arrivals, queues, rewards, costs | **PASSED** | P0 |
| **LT-2** | Defaults | At reset, Campus=40 eMBB, Factory=30 URLLC, Smart City=100 mURLLC | **PASSED** | P0 |
| **LT-3** | Slice override | Adding URLLC bots at Campus updates Campus matrix and URLLC slice total | **PASSED** | P0 |
| **LT-4** | Matrix correctness | Sequence of add/remove/set events matches matrix; row sums equal slice totals | **PASSED** | P0 |
| **LT-5** | Clipping | Adding beyond `max_count` caps safely at slice max and returns `clipped=True` | **PASSED** | P0 |
| **LT-6** | Remove more | Removing from empty location removes 0, does not touch others, count non-negative | **PASSED** | P0 |
| **LT-7** | Determinism | Replaying identical location events with same seed produces identical traffic | **PASSED** | P0 |
| **LT-8** | Fair comparison | Static, Heuristic, and Agent receive bit-for-bit identical arrivals across steps | **PASSED** | P0 |
| **LT-9** | Contract intact | 12-dim observation, 6-dim action, scalar info['cost'] intact | **PASSED** | P0 |
| **LT-10** | Old suite | All original simulator self-tests and shield unit tests pass cleanly | **PASSED** | P0 |
| **LT-11** | Delay is display-only | Observation, cost, and reward are identical regardless of delay model values | **PASSED** | P0 |
| **LT-12** | Delay behavior | `est_delay_ms` is finite, matches `base_ms` at low load, equals `overload_ms` on overload | **PASSED** | P1 |
| **LT-18** | High speed | 1,000 bots across locations runs 200-step episode in < 0.25 s | **PASSED** | P1 |
| **LT-31** | SLA invariance | `info['costs']`, `info['feasible']`, and `sla.py` status identical across location assignments | **PASSED** | P0 |
| **LT-34** | No SLA logic | Audit confirmed zero hardcoded SLA numbers or custom logic in location code | **PASSED** | P0 |
| **LT-35** | Delay not SLA input | Modifying `delay_model` does not alter SLA compliance or violation costs | **PASSED** | P0 |
| **LT-36** | Model untouched | `models/agent.zip` SHA256 verified unchanged (`3cd0a7e66847...`) | **PASSED** | P0 |

---

## Sub-Phase 10b: Locations API & Telemetry Endpoints (LT-13 to LT-17, LT-37, LT-40)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_locations_10b.py`
- **Result**: **7/7 PASSED**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **LT-13** | Backward compatibility | Body without location defaults cleanly to slice's primary location | **PASSED** | P0 |
| **LT-14** | Location rules | Only location, only slice, both, and neither handled cleanly | **PASSED** | P0 |
| **LT-15** | Input validation | Unknown location/slice, negative count, bad mode return 4xx without server crash | **PASSED** | P1 |
| **LT-16** | Stream fields | WebSocket telemetry includes `bots_by_location` and `est_delay_ms` per policy | **PASSED** | P0 |
| **LT-17** | Synchronized state | One POST updates Static, Heuristic, Agent synchronously; Reset restores defaults | **PASSED** | P0 |
| **LT-37** | Event log SLA | Event log lines name locations and match exact SLA status numbers from `sla.py` | **PASSED** | P1 |
| **LT-40** | Fair policy inputs | Location bot events apply simultaneously and provide identical arrivals across policies | **PASSED** | P0 |

---

## Sub-Phase 10c: Locations UI & Visual Monitoring (LT-19 to LT-30, LT-32, LT-33, LT-38, LT-39)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_locations_10c.py`
- **Result**: **16/16 PASSED**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **LT-19** | Add users at Campus | Adding users via Campus pre-fills eMBB, updates counters and visual matrix | **PASSED** | P0 |
| **LT-20** | Location pre-fill | Campus -> eMBB, Factory -> URLLC, Smart City -> mURLLC pre-fills accurately | **PASSED** | P1 |
| **LT-21** | Slice override | Override slice (e.g. URLLC at Campus) updates matrix and slice arrivals | **PASSED** | P1 |
| **LT-22** | Remove and Set | Remove only decreases chosen zone; Set 0 empties pair; totals match | **PASSED** | P0 |
| **LT-23** | Limits and clipping | Adding beyond capacity triggers `clipped=True` and alerts "Max reached" | **PASSED** | P1 |
| **LT-24** | Dot scaling | Canvas caps at max 40 dots per zone; scale reads '1 dot = N users' | **PASSED** | P1 |
| **LT-25** | Honesty strip | 'Locations are logical groups. Metrics are per slice. Delay is a model estimate.' always visible | **PASSED** | P0 |
| **LT-26** | Delay labelling | Estimated delay rows explicitly labeled 'Estimated delay (model)' across policies | **PASSED** | P0 |
| **LT-27** | Story holds | High Campus load triggers eMBB stress on Static while Agent maintains compliance | **PASSED** | P0 |
| **LT-28** | No fake UI | Zero Math.random driving metrics; offline disconnect handling intact | **PASSED** | P0 |
| **LT-29** | Offline integrity | Zero external CDN scripts or fonts; self-contained local chart.min.js | **PASSED** | P0 |
| **LT-30** | Stress testing | Rapid concurrent bot modifications handle cleanly without crash or drift | **PASSED** | P1 |
| **LT-32** | Zone SLA chips | Zone SLA chips reflect dominant slice status directly from `sla.py` | **PASSED** | P0 |
| **LT-33** | Overload badge | Max bots trigger infeasible regime; OVERLOAD badge claims 'protected first' | **PASSED** | P0 |
| **LT-38** | Limit change flows | SLA threshold modifications in config propagate dynamically to status chips | **PASSED** | P1 |
| **LT-39** | No traffic state | Slices with zero active users in a zone display 'no traffic' chip (sla-none) | **PASSED** | P1 |

---

## Sub-Phase 10d: Locations Documentation, E2E Scenarios & Regression (E2E-14, E2E-15, E2E-17, E2E-18, E2E-19)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_locations_10d.py`
- **Result**: **5/5 PASSED** (Full locations suite: 45/45 PASSED)

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **E2E-14** | Location demo story | Cold start, Campus surge, Factory burst, Smart City storm, Overload badge, Recovery | **PASSED** | P0 |
| **E2E-15** | Repeatability | Replaying identical location-tagged sequence yields bit-for-bit identical stats | **PASSED** | P0 |
| **E2E-17** | Rollback drill | Git tag `pre-locations` verified intact as safe fallback checkpoint | **PASSED** | P0 |
| **E2E-18** | SLA consistency | Strict agreement across `GET /sla`, WebSocket stream, and scoreboard at 3 moments | **PASSED** | P0 |
| **E2E-19** | Dynamic limit change | Modifying SLA thresholds in config propagates to status chips without code changes | **PASSED** | P1 |

---

## Sub-Phase 11e: SLA Documentation, Pitch Script & Final Sign-Off
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Result**: **ALL PHASES (0 to 11) PASSED & COMMITTED**

### Verification Summary
- **SLA Contract Specification**: Documented in `README.md`, `config.yaml`, and `sla.py`.
- **Demo Script**: Rehearsed with explicit pitch line: *"Here are our SLAs, and here they hold while Static fails."*
- **SLA Invariance & Safety**: Zero hardcoded SLA numbers outside config; zero `Math.random` in UI; `models/agent.zip` intact (`3cd0a7e66847...`).
---

## Phase F0: React Frontend Gate & Setup (FT-1 to FT-4)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Tag**: `pre-react`
- **Result**: **4/4 PASSED (P0)**

### Test Matrix

| **FT-1** | Old suite before changes | All earlier tests pass; `git tag pre-react` exists | **PASSED** | P0 |
| **FT-2** | Node & npm environment | Node 18+ (verified Node v24.10.0, npm 11.6.1) | **PASSED** | P0 |
| **FT-3** | Clean install & supply chain | Pinned versions in `package.json`, `package-lock.json` committed, zero unpinned packages | **PASSED** | P0 |
| **FT-4** | Scripts verification | `npm run typecheck`, `npm run build` both exit 0; bundle generated with `@fontsource/inter` | **PASSED** | P0 |

---

## Phase F1: Backend Additions & Real Stream Capture (FT-5 to FT-9)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `test_phase_f1.py`
- **Result**: **5/5 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-5** | Capabilities | `GET /api/capabilities` returns 6 booleans matching reality | **PASSED** | P0 |
| **FT-6** | Public config | `GET /api/config/public` values equal `config.yaml` | **PASSED** | P0 |
| **FT-7** | Training & results endpoints | Return real downsampled logs (<=500 pts) and results CSV matrices | **PASSED** | P1 |
| **FT-8** | Shield telemetry | `changed` (>3% delta) and `intervention_rate_20` computed from real data | **PASSED** | P0 |
| **FT-9** | Existing endpoints & routing | `/health`, `/ws`, `/spike`, `/reset`, `/summary`, `/bots`, `/sla`, `/legacy`, and SPA `/` intact | **PASSED** | P0 |

## Phase F2: Shell, Design System & Data Layer (FT-10 to FT-16)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f2.cjs` + `npm run typecheck` + `npm run build`
- **Result**: **7/7 PASSED (P0/P1/P2)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-10** | Types match reality | TypeScript types in `api.ts` strictly fit `stream_sample.json`; all 30 captured messages parsed cleanly | **PASSED** | P0 |
| **FT-11** | Reconnect resilience | WebSocket backoff (1s, 2s, 4s, max 5s) handles disconnection and resubscribes seamlessly | **PASSED** | P0 |
| **FT-12** | Ring buffer bounding | Chart series ring buffers capped at <= 300 points; FIFO eviction prevents memory growth | **PASSED** | P0 |
| **FT-13** | Missing features handling | Graceful fallback when `bots`, `sla`, or `locations` are disabled without crashing | **PASSED** | P0 |
| **FT-14** | No mock data | Automated scan verifies zero occurrences of `Math.random()`, `faker`, or fixture imports in production `src/` | **PASSED** | P0 |
| **FT-15** | Error boundary | Isolated React error boundary displays error card with Retry without crashing shell | **PASSED** | P1 |
| **FT-16** | Design tokens | Strict separation of slice colors (cyan/amber/violet) and policy colors (red/grey/emerald); radii 12px | **PASSED** | P2 |

---

## Phase F3: Page 1 — Live Demo Hero Screen (FT-17 to FT-30)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f3.cjs` + `npm run typecheck` + `npm run build`
- **Result**: **14/14 PASSED (P0/P1/P2)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-17** | Real data verification | All metrics, throughputs, and queues driven directly from live simulator WebSocket stream | **PASSED** | P0 |
| **FT-18** | Side-by-side overlay charts | Static (red), Heuristic (grey), Agent (emerald) with dashed SLA limit and legend | **PASSED** | P0 |
| **FT-19** | Dynamic Y-axis rule | `max(2 x SLA limit, 1.2 x highest value)` guarantees zero visibility and prevents spike clipping | **PASSED** | P0 |
| **FT-20** | Spike injection triggers | eMBB surge, URLLC burst, and mURLLC storm generate shaded reference bands on both charts | **PASSED** | P0 |
| **FT-21** | Policy story contrast | During surges, Static breaches SLA (red/amber status) while RL Agent holds sub-ms latency | **PASSED** | P0 |
| **FT-22** | SLA scoreboard strip | Static, Heuristic, and Agent tiles show violation %, eMBB served %, and window compliance | **PASSED** | P0 |
| **FT-23** | Shield meter & feed | Agent card shows real 20-step intervention meter; consecutive repeated feed events collapse to 'xN' | **PASSED** | P0 |
| **FT-24** | Nominal load banner | Calm guidance banner visible under baseline arrivals; auto-dismisses when surges occur | **PASSED** | P1 |
| **FT-25** | Simulator control loop | Pause freezes updates cleanly; Resume continues; Reset clears ring buffers and resets seeds | **PASSED** | P0 |
| **FT-26** | Feed category filtering | Explainability feed filters by All, Spikes, Bots, Shield, and SLA | **PASSED** | P1 |
| **FT-27** | Policy resource cards | PRB and vCPU share bars sum to 100% in slice colors (cyan/amber/violet) with queue gauges | **PASSED** | P1 |
| **FT-28** | Responsive layout | Compact viewport fits 1920x1080 without full page scrolling; elements never clip at 1366x768 | **PASSED** | P0 |
| **FT-29** | Console integrity | Zero console warnings or runtime unhandled errors during active multi-surge runs | **PASSED** | P0 |
| **FT-30** | Performance & 5 Hz rate | Smooth 5 steps/sec rendering with throttled store updates and zero UI jank | **PASSED** | P1 |

---
