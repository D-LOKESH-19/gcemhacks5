# Bots Feature Spec (Phase 9): Type a number, get that many simulated devices

Audience: the Antigravity build agent and the team. This extends the finished project (Phases 0 to 8). It must NOT break anything that already works. The human approves, in advance, the config.yaml additions and the new endpoints described here.

## 1. Goal

In the demo, the presenter types for example '20' in a Bots panel, picks a slice and presses Add. 20 simulated devices ('bots') of that slice appear on screen, and their traffic joins the simulation live. Static, Heuristic and the AI Agent all receive the exact same bot traffic, so the comparison stays fair. This makes the traffic source visible and interactive instead of a hidden number.

## 2. What a bot is

A bot is a simulated device that belongs to ONE slice and generates packets by its own rule each 100 ms step:

- **eMBB bot (video-like):** two-state ON/OFF model. While ON it sends Poisson(rate\_on) packets per step; it switches ON to OFF and OFF to ON with small probabilities. Gives bursty but steady load.
- **URLLC bot (robot or controller):** periodic. Each bot has a random phase and a period of about 10 steps, sends 1 small packet on its turn, with a little jitter.
- **mURLLC bot (IoT sensor):** mostly quiet. Each step it has a small probability of starting a burst lasting about 3 steps at a higher rate. Many bots bursting together is the 'storm'.

Total arrivals of a slice in a step = sum of what all its bots send.

## 3. Design rules (important)

1. **Vectorized, not objects.** Keep bot state in numpy arrays per slice (for example `on_state[]`, `phase[]`, `burst_left[]`). Do NOT create one Python object per bot. 1,000 bots must still run an episode in well under 0.2 s.
2. **No interface break.** The observation (12 floats), the action (6 floats), reward and cost definitions stay unchanged. The smoothed load already in the observation reflects bot-count changes automatically.
3. **Backward compatible.** Add `traffic_mode: aggregate | bots` in config. 'aggregate' keeps the old behaviour exactly (so old tests still pass). 'bots' uses the bot model. The existing `set_spike` keeps working in both modes (multiplies the slice's arrivals).
4. **Calibration.** Default bot counts must reproduce roughly the current arrival means, so the existing behaviour and the trained model stay in a sensible range.
5. **Same traffic for all policies.** The same bots, same seed and same add or remove events are applied identically to Static, Heuristic and Agent.
6. **Determinism.** Same seed plus same bot events gives identical traffic.

## 4. Config additions (config.yaml)

Starting values (the agent must check calibration and tell the human if it changes them):

```yaml
traffic_mode: bots            # aggregate | bots
bots:
  default_count: {embb: 40, urllc: 30, murllc: 100}
  max_count:     {embb: 200, urllc: 150, murllc: 1000}
  per_bot_mean:  {embb: 10.0, urllc: 1.0, murllc: 0.2}   # packets per step, long-run average
  embb:   {p_on: 0.2, p_off: 0.1, rate_on: 25.0}
  urllc:  {period_steps: 10, jitter: 0.1}
  murllc: {p_burst: 0.02, burst_len: 3, rate_burst: 4.0}
train_bot_range: {low: 0.3, high: 3.0}   # multiplier on default_count, capped by max_count
```

Calibration check: default counts times per\_bot\_mean must be close to the existing `arrival_mean` (eMBB about 400, URLLC about 30, mURLLC about 20 packets per step). Also check that at max\_count of one slice the shield floors can still protect the other slices (the system may be overloaded on eMBB, which is fine and good for showing queues, but URLLC and mURLLC must remain protectable).

## 5. Simulator changes (sim.py)

- `env.set_bots(slice, count)` sets the count (clipped to 0..max\_count). `env.add_bots(slice, n)` and `env.remove_bots(slice, n)` change it by n. New bots are initialised with random state from the env's own RNG (keeps determinism). Removing drops the last n.
- `env.get_bot_counts()` returns `{embb, urllc, murllc}`.
- `info` returned by `step` additionally contains `bots` (counts per slice) and `bot_packets` (packets generated this step per slice).
- `reset()` restores default counts.
- Per-step arrivals for each slice come from the bot model when traffic\_mode is 'bots', then the slice's spike multiplier is applied, then rounded to integers.
- Everything downstream (capacity check, queues, violations, reward, cost) is unchanged.

## 6. Training changes (train.py)

The current model was trained on fixed traffic. If it is not retrained, typing 200 bots in the demo can push it into situations it has never seen.

- Each training episode draws a random bot count per slice: `count = default_count x uniform(low, high)`, capped by `max_count`. Keep the existing randomised spikes too.
- Before retraining, back up the old model as `models/agent_pre_bots.zip`.
- Retrain, save `models/agent.zip`, rerun `evaluate.py`, and compare against the pre-bots results. Report both tables.
- Acceptance: Agent still meets the cost limit and still beats Static and Heuristic in the surge scenarios, now ALSO at 0.3x, 1x and 3x default bot counts. If retraining makes things worse, restore the backup model and report.

## 7. API changes (api.py)

- `GET /bots` returns the current counts and the max counts.
- `POST /bots` with body `{slice: 'embb'|'urllc'|'murllc', count: int, mode: 'add'|'remove'|'set'}`. Applies to all three policy copies at the same step. Count is clipped to limits; response includes the new counts and a flag `clipped: true` if clipped.
- Invalid input (unknown slice, negative or non-integer count, bad mode, missing fields) returns a clean 4xx error and the server keeps running.
- The WebSocket stream adds `bots: {embb, urllc, murllc}` and `bot_packets` to every message.
- `POST /reset` restores default bot counts.
- A short event is written to the event log: for example 'Step 120: +20 URLLC bots (now 50)'.

## 8. UI changes (static/index.html)

- **Bots panel** (top bar or side card): slice dropdown (eMBB, URLLC, mURLLC), a number input, and Add, Remove and Set buttons. Quick-add buttons +10, +50, +100. Live counters per slice, 'now / max'.
- **Bot animation canvas:** coloured dots (cyan eMBB, orange URLLC, green mURLLC) arranged around a small tower icon. Each dot sends small moving packet pulses toward the tower. Render at most 60 dots per slice; when the real count is higher, each dot represents `ceil(count / 60)` bots and a label says so (for example '1 dot = 5 bots').
- Adding bots makes dots appear with a short fade-in; removing makes them fade out. Keep animation light (requestAnimationFrame, no heavy libraries).
- If the request is clipped at the maximum, show a small amber note 'Max reached'.
- The three policy columns, scoreboard and event log keep working and react to the changed load.
- Offline: no new CDN dependencies.

## 9. Tests (add to the existing tests and to the testing guide)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| BT-1 | traffic\_mode aggregate | all old tests still pass unchanged | P0 |
| BT-2 | Calibration | with default counts over 200 steps, mean arrivals per slice are within 15 percent of the old arrival\_mean | P0 |
| BT-3 | Count control | add, remove and set change counts correctly; clipped to 0..max; remove below 0 gives 0 | P0 |
| BT-4 | Scaling | doubling URLLC bots roughly doubles URLLC arrivals | P1 |
| BT-5 | Determinism | same seed and same bot events give identical arrivals | P0 |
| BT-6 | Same traffic for all policies | total arrivals per slice are identical across Static, Heuristic and Agent | P0 |
| BT-7 | mURLLC storm | adding 500 mURLLC bots produces clearly bursty correlated arrivals, no NaN | P1 |
| BT-8 | Speed | 1,000 bots total, one 200-step episode under 0.2 s | P1 |
| BT-9 | Reset | reset restores default counts | P1 |
| BT-10 | Observation | stays shape (12,), all values within 0..1 at 0 bots and at max bots | P0 |
| BT-11 | Zero bots | a slice with 0 bots has 0 arrivals, no division by zero, cost defined | P0 |
| BT-12 | API valid | POST /bots add 20 URLLC: counts update, stream shows new counts, all three policies see the change at the same step | P0 |
| BT-13 | API invalid | bad slice, negative count, bad mode, missing field give 4xx and the server keeps streaming | P1 |
| BT-14 | UI | typing 20 and pressing Add makes 20 URLLC bots appear, counter updates, charts react within 2 seconds | P0 |
| BT-15 | UI limits | adding beyond max shows 'Max reached' and does not break charts | P1 |
| BT-16 | Retrained model | Agent meets the cost limit and beats Static and Heuristic at 0.3x, 1x and 3x default counts | P0 |
| BT-17 | Fake-work check | UI numbers change with bot counts because the simulator changed, not because of mock JavaScript (search for Math.random in index.html) | P0 |
| BT-18 | Stress | click Add 30 times quickly and open 2 tabs: no crash | P1 |

## 10. Implementation order (sub-phases; stop after each)

1. **Safety first.** Run `git tag pre-bots` and copy `models/agent.zip` to `models/agent_pre_bots.zip`. Confirm all existing tests pass, so there is a clean rollback point.
2. **9a: Config and simulator.** Config additions, bot model, set/add/remove functions, info fields. Run BT-1 to BT-5, BT-8 to BT-11.
3. **9b: Retrain and evaluate.** Randomised bot counts in training, retrain, evaluate at 0.3x, 1x, 3x. Run BT-6, BT-16. Report both before and after tables.
4. **9c: API.** `/bots` endpoints, stream fields, event log lines, reset behaviour. Run BT-12, BT-13.
5. **9d: UI.** Bots panel and animation canvas. Run BT-14, BT-15, BT-17, BT-18.
6. **9e: Docs.** Update README (feature, how to use in the demo, limits), the testing guide's test log with BT-1 to BT-18, and the demo script (add the line: 'type 20 bots and watch the load arrive').
7. **9f: Full regression.** Run the whole test suite and the E2E scenarios from the testing guide, then commit.

Commit once per sub-phase with a clear message.

## 11. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Retrained agent gets worse | Restore `models/agent_pre_bots.zip`, keep bots in the UI with the old model, and cap bot counts to 0.5x to 2x default |
| Bot sim too slow | Reduce per-step work, aggregate bots into counts by state instead of per-bot arrays |
| Animation lags | Lower max rendered dots to 30 and animate fewer pulses |
| Calibration breaks old results | Switch traffic\_mode back to 'aggregate' for evaluation, keep bots as a demo-only mode, and say so in the README |
| Slip of more than 2 hours | Ship 9a, 9c and 9d with the pre-bots model and a tighter cap, and skip retraining |

## 12. Definition of done

- [ ] Typing a number and pressing Add creates that many visible bots and changes the live traffic
- [ ] All three policies get identical traffic in every run
- [ ] Old tests pass in aggregate mode; new tests BT-1 to BT-18 pass in bots mode
- [ ] Retrained agent meets the SLA cost limit at 0.3x, 1x and 3x default counts
- [ ] Clean-clone run from the README works with the bots feature
- [ ] A backup screen recording of the demo includes the bots feature
