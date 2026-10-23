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

## Phase F4: Page 2 — Traffic and Bots Page (FT-31 to FT-38)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f4.cjs` + `npm run typecheck` + `npm run build`
- **Result**: **8/8 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-31** | Traffic presets | Steady, eMBB surge, URLLC burst, mURLLC storm, and Mixed inject synchronized bot & spike profiles | **PASSED** | P1 |
| **FT-32** | Add bots action | POST `/bots` with slice 'urllc', count 20, mode 'add' updates state and pushes live telemetry | **PASSED** | P0 |
| **FT-33** | Remove and Set modes | Modes 'set' and 'remove' correctly establish exact or decremented counts | **PASSED** | P0 |
| **FT-34** | Limit clipping | Injections exceeding slice capacities are bounded with explicit `clipped: true` indicator and `[Max reached]` tag | **PASSED** | P1 |
| **FT-35** | Dynamic dot scaling | Heavy bot counts (e.g. 500-1000) scale to <= 60 dots with explicit `1 dot = X bots` legend | **PASSED** | P1 |
| **FT-36** | Missing feature handling | Bots panel gracefully replaced with clean informative note when `capabilities.bots = false` | **PASSED** | P0 |
| **FT-37** | Strict client validation | Decimals, negative values, and non-numeric strings rejected with UI toast before dispatch | **PASSED** | P1 |
| **FT-38** | Stress test reliability | 30 rapid concurrent bot adjustments execute with 100% HTTP 200 responses and consistent state | **PASSED** | P1 |

---

## Phase F5: Page 3 — Agent Insights Page (FT-39 to FT-44)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f5.cjs` + `npm run typecheck` + `npm run build`
- **Result**: **6/6 PASSED (P0/P1/P2)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-39** | Stacked shares chart | Stacked areas sum to 100%; PRB vs vCPU toggle switches axes without distortion | **PASSED** | P1 |
| **FT-40** | Shield telemetry text | 'The shield changed the agent's decision in X percent of the last 20 steps.' strictly matches stream telemetry | **PASSED** | P0 |
| **FT-41** | 20-step decision table | Displays last 20 actuation rows with real numbers, ingress arrivals, and synthesized reasons | **PASSED** | P1 |
| **FT-42** | Radio-compute coupling | Per-slice effective capacity equals `min(PRB, vCPU)` and identifies bottleneck domain | **PASSED** | P1 |
| **FT-43** | Heuristic overlay line | Interactive toggle adds and removes the Heuristic URLLC reference baseline overlay | **PASSED** | P2 |
| **FT-44** | Scientific honesty | Copy strictly delineates algorithmic safety shield supervisor from learned neural RL policy | **PASSED** | P0 |

---

## Phase F6: Pages 4–6 — SLA, Training & Results Pages (FT-45 to FT-56)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f6.cjs` + `npm run typecheck` + `npm run build`
- **Result**: **12/12 PASSED (P0/P1/P2)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-45** | SLA contract promise | Formal limits displayed equal `config.yaml` across URLLC (<0.5%), mURLLC (<1.0%), and eMBB (>=70%) | **PASSED** | P0 |
| **FT-46** | 3x3 SLA matrix grid | Grid renders status chips and gauge bars matching `/sla`; 'No traffic' displayed when arrivals = 0 | **PASSED** | P0 |
| **FT-47** | Overload priority isolation | Severe load triggers `[OVERLOAD ACTIVE]` with exact 'URLLC and mURLLC protected first' guarantee | **PASSED** | P0 |
| **FT-48** | Window compliance rate | 20-step window compliance percentage displayed per candidate policy | **PASSED** | P1 |
| **FT-49** | Training metadata cards | Multipliers strictly labelled 'final trained value' and match `runs/log.csv` final checkpoint row | **PASSED** | P0 |
| **FT-50** | Training loss & cost curves | Real reward curve, 3 constraint costs with dashed threshold lines, and dual multiplier histories plotted | **PASSED** | P1 |
| **FT-51** | Headline recomputation | Verified recomputed metrics from `results/*.csv`: Agent cuts Static violations by 100.0% | **PASSED** | P0 |
| **FT-52** | Grouped scenario chart | Side-by-side grouped bars with 95% bootstrap confidence interval error bars per scenario | **PASSED** | P1 |
| **FT-53** | Model ablation study | 4 architecture rows with tail risk, worst window, and eMBB ratio comparing shield necessity | **PASSED** | P1 |
| **FT-54** | Feasible vs overload tabs | Scenarios partitioned into separate tabs with explicit overload prioritization note | **PASSED** | P0 |
| **FT-55** | CSV download endpoints | Direct download routes `/api/results/download/*.csv` serve valid structured benchmark data | **PASSED** | P2 |
| **FT-56** | Scientific footnotes | Mandatory footnote visibly notes slice-level simulator and queuing-theory delay model estimates | **PASSED** | P0 |

---

## Phase F7: Page 7 — Presenter Mode & Quality Polish (FT-57 to FT-62)
- **Date**: 2026-10-23
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f7.cjs` + `npm run typecheck` + `npm run build`
- **Result**: **6/6 PASSED (P0/P1/P2)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-57** | 2-meter readable typography | Scoreboard and key headline metrics formatted in >= 24px–48px typography (`text-4xl`/`text-5xl font-mono font-black`) for large projection display | **PASSED** | P0 |
| **FT-58** | Keyboard shortcuts & help | Presenter mode binds `1`, `2`, `3` (spikes), `Space` (pause), `R` (reset), `P`/`Esc` (toggle), `?` (interactive shortcuts modal overlay) | **PASSED** | P1 |
| **FT-59** | Fault-tolerant error handling | Error boundary displays structured error stack with 1-click user 'Retry Component' action; skeletons show pulsing placeholders | **PASSED** | P0 |
| **FT-60** | Multi-resolution responsiveness | Layouts scale smoothly between 1920x1080 and 1366x768 projection displays without clipping, horizontal scrollbars, or text collisions | **PASSED** | P1 |
| **FT-61** | Background tab throttling | WebSocket stream throttles to 1Hz on hidden tab (`!isDocumentVisibleRef.current`) and ring buffer caps at 300 points to prevent memory leaks | **PASSED** | P0 |
| **FT-62** | Accessible multi-channel badges | All status indicators simultaneously present semantic color, Lucide icon (`CheckCircle2`/`AlertTriangle`/`XCircle`), and explicit text label | **PASSED** | P1 |

---

## Phase F8: Production Cutover & Offline Verification (FT-63 to FT-72)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f8.cjs` + full backend regression test suite
- **Result**: **10/10 PASSED (P0/P1/P2)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-63** | Root SPA delivery | Root route `GET /` serves built React SPA `index.html` with HTTP 200 | **PASSED** | P0 |
| **FT-64** | Direct SPA deep-linking | Direct navigation to `/traffic`, `/agent`, `/sla`, `/training`, `/results`, `/present`, `/about` returns HTTP 200 without 404 | **PASSED** | P0 |
| **FT-65** | Classic dashboard preservation | Classic NOC monitor served cleanly at `http://localhost:8050/legacy` with full functionality intact | **PASSED** | P0 |
| **FT-66** | Reciprocal navigation | 1-click button navigation enables two-way jumping between Classic NOC (`/legacy`) and Enterprise React Suite (`/`) | **PASSED** | P0 |
| **FT-67** | Multi-tier fallback | Server implements robust fallback hierarchy: React `dist/index.html` -> Classic `static/index.html` -> Status JSON | **PASSED** | P1 |
| **FT-68** | 100% offline self-contained | Production bundle contains zero external CDN links; 56 `@fontsource/inter` local font files bundled in `dist/assets/` | **PASSED** | P0 |
| **FT-69** | Bundled asset delivery | Production hashed `.js`, `.css`, and `.woff2` assets served with HTTP 200 from `/assets/` | **PASSED** | P1 |
| **FT-70** | Model weights integrity | `models/agent.zip` SHA256 verified identical (`3cd0a7e66847...`) to original checkpoint | **PASSED** | P0 |
| **FT-71** | Simulator & Shield intact | Core environment (`sim.py`), safety shield (`shield.py`), and SLA module (`sla.py`) strictly preserved without logic changes | **PASSED** | P0 |
| **FT-72** | Architecture documentation | `README.md` and `FRONTEND_GUIDE.md` updated with comprehensive dual-dashboard operational documentation | **PASSED** | P1 |

---

## Phase F0: Baseline Verification & Environment Sanity
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Environment**: Node `v24.10.0`, npm `11.6.1`, Python `3.10` / Windows PowerShell
- **Git Tag**: `pre-react` (verified)
- **Suites Executed**: `sim_selftest.py`, `shield.py`, `test_bots_9a.py` through `9d.py`, `test_sla_11d.py`, `test_locations_10c.py`, `test_locations_10d.py`
- **Result**: **ALL TESTS PASSED (0 Failures, 0 Regressions)**

### Baseline Test Summary
- **Simulator Acceptance (`sim_selftest.py`)**: 5/5 PASSED (simplex conservation, surge drop, radio-compute coupling, determinism).
- **Safety Shield (`shield.py`)**: 3/3 PASSED (simplex sum 1.0, floor preservation, dynamic scaling).
- **Bot Patrol Simulation (`test_bots_9a-d.py`)**: 18/18 PASSED (calibration, scaling, traffic fairness, UI bounds, zero Math.random).
- **SLA Module & Multi-Window (`test_sla_11d.py`)**: 8/8 PASSED.
- **Locations Engine (`test_locations_10c-d.py`)**: 21/21 PASSED.

---

## Phase F1: Data Layer, App Shell & Endpoints Contract (FT-5 to FT-9)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `python test_phase_f1.py` + `npm --prefix frontend run build`
- **Result**: **5/5 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-5** | Capabilities Endpoint | `/api/capabilities` returns all 6 booleans matching real filesystem state | **PASSED** | P0 |
| **FT-6** | Public Config | `/api/config/public` accurately mirrors `config.yaml` parameters | **PASSED** | P0 |
| **FT-7** | Training & Results API | `/api/training/log` (downsampled <=500 pts) and `/api/results` return real data | **PASSED** | P0 |
| **FT-8** | Shield Stats Stream | `shield` block includes `active`, `changed`, `delta_pct`, `intervention_rate_20` | **PASSED** | P0 |
| **FT-9** | Legacy & SPA Integrity | `/health`, `/summary`, `/spike`, `/reset`, `/bots`, `/legacy`, and SPA `/` intact | **PASSED** | P0 |

---

## Phase F2: Live Dashboard, Scoreboard & Charts (FT-10 to FT-16)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f2.cjs` + `npm --prefix frontend run build`
- **Result**: **5/5 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-10** | TypeScript Type Reality | All 30 captured stream sample messages parse with zero type/schema mismatches | **PASSED** | P0 |
| **FT-12** | Ring Buffer Bounds | Telemetry buffers cap at 300 items with deterministic FIFO eviction | **PASSED** | P0 |
| **FT-14** | Production Code Integrity | Zero `Math.random()`, `faker`, or fixture imports in `frontend/src/` | **PASSED** | P0 |
| **FT-16** | Color Palette Invariant | Strict separation of slice colors (eMBB `#22D3EE`, URLLC `#F59E0B`, mURLLC `#A78BFA`) and policy colors (Static `#F87171`, Heuristic `#CBD5E1`, Agent `#34D399`) | **PASSED** | P0 |
| **FT-Live** | Spike Injection & Control | Real-time spike injection, pause toggle, and nominal banner pulse integrated | **PASSED** | P1 |

---

## Phase F3: Explainability Feed, Overlay Charts & Control Actions (FT-17 to FT-30)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f3.cjs` + `npm --prefix frontend run build`
- **Result**: **8/8 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-17** | Backend Connectivity | Live simulator backend responds at `/health` with status `ok` | **PASSED** | P0 |
| **FT-18** | Policy Lines & SLA Dash | Overlay charts render Static `#F87171`, Heuristic `#CBD5E1`, Agent `#34D399` plus SLA dashed ReferenceLine | **PASSED** | P0 |
| **FT-19** | Dynamic Chart Y-Axis | Y-axis upper bound dynamically evaluates `max(2 * SLA limit, 1.2 * maxVal)` | **PASSED** | P1 |
| **FT-20** | Synchronized Spikes | `/spike` endpoint triggers slice surges synchronized across policies | **PASSED** | P0 |
| **FT-23** | Feed Deduplication | Consecutive duplicate explainability events collapse into counter tags (`xN`) | **PASSED** | P1 |
| **FT-25** | Pause & Reset Lifecycle | `/pause` and `/reset` cleanly manipulate simulator execution state | **PASSED** | P0 |
| **FT-26** | Feed Category Filtering | Explainability feed filters by spikes, bots, shield, and SLA categories | **PASSED** | P1 |
| **FT-27** | Simplex Share Display | Resource cards display PRB/vCPU shares summing to 100% and real shield intervention meter | **PASSED** | P0 |

---

## Phase R0: Gate, Allocation Block & Backend Engine (AT-1 to AT-16)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Git Tag**: `pre-allocation` (verified)
- **Script**: `python test_allocation_r0.py`
- **Result**: **15/15 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **AT-1** | Block Present | `allocation` block present on all 3 policies with finite 3-element arrays | **PASSED** | P0 |
| **AT-2** | Shares Valid | `raw`, `final`, `prev` sum to 1.0 within 1e-5; `final` equals applied simulator shares | **PASSED** | P0 |
| **AT-3** | Unit Counts | PRB counts sum to 100 and vCPU to 8; each count >= floor(final * total); handles alternate totals | **PASSED** | P0 |
| **AT-4** | Determinism | Identical shares produce identical counts; ties break in eMBB, URLLC, mURLLC order | **PASSED** | P1 |
| **AT-5** | Transfers Net Zero | Donors' decreases equal receivers' increases; positive non-zero amounts | **PASSED** | P0 |
| **AT-6** | Transfers Match Deltas | Reconstructing counts from previous counts plus transfers equals current counts exactly | **PASSED** | P0 |
| **AT-7** | Static is Static | Static policy produces zero transfers across all steps after step 1 | **PASSED** | P0 |
| **AT-8** | Shield Changed Flag | `changed` is true exactly when a slice shifts by >3 percentage points | **PASSED** | P0 |
| **AT-9** | Floors Protected | Final URLLC and mURLLC shares strictly >= configured floors across steps | **PASSED** | P0 |
| **AT-10** | Capacity & Utilization | Recomputed from simulator formulas; utilization non-negative and finite | **PASSED** | P0 |
| **AT-11** | Bottleneck Rules | All 5 bottleneck classifications (`idle`, `none`, `both`, `radio`, `compute`) validated | **PASSED** | P0 |
| **AT-12** | Reason Codes | All 4 transfer reason codes (`idle_harvest`, `floor_restore`, `surge`, `rebalance`) verified | **PASSED** | P1 |
| **AT-13** | Capability Flag | `GET /api/capabilities` returns `allocation: true` | **PASSED** | P1 |
| **AT-14** | Performance & Size | Step computation runtime ~1.02ms (<25ms); message size ~7.96KB (<15KB) | **PASSED** | P1 |
| **AT-15** | No Regression | All legacy and existing API endpoints (`/health`, `/summary`, `/bots`) remain functional | **PASSED** | P0 |
| **AT-16** | Traffic Fairness | Static, Heuristic, and Agent policies receive bit-for-bit identical arrivals and events | **PASSED** | P0 |

---

## Phase R1: Allocation Types, Selectors & Data Utilities (AT-39)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_r1.cjs` + `npm --prefix frontend run build`
- **Result**: **4/4 PASSED (P0)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **AT-39a** | Fixtures Schema Reality | All 30 captured `stream_sample.json` frames validate against `AllocationBlock` TypeScript definitions | **PASSED** | P0 |
| **AT-39b** | Cell Diff Selector | `computeCountDiffs` detects steady-state zero deltas and identifies donor/receiver slices with exact unit deltas | **PASSED** | P0 |
| **AT-39c** | Transfer Ledger Burst Merging | `mergeBurstTransfers` merges consecutive identical transfers into multiplier count tags (`xN`) while keeping distinct items intact | **PASSED** | P0 |
| **AT-39d** | Replay Scrub Buffer | `extractScrubBuffer` safely truncates telemetry history ring buffer strictly to 60 steps | **PASSED** | P0 |

---

## Phase R2: Resource Pools, Locks, Flashes & Legend (AT-21 to AT-25, AT-42)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_r2.cjs` + `npm --prefix frontend run build`
- **Result**: **5/5 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **AT-21** | Unit Totals Invariant | PRB cells strictly total 100 and vCPU chips total 8 across all frames | **PASSED** | P0 |
| **AT-22** | Contiguous Slice Blocks | Slices ordered strictly in fixed order [eMBB, URLLC, mURLLC] without interleaving | **PASSED** | P0 |
| **AT-23** | Flash Animation Bounds | Unit reallocations trigger 600ms boundary flashes capped at 12 simultaneous units | **PASSED** | P0 |
| **AT-25** | SLA Floor Locks | Protected SLA floor cells display lock icon matching `floor(floor_share * total)` | **PASSED** | P0 |
| **AT-42** | Legend & Honesty Text | Collapsible legend explains tokens, locks, and flashes; whole-units disclaimer visible | **PASSED** | P1 |

---

## Phase R3: End-to-End Architectural Flow Strip (AT-28)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_r3.cjs` + `npm --prefix frontend run build`
- **Result**: **6/6 PASSED (P0)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **AT-28a** | 5-Node Topology | Devices -> gNB Radio -> Slicer -> Edge UPF -> Apps rendered in sequence | **PASSED** | P0 |
| **AT-28b** | Honest Controller Label | Slicer labeled as 'Resource Controller' with safety shield indicator | **PASSED** | P0 |
| **AT-28c** | Particle Density Bounds | Particles capped at 120 max with calibration label '1 particle = 10 packets' | **PASSED** | P0 |
| **AT-28d** | Bottleneck Detection | Stream bottleneck state triggers warning badge at radio or compute nodes | **PASSED** | P0 |
| **AT-28e** | Traffic Queue Slowdown | Bottlenecked slices slow particle travel speed from 2.4 to 0.8 px/frame | **PASSED** | P0 |
| **AT-28f** | Live State Integration | FlowStrip integrated into ResourceAllocationPage with real-time arrivals | **PASSED** | P0 |

---

## Phase R4: Pipeline, Coupling Panel & Transfer Ledger (AT-26, AT-27, AT-29)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_r4.cjs` + `npm --prefix frontend run build`
- **Result**: **3/3 PASSED (P0)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **AT-26** | 5-Stage Decision Pipeline | Visualizes observe, policy propose, shield check, applied, and result; Static shows 'Fixed rule' | **PASSED** | P0 |
| **AT-27** | Transfer Ledger | Tracks last 50 events, pauses auto-scroll on hover, collapses bursts (xN), and supports filters | **PASSED** | P0 |
| **AT-29** | Radio-Compute Coupling | Compares radio and compute capacity per slice, highlights bottlenecks, and displays coupling rule | **PASSED** | P0 |

---

## Phase R5: Replay Scrubber, Compare Mode & Quality Polish (AT-30 to AT-38)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_r5.cjs` + `npm --prefix frontend run build`
- **Result**: **5/5 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **AT-30** | Replay Scrubber | Step slider over last 60 frames, banner 'Replaying step N', Live resume, buffer reset | **PASSED** | P0 |
| **AT-31** | 3-Policy Compare Mode | Side-by-side comparison of Static, Heuristic, and Agent on identical simulation frame | **PASSED** | P0 |
| **AT-34** | Zero Mock Data | Strictly 0 occurrences of `Math.random` or mock generators in `frontend/src/` | **PASSED** | P0 |
| **AT-35** | Honest Terminology | Controller named 'Resource Controller'; whole-units and overload priority rules visible | **PASSED** | P0 |
| **AT-37** | Disabled State Handling | Inactive capability flag renders friendly notification banner without crashing | **PASSED** | P1 |

---

## Phase F4: Traffic Profiles, Virtual Bots & Canvas Map (FT-31 to FT-38)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f4.cjs` + `npm --prefix frontend run build`
- **Result**: **8/8 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-31** | Profile Presets | All 5 profiles (Steady, eMBB surge, URLLC burst, mURLLC storm, Mixed) verified | **PASSED** | P0 |
| **FT-32** | Bot Addition | `POST /bots` with mode `add` correctly increases bot population | **PASSED** | P0 |
| **FT-33** | Bot Set & Remove | `POST /bots` supports exact count setting and decrementing | **PASSED** | P0 |
| **FT-34** | Boundary Clipping | Requests beyond slice maximum return `clipped: true` with capped counts | **PASSED** | P1 |
| **FT-35** | Canvas Dot Scaling | High bot counts scale dynamically (<= 60 dots) with explicit calibration label | **PASSED** | P0 |
| **FT-36** | Capabilities Guard | Inactive bot generator displays graceful offline notification without crash | **PASSED** | P1 |
| **FT-37** | Input Sanitization | Client input rejects non-numeric, negative, and decimal strings before API call | **PASSED** | P1 |
| **FT-38** | Rapid Concurrency | 30 rapid back-to-back bot modifications processed with 100% HTTP 200 OK | **PASSED** | P0 |

---

## Phase F5: Agent Deep Dive & CMDP Convergence (FT-39 to FT-44)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f5.cjs` + `npm --prefix frontend run build`
- **Result**: **6/6 PASSED (P0/P1/P2)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-39** | Stacked Shares Chart | Stacked areas sum to 100% simplex; PRB vs vCPU toggle switches axes without distortion | **PASSED** | P1 |
| **FT-40** | Shield Text Stream | "The shield changed the agent's decision in X percent of the last Y steps" matches live stream | **PASSED** | P0 |
| **FT-41** | Decision Audit Table | 20-row ring buffer displays live decision values and numeric reason breakdown | **PASSED** | P1 |
| **FT-42** | Coupling Capacity Bars | Effective capacity strictly equals min(radio PRB, compute vCPU) | **PASSED** | P1 |
| **FT-43** | Heuristic Overlay | Interactive toggle overlays/removes Heuristic reference baseline without reload | **PASSED** | P2 |
| **FT-44** | Scientific Honesty | Explanatory copy cleanly delineates algorithmic supervisor from neural RL policy without overclaiming | **PASSED** | P0 |

---

## Phase F6: SLA Matrix, Training Curves & Results Telemetry (FT-45 to FT-56)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f6.cjs` + `npm --prefix frontend run build`
- **Result**: **12/12 PASSED (P0/P1/P2)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-45** | SLA Promise Guarantees | SlaPromiseCard defines plain-words guarantees for URLLC, mURLLC, and eMBB matching config | **PASSED** | P0 |
| **FT-46** | Empty Slice Indicator | SlaGridMatrix renders unambiguous 'No traffic' message when arrivals equal 0 | **PASSED** | P0 |
| **FT-47** | Overload Badge & Copy | Overload badge renders exact 'URLLC and mURLLC protected first' prioritization copy | **PASSED** | P0 |
| **FT-48** | Windowed SLA Compliance | 20-step window compliance percentage displayed per slice matching backend telemetry | **PASSED** | P1 |
| **FT-49** | Training Lambda Cards | Multipliers strictly labelled 'final trained value' matching `runs/log.csv` final rows | **PASSED** | P0 |
| **FT-50** | Cost Curves & Empty States | Costs plotted with dashed contract limit lines and actionable empty state fallback | **PASSED** | P1 |
| **FT-51** | Recomputed Headline Card | /api/results headline recomputed from CSV: Agent cuts Static violations by 100.0% | **PASSED** | P0 |
| **FT-52** | Error Bar Confidence Bounds | ScenarioGroupedBarChart renders 95% bootstrap confidence interval error bars | **PASSED** | P1 |
| **FT-53** | 4-Variant Ablation Table | Ablation study table renders 4 configurations with tail risk and worst-window metrics | **PASSED** | P1 |
| **FT-54** | Scenario Partitioning | Results partition Feasible vs Overload stress with explicit protection disclosures | **PASSED** | P1 |
| **FT-55** | CSV Download Endpoints | Both `/api/results/download/sla_table.csv` and `/ablation.csv` stream valid CSV payloads | **PASSED** | P0 |
| **FT-56** | Mandatory Honesty Footnote | Visible footnote explains slice-level simulator scope and delay model estimation limits | **PASSED** | P0 |

---

## Phase F7: Presenter Mode & Projection Polish (FT-57 to FT-62)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f7.cjs` + `npm --prefix frontend run build`
- **Result**: **6/6 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-57** | 2-Meter Readable Typography | PresenterPage implements >= 24px-48px high-contrast typography readable at 2 meters | **PASSED** | P0 |
| **FT-58** | Keyboard Shortcuts & Help | Hotkeys (1, 2, 3, Space, R, P, Esc, ?) fully functional with accessible help modal overlay | **PASSED** | P0 |
| **FT-59** | Error & Loading States | ErrorBoundary with user-facing Retry component and LoadingSkeleton pulse states | **PASSED** | P1 |
| **FT-60** | Responsive Viewport Layout | Multi-column grid adapts seamlessly to 1920x1080 and 1366x768 without overlap | **PASSED** | P1 |
| **FT-61** | Background Tab Protection | Stream throttles to 1Hz in inactive tabs with 300-point capped ring buffer | **PASSED** | P0 |
| **FT-62** | Multi-Channel Status Badges | Status badges display color + Lucide icon + explicit text simultaneously | **PASSED** | P0 |

---

## Phase F8: Cutover, Dual Dashboard Routing & Final Offline Verification (FT-63 to FT-72)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `node frontend/test_phase_f8.cjs` + Python backend regression suite
- **Result**: **10/10 PASSED (P0/P1)**

### Test Matrix

| ID | Test Category | Acceptance Criteria | Result | Severity |
| :---: | :--- | :--- | :---: | :---: |
| **FT-63** | Production Root Route | Root `/` serves React SPA index.html with HTTP 200 | **PASSED** | P0 |
| **FT-64** | Direct SPA Deep Linking | Direct URL hits to `/traffic`, `/agent`, `/sla`, `/training`, `/results`, `/present`, `/about` return index.html | **PASSED** | P0 |
| **FT-65** | Legacy Dashboard Route | Classic NOC dashboard reliably served at `/legacy` with full historical functionality | **PASSED** | P0 |
| **FT-66** | Reciprocal Cross-Links | Reciprocal navigation verified: `/legacy` links to `/` and React header links to `/legacy` | **PASSED** | P0 |
| **FT-67** | Multi-Tier Fallback | `api.py` implements graceful fallbacks between React dist, static classic, and JSON status | **PASSED** | P1 |
| **FT-68** | Zero External CDN Links | `dist/` is 100% self-contained with 0 external CDN links and bundles 56 local font files offline | **PASSED** | P0 |
| **FT-69** | Bundled Asset Delivery | Bundled JS, CSS, and WOFF2 fonts served over HTTP at `/assets/` with HTTP 200 OK | **PASSED** | P0 |
| **FT-70** | Model Weights Integrity | `models/agent.zip` SHA256 verified strictly identical (`3cd0a7e66847f16a...`) | **PASSED** | P0 |
| **FT-71** | Simulator Core Untouched | `sim.py` (SliceEnv), `shield.py` (apply_shield), and `sla.py` remain strictly untouched | **PASSED** | P0 |
| **FT-72** | Architecture Documentation | `README.md` documents both Enterprise React Suite and Classic NOC view with honest terminology | **PASSED** | P1 |



---

## Phase L0: Lending Gate and Safety (LL-12 baseline)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Tag / backup**: `git tag pre-lending` (on 2b3d8ea); `models/agent_pre_lending.zip` is byte-identical to `models/agent.zip` (SHA256 `3cd0a7e66847f16a...26314e1`)
- **Result**: whole old suite passes (21 Python suites + 12 Node suites F2-F8, R1-R5)

### Findings
- First run: `test_locations_10c.py` and `test_phase_f2.cjs` failed with file-not-found. Cause: the repo reorganisation (2b3d8ea) moved tests into `test_files/`, and these two built paths from their own folder. Test-harness paths only, no product regression. Fixed by pointing them at the repo root (`_ROOT`) / `FRONTEND_DIR`. No product code changed.
- Run commands in TESTING_GUIDE.md use old root paths; use `PYTHONPATH=. python test_files/<name>.py` and `node test_files/<name>.cjs`.

### Suite results (real output summary)
| Suite | Result |
| :--- | :---: |
| sim_selftest.py (5 tests), shield.py (3 unit tests) | PASSED |
| test_api, test_allocation_r0, test_bots_9a-9d | PASSED |
| test_locations_10a-10d (10c: 16/16 after path fix), test_phase10_gate | PASSED |
| test_phase_f1, test_sla_11a-11d | PASSED |
| test_phase_f2-f8.cjs, test_phase_r1-r5.cjs | PASSED |

### LL-12 baseline recorded
`test_files/lending_baseline_l0.py` fingerprints the original Agent + Shield (`agent_pre_lending.zip`) per-step trace (shares, violations, throughput, queue, arrivals) as SHA256 for 7 scenarios x seeds [9001, 9002, 9003] = 21 runs, saved to `results/lending_baseline_pre.json`. Re-run with `--check` reproduced all 21 hashes (0 mismatches), so the baseline is deterministic. These seeds are for the `mode: off` equality check only, not for tuning or evaluation. LL-12 will compare Enhanced (`mode: off`) against this file in L2/L3.

---

## Phase L1: Predictor (PL-1 to PL-8)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `python test_files/test_predictor.py` (also runs `lending_calibration.py` on the validation seeds)
- **Result**: **22/22 checks passed**. Old-suite spot check after the `config.yaml` addition: `sim_selftest`, `shield`, `test_api`, `test_sla_11a/11d`, `test_bots_9a`, `test_locations_10d` pass; the LL-12 baseline `--check` reproduces 21/21 hashes.
- **Files**: `predictor.py`, `lending_calibration.py`, `lending_seeds.py`, `lending:` section in `config.yaml` (pre-approved, additive).
- **Seeds** (printed by the tests): validation/tuning `7000-7019`; held-out evaluation `8000-8019` (not used in L1); disjoint from train 42-44, old validation 51-55, old evaluation 100-119, baseline 9001-9003.

### Test matrix
| ID | Test | Result | Real output |
| :---: | :--- | :---: | :--- |
| PL-1 | No oracle | **PASSED** | outputs identical when all data after step t is replaced by garbage (849 comparisons); predictor reads only `arrivals, queue, shares.prb, shares.vcpu, violations`; source has no simulator references |
| PL-2 | Forecast vs naive last-value | **PASSED (URLLC) / REPORTED (others)** | MAE forecast vs naive: URLLC 5.60 vs 6.54 (better); **eMBB 77.1 vs 74.7 (NOT better)**; **mURLLC 7.20 vs 7.00 (NOT better)** |
| PL-3 | Risk behaves | **PASSED** | risk in (0,1), non-increasing in capacity, 0.010 with large headroom, 0.990 with large shortfall |
| PL-4 | Calibration (20 val seeds, 4 policies x 7 scenarios) | **PASSED** | overall Brier 0.00425 vs constant 0.07026 (skill 0.94), AUC 0.998, ECE 0.0144; per slice Brier beats constant for eMBB, URLLC, mURLLC |
| PL-5 | Burst detection | **PASSED** | 0.00% false alarms in steady Poisson load; x7 jump flagged in the same step; flag clears afterwards |
| PL-6 | Zero traffic | **PASSED** | all outputs finite, risk 0.0098, zero share handled |
| PL-7 | Speed | **PASSED** | 0.148 ms/step for 3 slices |
| PL-8 | Warm-up | **PASSED** | first 10 steps `warming_up`, margin = 0.30 x forecast |

### Honest findings
- **Forecast is not better than naive last-value for eMBB and mURLLC** (PL-2). Only URLLC (periodic) benefits. Smoothing parameters stay at the spec defaults; any change would be tuned on validation seeds only.
- **Risk definition for eMBB** (deviation from the spec wording, flagged): eMBB risk compares `min_served_ratio x demand` (0.70 read from `sla` config, not hard-coded) with capacity, because the eMBB SLA is violated at served ratio < 0.70, not at demand > capacity. With the plain definition, mid-range risks (0.3-0.7) were observed only 1-2% of the time.
- **Calibration is conservative**: risk over-predicts in the 0.1-0.3 bins (predicted 0.135/0.244, observed 0.037/0.139) and in the 0.7-0.9 bins for eMBB/mURLLC; the 0.9-1.0 bin is accurate (0.983 vs 0.990). Persistent overload dominates the high bin; burst onset itself is not predictable (violation at the onset step has no warning).
- **Calibration events come mostly from stress traces.** The original Agent+Shield and Heuristic+Shield have 0 URLLC/mURLLC violations in all 7 scenarios (seed 7000), so a clearly labelled `lean_static_stress` policy (tight URLLC/mURLLC compute, stress only, not an operator policy) was added to give those slices positive events.
- **Important for L2-L4:** the shipped `agent.zip` raw output is almost constant (about 0.79/0.11/0.11 shares in every scenario); the shield (floors 0.15 + 1.2 x load) does the protecting, and Agent+Shield and Heuristic+Shield produce nearly identical shares (max difference 2e-7). With shield floors at 0.15, URLLC/mURLLC have little lendable share, and the original agent already has 0 violations in the standard scenarios. Expect little or no violation gain for Enhanced there; any gain is more likely in heavy-load/overload cases or eMBB served ratio. This will be reported as measured in L4.

---

## Phase L2: Lender Logic (LL-1 to LL-15, EP-1/3/5/8)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `python test_files/test_lender.py`
- **Result**: **37/37 checks passed.** After the change: `test_predictor.py` 22/22, LL-12 fingerprints 21/21, `sim_selftest`, `shield`, `test_api`, `test_sla_11a/11c`, `test_bots_9b`, `test_allocation_r0` pass.
- **Files**: `lender.py` (`Lender`, `EnhancedPolicy`), `predictor.py` (two additive output fields: `demand_last`, `queue_growth`, for the reactive ablation). `sim.py`, `shield.py`, `sla.py`, `train.py`, `baselines.py` unchanged since `pre-lending` (checked with git diff in LL-14b). Not yet wired into `api.py` (that is L3).

### Test matrix (real output summary)
| ID | Test | Result | Real output |
| :---: | :--- | :---: | :--- |
| LL-1 | Protected minimum | **PASSED** | 10,000 random states (100 lenders x 100 steps, 14,044 active-loan observations): 0 donors below protected minimum; same in reactive mode |
| LL-2 | Conservation | **PASSED** | 0 violations: shares sum to 1, lent == borrowed, adj - raw == borrowed - lent, no negative share, no slice both donor and borrower on a resource |
| LL-3 | No risk, no loan | **PASSED** | output array identical (also dtype) to the agent proposal |
| LL-4 | Loan on risk | **PASSED** | burst-flagged borrower funded in the same step (0.267 <= 0.30), 2-step confirmation without a flag, lowest-risk donor first |
| LL-5 | Bottleneck-aware | **PASSED** | cpu-limited -> vCPU only; radio-limited -> PRB only; within 5% -> both; `bottleneck_aware: false` -> PRB only |
| LL-6 | Return | **PASSED** | no return before 3 calm steps (first at step 4), x0.75 of remaining per step, closed at step 17, shares equal the proposal again |
| LL-7 | No flapping | **PASSED** | 100 toggle cycles -> 2 loans opened; 20 isolated bursts -> 33 loans opened (PRB then vCPU as the bottleneck shifts), 33 closed, mean duration 16.4 steps, 0 loans shorter than confirm_steps |
| LL-8 | Recall | **PASSED** | donor risk > recall: loan 0.267 -> 0.233 in the same step, 'recalled' logged, donor back at target 0.467 |
| LL-9 | Time limit | **PASSED** | past ttl with high risk renewed 2x; with moderate risk 'expired' logged and the loan winds down |
| LL-10 | Funding order | **PASSED** | URLLC 0.167 before mURLLC 0.033 (total = lendable 0.20); mURLLC 0.10 before eMBB 0.05 |
| LL-11 | Overload | **PASSED** | flagged, unfunded 45.1 PRB, text "Cannot fully fund URLLC risk: lendable 14.9 PRB, need 60.0 PRB. Protecting URLLC and mURLLC first.", minimums kept, no flag when funded |
| LL-12 | Off == original | **PASSED** | `mode: off` EnhancedPolicy matches the pre-lending fingerprints, 21/21 runs bit-for-bit |
| LL-13 | Determinism | **PASSED** | identical shares, ledger and stats in 3 scenarios (3 loans opened, so not vacuous) |
| LL-14 | Contracts | **PASSED** | obs (12,), action (6,); core files unchanged since `pre-lending`; shield called after the lender on all 60 steps and the final action equals the shield output; URLLC/mURLLC shares never below 0.15 |
| LL-15 | Speed | **PASSED** | lender + predictor mean 0.303 ms/step, p99 0.483 ms |
| EP-1/3/5/8 | Edge cases | **PASSED** | all-slices-high: overload, shares unchanged; lender cannot borrow same resource; reset clears everything; huge loan clipped (0.300 per step), 361.7 PRB reported unfunded |

### Bugs found and fixed during L2 (before commit)
- **Overload was understated** (found by EP-8): unfunded was computed against the per-step capped amount, so a need of 4.0 pool-shares against 0.4 lendable looked fully funded. Fixed: overload now compares the full need with total lendable in priority order; the per-step cap (`max_loan_fraction`) only limits how fast a loan is drawn.
- LL-7 and LL-13 were first too weak (2 loans / reading stats after the lender reset); strengthened as above.

### Design notes (interpretations where the spec was open)
- Lender reads risk at the agent's *proposed* allocation (no loans) for borrower/return decisions, and at the *effective* allocation (after loans) for donors and recall. This stops a funded borrower from looking safe and returning mid-burst.
- `bottleneck_aware: false` means radio-only lending (the 'radio-only' ablation in section 9).
- Geometric return never reaches zero, so a loan under 0.005 of the pool (0.5 PRB) is closed; TTL renewal is silent (counted in `renewals`, no ledger event).
- Overload text is emitted when overload starts (and a 'cleared' message when it ends), not on every step.
- A donor must be below `risk.recall` to lend; a slice that borrows or lends a resource cannot do the opposite on that resource.

### Informational: lending activity with the real pre-lending agent (seed 7000, not an evaluation)
| Scenario | Loans opened | Overload steps | URLLC+mURLLC violations (Enhanced) |
| :--- | :---: | :---: | :---: |
| steady, bots 0.3x, bots 1.0x | 0 | 0 | 0 |
| urllc_burst | 1 (eMBB -> URLLC, PRB) | 0 | 0 |
| murllc_storm | 2 (eMBB -> mURLLC, PRB and vCPU) | 0 | 0 |
| embb_surge | 0 | 32 | 0 |
| bots_3.0x | 0 | 198 of 200 | 0 |
The original Agent + Shield also has 0 violations in all of these, so no violation gain is visible here. In eMBB surge and 3x bots eMBB cannot be funded, so overload is reported (eMBB degrades, URLLC/mURLLC protected). Whether Enhanced improves anything is for L4 to measure on the held-out seeds.

---

## Phase L3: Integration (LI-1 to LI-6)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Script**: `python test_files/test_lending_integration.py`
- **Result**: **14/14 checks passed.** Full regression after the change: 21/21 Python suites (incl. `test_predictor` 22/22, `test_lender` 37/37), 12/12 Node suites (F2-F8, R1-R5), LL-12 fingerprints 21/21.
- **Files changed**: `api.py` (additive: fourth env + `EnhancedPolicy`, `policies.enhanced`, `scoreboard.enhanced`, `est_delay_ms.enhanced`, SLA status for enhanced, `GET /api/lending`, `capabilities.lending`), `lender.py` (hooks: `last_shield_active`, `last_raw`, `risk_final`, `risk_at_shares`). Only 3 existing lines of `api.py` were modified, each just extended with `enhanced` (the `clipped = ...` bot-clip line, the per-policy stats loop list, and the scoreboard policy list); everything else is additions; no core file (`sim.py`, `shield.py`, `sla.py`, `train.py`, `baselines.py`) changed.

### Test matrix (real output summary)
| ID | Test | Result | Real output |
| :---: | :--- | :---: | :--- |
| LI-1 | Four policies, same traffic | **PASSED** | arrivals identical for Static, Heuristic, Agent, Enhanced on all 100 steps with a mURLLC spike, URLLC spike, bots add/remove; still identical after a spike and a mid-run reset |
| LI-2 | Pipeline fields | **PASSED** | raw, post_lender, final each sum to 1 (600 vectors, max error 1.0e-4 from 4-decimal rounding); 54 steps had active loans |
| LI-3 | Shield last (adversarial) | **PASSED** | lender forced to lend (high risk threshold 0.001, max_loan_fraction 0.9; 200 loan-steps): final == shield(post_lender) on all 150 steps; URLLC/mURLLC final share never below 0.15 (min 0.1500) |
| LI-4 | Stream fields from backend | **PASSED** | mURLLC forecast 19 -> 245 and max risk 0.03 -> 0.99 when a storm is triggered; 24 steps with loans; events opened/enlarged/returned; `/ws` messages carry `policies.enhanced.allocation.lending` |
| LI-5 | Capabilities / API | **PASSED** | `lending` true -> false when `mode: off` -> true again; `GET /api/lending` returns config, loans, stats, ledger, live + offline calibration |
| LI-6 | No regression | **PASSED** | every old field identical to the `pre-lending` `api.py` over 100 steps (only `inference_ms`, a wall-clock timing, excluded); message size 8,477 -> 11,616 bytes = **+37.0%** (limit 40%, small margin); step time 1.11 -> 2.37 ms; live WebSocket 4.65 steps/s |

### Notes
- New stream keys (all additive): `policies.enhanced` (same shape as `agent` without `lambda`/`bots_by_location`, plus `allocation.lending`), `scoreboard.enhanced`, `est_delay_ms.enhanced`, `/sla` and `/summary` gain `enhanced`.
- `allocation.lending` = `{mode, thresholds{high,low,recall}, risk[3] (at the agent's proposal), risk_after[3] (after the lender), forecast[3], margin[3], headroom[3], warming_up, loans_active[], loans_events[] (this step only), messages[], lent{prb,cpu}, overload, unfunded{prb,cpu} (PRB/vCPU units), pipeline{raw,post_lender,final}}`. Pipeline `raw` is the agent's own proposal. Values are rounded to 4 decimals (shares) / 1 decimal (packets).
- The 37.0% message growth leaves little room. L5 must not add more per-step fields; the loan ledger is built client-side from `loans_events` (capped at 200 entries), and `/api/lending` serves the full ledger.
- `GET /api/lending` calibration: `live` = running (risk at the applied allocation, observed violation at the next step) pairs from the Enhanced copy, `offline` = the L1 validation-seed replay.
- `lending.mode: off` keeps the `enhanced` stream (identical to Agent + Shield) and reports `capabilities.lending: false`.
- Live WebSocket rate is 4.65 steps/s (sleep of 0.20 s plus step and send time); this loop was already in place before lending.

---

## Phase L4: Evaluation (LE-1 to LE-10)
- **Date**: 2026-10-24
- **Branch**: `a/core-sla`
- **Pipeline**: `python lending_tune.py` (validation seeds only) -> `python lending_run_eval.py` (held-out seeds) -> `python lending_report.py` -> `python test_files/test_lending_eval.py`
- **Result**: **10/10 checks passed.** These tests verify that the evaluation is computed correctly, paired, honest and reproducible. **They do not say Enhanced wins; it does not (see below).** Re-run after the evaluation: `test_predictor` 22/22, `test_lender` 37/37, `test_lending_integration` 14/14, LL-12 fingerprints 21/21. No product code changed in L4 (`git diff pre-lending` empty for `sim.py, shield.py, sla.py, train.py, baselines.py, evaluate.py`; `config.yaml`, `api.py`, `lender.py`, `predictor.py` unchanged since L3).
- **New files**: `lending_eval.py`, `lending_tune.py`, `lending_run_eval.py`, `lending_report.py`, `test_files/test_lending_eval.py`; outputs `results/lending_*.csv|json|png|md` (CSV and PNG are git-ignored by the repo convention and reproducible with the commands above; the JSON files and `lending_report.md` are committed).

### Seeds (printed by the scripts and tests, LE-9)
- Tuning / validation: `[7000 .. 7019]` (20 seeds). Evaluation (held-out): `[8000 .. 8019]` (20 seeds). Disjoint; also disjoint from train 42-44, old validation 51-55, old evaluation 100-119, baseline 9001-9003.
- Tuning grid (fixed before running): `risk.high {0.2,0.3,0.5}` x `confirm_steps {1,2}` x `ewma_alpha {0.2,0.4}` = 12 configs, scored on validation seeds, feasible scenarios only: fewest URLLC+mURLLC violated packets, then highest eMBB ratio, then fewest loans, then closest to defaults.
- **Tuning was flat**: all 12 configs gave the same violations (2.00003 packets) and the same eMBB ratio (0.9374950), so the shipped defaults were kept and `config.yaml` was not changed.

### Scenarios and regimes
steady, eMBB surge, URLLC burst, mURLLC storm, bots 0.3x, bots 1.0x (feasible); bots 3.0x and bots 5.0x (overload, reported separately). Bots 5.0x was added to the spec's list in advance (ES-5, spec mentions 5x) and before any result was seen. 7 policies x 8 scenarios x 20 seeds = 1,120 episodes, identical traffic asserted for every (scenario, seed) across all policies.

### Test matrix
| ID | Test | Result | Real output |
| :---: | :--- | :---: | :--- |
| LE-1 | Paired seeds | **PASSED** | Enhanced and original Agent+Shield on the same 20 held-out seeds; paired 95% bootstrap CI in all 8 scenarios. **Violations avoided = +0.0000 [0.0000, 0.0000] in every scenario; 0/20 seeds differ** |
| LE-2 | Scenarios | **PASSED** | all 8 run; headline uses the 6 feasible only; overload (bots 3.0x, 5.0x) separate |
| LE-3 | Predictive vs reactive | **PASSED (computed)** | onset-window violations identical on every seed in all 8 scenarios. Predictive opens loans in URLLC burst (0.55/episode) and mURLLC storm (1.95) where reactive opens 0 and 0.05; the only measurable difference is utilization in the storm, +0.00014 [0.00000, 0.00038] (negligible) |
| LE-4 | No-return ablation | **PASSED (computed)** | utilization in the mURLLC storm is **lower without returns: -0.00287 [-0.00697, -0.00004]** (returning capacity does help, by under 0.3 points); nothing else differs |
| LE-5 | Radio-only ablation | **PASSED (computed)** | utilization in the storm -0.00039 [-0.00078, -0.00006] (negligible); nothing else differs |
| LE-6 | Metrics complete | **PASSED** | all section-9 metrics saved, no NaN |
| LE-7 | Predictor evaluation (held-out seeds) | **PASSED** | Brier 0.00397 vs constant 0.07029 (skill 0.944), AUC 0.9989, ECE 0.0146; per slice Brier beats constant for eMBB, URLLC and mURLLC. Forecast MAE 29.13 vs naive last-value 28.96: **better only for URLLC (5.59 vs 6.65), not for eMBB (73.9 vs 72.6) or mURLLC (7.87 vs 7.68)** |
| LE-8 | Overload honesty | **PASSED** | report has an Overload section with the 'protected first' wording and no 'all SLAs hold' / 'guarantee' claims |
| LE-9 | No tuning on evaluation | **PASSED** | seed lists above; tuning used validation seeds only; config equals tuned choice |
| LE-10 | Files and headline | **PASSED** | CSVs and 4 plots exist; headline recomputed by hand from the raw CSV matches; 3 random episodes re-simulated from scratch match the CSV exactly |

### Honest headline (feasible scenarios, paired per seed)
- **Violations: Enhanced = original Agent+Shield exactly** (0.112 violated packets per seed for both, identical on every seed). The only violation among the original agent's 160 episodes is 2.24 packets at step 2 of one storm episode (seed 8008), before the predictor has any history; Enhanced has the same violation.
- eMBB served ratio 0.93803 vs 0.93803 (difference 7e-11); utilization +0.00002 (statistically above 0, negligible).
- Versus **Static**: 111.7 -> 0.112 violated packets per seed, onset-window 21.1 -> 0.112, eMBB ratio +0.7 pts, utilization +0.18 pts, all with intervals above 0. This comes from the shielded RL agent, not from lending.
- **Claim 1 ("fewer onset-window violations than the original agent and than reactive lending") is NOT supported by the data.** There is nothing left for lending to avoid: the original Agent + Shield is already at 0 violations in 159 of 160 episodes.
- **Claim 2 ("capacity returned, utilization and eMBB throughput recover") is only weakly supported**: returns raise storm utilization by 0.29 points vs no-return, and eMBB ratio is unchanged. Effects are tiny.
- **Claim 3 ("calibrated risk, honest overload")** is supported: Brier skill 0.944, ECE 0.015, and the lender reports overload instead of hiding it. Caveat: risk over-predicts in the mid bins (see `results/lending_reliability.png`).

### Why Enhanced cannot improve on the original agent here (diagnosis, not an excuse)
- The shipped agent's raw output is almost constant and the shield (floors 0.15 plus 1.2 x load) does the protecting, so URLLC and mURLLC already have ample capacity.
- **eMBB is where the SLA is missed** (eMBB surge: served ratio 0.629 < 0.70, all-SLA met in 5% of episodes (1/20) for both policies; bots 3.0x: 0.167, 0%; bots 5.0x: 0.086, 0%; URLLC and mURLLC SLAs are met in 100% of episodes in all three, for both policies). The lender flags overload (16% of steps in the surge, 99% in 3x/5x) but cannot help: URLLC/mURLLC sit at their shield floors, the shield is the last word and was off limits, so there is no lendable capacity above the floors.
- The standard scenarios start spikes at step 0, before any predictor history; no predictor can anticipate that. A mid-episode storm scenario was NOT added after seeing these results (it would be post-hoc); it is listed as an option below.

### Plot and colour notes
- Policy colours are the project's fixed ones (Static #F87171, Heuristic #CBD5E1, Agent #34D399, Enhanced #F472B6). `validate_palette.js` (dark) FAILs the lightness/chroma bands (the grey Heuristic is neutral by design) and WARNs on Agent vs Enhanced deutan separation (dE 6.6). Secondary encoding is used as that warning requires: hatching per policy, markers, a legend and direct row labels.
- Paired chart axes are fixed to +/-0.5 so a zero effect is shown as zero (an auto-scaled axis made a 1e-7 effect look large and was fixed).
- The report adds a 'negligible' verdict tier (|effect| < 0.001 for ratios, < 0.01 packets). It was added after seeing the numbers to avoid calling a 2e-5 utilization gain 'better'; it can only make verdicts more conservative.
