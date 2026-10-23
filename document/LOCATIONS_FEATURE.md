# Locations Feature Spec (Phase 10): Virtual users at Campus, Factory and Smart City

Audience: the Antigravity build agent and the team. This extends the finished Bots feature (Phase 9, see BOTS\_FEATURE.md). It must NOT break anything that already works. The human approves in advance: the config.yaml additions, the optional `location` field on `/bots`, and the new display-only delay metric described here.

## 1. Goal

The presenter picks a location (Campus, Factory, Smart City), a slice and a number, and presses Add Users. That many virtual devices appear in that location's zone on the dashboard, and their traffic really joins the simulation. Static, Heuristic and the RL Agent all receive identical traffic, so the comparison stays fair.

## 2. Design decisions (already made; do not reopen)

1. **Location is a label and a visual group in version 1.** It does NOT change packet rates, so the traffic distribution seen by the agent is unchanged and no retraining is needed. The simulator still aggregates bots per slice.
2. **Each location has a default slice:** Campus = eMBB, Factory = URLLC, Smart City / IoT Zone = mURLLC. The slice dropdown pre-fills from the location but the presenter may override it (for example URLLC bots in Campus). Traffic behaviour always follows the SLICE, never the location.
3. **Metrics stay per slice.** The simulator does not simulate distance, signal strength, interference, handovers or multiple cells. Per-zone displays show per-slice metrics next to the zone; the UI must say this.
4. **Latency is not measured today** (the simulator counts deadline violations and queue lengths). Add a display-only 'estimated delay' with a clear label. It must NOT be used in reward, cost, observation or the shield.
5. **No contract break:** the observation (12 floats), action (6 floats), reward and cost definitions, and all existing endpoints stay backward-compatible. Calls that do not send a location keep working.

## 3. Config additions (config.yaml)

```yaml
locations:
  campus:     {label: Campus,              default_slice: embb}
  factory:    {label: Factory,             default_slice: urllc}
  smart_city: {label: Smart City / IoT Zone, default_slice: murllc}
delay_model:                  # display only, never used in reward or cost
  base_ms: {embb: 10.0, urllc: 0.3, murllc: 2.0}
  rho_cap: 0.99
  overload_ms: 100.0
```

The default bot counts from Phase 9 are placed in each slice's default location at reset (default eMBB bots in Campus, URLLC in Factory, mURLLC in Smart City).

## 4. Simulator changes (sim.py)

- Each bot carries a location tag (small integer array next to the existing per-slice bot arrays). Do not create per-bot Python objects.
- `env.apply_bot_event(slice, location, mode, n)` where mode is add, remove or set. If location is omitted it uses the slice's default location.
  - **add:** creates n bots tagged with that location. Total bots of the slice are clipped to `max_count`.
  - **remove:** removes up to n bots that have that location tag in that slice, highest index first (deterministic). If fewer than n exist it removes what exists and reports `clipped`.
  - **set:** sets the count for that (location, slice) pair to n (clipped so the slice total stays within `max_count`).
- `env.get_bot_matrix()` returns counts per location and slice, and `get_bot_counts()` still returns per-slice totals.
- `reset()` restores the default distribution.
- The location tag must NOT influence random draws or traffic rates. The same per-slice bot sequence gives the same arrivals regardless of locations (this is tested, LT-1).
- **Estimated delay (display only):** for each slice compute `rho = min((queue + arrivals) / max(service_capacity, eps), rho_cap)`, `est_delay_ms = base_ms / (1 - rho)`, and if the slice is overloaded (demand above capacity) use `overload_ms`. Service capacity is `min(radio_cap, cpu_cap)` from the existing step. Put `est_delay_ms` per slice into `info`. Never feed it into reward, cost, observation or the shield.
- `info` additionally contains `bots_by_location` (the matrix) and `est_delay_ms`.

## 5. API changes (api.py)

- `POST /bots` body: `{slice?: 'embb'|'urllc'|'murllc', location?: 'campus'|'factory'|'smart_city', count: int, mode: 'add'|'remove'|'set'}`.
  - Only slice given: use the slice's default location (old behaviour).
  - Only location given: use that location's default slice.
  - Both given: use both.
  - Neither given, unknown location or slice, negative or non-integer count, bad mode: clean 4xx, server keeps running.
  - The event is applied to Static, Heuristic and Agent at the same step.
  - Response: new totals per slice, the new matrix, and `clipped: true|false`.
- `GET /bots` returns totals per slice, the full location x slice matrix, the limits and the location defaults.
- The WebSocket stream adds `bots_by_location` and `est_delay_ms` (per policy, per slice) to every message.
- `POST /reset` restores the default distribution.
- Event log lines name the location, for example: 'Step 120: +20 users at Campus (eMBB), eMBB now 60'.

## 6. UI changes (static/index.html)

- **Add Users panel:** location dropdown (Campus, Factory, Smart City / IoT Zone), slice dropdown that pre-fills from the location but can be changed, number input, Add Users, Remove, Set, quick +10 / +50 / +100, and Reset. Show the limit note 'Max reached' when clipped.
- **Three zones** laid out as a simple scene around one tower icon: Campus (building icon), Factory (factory icon), Smart City / IoT Zone (skyline icon). Draw icons with simple inline SVG or CSS, no new libraries.
- **Dots:** colour by slice (cyan eMBB, orange URLLC, green mURLLC), placed inside the zone of their location, each pulsing small packets toward the tower. Render at most 40 dots per zone; when the real count is higher, show '1 dot = N users'. Fade in on add, fade out on remove.
- **Zone counters:** under each zone, for example 'eMBB 40, URLLC 0, mURLLC 0'.
- **Honesty strip (always visible, small):** 'Locations are logical groups. Metrics are per slice. Delay is a model estimate.'
- **Policy columns** (Static, Heuristic, AI Agent) keep everything they have today, plus a per-slice 'Estimated delay (model)' value next to throughput and violations.
- No new CDN dependencies; the page must still work offline.

## 7. Build order (sub-phases; stop after each)

1. **Gate:** start only if the Phase 9 tests BT-1, BT-6 and BT-16 pass. Run `git tag pre-locations` and confirm the whole old suite passes in both traffic modes.
2. **10a: Config and simulator.** Location tags, `apply_bot_event`, matrix, estimated delay. Run LT-1 to LT-12 and LT-18.
3. **10b: API.** `location` field, matrix endpoints, stream fields, event log. Run LT-13 to LT-17.
4. **10c: UI.** Add Users panel, zones, dots, honesty strip, delay display. Run LT-19 to LT-30.
5. **10d: Docs and regression.** README, demo script, test log, full regression and E2E-14 to E2E-17.

Commit once per sub-phase.

## 8. Tests

### 8.1 Simulator (10a)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| LT-1 | Location is only a label | same seed and same per-slice bot sequence, with the users placed in different locations: arrivals, queues, rewards and costs are identical | P0 |
| LT-2 | Defaults | at reset, bots sit in each slice's default location and the totals equal Phase 9 defaults | P0 |
| LT-3 | Slice override | add URLLC users in Campus: they count toward URLLC arrivals and show under Campus | P0 |
| LT-4 | Matrix correctness | after a sequence of add, remove and set events the matrix equals the arithmetic result and the row sums equal the slice totals | P0 |
| LT-5 | Clipping | adding beyond `max_count` across several locations never exceeds the slice max; `clipped` is reported | P0 |
| LT-6 | Remove more than exists | removes only what exists in that location, never touches other locations, count never negative | P0 |
| LT-7 | Determinism | same seed and same location-tagged events twice give identical traffic | P0 |
| LT-8 | Fair comparison | evaluate.py with location-tagged events: total arrivals per slice identical for Static, Heuristic and Agent | P0 |
| LT-9 | Contract unchanged | observation shape (12,), finite, within 0..1; action 6; reward and cost match the old definitions at 0, default and max bots | P0 |
| LT-10 | Old suite | all old tests and BT tests pass in aggregate mode and bots mode | P0 |
| LT-11 | Estimated delay is display-only | reward, cost and observation are identical with the delay computation enabled and with it removed (diff a run) | P0 |
| LT-12 | Delay behaviour | est\_delay\_ms is finite, grows as load rises, equals about base\_ms at low load, equals overload\_ms when demand exceeds capacity | P1 |
| LT-18 | Speed | 1,000 bots total across all locations: one 200-step episode under 0.2 s | P1 |

### 8.2 API (10b)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| LT-13 | Backward compatible | the old body `{slice, count, mode}` still works and uses the default location | P0 |
| LT-14 | Location rules | only location, only slice, both, and neither behave as in section 5 | P0 |
| LT-15 | Invalid input | unknown location or slice, negative or non-integer count, bad mode, empty body give a 4xx; the stream keeps running | P1 |
| LT-16 | Stream fields | every message has `bots_by_location` and `est_delay_ms`, values come from the simulator and change when users are added | P0 |
| LT-17 | Same step for all | one POST changes Static, Heuristic and Agent at the same step; Reset restores defaults | P0 |

### 8.3 UI (10c)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| LT-19 | Add 20 at Campus | choose Campus, slice pre-fills to eMBB, type 20, Add: 20 cyan dots appear in the Campus zone, the counter updates, the eMBB charts react within 2 seconds | P0 |
| LT-20 | Location pre-fill | selecting Factory pre-fills URLLC, Smart City pre-fills mURLLC | P1 |
| LT-21 | Override | URLLC users in Campus appear as orange dots in Campus and raise URLLC load | P1 |
| LT-22 | Remove and Set | Remove only reduces the chosen location; Set 0 empties that pair; counters match the API | P0 |
| LT-23 | Limits | beyond max shows 'Max reached', charts stay intact | P1 |
| LT-24 | Dot scaling | 500 users in one zone show at most 40 dots with a label like '1 dot = 13 users', no lag | P1 |
| LT-25 | Honesty strip | the strip 'Locations are logical groups. Metrics are per slice. Delay is a model estimate.' is always visible | P0 |
| LT-26 | Delay labelling | delay values are labelled 'Estimated delay (model)', never 'latency' or 'measured' | P0 |
| LT-27 | Story still holds | 100 users at Campus: Static turns red, Agent stays green; event log names Campus | P0 |
| LT-28 | No fake UI | search index.html for `Math.random`, `mock`, `fake`: none drives chart or counter values; stopping the server shows 'disconnected' | P0 |
| LT-29 | Layout and console | no overlap at 1920x1080 and 1366x768; no red console errors; works offline | P0 |
| LT-30 | Stress | press Add 30 times quickly in different zones with 2 tabs open: no crash, no drift between tabs | P1 |

### 8.4 Edge cases

| ID | Edge case | Expected |
| --- | --- | --- |
| EL-1 | Remove from an empty location | nothing happens, clear message, no crash |
| EL-2 | Max users in all three locations | stable; floors enforced; report which SLA breaks |
| EL-3 | Add during a spike | effects combine, no crash |
| EL-4 | Add during Pause | applied exactly once on resume |
| EL-5 | Reset after many events | default distribution, dots and counters reset |
| EL-6 | Same events, different order across locations | same per-slice totals; traffic identical only when the per-slice sequence is identical (document this) |
| EL-7 | Decimal or huge numbers in the input | rejected with a message in the UI |

### 8.5 End-to-end scenarios

**E2E-14: Location demo story.** Cold start, steady for 20 seconds. Add 100 users at Campus: Static breaches, Agent holds. Add 20 users at Factory: URLLC load rises slightly, SLA holds. Add 500 users at Smart City: mURLLC storm, Agent holds through the shield. Remove them all: recovery. Event log and scoreboard tell the same story.

**E2E-15: Repeatability.** Reset and replay the identical location-tagged sequence twice: identical scoreboard numbers.

**E2E-16: Regression.** Run E2E-1 to E2E-13 from the testing guide again. All must still pass.

**E2E-17: Rollback drill.** Check out the `pre-locations` tag in a separate folder (`git worktree add ../rollback pre-locations`), start it, confirm the Phase 9 demo works. This proves the fallback.

## 9. Honest claims for the pitch

- Say: 'virtual users in logical zones generate real simulated traffic that all three policies receive identically.'
- Do NOT say: 'multi-cell', 'real geography', 'signal strength', 'handover', 'measured latency'.
- Per-zone numbers are per-slice results shown in that zone.
- Future work: location-dependent rates, channel quality per location, multi-cell, ns-3 validation.

## 10. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Location tags break determinism | revert to per-slice-only events and keep the zone display as a visual layer driven by counts |
| UI becomes crowded | hide the delay values behind a toggle; reduce dots per zone to 20 |
| Delay model confuses judges | remove it from the UI and keep it in the API only |
| Phase 9 gate fails | do not start Phase 10; fix Phase 9 first |
| Slip of more than 1.5 hours | ship 10a and 10b with a plain location dropdown, skip the zone scene |

## 11. Definition of done

- [ ] Choosing a location and slice, typing a number and pressing Add Users shows that many dots in the right zone and changes the live traffic
- [ ] All three policies receive identical traffic in every run (LT-8)
- [ ] Location does not change simulator results by itself (LT-1)
- [ ] Old suite and the Phase 9 suite still pass in both traffic modes
- [ ] Honesty strip and 'Estimated delay (model)' labels are visible
- [ ] E2E-14 to E2E-17 pass twice; backup recording includes the location demo
- [ ] README and the demo script updated; test results logged in TEST\_LOG.md

## 12. Addendum: alignment with the SLA and RL Model Spec (SLA\_RL\_SPEC.md)

This section was added after the SLA and RL upgrade. Where it conflicts with sections 1 to 11, this section wins. Everything else in this file still applies.

### 12.1 What changed underneath this feature

The SLA upgrade added: `config.yaml` sections `sla` and `cmdp`, the module `sla.py` (the single source of truth for SLA status), `info['costs']` and `info['feasible']` in the simulator, a `sla` field per policy and slice in the WebSocket stream, a `GET /sla` endpoint, SLA status chips, an OVERLOAD badge, and a retrained model with per-slice constraints. Locations must build on all of that and must not bypass it.

### 12.2 Rules that now apply to locations

1. **SLA status always comes from `sla.py`.** Zone displays, chips, the event log and the README may show only what `sla.py` or the stream's `sla` field returns. No new SLA logic, no SLA numbers hard-coded anywhere in the location code.
2. **Location is still only a label.** It must not change arrivals, queues, rewards, costs, `info['costs']`, `info['feasible']` or any SLA status. Same per-slice bot sequence gives identical results whatever the locations are.
3. **No retraining for locations.** Use the latest `models/agent.zip` produced by the SLA upgrade. Do not overwrite it. If a location test fails because of the model, report it instead of retraining.
4. **Estimated delay stays display-only** and is never an input to `sla.py`, the costs, the reward, the observation or the shield. SLAs are defined on violations and served ratio, not on delay.
5. **Zones show per-slice SLA status.** Each zone shows the SLA chip of the slice(s) that have users in it (ok, amber, breach, or 'no traffic'). The honesty strip keeps saying the status is per slice, not per location.
6. **Overload is shown, not hidden.** When `feasible` is false the OVERLOAD badge appears and the wording is 'URLLC and mURLLC protected first'. Adding many users in several locations may trigger it; that is expected.
7. **Event log uses SLA language.** Example: 'Step 120: +100 users at Campus (eMBB). eMBB SLA: AT RISK (68 percent served, limit 70).' Numbers come from `sla.py`.

### 12.3 Updated gate and build order

- **Gate before 10a:** the SLA upgrade must be done, and these must pass with real output: SM-11 (old contract intact), SM-12 (old suite in both modes), SM-25 (same traffic for all policies), SM-28 (Agent meets SLAs in feasible scenarios), plus the Phase 9 tests BT-1 and BT-6. If any fails, do not start Phase 10.
- Run `git tag pre-locations` after the gate passes.
- **10a** simulator and config, **10b** API, **10c** UI, **10d** docs and regression, exactly as in section 7, with the new tests below added to each step.

### 12.4 Additional tests

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| LT-31 | SLA invariance | same seed and same per-slice bot sequence with users placed in different locations: `info['costs']`, `info['feasible']` and every SLA status from `sla.py` are identical | P0 |
| LT-32 | Zone SLA chips | add 100 users at Campus: the Campus zone shows the eMBB chip changing as the load grows; values equal the stream's `sla` field | P0 |
| LT-33 | Overload badge | add the maximum users in all three locations: `feasible` becomes false, the OVERLOAD badge appears, the wording says 'protected first', nothing claims all SLAs hold | P0 |
| LT-34 | No SLA logic in location code | search the location code and `index.html` for SLA numbers (0.005, 0.01, 0.70, 0.02, 0.03) and for custom threshold logic: none outside `config.yaml` and tests | P0 |
| LT-35 | Delay is not an SLA input | change `delay_model` values in config: SLA status, costs and reward do not change; only the displayed delay changes | P0 |
| LT-36 | Model untouched | `models/agent.zip` hash is identical before and after Phase 10 | P0 |
| LT-37 | Event log numbers | the SLA numbers in event log lines match `GET /sla` at that step | P1 |
| LT-38 | Limit change flows through | edit the URLLC limit in `config.yaml` and restart: zone chips, columns and the SLA card all follow, with no location-specific code to update | P1 |
| LT-39 | 'No traffic' state | a slice with zero users in a zone shows 'no traffic', not a green OK | P1 |
| LT-40 | Same step for all policies | one location-tagged POST changes Static, Heuristic and Agent at the same step and all three get identical SLA inputs | P0 |

### 12.5 Updated and extra end-to-end scenarios

**E2E-14 (replaces the earlier version):** cold start and steady for 20 seconds. Add 100 users at Campus: Static's eMBB chip goes amber then red while the Agent's stays green; the event log names Campus and quotes the SLA numbers. Add 20 users at Factory: URLLC stays within its SLA for the Agent. Add 500 users at Smart City: mURLLC storm; the Agent holds through the shield; Static breaches. Add the maximum everywhere: OVERLOAD badge appears and only 'protected first' is claimed. Remove everything: all chips recover.

**E2E-18: SLA consistency.** During E2E-14 compare the UI chips, `GET /sla`, the stream's `sla` field and the scoreboard at three moments: all must agree.

**E2E-19: Limit change.** Tighten the eMBB limit in `config.yaml`, restart, repeat the Campus step: the chip turns amber or red earlier, with no code change.

### 12.6 Updated honest claims

- Say: 'virtual users in logical zones create real simulated traffic; all three policies receive it identically; SLA status is computed per slice by one module.'
- Do not say: SLAs per location, multi-cell, real geography, signal strength, handovers, measured latency, or that SLAs hold under overload.

### 12.7 Updated definition of done (adds to section 11)

- [ ] Gate tests (SM-11, SM-12, SM-25, SM-28, BT-1, BT-6) passed with real output before starting
- [ ] LT-31 to LT-40 pass; `models/agent.zip` is unchanged (LT-36)
- [ ] Zones, chips, event log and the SLA card all show values from `sla.py`, with no SLA numbers hard-coded in location or UI code
- [ ] E2E-14, E2E-18 and E2E-19 pass twice; the backup recording includes the location demo with SLA chips changing
