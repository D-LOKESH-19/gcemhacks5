# SLA-Aware Predictive Resource Lending Spec (Phase L: our innovation)

Audience: the Antigravity build agent and the team. This adds our innovation on top of the finished project. It must NOT break anything that works. The human approves in advance: the new `lending` config section, the new modules `predictor.py` and `lender.py`, the new policy copy 'enhanced', the new stream and API fields described here, and the new UI parts. Do not change the RL model, the observation (12 floats), the action (6 floats), the reward or the old cost definitions.

## 1. The real-world problem (for the pitch)

A 5G operator promises different guarantees to different customers: factories need URLLC deadlines, sensor fleets need mURLLC reliability, video users need eMBB throughput. All of them share one radio pool and one edge compute pool. Today there are three ways to run this, and each has a weakness:

1. **Static reservations** are safe but waste capacity: a quiet slice keeps resources that a busy slice badly needs.
2. **Reactive controllers** only move resources after congestion or violations appear. For URLLC with deadlines of milliseconds, a violation has already happened by the time the controller reacts.
3. **Controllers that claim guarantees** hide the truth when the network simply does not have enough capacity.

The result: SLA violations at burst onset, stranded capacity between bursts, and no honest signal when the SLA cannot be met.

## 2. Our solution in one paragraph

Instead of waiting for congestion, our system estimates the risk of an impending SLA violation for every slice from recent traffic only. When a slice is at risk it temporarily lends spare radio bandwidth and edge compute to that slice, taking only what donor slices can spare while their own minimum needs stay protected. When the burst is over it returns the borrowed resources step by step, so overall utilization recovers. If the lendable capacity is not enough, it says so: it flags overload, shows the unfunded amount, and protects URLLC and mURLLC first, instead of pretending that every SLA can be guaranteed.

Four ideas: **Predict, Lend, Return, Admit overload.**

## 3. What is new, honestly

- Lending is driven by an explicit, calibrated **risk estimate**, not by a fixed rule or by a violation that already happened.
- Loans are **bottleneck-aware**: only the resource that limits a slice's effective capacity (radio or compute) is lent, which uses our radio-compute coupling.
- Loans have a **lifecycle**: hysteresis, gradual return, recall when the donor itself becomes at risk, and a time limit.
- The system **admits overload** with numbers.
- We **prove** it: identical traffic for every policy, paired statistics against the original RL agent, an ablation of predictive versus reactive lending, and a calibration check of the risk estimate.

We do not claim to have invented lending or prediction in general. The contribution is the combination, applied to joint radio-and-compute slicing, with an honest evaluation.

## 4. Design decisions (made; do not reopen)

1. **Position in the pipeline:** Agent proposes (raw shares) -> **Lender adjusts** -> Shield enforces hard floors -> applied. The shield stays the last line of defence and always has the final word.
2. **The original RL agent is unchanged** and is not retrained. The Lender is a wrapper that works with any policy. Training with the lender in the loop is future work.
3. **No oracle.** The predictor may use only past observable data (arrivals, queues, allocations, past violations). It must never read simulator internals such as burst probabilities, future spikes or bot schedules.
4. **Intervene only when needed.** If the agent already gives a slice enough capacity, the lender does nothing.
5. **Policies compared (identical traffic, seed and events):** Static, Heuristic, Agent + Shield (the original), and **Enhanced** = Agent + Lender + Shield.
6. **Contracts unchanged:** observation, action, reward, old `info['cost']`, `info['costs']`, `sla.py` and all existing endpoints keep working. All additions are additive.
7. **Lender off means identical to original.** With `lending.mode: off` the Enhanced policy must produce bit-for-bit the same results as Agent + Shield for the same seed.

## 5. Mechanism specification

### 5.1 Predictor (predictor.py)

Per slice, from history only:

- **Forecast of next-step demand** `d_hat`: exponentially weighted level plus a damped trend (`ewma_alpha`, `trend_beta`). Demand means arrivals plus carried-over queue (eMBB).
- **Residuals:** keep the last `residual_window` (default 50) one-step forecast errors.
- **Burst margin:** the `burst_quantile` (default 0.95) of the recent positive residuals. Until the window has 10 values use a conservative default margin and mark the output as 'warming up'.
- **Burst detector:** arrivals above 3 times the recent level flag a burst; a burst flag raises the forecast to the burst level for the next steps (persistence learned from the observed burst, not from config).
- **Risk** `R` in 0..1: the estimated probability that next-step demand exceeds the slice's effective capacity at the current allocation, computed from the empirical residual distribution: `R = fraction of residuals with (d_hat + residual) > effective_capacity`, smoothed with a small pseudo-count so it is never exactly 0 or 1 without evidence.
- **Headroom:** `effective_capacity - (d_hat + margin)`, in packets per step, for radio, compute and the minimum of both.
- Outputs per slice: `forecast`, `margin`, `risk`, `headroom_radio`, `headroom_cpu`, `warming_up`.

### 5.2 Protected minimum

For every slice and each resource the protected minimum share is `protected_min = max(shield_floor, protected_margin x d_hat / (rate x pool_total))`. For eMBB the margin is chosen so that the SLA served ratio (at least 0.70 from `sla.py` config) is still reachable for forecast demand. A donor is never taken below its protected minimum. The shield floors remain as a hard lower bound under everything.

### 5.3 Borrower need and bottleneck awareness

For a slice with `risk >= risk.high` for `confirm_steps` consecutive steps (one step for a detected burst):

- Need per resource: `need = max(0, (d_hat + margin) - current_capacity)`, converted to share units.
- If `bottleneck_aware` is true, only the resource that is the bottleneck gets a loan (radio if radio capacity is the smaller one, compute if compute is, both if within 5 percent). Use the same bottleneck definition as the Allocation page spec.

### 5.4 Lending algorithm (each step, per resource)

1. Compute risk, forecast, protected minimum and bottleneck for all slices.
2. Borrowers = slices over the risk threshold with need above zero. A slice is either a donor or a borrower for a resource in the same step, never both.
3. Donors = the other slices; `lendable = max(0, proposed_share - protected_min)`.
4. Fund borrowers in `priority` order (default URLLC, then mURLLC, then eMBB). For each borrower take from donors in order of lowest risk and largest lendable amount. One loan step moves at most `max_loan_fraction` of the pool.
5. Open or enlarge a loan record: `{id, resource, donor, borrower, amount, opened_step, ttl, reason_code, risk_at_open}`.
6. Apply the offsets on top of the agent's raw shares (donor minus, borrower plus), then pass the result to the shield.
7. If need remains unfunded, record it (section 5.6).

### 5.5 Returns, recalls, time limits

- **Return (hysteresis):** when the borrower's risk stays below `risk.low` for `return_confirm_steps` consecutive steps, the loan is returned gradually, `ramp_return_pct` of its remaining amount per step, until zero. No return before the confirmation period.
- **Recall (priority):** if a donor's risk exceeds `risk.recall`, its loans are reduced in the same step, enough to bring the donor back to its protected minimum plus its own margin. The borrower may then become unfunded, which is reported.
- **Time limit:** a loan older than `ttl_steps` is re-evaluated and renewed only if the borrower's risk is still high.
- **No flapping:** a loan cannot open and fully close within `confirm_steps` steps unless recalled.

### 5.6 Overload admission

If the total need of the borrowers cannot be funded from what donors can lend without breaking protected minimums, the lender sets `overload: true` and reports, per slice and resource, the **unfunded amount**. It emits an event such as 'Cannot fully fund URLLC risk: lendable 6 PRB, need 14 PRB. Protecting URLLC and mURLLC first.' Under overload the protection order is URLLC, then mURLLC, then eMBB degrades. Nothing in the UI or README may claim all SLAs hold during overload. Link this flag to `sla.py` `feasible` in the display (both can be true at once).

### 5.7 Invariants (each has a test)

1. No donor ever ends below its protected minimum (when the baseline allocation was feasible).
2. Shares sum to 1 for each resource; total lent equals total borrowed; loan offsets equal share changes.
3. The predictor's output at step t does not change if future data (steps after t) is altered.
4. No loans open when no slice is above the risk threshold.
5. Hysteresis and ramped return as in 5.5; recall happens in the same step.
6. Overload is always flagged when need exceeds lendable.
7. Determinism for the same seed and events.
8. With `mode: off` the results equal the original Agent + Shield exactly.
9. The shield is always applied last.
10. Lender plus predictor take under 3 ms per step.

## 6. Config additions (config.yaml)

```yaml
lending:
  mode: predictive            # predictive | reactive | off
  bottleneck_aware: true
  forecast: {ewma_alpha: 0.4, trend_beta: 0.2, residual_window: 50, burst_quantile: 0.95, default_margin_fraction: 0.30}
  risk: {high: 0.30, low: 0.10, recall: 0.25, confirm_steps: 2, return_confirm_steps: 3}
  protected_margin: {embb: 1.0, urllc: 1.3, murllc: 1.3}   # embb uses the SLA served-ratio target
  max_loan_fraction: 0.30
  ramp_return_pct: 0.25
  ttl_steps: 30
  priority: [urllc, murllc, embb]
```

`reactive` mode is the ablation: the same loan machinery, but the trigger is a violation or queue growth that already happened in the last step, with no forecast. Thresholds may be tuned only on a validation seed set that is disjoint from the evaluation seeds.

## 7. Code structure

- `predictor.py`: pure, testable classes with explicit state, no globals.
- `lender.py`: `Lender.adjust(raw_prb, raw_cpu, history, config) -> (adjusted_prb, adjusted_cpu, loans, lending_info)`.
- The Enhanced policy = existing agent policy + `Lender` + existing shield, wired in the same place where the Agent policy is built. The shield code is not modified.
- Tests in `tests/test_predictor.py`, `tests/test_lender.py`, `tests/test_enhanced.py`.

## 8. Integration and API

- The API runs four policy copies on identical traffic and events: `static`, `heuristic`, `agent` (original), `enhanced`. The stream keeps all old fields and adds the key `enhanced`.
- Per step, the enhanced policy reports in its `allocation` block (additive, see the Allocation page spec) a `lending` object: `{mode, risk: [3], forecast: [3], margin: [3], headroom: [3], warming_up, loans_active: [...], loans_events: [opened | enlarged | returned | recalled | expired], lent: {prb: [3], cpu: [3]}, overload: bool, unfunded: {prb: [3], cpu: [3]}, pipeline: {raw: [3], post_lender: [3], final: [3]}}`.
- `GET /api/lending` returns the lending config, the open loans, loan statistics (count, mean amount, mean duration, return lag, recalls) and predictor calibration statistics.
- `GET /api/capabilities` gets `lending: true/false`.
- If the Allocation page does not exist yet, the lending data is still produced and shown by the panels in section 10 that do not depend on it.

## 9. Evaluation plan

**Policies:** Static, Heuristic, Agent + Shield (original), Enhanced. **Ablations:** Enhanced reactive, Enhanced without returns (never return), Enhanced radio-only (not bottleneck-aware), and optionally an 'oracle lender' that sees the true next demand (labelled 'upper bound, not deployable').

**Scenarios:** steady, eMBB surge, URLLC burst, mURLLC storm, bots at 0.3x, 1x and 3x default counts, and overload cases (reported separately). 20 or more held-out seeds, disjoint from any tuning seeds. Identical traffic and bot events for all policies.

**Metrics:**

- SLA window compliance and violation rate per slice (from `sla.py`).
- **Onset-window violations:** violations in the first 3 steps after a burst or spike starts (this is where prediction should help).
- eMBB served ratio and overall resource utilization.
- Loan statistics: number, mean amount, mean duration, return lag, recalls, time spent in overload.
- **Violations avoided versus the original agent**, paired per seed, with a 95 percent paired bootstrap interval.
- Predictor quality: forecast error versus a naive last-value forecast, a reliability table (predicted risk bins versus observed next-step violation frequency), Brier score versus a constant-rate baseline, and AUC.

**Expected story, and what to do if it does not appear:** predictive lending reduces onset-window violations compared with the original agent and with reactive lending, returns capacity so utilization and eMBB throughput recover, and flags overload honestly. Random burst onsets cannot be foreseen, so the gain concentrates in the steps after onset and in sizing. If a scenario shows no gain, report it and adjust the pitch; never tune on evaluation seeds and never change the evaluation to look better.

## 10. UI changes (React app; extend the Allocation page if it exists)

- **Enhanced everywhere:** a fourth policy (tab, scoreboard tile, chart line, card). Policy colour for Enhanced: pink `#F472B6`. Slice colours and other policy colours stay as they are.
- **Lending panel** (on the Allocation page, or on the Agent Insights page if Allocation is not built):
  - Risk gauges per slice (0 to 100 percent) with the high, low and recall thresholds marked, a small forecast-versus-capacity chart, and a 'warming up' tag when relevant.
  - **Loan visualisation:** cells or chips that are on loan show a clock icon and a striped fill in the borrower's colour; donors' lent cells keep a dashed outline in their colour; a dashed arrow from donor to borrower labelled with the amount and the time to live; when repaid the arrow reverses and fades.
  - **Loan ledger:** opened, enlarged, returned, recalled and expired entries with step, resource, donor, borrower, amount and reason text built from real numbers.
  - **Overload banner:** appears when `overload` is true with the exact numbers ('lendable 6 PRB, need 14 PRB') and the wording 'URLLC and mURLLC protected first'. It disappears when resolved.
  - **Pipeline stage:** the decision pipeline shows 'Lender adjusts' between 'Agent proposes' and 'Shield checks', with the raw, post-lender and final shares.
- **Results page section 'Innovation: predictive lending':** paired violations avoided with intervals, predictive versus reactive onset-window violations, the no-return and radio-only ablations, the calibration (reliability) chart, and loan statistics. Every number comes from the backend and the CSV files.
- **Honesty labels (always visible near the panel):** 'Risk is a forecast from past traffic only.' 'Slice-level simulator.' Overload text as above.
- Respect reduced motion; no mock or random data; works offline.

## 11. Build phases (stop after each; wait for 'next')

| Phase | Goal | Deliverables | Tests |
| --- | --- | --- | --- |
| L0 | Gate and safety | the SLA upgrade, shield, `sla.py`, evaluate.py and the existing suite pass; `git tag pre-lending`; copy `models/agent.zip` to `models/agent_pre_lending.zip` | LL-12 baseline recorded |
| L1 | Predictor | `predictor.py`, tests, offline calibration on recorded traces | PL-1 to PL-8 |
| L2 | Lender logic | `lender.py` with loans, returns, recalls, overload, property tests | LL-1 to LL-15 |
| L3 | Integration | Enhanced policy, config, four policies in the API, stream and `/api/lending` fields, capabilities | LI-1 to LI-6 |
| L4 | Evaluation | paired evaluation, ablations, predictor evaluation, CSVs and plots | LE-1 to LE-10 |
| L5 | UI | Enhanced everywhere, Lending panel, Results section | LU-1 to LU-10 |
| L6 | Docs and regression | README, pitch notes, demo script, test log, full regression, E2E | E2E-L1 to E2E-L5 |

Commit once per phase.

## 12. Tests

### Predictor (L1)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| PL-1 | No oracle | change all data after step t in a trace: predictor outputs at t are identical | P0 |
| PL-2 | Forecast quality | on periodic URLLC and bursty eMBB traces the forecast has lower error than a naive last-value forecast; if not, report | P1 |
| PL-3 | Risk behaves | risk rises as demand over capacity rises; near 0 with large headroom; high with large shortfall; stays within 0..1 | P0 |
| PL-4 | Calibration | over 20 seeds and all scenarios, the reliability table is produced; Brier score beats a constant-rate predictor; calibration error is reported | P0 |
| PL-5 | Burst detection | a jump above 3 times the level is flagged within 1 step; false alarms in steady load under 5 percent | P1 |
| PL-6 | Zero traffic | no NaN, risk near 0, no division by zero | P0 |
| PL-7 | Speed | predictor for 3 slices under 1 ms per step | P1 |
| PL-8 | Warm-up | the first 10 steps use the conservative margin and set `warming_up` | P1 |

### Lender logic (L2)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| LL-1 | Protected minimum | 10,000 random states: no donor ends below its protected minimum | P0 |
| LL-2 | Conservation | shares sum to 1 per resource; total lent equals total borrowed; ledger offsets equal share changes | P0 |
| LL-3 | No risk, no loan | all risks below the threshold: no loans, output equals the agent's proposal | P0 |
| LL-4 | Loan on risk | a crafted high-risk borrower with an idle donor gets a loan within 1 step, at most `max_loan_fraction`, from the lowest-risk donor | P0 |
| LL-5 | Bottleneck-aware | compute-limited borrower gets only vCPU, radio-limited only PRB, 'both' gets both | P0 |
| LL-6 | Return | after the confirmation period the loan ramps down by `ramp_return_pct` per step to zero; no return earlier | P0 |
| LL-7 | No flapping | stress run: loan lifetime is at least the confirmation steps unless recalled; open and close counts stay low | P1 |
| LL-8 | Recall | donor risk above the recall threshold reduces its loans in the same step and logs 'recalled' | P0 |
| LL-9 | Time limit | a loan past `ttl_steps` is renewed only if the risk is still high | P1 |
| LL-10 | Funding order | under shortage URLLC is funded before mURLLC before eMBB | P0 |
| LL-11 | Overload | need above lendable sets `overload`, reports unfunded amounts, emits the event, keeps protected minimums | P0 |
| LL-12 | Off equals original | `mode: off` gives bit-for-bit identical results to Agent + Shield for the same seed | P0 |
| LL-13 | Determinism | same seed and events give identical loans and shares | P0 |
| LL-14 | Contracts | observation (12), action (6), reward and old costs unchanged; the shield is applied last | P0 |
| LL-15 | Speed | lender plus predictor under 3 ms per step | P1 |

### Integration (L3)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| LI-1 | Four policies, same traffic | arrivals and bot or spike events are identical for Static, Heuristic, Agent and Enhanced at every step | P0 |
| LI-2 | Pipeline fields | raw, post\_lender and final shares exist, each sums to 1 | P1 |
| LI-3 | Shield last | an adversarial run: final shares never violate the shield floors | P0 |
| LI-4 | Stream fields | `lending` block values come from the backend and change when load changes | P0 |
| LI-5 | Capabilities | `lending` flag flips with the feature | P1 |
| LI-6 | No regression | old suite passes; all old stream fields unchanged; message growth under 40 percent; about 5 steps per second | P0 |

### Evaluation (L4)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| LE-1 | Paired seeds | Enhanced and the original agent run on the same held-out seeds; paired bootstrap interval for the violation difference | P0 |
| LE-2 | Scenarios | all scenarios in section 9 run, overload reported separately | P0 |
| LE-3 | Predictive versus reactive | onset-window violations compared with the reactive ablation | P0 |
| LE-4 | No-return ablation | utilization and eMBB served ratio compared; report honestly | P1 |
| LE-5 | Radio-only ablation | compared; report honestly | P1 |
| LE-6 | Metrics complete | every metric in section 9 is computed and saved | P0 |
| LE-7 | Predictor evaluation | reliability table, Brier score, AUC and forecast error saved | P0 |
| LE-8 | Overload honesty | overload results use the 'protected first' wording and never claim all SLAs hold | P0 |
| LE-9 | No tuning on evaluation | thresholds tuned on validation seeds only; the two seed lists are printed and disjoint | P0 |
| LE-10 | Files and headline | `results/lending_*.csv` and plots exist; the headline numbers are recomputed by hand and match | P0 |

### UI (L5)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| LU-1 | Enhanced everywhere | tab, tile, chart line and card with the pink policy colour; other palettes unchanged | P1 |
| LU-2 | Risk gauges | values equal the stream; thresholds marked; 'warming up' shown when true | P0 |
| LU-3 | Loan visuals | cells on loan show the clock and stripes; donor outlines; counts equal the ledger | P0 |
| LU-4 | Ledger | opened, enlarged, returned, recalled and expired entries equal the stream; filters work | P0 |
| LU-5 | Overload banner | appears with exact numbers and the 'protected first' wording; disappears when resolved | P0 |
| LU-6 | Storm story | in a mURLLC storm risk rises, a loan opens, and after the burst the loan returns step by step | P0 |
| LU-7 | Results section | paired differences with intervals, predictive versus reactive, calibration chart; numbers equal the CSV | P0 |
| LU-8 | Basics | no mock data, no console errors, works offline, no overlap at 1920x1080 and 1366x768 | P0 |
| LU-9 | Honesty labels | 'Risk is a forecast from past traffic only' and 'Slice-level simulator' visible | P0 |
| LU-10 | Reduced motion | respected | P2 |

### Edge cases

| ID | Edge case | Expected |
| --- | --- | --- |
| EP-1 | All slices high risk at once | overload flagged, protected minimums intact, priority order respected |
| EP-2 | Borrower's traffic disappears mid-loan | loan returns by the normal ramp |
| EP-3 | A slice that lent tries to borrow the same resource | blocked within the same step |
| EP-4 | Bot count changes during a loan | forecast adapts; loans stay consistent with the ledger |
| EP-5 | Reset | ledger, predictor state and loans all clear |
| EP-6 | First 50 steps | warm-up margin is used and reported |
| EP-7 | Very short repeated bursts | no flapping; recall and return rules hold |
| EP-8 | Loan larger than the pool | clipped to what donors can lend; the rest is reported unfunded |
| EP-9 | Two tabs open | same ledger and risk values in both |

### End to end (L6)

- **E2E-L1 storm story:** cold start, steady 20 seconds, press mURLLC storm. The original agent shows onset violations; the Enhanced risk gauge rises, a loan opens from the slice with spare capacity, violations stay lower, and after the burst the loan returns step by step.
- **E2E-L2 repeatability:** reset and replay the same events twice; identical loans and numbers.
- **E2E-L3 overload honesty:** add the maximum bots everywhere; the overload banner appears with numbers and the correct wording; nothing claims all SLAs hold.
- **E2E-L4 regression:** `mode: off` gives results identical to Agent + Shield; the full earlier suite and all earlier E2E scenarios pass.
- **E2E-L5 soak:** 30 minutes with random spikes and bot changes: stable memory, no console errors, no unbounded ledger growth (cap the ledger at 200 entries in the UI).

## 13. Pitch material

**Problem statement (30 seconds):** 'Network slices share one radio pool and one edge compute pool. Static reservations waste capacity, and reactive controllers only act after a deadline has already been missed. And when the network truly lacks capacity, nobody tells the operator.'

**Solution (30 seconds):** 'We predict SLA risk from recent traffic, lend only the bottleneck resource to the slice at risk while protecting everyone else's minimum, return it step by step when the burst is over, and say so honestly when the capacity is not there.'

**Three claims, each needs evidence from section 9:**

1. Fewer onset-window violations than the original RL agent and than reactive lending (LE-1, LE-3).
2. Capacity is returned, so utilization and eMBB throughput recover (LE-4, loan statistics).
3. The risk estimate is calibrated and overload is reported honestly (LE-7, LE-8).

**Demo script (90 seconds):** nominal load; press mURLLC storm; show the risk gauge, the loan arrow and the ledger; show the original agent's violations next to Enhanced; watch the loan return; add maximum bots to show the overload banner; finish on the Results card with the paired interval and the calibration chart.

**Likely jury questions:**

- 'Is this just a heuristic?' It is a model-based layer with a calibrated risk estimate, a loan lifecycle with hysteresis and recall, and overload admission, and we test it against a reactive version and the original RL agent with paired statistics.
- 'Does it work in a real network?' We validated it in a slice-level simulator. Radio-level validation with ns-3 is future work.
- 'Why not retrain the RL agent?' The lender works with any policy; training with the lender in the loop is future work.
- 'Can you guarantee the SLA?' We protect minimums and flag overload; we never claim guarantees under overload.
- 'Is it overfitted to your simulator?' The predictor only sees past traffic, and thresholds are tuned on separate validation seeds.

## 14. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Enhanced shows no gain over the original agent | report honestly; lead with calibration, overload honesty and the onset-window result; check thresholds on validation seeds |
| Lender oscillates | raise `confirm_steps` and `return_confirm_steps`, lower `ramp_return_pct` |
| Risk estimate is poorly calibrated | widen the residual window or use a simpler quantile margin; report the calibration error |
| Too slow per step | cut the residual window to 30, vectorise the predictor |
| Four policy copies make the UI heavy | lower the update rate to 3 per second; hide Heuristic behind a toggle |
| Time runs short | ship L1 to L4 and show the results table plus the Lending panel only; skip the ablations beyond predictive versus reactive |

## 15. Definition of done

- [ ] Predictor, Lender and the Enhanced policy exist and run on identical traffic with the other three policies
- [ ] All invariants in section 5.7 are tested; `mode: off` equals the original exactly
- [ ] The evaluation uses disjoint held-out seeds, paired statistics, and the predictive versus reactive ablation
- [ ] The risk estimate has a calibration table and overload is reported honestly
- [ ] The Lending panel, loan visuals, ledger, overload banner and Results section work and show only backend data
- [ ] All P0 tests pass and are logged in `TEST_LOG.md`; the earlier suite still passes
- [ ] README, pitch notes and demo script updated; backup recording includes the lending story
