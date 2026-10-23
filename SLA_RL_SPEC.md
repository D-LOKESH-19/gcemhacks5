# SLA and RL Model Spec (Core Upgrade)

Audience: the Antigravity build agent and the team. This is the CORE of the project: the SLAs we promise per slice, and the constrained reinforcement learning model that learns to keep them. It extends the finished work (Phases 0 to 9, and Phase 10 if done). Do not break anything that works. The human approves in advance: the new `sla` and `cmdp` config sections, the new `info['costs']` fields, the new `sla.py` module, and retraining the model.

## 1. Why this upgrade

Today the SLAs exist only indirectly: URLLC and mURLLC share ONE combined violation cost, eMBB has no SLA at all, and the SLA numbers are not written anywhere as a single source of truth. This upgrade fixes that:

1. One SLA table per slice, defined in `config.yaml`.
2. One module `sla.py` that computes SLA status. Training, evaluation, the API and the UI all use that same module (single source of truth).
3. A constrained RL model (CMDP) with one constraint and one Lagrange multiplier PER SLICE.
4. A proper evaluation that proves SLA compliance with confidence intervals, plus ablations that prove why each part of the model is needed.

## 2. The SLA table (per slice)

All SLAs are defined at the simulator level (100 ms steps). Evaluation window = 20 steps (2 seconds of simulated time).

| Slice | SLA metric | Target | How it is measured | Trained by | Enforced by |
| --- | --- | --- | --- | --- | --- |
| URLLC | violation rate (packets not served in their step divided by packets arrived) | at most 0.5 percent per episode, and at most 2 percent in any 20-step window | `sla.py` from `info['violations']` and arrivals | CMDP constraint with its own multiplier | shield floor |
| mURLLC | violation rate | at most 1 percent per episode, and at most 3 percent in any 20-step window | same | CMDP constraint with its own multiplier | shield floor |
| eMBB | served ratio (served divided by offered, including queue) | at least 0.70 averaged over the episode, when the load is feasible | `sla.py` | CMDP constraint on mean shortfall below 0.70 | not enforced by the shield (reward also pushes it up) |

**Reliability wording:** reliability = 1 minus violation rate. In our simulator the URLLC target is 99.5 percent. Do NOT claim 99.999 percent or 1 ms measured latency. The real standards target is context, not our claim.

**Feasible load rule:** if offered load across all slices exceeds 90 percent of total capacity (radio and compute combined, using the same min logic as the simulator), the situation is flagged 'overload / infeasible'. SLA results are reported separately for feasible and overload cases. In overload, the claim is only 'URLLC and mURLLC are protected first', never 'all SLAs hold'.

## 3. Config additions (config.yaml)

```yaml
sla:
  window_steps: 20
  embb:   {min_served_ratio: 0.70}
  urllc:  {max_violation_rate: 0.005, max_window_violation: 0.02}
  murllc: {max_violation_rate: 0.01,  max_window_violation: 0.03}
  feasible_load_fraction: 0.90
  amber_fraction: 0.80        # UI turns amber above 80 percent of a limit
cmdp:
  limits: {embb_shortfall: 0.05, urllc: 0.005, murllc: 0.01}
  lambda_init: 1.0
  lambda_max: 20.0
  lagrange_lr: 0.05
  dual_mode: simple           # simple | pid
  pid: {kp: 0.5, ki: 0.05, kd: 0.1}
```

The old `cost_limit` stays in config for backward compatibility with the old tests; it keeps its old meaning (combined URLLC plus mURLLC violation fraction).

## 4. The SLA module (sla.py): single source of truth

Pure functions, no global state, unit tested.

- `window_status(history, slice, cfg)`: from the last `window_steps` steps returns the metric value, the limit and a status `ok | amber | breach`.
- `episode_status(history, cfg)`: per-slice metric, limit, `met: bool`, margin.
- `is_feasible(arrivals_total, capacity_total, cfg)`: returns the feasible flag.
- `sla_compliance_rate(histories, cfg)`: fraction of windows meeting the SLA across many episodes.

Used by: `train.py` (cost signals), `evaluate.py` (tables), `api.py` (stream fields) and `static/index.html` (status chips). The UI must show whatever `sla.py` returns, not its own logic.

## 5. Simulator changes (sim.py)

No change to the observation (12 floats), the action (6 floats), the reward definition, or the old `info['cost']` scalar. Only additions:

- `info['costs']` with three per-step costs:
  - `urllc`: URLLC violations divided by URLLC arrivals (0 if no arrivals)
  - `murllc`: mURLLC violations divided by mURLLC arrivals (0 if no arrivals)
  - `embb`: max(0, 0.70 minus eMBB served ratio at this step) (0 if no demand)
- `info['feasible']`: bool from `sla.is_feasible` for this step's offered load.
- Old `info['cost']` is unchanged, so old tests pass.

## 6. The RL model (train.py): constrained PPO with per-slice duals

**Problem form (CMDP):** maximize expected eMBB served ratio (reward) subject to three constraints: mean URLLC cost at most 0.005, mean mURLLC cost at most 0.01, mean eMBB shortfall cost at most 0.05.

**Algorithm:** PPO (Stable-Baselines3, MlpPolicy, 2 x 64, CPU only), with Lagrangian relaxation.

- Training signal per step: `r_t minus lambda_urllc x c_urllc minus lambda_murllc x c_murllc minus lambda_embb x c_embb`.
- Three multipliers, all start at `lambda_init`, all clipped to 0..`lambda_max`.
- Dual update once per episode, per constraint i: `lambda_i = clip(lambda_i + lagrange_lr x (mean_cost_i minus limit_i), 0, lambda_max)`.
- If `dual_mode: pid` is chosen (use it if lambdas oscillate): `lambda_i = clip(kp x e + ki x integral(e) + kd x delta(e), 0, lambda_max)` with `e = mean_cost_i minus limit_i`, and the integral clamped (anti-windup).
- Log per episode: reward, three mean costs, three lambdas, feasible fraction. Save to `runs/log.csv`.
- Action pipeline: policy output (6 numbers) goes through softmax per group, then the shield, then the simulator. The shield is part of the environment during training AND evaluation.

**Training distribution (what the agent sees):**

- Random spikes (slice, factor, start, duration) every episode.
- Random bot counts per slice (0.3x to 3x default, capped), plus random mid-episode add and remove events.
- Curriculum (recommended): first third of training with mild spikes and low counts, then full range.
- Fixed training seeds, and evaluation seeds that are NEVER used in training.

**Model selection:** train 3 seeds. Keep the checkpoint that (1) satisfies all three constraints on a validation set of feasible scenarios, then (2) has the highest eMBB served ratio. Save as `models/agent.zip`; save the others as `models/agent_seed*.zip`. Back up the previous model as `models/agent_prev.zip` before overwriting.

**Budget:** 100k to 200k steps per seed. The whole training (3 seeds) should finish in about 30 minutes on a laptop CPU; if not, reduce to 2 seeds and tell the human.

## 7. Evaluation (evaluate.py)

- **Scenarios:** steady, eMBB surge, URLLC burst, mURLLC storm, and a bots scenario at 0.3x, 1x, 3x default counts. Each run uses 20 held-out seeds x 200 steps. Report feasible and overload cases separately.
- **Policies:** Static, Heuristic, Heuristic + Shield, Agent (full).
- **Ablations (the proof the model is needed):** (a) unconstrained PPO (all lambdas fixed at 0, no shield), (b) constrained PPO without the shield, (c) shield without RL (heuristic + shield), (d) full model: constrained PPO with per-slice duals and the shield. Expected story: (a) breaks URLLC, (b) mostly holds but with tail risk, (c) holds the SLA but wastes eMBB capacity, (d) holds the SLA and serves the most eMBB.
- **Metrics per policy, slice and scenario:** episode SLA met (yes or no), violation rate with 95 percent bootstrap confidence interval, SLA window compliance rate (percent of 20-step windows within SLA), p99 per-step violation, mean eMBB served ratio, worst window.
- **Headline numbers** come only from feasible scenarios: for example 'Agent meets all three SLAs in X percent of windows versus Y percent for Static, while serving Z percent more eMBB traffic than Heuristic + Shield'.
- Output: `results/sla_table.csv`, `results/ablation.csv`, grouped bar charts, training curves with lambdas, saved plots.

## 8. API and UI changes (small; SLA status only)

- The stream adds per policy and per slice: `sla: {status, value, limit}` from `sla.py`, plus `feasible`.
- `GET /sla` returns the SLA table (limits) and the current episode status per policy.
- The UI chips and the SLA lines on the charts are driven by these fields: green 'SLA OK', amber 'AT RISK' above 80 percent of the limit, red 'SLA BREACH'. A small 'OVERLOAD' badge appears when `feasible` is false.
- Add an 'SLA' info card listing the three SLAs in plain words, so judges can see the promise: 'URLLC: under 0.5 percent violations. mURLLC: under 1 percent. eMBB: at least 70 percent served.'
- No mock JavaScript values anywhere.

## 9. Build order (sub-phases; stop after each)

1. **Gate and safety:** run the whole old suite in both traffic modes, tag `git tag pre-sla`, copy `models/agent.zip` to `models/agent_prev.zip`.
2. **11a: SLA config and sla.py** with unit tests, plus `info['costs']` and `info['feasible']` in the simulator. No retraining. Run SM-1 to SM-14.
3. **11b: Multi-constraint training.** Per-slice lambdas, curriculum, 3 seeds, model selection. Run SM-15 to SM-24.
4. **11c: Evaluation and ablations.** Held-out seeds, confidence intervals, all four ablations. Run SM-25 to SM-33.
5. **11d: API and UI SLA status.** Run SM-34 to SM-41.
6. **11e: Docs.** README SLA section, pitch wording, test log, demo script line 'here are our SLAs, and here they hold while Static fails'.

Commit once per sub-phase.

## 10. Tests

### 10.1 SLA module and simulator additions (11a)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| SM-1 | Config present | all keys in section 3 exist and load | P0 |
| SM-2 | URLLC metric | hand-made history with 1 violation in 400 packets gives 0.0025 and met = True; 3 in 400 gives 0.0075 and met = False | P0 |
| SM-3 | mURLLC metric | same style with the 1 percent limit | P0 |
| SM-4 | eMBB metric | served ratio 0.75 meets the SLA; 0.65 does not | P0 |
| SM-5 | Window logic | a burst of violations inside one 20-step window gives breach even if the episode average is fine | P0 |
| SM-6 | Status levels | below 80 percent of limit gives ok, 80 to 100 percent gives amber, above gives breach | P0 |
| SM-7 | No arrivals | zero arrivals gives violation rate 0, no division by zero, no NaN | P0 |
| SM-8 | Feasible flag | offered load above 90 percent of capacity gives feasible = False; below gives True | P0 |
| SM-9 | info costs present | every step has costs for the three slices, all finite, all within 0..1 | P0 |
| SM-10 | Costs match definitions | recompute costs from violations and arrivals independently and compare | P0 |
| SM-11 | Old contract intact | observation (12,), action 6, reward and old `info['cost']` identical to before the change (compare a fixed-seed run to the pre-sla tag) | P0 |
| SM-12 | Old suite | all old tests pass in aggregate and bots modes | P0 |
| SM-13 | Pure functions | `sla.py` has no global state; same input gives same output | P1 |
| SM-14 | Single source of truth | search the repo: no other file hard-codes 0.005, 0.01, 0.70 or 0.02 outside `config.yaml` and tests | P1 |

### 10.2 Training (11b)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| SM-15 | Training runs | finishes within budget, no crash, model files for each seed exist and are not tiny | P0 |
| SM-16 | Log content | `runs/log.csv` has reward, three costs, three lambdas, feasible fraction per episode | P0 |
| SM-17 | Lambdas behave | each lambda rises while its cost is above its limit, decays when below, stays within 0..lambda\_max, never NaN | P0 |
| SM-18 | Each constraint moves | in the last 20 percent of training each mean cost is at or below its limit (feasible episodes) | P0 |
| SM-19 | Held-out seeds | training seeds and evaluation seeds are disjoint (print both lists) | P0 |
| SM-20 | Training distribution | spikes, bot counts and mid-episode bot events are randomised (read the code, check the log) | P1 |
| SM-21 | Model selection | the saved best model satisfies all constraints on the validation set and is the highest eMBB ratio among such models | P1 |
| SM-22 | Backup | `agent_prev.zip` exists and loads; new `agent.zip` is newer | P1 |
| SM-23 | Model loads and acts | fresh Python session: load, predict on 1,000 random observations: shape 6, finite, in range | P0 |
| SM-24 | PID mode | if lambdas oscillate with `simple`, switching to `pid` reduces the oscillation (compare the lambda plots) | P2 |

### 10.3 Evaluation and ablations (11c)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| SM-25 | Same traffic for all policies | total arrivals per slice identical across Static, Heuristic, Heuristic + Shield, ablations and Agent | P0 |
| SM-26 | Tables produced | `results/sla_table.csv` and `results/ablation.csv` exist with every scenario and policy | P0 |
| SM-27 | Confidence intervals | every violation rate has a 95 percent interval over 20 seeds | P1 |
| SM-28 | Agent meets SLAs | in feasible scenarios the Agent meets all three SLAs; any failure is listed honestly | P0 |
| SM-29 | Beats Static | Static misses at least one SLA in the surge scenarios and the Agent does not | P0 |
| SM-30 | Ablation (a) | unconstrained PPO without shield violates URLLC or mURLLC SLA in at least one scenario | P1 |
| SM-31 | Ablation (c) | Heuristic + Shield holds the SLA but serves less eMBB than the Agent in surge scenarios (if not, report that honestly and change the pitch) | P1 |
| SM-32 | Overload reporting | overload cases are reported separately, and only 'URLLC and mURLLC protected first' is claimed there | P0 |
| SM-33 | Headline numbers | recompute them from the CSVs yourself; they match the README | P0 |

### 10.4 API and UI (11d)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| SM-34 | Stream fields | every message has `sla` per policy and slice, and `feasible`; values come from `sla.py` | P0 |
| SM-35 | `GET /sla` | returns limits and current status; limits equal `config.yaml` | P1 |
| SM-36 | Change a limit | edit URLLC limit in `config.yaml`, restart: chips, SLA lines and the info card all follow | P0 |
| SM-37 | Chips | green, amber and red appear in the right situations during a surge | P0 |
| SM-38 | Overload badge | adding very many users shows 'OVERLOAD' and the wording 'protected first' | P1 |
| SM-39 | SLA info card | plain-words list of the three SLAs is visible | P1 |
| SM-40 | No fake UI | search `index.html` for `Math.random`, `mock`, `fake`: none drives SLA values | P0 |
| SM-41 | Console and offline | no red errors; works offline | P0 |

### 10.5 Edge cases

| ID | Edge case | Expected |
| --- | --- | --- |
| ES-1 | A slice has zero users for the whole episode | its SLA is met trivially, shown as 'no traffic', no division by zero |
| ES-2 | Single violation in a very quiet window | window logic handles tiny denominators sensibly (document the rule, for example a minimum packet count before judging a window) |
| ES-3 | All limits set very strict in config | training still runs; report that the problem may become infeasible |
| ES-4 | Lambda reaches lambda\_max | log a warning; training continues; report in the training summary |
| ES-5 | Evaluation at 5x default load | reported as overload; shield floors intact |
| ES-6 | Model trained, then limit changed in config | evaluate.py warns that the model was trained for different limits |

## 11. Honest claims for the pitch

- Say: 'we define an SLA per slice, enforce URLLC and mURLLC with a hard shield, and learn the rest with constrained RL with one dual variable per SLA.'
- Say: 'in our simulator the URLLC violation rate stays under 0.5 percent (95 percent interval X to Y) in feasible load.'
- Do NOT say: 'five nines', '1 ms measured latency', 'guaranteed under any load', 'beats the heuristic' unless the numbers show it.
- Overload: 'under overload we protect URLLC and mURLLC first and degrade eMBB gracefully.'
- Limits: slice-level simulator, not a radio-level model; ns-3 validation is future work.

## 12. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Three constraints make training unstable | use `dual_mode: pid`, lower `lagrange_lr` to 0.02, or relax the eMBB constraint into reward-only and say so |
| Constraints infeasible together | loosen eMBB min served ratio to 0.60 and re-run; document the change |
| Agent only equals Heuristic + Shield | lead the pitch with the SLA proof and the ablation story; show eMBB gain separately |
| Retraining makes things worse | restore `agent_prev.zip`, keep SLA reporting working with it, and report honestly |
| Slip of more than 2 hours | ship 11a, 11c on the existing model and 11d; skip retraining and say 'per-slice SLA monitoring' instead of 'per-slice constrained training' |

## 13. Definition of done

- [ ] SLA table lives in `config.yaml` and `sla.py` is the only place that computes SLA status
- [ ] The model trains with three constraints and three multipliers, with held-out evaluation seeds
- [ ] Agent meets all SLAs in feasible scenarios; Static does not; ablations tell the expected story or the pitch is adjusted to what is true
- [ ] Results tables have confidence intervals; overload is reported separately
- [ ] UI chips, SLA lines and the SLA info card are driven by `sla.py` output through the API
- [ ] Old suite and all earlier phases still pass in both traffic modes
- [ ] SM-1 to SM-41 passed (all P0), logged in TEST\_LOG.md; README and demo script updated; backup recording shows the SLA story
