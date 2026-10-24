# 5G SliceOS: the complete study guide for the Third Round Review

Written for: the two team members who will present to the judges (physical review, 24/10/26, 6:30 AM). Read it top to bottom once, then use Part 6 (scoring map), Part 7 (demo) and Part 8 (questions) for rehearsal. Every number here comes from files in this repository; the file is named next to it so you can open it if a judge asks.

**How the marks work:** Functional Implementation and Problem Alignment 20, Technical Depth and Solution Effectiveness 20, Progress, Testing and Validation 10. Total 50. We cannot control the marks. What we can do is be able to answer anything with evidence, and never say anything a judge can disprove in one click. Part 9 lists the things that could embarrass us.

---

## Part 0. The 60-second version (memorise this)

- **Problem:** a 5G operator sells network slices (eMBB video, URLLC factory robots, mURLLC sensors) that share one radio pool (100 PRBs) and one edge compute pool (8 vCPUs). Fixed splits strand capacity, and compute is a second bottleneck: radio capacity is useless if CPU is short.
- **Our solution:** a simulator plus a **constrained reinforcement-learning agent** that sets radio and compute shares together, a **hard safety shield** that guarantees minimum floors for URLLC and mURLLC, per-slice **SLAs** defined in one module (`sla.py`), a live dashboard, and our add-on innovation, **predictive resource lending** (forecast risk from past traffic, lend only the bottleneck resource, return it, admit overload honestly).
- **Result in one sentence:** in the simulator the shielded agent holds the URLLC and mURLLC SLAs where Static does not (111.7 violated packets per run vs 0.112), the risk forecast is well calibrated (Brier 0.0040 vs 0.0703 for a constant predictor), and overload is reported honestly. **Lending does not beat our own agent** (identical on every held-out seed), and we say so.
- **Evidence:** 23 Python test suites, 12 earlier Node suites, 44 real-browser UI checks, 10 browser end-to-end checks and a 30-minute soak, all passing.
- **Honest limits:** slice-level simulator (not a radio-level model), no ns-3 validation, one cell.

### Cheat sheet of numbers

| Item | Value | Where |
| --- | --- | --- |
| Pools | 100 PRB, 8 vCPU, 12 packets per PRB per step, 200 packets per vCPU per step | `config.yaml` |
| Step | 100 ms simulated, 200 steps per episode | `config.yaml` |
| Mean arrivals (aggregate mode) | eMBB 400, URLLC 30, mURLLC 20 packets per step | `config.yaml` |
| Spike factors | eMBB 2.5x, URLLC 3x, mURLLC 7x | `config.yaml` |
| Shield floor | 15% each for URLLC and mURLLC, raised to 1.2 x recent load (caps 60% / 35%) | `shield.py` |
| SLA URLLC | violation rate at most 0.5% per episode, at most 2% in any 20-step window | `config.yaml`, `sla.py` |
| SLA mURLLC | at most 1% per episode, at most 3% in any 20-step window | same |
| SLA eMBB | at least 70% of offered traffic served | same |
| Observation / action | 12 floats / 6 floats (3 PRB logits + 3 vCPU logits) | `sim.py` |
| Training | Lagrangian PPO, MlpPolicy 2x64, 100,000 steps per seed, 3 seeds (42, 43, 44), about 500 logged episodes | `train.py`, `runs/log.csv` |
| Seed discipline | train 42-44, validation 51-55, evaluation 100-119; lending tuning 7000-7019, lending evaluation 8000-8019 | `train.py`, `lending/seeds.py` |
| Static vs shielded agent | 111.7 vs 0.112 violated URLLC+mURLLC packets per seed (feasible scenarios, lending eval) | `results/lending_report.md` |
| Lending vs original agent | 0.112 vs 0.112, identical on all 20 seeds | same |
| Predictor | Brier 0.00397 vs 0.07029, AUC 0.9989, calibration error 0.0146 (held-out seeds) | `results/lending_predictor_eval.json` |
| Speed | lender plus predictor 0.30 ms per step; whole 4-policy step about 2.4 ms | `test_lender.py`, `test_lending_integration.py` |

---

## Part 1. Problem and alignment (criterion 1: 20 marks)

### 1.1 The real-world problem
5G operators sell slices with different promises: **eMBB** (high throughput, tolerant of delay), **URLLC** (tiny packets, strict deadline, very high reliability), **mURLLC** (massive machine-type devices, occasional bursts, reliability target). Today most deployments split spectrum in fixed percentages (for example 60/25/15). That causes:

1. **Stranded capacity:** one slice surges and drops packets while another sits idle.
2. **Compute is also a bottleneck:** more radio capacity pushes more packets into the edge UPF; without CPU to match, packets queue and SLAs break while radio is free. In our simulator this is the rule `served = min(queue + arrivals, radio capacity, compute capacity)`.
3. **URLLC vs eMBB conflict:** reserving radio for URLLC wastes spectrum, preempting eMBB hurts broadband.
4. **Average-reward RL is unsafe:** a standard RL agent will sacrifice rare URLLC packets to gain eMBB throughput.
5. **Different timescales:** radio scheduling at about 1 ms, orchestration at 100 ms to 1 s.

Who pays: operators (penalties, wasted spectrum) and enterprise customers (factories, hospitals).

### 1.2 The problem statement we were given (verbatim)
"Reinforcement Learning-Based Network Slicing and Resource Allocation for 5G: Develop an intelligent resource allocation system that dynamically assigns bandwidth, compute, and priority across eMBB, URLLC, and mURLLC slices in a 5G network under fluctuating demand. The solution should use reinforcement learning or optimization, be tested in a realistic network simulator, guarantee slice-level SLAs, and compare against static and heuristic baselines."

### 1.3 Requirement-by-requirement alignment

| Requirement in the statement | What we built | Evidence / where to show it |
| --- | --- | --- |
| Dynamically assign **bandwidth** | PRB shares per slice every 100 ms step | Allocation page, `sim.py` |
| ... **compute** | vCPU shares per slice, jointly with PRBs (the agent outputs 6 numbers) | Allocation page "coupling" panel, `sim.py` |
| ... **priority** | URLLC and mURLLC protected first: shield floors, SLA-first constraints, overload rule "URLLC and mURLLC protected first" | `shield.py`, SLA page |
| Under **fluctuating demand** | Poisson traffic, periodic URLLC, bursty eMBB and mURLLC, user-controlled spikes, **bots** (individual devices that switch on and off) and **locations** (campus, factory, smart city) | Traffic and Bots page, `sim.py` |
| Use **RL or optimization** | Constrained RL: PPO with one Lagrange multiplier per SLA (CMDP) | `train.py`, Training page |
| Tested in a **realistic network simulator** | A slice-level Gymnasium simulator with the radio-compute coupling. **We do not claim it is radio-level realistic**; ns-3 validation is future work | `sim.py`, `sim_selftest.py` |
| **Guarantee slice-level SLAs** | A hard shield enforces floors for URLLC and mURLLC by construction; SLAs are defined per slice and checked by one module. We say "protected" and "held in feasible load", never "guaranteed under any load" | `shield.py`, `sla.py` |
| Compare to **static and heuristic baselines** | Static 60/25/15, a demand-proportional Heuristic, Heuristic + Shield, ablations, all on identical traffic | `baselines.py`, `evaluate.py`, Results page |

### 1.4 What the user sees (functional implementation)
A React suite (served by FastAPI at `/`) and a classic single-page dashboard (at `/legacy`), both live over WebSocket at about 5 steps per second, working offline:

- **Live Demo:** four policies side by side on identical traffic, SLA chips, charts, spike buttons.
- **Traffic and Bots:** add or remove devices per slice and location; the traffic changes immediately on all policies.
- **Allocation:** the 100 PRBs and 8 vCPUs as cells, who has what, transfers, the decision pipeline, and the lending panel.
- **Agent Insights:** shield interventions, shares over time, audit table.
- **SLA Matrix:** each policy against each slice's SLA, with "OVERLOAD ACTIVE" when demand exceeds capacity.
- **Training:** the learning curves and Lagrange multipliers.
- **Results:** benchmark tables with confidence intervals and the lending evaluation.
- **Presenter mode:** large type for a projector.

---

## Part 2. How it works (criterion 2: technical depth)

### 2.1 Pipeline

```
traffic (bots, spikes) -> SliceEnv (sim.py)  <->  policy
policy = Static | Heuristic | Agent (PPO) -> Shield -> applied
Enhanced = Agent -> Lender -> Shield -> applied
api.py runs four environment copies on identical traffic and streams over /ws
```

### 2.2 The simulator (`sim.py`)
Per 100 ms step and per slice:
1. **Arrivals**: eMBB Poisson with random bursts; URLLC Poisson with a periodic component (period 20 steps in aggregate mode); mURLLC Poisson with rare 7x bursts. In **bots mode** (the default config) traffic is the sum of individual bots: eMBB bots switch on and off (Markov), URLLC bots are periodic with jitter, mURLLC bots burst rarely. Default counts 40 / 30 / 100, maximum 200 / 150 / 1000.
2. **Capacities**: radio = PRB share x 100 x 12 packets; compute = vCPU share x 8 x 200 packets.
3. **Served** = min(queue + arrivals, radio capacity, compute capacity). **This min is the radio-compute coupling.**
4. **eMBB** can queue (up to 2000), overflow is dropped. **URLLC and mURLLC cannot queue**: a packet not served in its step missed its deadline and is a violation.
5. `info` carries violations, throughput, queues, shares, per-slice costs and a feasibility flag.

Interface contract (never changed): **observation** = 12 floats in 0..1 (per slice: queue fraction, smoothed load, PRB share, vCPU share); **action** = 6 floats in -1..1 (3 PRB logits, 3 vCPU logits) turned into shares by a softmax per group; **reward** = fraction of eMBB demand served; **cost** = URLLC+mURLLC violated fraction.

### 2.3 SLAs (`sla.py`, single source of truth)
Pure functions used by training, evaluation, the API and the UI, so the number on screen is the number we trained against. Per slice: a metric, a limit, a status `ok` / `amber` (above 80% of the limit) / `breach`. Window rule: the worst 20-step window must also be within the window limit. **Feasibility**: if offered load exceeds 90% of total capacity the situation is flagged **overload**; headline claims use feasible load only, and in overload we claim only that URLLC and mURLLC are protected first.

### 2.4 The shield (`shield.py`)
A deterministic rule layer applied last: floor for URLLC and mURLLC = max(15%, 1.2 x recent load), capped at 60% and 35%. If the policy proposes less, the shield raises it and takes the difference from eMBB first (then from other slices above their floors), separately for PRBs and vCPUs. Tested: shares sum to 1 and floors hold under adversarial input. **This is why the SLA holds by construction.**

### 2.5 Constrained RL (`train.py`)
The problem is a **constrained Markov decision process**: maximise eMBB served ratio subject to three cost limits (URLLC 0.5%, mURLLC 1%, eMBB shortfall below 70% limited to 0.05). Method: **PPO** (2x64 networks, CPU only) with **Lagrangian relaxation**: the training signal is reward minus lambda_i x cost_i for each of the three constraints, and each lambda_i rises while its cost is above its limit and decays when below (clipped 0 to 20). Training uses randomised spikes, bot counts (0.3x to 3x) and mid-episode bot events, a curriculum from mild to full range, three training seeds, validation seeds for model selection (satisfy all constraints first, then highest eMBB ratio) and evaluation seeds never used in training. The shield is part of the environment during training and evaluation.

### 2.6 Baselines (`baselines.py`)
**Static** 60/25/15 for both resources. **Heuristic**: share proportional to queue plus smoothed load with floors. **Heuristic + Shield**. Ablations: (a) unconstrained PPO without shield, (b) constrained PPO without shield, (c) shield without RL, (d) full model.

### 2.7 The innovation: SLA-aware predictive resource lending
Pipeline position: **Agent proposes -> Lender adjusts -> Shield enforces floors**. The RL model, observation, action, reward and shield are untouched.

**Predict (`lending/predictor.py`).** Per slice, from past traffic only: an exponentially weighted level with a damped trend forecasts next-step demand; the recent forecast errors give a burst margin (95th percentile of positive errors; a conservative 30% margin during the first 10 steps, flagged "warming up"); a burst detector flags arrivals above 3x the recent level and keeps the forecast raised for as long as past bursts lasted. **Risk** = the fraction of recent forecast errors for which forecast plus error would exceed the slice's capacity at the current allocation (for eMBB, 70% of demand against capacity, because that is its SLA), lightly smoothed so it is never exactly 0 or 1. **No oracle:** the predictor never sees burst probabilities, bot schedules or future spikes, and a test proves its output does not change when future data is altered.

**Lend (`lending/lender.py`).**
- A slice becomes a borrower when its risk stays above 30% for 2 steps (1 step if a burst is detected).
- Only the **bottleneck resource** is lent: radio if radio capacity is the smaller of the two, compute if compute is, both if within 5%. This uses our radio-compute coupling.
- Donors are the other slices, lowest risk first, and never go below a **protected minimum** (their own forecast demand plus a margin, and never below the shield floor).
- Funding order URLLC, then mURLLC, then eMBB; at most 30% of the pool moves in one step.

**Return.** When the borrower's risk stays below 10% for 3 steps, the loan is returned gradually (25% of the remaining amount per step). A donor whose own risk exceeds 25% gets its share back in the same step (**recall**). Loans expire after 30 steps unless the risk is still high. No flapping by construction (confirmation periods).

**Admit overload.** If the need exceeds what donors can lend without breaking their minimums, the lender sets `overload`, reports the unfunded amount per slice and resource, and says: "Cannot fully fund eMBB risk: lendable 0.0 PRB, need 80.6 PRB. Protecting URLLC and mURLLC first." It never claims all SLAs hold.

**Invariants (each has a test):** donors never end below their protected minimum; shares sum to 1 and total lent equals total borrowed; no risk means no loan and an unchanged proposal; hysteresis and ramped return; overload always flagged when need exceeds lendable; deterministic for the same seed; **with `lending.mode: off` the Enhanced policy is bit-for-bit the original Agent + Shield**; the shield is always applied last; under 3 ms per step.

### 2.8 System design choices worth stating
- **Single source of truth** for SLAs and for constants (`config.yaml`).
- **Identical traffic** for every policy (same seed, same spikes, same bot events) so comparisons are fair.
- **Additive changes only**: new stream fields and endpoints never changed an old field; a test compares every old field with the pre-lending API for 100 steps.
- **Honest labelling** in the UI: "Slice-level simulator", "Risk is a forecast from past traffic only", "Displayed in whole units; the simulator uses continuous shares".

---

## Part 3. Results and what they mean (criterion 2: solution effectiveness)

### 3.1 The SLA story (held-out seeds, 20 seeds, 95% bootstrap intervals; `results/sla_table.csv`, `results/ablation.csv`)
- **Static** misses the SLA under bursts: in the mURLLC storm 17 of 20 runs have violations. Summed over the six feasible scenarios and averaged per seed (lending evaluation), Static has 111.7 violated URLLC+mURLLC packets against 0.112 for the shielded agent.
- **Unconstrained PPO without the shield** breaks mURLLC in the storm (mean violation rate 0.79%, SLA met in 50% of runs). **Constrained PPO without the shield** is no better there (2.29%, SLA met in 10%): constraints alone do not make it safe. **With the shield** URLLC and mURLLC hold (0.00%) in every feasible scenario. This is the case for a hard shield.
- **Full model vs Heuristic + Shield: identical in our scenarios** (for example eMBB surge served ratio 0.6394 for both). The shield, not the learned policy, produces the SLA. The shipped agent's raw output is almost constant (about 79% / 11% / 11%) and the shield adjusts it. We say this openly (Q&A 20).
- **eMBB** is the slice that misses its SLA: in the surge the served ratio is 0.63 against the required 0.70 for every shielded policy (Static 0.59). The cause is capacity, not scheduling.

Earlier README tables (aggregate traffic mode) show every policy at 0.0000 URLLC+mURLLC violations in four scenarios and the agent +1.05% over Static in eMBB surge throughput. Do not use that as the headline: in the bots-mode evaluation the storm separates Static from the shielded policies much more clearly.

### 3.2 Lending evaluation (`results/lending_report.md`)
Protocol: 7 policies (Static, Heuristic + Shield, Agent + Shield, Enhanced, and three ablations: reactive, no-return, radio-only) x 8 scenarios (steady, eMBB surge, URLLC burst, mURLLC storm, bots 0.3x, 1x, 3x, 5x) x 20 held-out seeds (8000-8019), identical traffic, paired per seed, 95% paired bootstrap. Thresholds were tuned only on validation seeds 7000-7019; the 12-point tuning grid was flat, so defaults were kept. Bots 3x and 5x are overload and are reported separately.

| Pitch claim | Result | Verdict |
| --- | --- | --- |
| Fewer onset-window violations than the original agent and than reactive lending | identical on every seed: 0.112 violated packets per seed for both; the only agent violation in 160 episodes is 2.24 packets at step 2 of one storm run | **Not supported.** Nothing left to avoid |
| Capacity is returned, utilization and eMBB throughput recover | loans return step by step (storm: 23 steps mean duration); utilization and eMBB ratio stay at the original agent's level (0.3785 vs 0.3784; 0.99983 vs 0.99983) | **Mechanism works, no improvement shown.** (Never returning would make the utilization metric read 0.3 points higher, which is a property of the metric, not a benefit of returns) |
| Risk is calibrated, overload honest | Brier 0.00397 vs 0.07029, AUC 0.9989, calibration error 0.015; overload flagged on 99% of steps at 3x/5x bots and 16% of steps in the surge, with unfunded amounts | **Supported.** Caveats: risk over-predicts in the middle bins; the demand forecast beats a naive last-value forecast only for URLLC (5.59 vs 6.65 packets), not eMBB or mURLLC |

**Why lending cannot help here:** URLLC and mURLLC already have no violations (the shield gives them capacity) and sit at their floors, so there is nothing to lend to eMBB; the shield is the last word and was off limits. The standard scenarios also start spikes at step 0, before the predictor has history.

---

## Part 4. Testing and validation (criterion 3: 10 marks)

### 4.1 Progress (the story told by git, `git log --oneline`)
Phase 0-7: environment, simulator, baselines, shield, constrained RL, API, dashboard, results. Phase 9: bots. Phase 10: locations. SLA upgrade (11a-11e): per-slice SLAs, three constraints and multipliers, held-out evaluation with ablations. Frontend F0-F8 and allocation R0-R5: React suite, resource allocation page. Phase L0-L6: predictive lending. Every phase ended with its tests run, a log entry in `document/TEST_LOG.md` and a commit. Rollback points are tagged (`pre-bots`, `pre-locations`, `pre-sla`, `pre-react`, `pre-allocation`, `pre-lending`).

### 4.2 Test inventory (final run)

| Group | Count | What it proves |
| --- | --- | --- |
| Python suites (`test_files/test_*.py`, `sim_selftest.py`, `shield.py`) | 23 suites, all pass | simulator (shares sum to 1, static fails in a surge, radio-compute coupling, determinism), shield (floors hold), bots, locations, SLA module, training outputs, API |
| Lending: predictor `test_predictor.py` | 22 checks | no oracle, forecast quality, risk behaves, calibration, burst detection, zero traffic, speed, warm-up |
| Lending: lender `test_lender.py` | 37 checks | 10,000 random states with no donor below its minimum, conservation, bottleneck, return, recall, time limit, funding order, overload, `mode: off` equals original, determinism, speed |
| Lending: integration `test_lending_integration.py` | 14 checks | four policies on identical traffic, shield last, stream fields, every old field identical to the pre-lending API, message growth 37.3% (limit 40%) |
| Lending: evaluation `test_lending_eval.py` | 10 checks | paired held-out seeds, metrics complete, headline recomputed by hand, three episodes re-simulated from scratch match |
| Lending: end-to-end `test_lending_e2e.py` | 4 checks | replay twice gives identical frames, `mode: off` equals the agent through the API, ledger cap |
| Earlier Node suites (`test_phase_f2-f8`, `r1-r5`) | 12 suites, all pass | frontend structure and behaviour (mostly source-level checks) |
| Real-browser UI `test_lending_ui.cjs` | 44 checks | Chromium drives the real app: DOM equals live stream, console errors, overlap at 1920x1080 and 1366x768, reduced motion, offline |
| Real-browser E2E `test_lending_e2e.cjs` | 10 checks | storm story from a cold start; overload honesty on every page |
| Soak `e2e_soak.cjs` | 30 minutes | 178 random spikes, 132 bot changes, 6 resets: heap about 10 MB, server about 297 MB, no growth, no console errors |

### 4.3 Validation method (why the numbers can be trusted)
- **Held-out seeds never used in training or tuning**; the two seed lists are printed and checked disjoint by tests.
- **Identical traffic** for all policies, asserted in code at every run.
- **Paired statistics** with bootstrap intervals, not single runs.
- **Ablations** that show why each part is needed (Part 3.1).
- **Backward-compatibility fingerprint**: the original Agent + Shield's step-by-step trace is hashed for 21 runs; the lending system with `mode: off` reproduces all 21 exactly.
- **Honest-reporting rule**: the lending result did not meet the expected story, the evaluation was not changed, and the log says so (including a sign error we found and corrected in our own report).
- **Real bugs found by testing and fixed**: overload under-reporting (found by an edge-case test), horizontal overflow at 1366x768 on every page, `/allocation` returning 404 on refresh, a console error from a missing favicon.

### 4.4 What is NOT validated (say it before they ask)
No real network and no ns-3 or 5G-LENA run. The `ns3/` folder in the repository holds a script that generates **synthetic** traces; it is **not** an ns-3 validation and must not be presented as one. One cell, one trained model, a slice-level abstraction of the radio, simulated traffic models. The lender was not trained in the loop.

---

## Part 5. The three-minute story (what to say, in order)

1. **Problem (20 s):** shared radio and compute, fixed splits strand capacity, compute is a second bottleneck, plain RL sacrifices rare URLLC packets.
2. **Solution (30 s):** constrained RL decides radio and compute together, a hard shield guarantees URLLC and mURLLC floors, SLAs per slice in one module.
3. **Live (90 s):** see Part 7.
4. **Evidence (30 s):** Static 111.7 vs 0.112 violated packets; ablation shows the shield is what makes it safe; 20 held-out seeds with intervals.
5. **Innovation and honesty (20 s):** lending forecasts risk from past traffic (calibrated, Brier 0.0040 vs 0.0703), lends only the bottleneck resource, returns it, and flags overload. It does not beat our own agent here and we report that.
6. **Limits (10 s):** slice-level simulator, no ns-3, future work: radio-level validation, training with the lender in the loop.

---

## Part 6. Scoring map: say this, show this

### Criterion 1: Functional Implementation and Problem Alignment (20)
| They look for | Say | Show |
| --- | --- | --- |
| Does it solve the stated problem | "Each phrase of the problem statement maps to a component" (table 1.3) | Part 1.3 on one slide or on paper |
| Does it actually run | live dashboard on identical traffic, four policies | Live Demo page, press a spike |
| Dynamic under fluctuating demand | spikes, bots, locations | Traffic and Bots page: add 20 users, charts react |
| Bandwidth, compute, priority | PRBs, vCPUs, protected-first | Allocation page cells and coupling panel |
| Baselines compared | Static, Heuristic, Heuristic + Shield, ablations | Results page |
| SLA per slice | table of three SLAs, status chips | SLA page |

### Criterion 2: Technical Depth and Solution Effectiveness (20)
| They look for | Say | Show |
| --- | --- | --- |
| Technical depth | CMDP with three multipliers, PPO, hard shield, radio-compute coupling, calibrated forecast, loan lifecycle with hysteresis and recall | Training page (lambdas), Allocation decision pipeline |
| Effectiveness | Static 111.7 vs 0.112; ablation: no shield breaks the storm | Results page tables |
| Why not simply a heuristic | Heuristic + Shield matches the agent in our scenarios: the shield is the safety; honest | Q&A 20 |
| Innovation | lending: predict, lend only the bottleneck, return, admit overload | Allocation page lending panel |
| Honesty about gains | lending identical to the agent on all 20 seeds, explained | Results section "Innovation: predictive lending" |

### Criterion 3: Progress, Testing and Validation (10)
| They look for | Say | Show |
| --- | --- | --- |
| Progress | phased build, every phase tested, logged and tagged | `git log --oneline`, `document/TEST_LOG.md` |
| Testing | 23 + 12 suites, 44 browser checks, 30-minute soak | run the quick proof (Part 7.4) |
| Validation | held-out seeds, paired intervals, ablations, bit-identical fallback, replay determinism | `results/lending_report.md` |
| Limits stated | no ns-3, slice-level only | Part 4.4 |

---

## Part 7. Demo run-of-show (physical review)

### 7.1 Before the judges arrive (10 minutes)
1. `cd` to the repo, activate nothing special: use `.\venv\Scripts\python`.
2. `.\venv\Scripts\python -m uvicorn api:app --port 8050` (leave running). Open `http://localhost:8050/`.
3. Check: header shows "Live", step counter moving, four policy tiles. If the page is blank, `frontend/dist` is missing: run `npm --prefix frontend run build`.
4. Press **Reset**. Wait 20 seconds so the predictor has history.
5. Open a second tab at `/allocation` and click **Enhanced (Lending)**.
6. Browser zoom 100%, full screen. No internet is needed.
7. Have `results/lending_report.md` and `document/TEST_LOG.md` open in the editor as backup.

### 7.2 Live script (about 4 minutes)
| Time | Action | What they see | Say |
| --- | --- | --- | --- |
| 0:00 | Live Demo page, nominal load | four tiles, charts flat, SLA chips green | "Same traffic on all four policies. Static is the fixed 60/25/15 split." |
| 0:20 | Press **mURLLC storm** | Static violations climb and its chip turns red; Agent and Enhanced stay at zero | "Static fails the SLA. Our shielded RL agent holds it. The shield guarantees floors by construction." |
| 0:50 | Traffic and Bots: add 20 users at the factory | URLLC load rises everywhere | "Real demand changes, devices not just percentages." |
| 1:10 | Allocation page, Enhanced tab | gauges, dashed loan arrow, striped cells, ledger line | "Our add-on predicts risk from past traffic only, lends only the bottleneck resource, and writes down why." |
| 1:40 | Wait for the loan to return | arrow shrinks, ledger shows returned | "Capacity comes back step by step. No flapping." |
| 2:00 | Traffic page: set eMBB bots to maximum | overload banner with exact numbers | "When capacity is not there we say so, with numbers. URLLC and mURLLC protected first. We never claim every SLA holds." |
| 2:30 | Results page | tables with intervals, lending section, calibration chart | "20 held-out seeds, paired intervals. Calibrated risk is our strong result. Lending does not beat our own agent here, and we show that." |
| 3:15 | Click Reset | back to nominal | "Everything is reproducible: same seed, same events, same frames." |

### 7.3 If something breaks
- Stream stalls: press Reset; if still stuck, restart `uvicorn` (20 seconds) and hard refresh.
- Page blank: use `/legacy` (classic dashboard) which has no build step.
- No network needed anywhere. If the browser shows a connection error, the server is not running.
- Worst case: walk through `results/lending_report.md`, `results/*.png` and `document/TEST_LOG.md`. (A screen recording was not made; record one if time allows.)

### 7.4 "Prove it" quick tests a judge can watch (about 2 minutes total)
```
.\venv\Scripts\python test_files\test_lender.py                 # 37 checks, about 12 s
.\venv\Scripts\python test_files\test_lending_integration.py    # 14 checks, about 10 s
.\venv\Scripts\python test_files\test_lending_eval.py           # 10 checks, about 5 s
node test_files\test_lending_ui.cjs                             # 44 checks in a real browser, about 60 s
.\venv\Scripts\python test_files\lending_baseline_l0.py --check # original agent reproduced bit for bit
```
The full regression (23 Python suites and 12 Node suites) takes about 10 minutes.

---

## Part 8. Questions you will be asked (and honest answers)

### Functional implementation and alignment
1. **What problem do you solve?** Static slicing wastes capacity and ignores compute; plain RL risks the rare URLLC packets. We allocate radio and compute jointly, learn with constraints, and protect URLLC and mURLLC with a hard floor.
2. **How is this different from the usual "RL for slicing"?** Three things: joint radio-and-compute (the min coupling), constrained RL with one multiplier per SLA, and a deterministic shield so the promise holds by construction, plus an honest evaluation.
3. **What are the three slices and their SLAs?** eMBB at least 70% served; URLLC at most 0.5% violations; mURLLC at most 1%; windows of 20 steps (2 s).
4. **Where do you "guarantee" SLAs?** We protect URLLC and mURLLC with floors and say "held in feasible load". We do not claim guarantees under overload, nor five nines or measured 1 ms latency.
5. **What is "overload"?** Offered load above 90% of total capacity. Then the claim is only that URLLC and mURLLC are protected first and eMBB degrades.
6. **What do bots and locations add?** Individual devices that switch on and off give realistic burstiness and let the audience change demand; locations group them (campus, factory, smart city).
7. **Is the simulator realistic?** It is a slice-level abstraction with an explicit radio-compute coupling, not a radio-level model. That is a stated limit; ns-3 validation is future work.

### Technical depth and effectiveness
8. **Why PPO and not another method?** Stable, CPU-friendly, works with continuous actions; trained in minutes on a laptop.
9. **What is a CMDP and a Lagrange multiplier?** Maximise reward subject to cost limits; the multiplier grows while a limit is violated, penalising risky actions, and decays when satisfied. We have one per SLA.
10. **Why a shield if you have constrained RL?** Learning gives soft, average-case safety; the ablation shows constrained PPO without the shield still fails the mURLLC storm (2.29% violations, SLA met in 10% of runs). The shield gives a hard floor.
11. **What does the observation contain?** 12 numbers: per slice queue fraction, smoothed load, current PRB and vCPU share.
12. **What is the radio-compute coupling?** Served traffic is the minimum of radio and compute capacity, so more PRBs do nothing if vCPUs are short. The lender lends only the bottleneck resource for that reason.
13. **How does the lender decide?** It forecasts next-step demand from past arrivals and queue, estimates risk as the probability demand exceeds capacity using recent forecast errors, and lends when risk is above 30% for 2 steps (1 for a detected burst).
14. **How do you stop it taking too much?** Donors never go below a protected minimum (forecast demand with a margin, and never below the shield floor); at most 30% of the pool moves per step; the shield is applied after.
15. **How do you avoid flapping?** Confirmation periods before lending (2 steps) and before returning (3 steps), gradual return, and a rule that a slice cannot lend and borrow the same resource at once.
16. **Is the predictor cheating by looking at the simulator?** No. It receives only past arrivals, queues, allocations and violations. A test changes all data after step t and shows the output at t is unchanged, and a source check forbids simulator references.
17. **Is the risk estimate any good?** On held-out seeds: Brier 0.00397 vs 0.07029 for a constant-rate predictor, AUC 0.9989, calibration error 0.015. It is conservative in the middle bins, and the top bin is mostly sustained overload, not burst-onset prediction.
18. **Is the demand forecast good?** Better than naive last-value only for URLLC; for eMBB and mURLLC it is slightly worse (73.9 vs 72.6; 7.87 vs 7.68 packets). We kept the specified smoothing and report it.
19. **How fast is it?** 0.30 ms per step for predictor plus lender; the whole four-policy step about 2.4 ms against a 200 ms budget.
20. **Your agent equals Heuristic + Shield. Why RL at all?** True in our scenarios: the shield produces the SLA, and the shipped agent's raw output is almost constant. We report it. What the RL framework adds is the constrained formulation and tooling for settings where load patterns are less simple; we have not shown a gain over Heuristic + Shield here. Do not claim otherwise.
21. **Does lending beat your RL agent?** No. On 20 held-out seeds in 8 scenarios the violations are identical on every seed, because the shield already gives URLLC and mURLLC enough capacity and they have none to lend to eMBB. We did not alter the evaluation; the log records it.
22. **Then what is the contribution?** A calibrated, history-only risk estimate; bottleneck-aware loans with a safe lifecycle that is bit-identical to the original when switched off; honest overload admission with exact numbers; and an evaluation that would have shown a gain if one existed.
23. **Why is eMBB below 70% in the surge?** The surge needs more capacity than the shield-protected split provides; URLLC and mURLLC hold their floors (that is the priority rule), so eMBB degrades. Lending cannot take the floors away. Letting it relax a floor for an idle donor is a design change we have not approved or tested.
24. **How do you know it is not overfitted to your simulator?** The predictor sees only past traffic and thresholds were tuned on separate seeds; the tuning grid was flat. We have not tested on another simulator, which is why we call it simulator-level evidence.

### Progress, testing, validation
25. **How did you test?** Unit tests (shield, SLA module), simulator acceptance tests, property tests (10,000 random states for lending), integration tests against the pre-lending API, held-out statistical evaluation, real-browser UI tests, end-to-end scenarios and a 30-minute soak.
26. **How do you prevent tuning on the test set?** Separate seed ranges, printed and checked disjoint by a test; tuning only on validation seeds.
27. **How do you know nothing broke when you added lending?** A fingerprint of 21 original runs is reproduced exactly with lending off; a test compares every old field of 100 streamed frames with the pre-lending API; the whole earlier suite passes.
28. **What bugs did testing find?** Overload under-reporting (edge-case test), a horizontal scroll at 1366x768 on every page, a 404 on refreshing `/allocation`, a console error from a missing favicon. We also corrected a sign error in our own report.
29. **Is it reproducible?** Yes: the same seed and events give identical frames (tested twice), and results are regenerated by scripts.
30. **What did you not validate?** Real networks and ns-3. We say so.
31. **What is your confidence in the numbers?** 20 held-out seeds with 95% paired bootstrap intervals; headline numbers were recomputed by hand and three episodes re-simulated from scratch matched the CSV exactly.
32. **What would you do next?** Radio-level validation in ns-3, train the agent with the lender in the loop, a mid-episode storm scenario to test onset prediction, and possibly letting the lender relax a floor for an idle donor with safety analysis.

---

## Part 9. Things that could embarrass us (fix or avoid)

| Risk | Why | What to do |
| --- | --- | --- |
| Saying lending "reduces violations vs the agent" | measured: identical | do not say it; use Q&A 21 |
| Saying "guarantees 0.00% violations" | the older README headline still says it; conflicts with our own honest-claims list | avoid reading it aloud; say "held in feasible load" (candidate edit) |
| Saying ns-3 validated it | `ns3/` holds only synthetic traces | never mention ns-3 as done; "future work" |
| "RL beats the heuristic" | agent equals Heuristic + Shield here | Q&A 20 |
| UI compliance percentages on the Live scoreboard and SLA matrix ("20-Step SLA Compliance", "Window Compliance") | some are computed by formula or hard-coded (for example 100.0% for the agent), not taken from the backend | point judges to the SLA chips and the Results page instead; do not quote those percentages (candidate fix) |
| "Five nines / 1 ms measured" | not measured | avoid |
| No video backup | none was recorded | use screenshots and reports; record one if time allows |
| Heuristic tile shows violations in the live demo | the live Heuristic has no shield; the table's "Heuristic + Shield" is the shielded one | say which one you mean |

---

## Part 10. Glossary

**eMBB, URLLC, mURLLC:** the three slice types. **PRB:** physical resource block, the unit of radio capacity. **vCPU:** virtual CPU core at the edge UPF. **UPF:** user plane function, the edge compute that processes packets. **SLA:** service-level agreement, the per-slice promise. **CMDP:** constrained Markov decision process. **Lagrangian relaxation:** folding a constraint into the reward with a multiplier. **PPO:** proximal policy optimisation, the RL algorithm. **Shield:** a deterministic rule layer applied after the policy. **Feasible / overload:** offered load at most / above 90% of capacity. **Lender, loan, donor, borrower, recall:** lending vocabulary (Part 2.7). **Brier score:** mean squared error of a probability forecast (lower is better). **AUC:** how well a score ranks events above non-events. **Calibration:** predicted probabilities match observed frequencies. **Paired bootstrap:** resample per-seed differences to get a confidence interval. **Held-out seeds:** random seeds never used for training or tuning. **Ablation:** removing one part to show whether it matters. **Hysteresis:** different thresholds to start and stop, to avoid flapping.

---

## Part 11. Where everything is

| What | Where |
| --- | --- |
| Master configuration | `config.yaml` |
| Simulator, shield, SLA module, baselines | `sim.py`, `shield.py`, `sla.py`, `baselines.py` |
| Training and evaluation | `train.py`, `evaluate.py`, `runs/log.csv`, `results/sla_table.csv`, `results/ablation.csv` |
| Lending | package `lending/`: `predictor.py`, `lender.py`, `evaluation.py`, `tune.py`, `run_eval.py`, `report.py`, `calibration.py`, `seeds.py` |
| Lending results | `results/lending_report.md`, `results/lending_*.csv|json|png` |
| API and dashboards | `api.py` (React app at `/`, classic at `/legacy`), `frontend/` |
| Tests | `test_files/` |
| Logs and specs | `document/TEST_LOG.md`, `document/LENDING_SPEC.md`, `document/SLA_RL_SPEC.md`, `document/PROJECT_GUIDE.md`, `document/TESTING_GUIDE.md`, `document/LENDING_PITCH.md` |
| Model | `models/agent.zip` (backup `models/agent_pre_lending.zip`, same file) |

**Run commands:** start `.\venv\Scripts\python -m uvicorn api:app --port 8050`; benchmark `.\venv\Scripts\python evaluate.py`; lending evaluation `python -m lending.run_eval` then `python -m lending.report`.
