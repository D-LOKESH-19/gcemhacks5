# React Frontend Spec (Phase F): a proper dashboard, page by page

Audience: the Antigravity build agent and the team. Host: Windows, one laptop, PowerShell. This replaces the old single-file dashboard (`static/index.html`) with a React app in `frontend/`. The backend, simulator, SLA module and RL model are NOT redesigned here. The agent must first inspect the real repo and report every difference from what this spec assumes (some features such as Bots, SLA upgrade or Locations may or may not exist yet).

## 1. Why a new frontend

Problems seen in the current dashboard:

1. At nominal load the three policy panels look identical and the violation charts are flat zero with the axis wasted. The demo looks dull until a spike.
2. Three separate copies of the same chart make the gap between policies hard to see. One overlay chart shows it at a glance.
3. The 'Shield ACTIVE' line repeats on every step. A spammy log hides the story and invites the question 'is the shield doing all the work?'. We must show a measured shield intervention rate instead.
4. The Lagrange multiplier lambda is a training-time value. Showing it live as 0.000 is misleading. It belongs on the Training page, labelled as the final trained value.
5. One page cannot hold the demo, the traffic controls, the SLA promise, the training evidence and the results.

## 2. Decisions (made; do not reopen)

| Topic | Decision |
| --- | --- |
| Framework | React 18 with TypeScript, built by Vite, in `frontend/` |
| Styling | Tailwind CSS with design tokens (section 5), no heavy UI kit |
| Charts | Recharts (cap history per series, see section 6) |
| Routing | react-router-dom |
| State | Zustand store for the stream, plus small local state in components |
| Icons | lucide-react |
| Fonts | local only (`@fontsource/inter` installed through npm), no Google Fonts, no CDN |
| Delivery | `npm run build` creates `frontend/dist`; FastAPI serves it at `/`. The old dashboard stays at `/legacy` as the fallback |
| Offline | the built app must work with Wi-Fi off. Node and npm are needed only to build, not to run the demo |
| Supply chain | pin exact versions in `package.json`, commit `package-lock.json`, choose versions at least 14 days old, show the list to the human before installing |
| Old rule replaced | the earlier decision 'zero npm build' is replaced by this one. Add it to the decisions log in PROJECT\_GUIDE.md |

## 3. Node.js setup (Windows)

The agent must ASK the human before installing anything.

1. Check: `node --version` and `npm --version`. Need Node 20 LTS or 22 LTS (18 is the minimum).
2. If missing, the human installs the current LTS from nodejs.org (the Windows installer, default options), or runs `winget install OpenJS.NodeJS.LTS`.
3. Close and reopen PowerShell, then check again.
4. If PowerShell blocks `npm` scripts, use `Set-ExecutionPolicy -Scope Process Bypass` for that terminal only.
5. `npm install` needs internet once. After the first install and build, the demo needs no internet.
6. Never commit `node_modules`. Do commit `package-lock.json`. Keep a built copy of `frontend/dist` (committed or zipped on a USB stick) so the demo laptop does not need Node on demo day.

## 4. Architecture

```
Development:  browser -> Vite dev server (port 5173) --proxy--> FastAPI (port 8000)
Production:   browser -> FastAPI (port 8000): '/' serves frontend/dist, '/legacy' serves static/index.html,
                         '/api/*' and '/ws' are the data
```

- Keep existing endpoints working exactly as they are (`/health`, `/ws`, `/spike`, `/reset`, `/summary`, and `/bots`, `/sla` if they exist).
- If `frontend/dist` is missing, `/` falls back to the legacy dashboard with a visible note. The demo must never be blank.

## 5. Backend additions (small, pre-approved)

The human approves these in advance. Anything else that changes an existing interface needs a question first. No new Python dependencies without asking.

1. CORS for `http://localhost:5173` (development only).
2. `GET /api/capabilities` returns booleans: `bots`, `sla`, `locations`, `training_log`, `results`, `delay`. The UI hides what is not available instead of crashing.
3. `GET /api/config/public` returns the slice names, SLA limits, bot limits, spike factors and location defaults, all read from `config.yaml`. The UI never hard-codes these numbers.
4. `GET /api/training/log` returns `runs/log.csv` as JSON, downsampled to at most 500 points, plus model info (seed, timesteps, file date, selected checkpoint if known).
5. `GET /api/results` returns `results/*.csv` (SLA table, ablation, scenario table) as JSON, and the headline numbers computed by the backend from those files.
6. Stream addition: per policy a `shield` block `{active: bool, changed: bool, delta_pct: float, intervention_rate_20: float}`, where `changed` means the shield altered any share by more than 3 percentage points, and `intervention_rate_20` is the fraction of the last 20 steps where it did. Computed from real shield input and output, never faked.
7. Static serving of `frontend/dist` and `/legacy` as in section 4.
8. First thing in F1: run the server, capture 30 real stream messages into `frontend/fixtures/stream_sample.json`. TypeScript types in `src/types/api.ts` are written from this real payload. Fixtures are for automated tests only, never imported by production code.

## 6. Design system

**Theme:** dark. Background `#0B1220`, cards `#121A2B`, borders `#1F2A44`, text `#E5E7EB`, muted `#94A3B8`. Radius 12 px. One shadow level.

**Slice colours (only for share bars, bots, slice labels):** eMBB cyan `#22D3EE`, URLLC amber `#F59E0B`, mURLLC violet `#A78BFA`.

**Policy colours (only for chart lines and policy cards):** Static red `#F87171`, Heuristic light grey `#CBD5E1`, RL Agent emerald `#34D399`. Never swap the two palettes.

**Status colours:** OK green, AT RISK amber, BREACH red, NO TRAFFIC grey, OVERLOAD purple badge. Status is always colour plus icon plus text (never colour alone).

**Type:** Inter (local). Body 14 px, chart labels 12 px, card titles 16 px, big numbers 28 to 40 px. Presenter mode scales text by 1.4.

**Layout rules:** no page scrolling on the Live page at 1920x1080 or 1366x768; other pages may scroll vertically; nothing overlaps or clips at 1366x768.

**Charts rules:**

- Ring buffer of at most 300 points per series. Render at most 5 updates per second.
- Y axis for violation charts: `max(2 x SLA limit, 1.2 x highest value)`, so zero is visible and spikes are not clipped.
- Draw the SLA limit as a dashed line with a label. Mark spikes as shaded vertical bands with a small label.
- Tooltips show policy, step and value. Legends show the three policy names and colours.
- Units in every axis title.

**States:** every page has a loading skeleton, an empty state with a helpful message, and an error state with a Retry button.

## 7. App shell and data layer (built first)

- **Top bar:** app name, nav links (Live, Traffic, Agent, SLA, Training, Results), connection badge (Live, Reconnecting, Offline), scenario name, step counter, Presenter mode toggle.
- **WebSocket hook:** auto-reconnect with backoff (1, 2, 4 seconds, max 5), resubscribes after reconnect, never throws into the UI. If the tab is hidden, keep reading messages but skip rendering.
- **Store:** latest message, ring buffers per policy and metric, event feed (max 200 items), capabilities, public config, connection state.
- **Error boundary** around each page, a 404 page, toasts for API errors.
- **No mock data** in production code. Search for `Math.random`, `faker`, `mock`, and fixture imports outside tests.

## 8. Pages (one by one)

### Page 1: Live Demo (`/`) - the main demo screen

**Purpose:** show in 10 seconds that static slicing fails during surges, and that the RL agent with shield holds the SLA.

**Layout (top to bottom):**

1. **Control bar:** spike buttons (eMBB surge, URLLC burst, mURLLC storm; factors from `/api/config/public`), Pause or Resume, Reset, scenario badge.
2. **SLA scoreboard strip:** three tiles (Static, Heuristic, RL Agent). Each shows the overall status chip, URLLC and mURLLC violation percent, eMBB served percent, and the share of windows within SLA. Values come from the stream or `/sla`.
3. **Hero charts side by side:** (A) violation rate overlay, three policy lines plus the SLA line; (B) eMBB served ratio overlay (or throughput if served ratio is not in the stream).
4. **Policy cards (three, compact):** status chip, PRB share bar and vCPU share bar in slice colours, eMBB queue bar, estimated delay (model) if available.
5. **Feed (right side or bottom drawer):** 'What is happening' with filters: Spikes, Bots, Shield, SLA.

**Shield display:** on the RL card show 'Shield intervention rate (last 20 steps): X percent' plus a small meter. Feed lines for the shield only when `changed` is true, at most one line per 5 steps, repeated lines collapse into 'x12'.

**Nominal state:** when all policies are within SLA and equal, show a calm banner: 'Nominal load: all policies serve everything. Press a spike to see the difference.' with a subtle pulse on the spike buttons for the first 10 seconds.

**Interactions:** buttons call the existing endpoints and show a toast on error; a spike creates a band marker on both charts; Pause stops the UI and the backend if an endpoint exists (otherwise it freezes the UI and shows 'display paused').

### Page 2: Traffic and Bots (`/traffic`)

- **Presets:** Steady, eMBB surge, URLLC burst, mURLLC storm, Mixed. A preset calls the existing spike endpoints (and bot endpoints if available).
- **Bots panel (only if `capabilities.bots`):** slice dropdown, number input, Add, Remove, Set, quick +10 +50 +100, 'Max reached' note when clipped, counters showing now and max per slice. Calls `POST /bots`.
- **Device canvas:** coloured dots by slice around a tower icon, packet pulses toward the tower, at most 60 dots per slice with a label such as '1 dot = 5 bots', fade in and out.
- **Traffic chart:** arrivals per slice per step in slice colours.
- **Locations (only if `capabilities.locations`, later phase):** zone selector and zones scene. Leave a clearly marked placeholder component, do not build it now.

### Page 3: Agent Insights (`/agent`)

- **Shares over time:** stacked area chart of the Agent's PRB shares, with a toggle to show vCPU shares, and a toggle to overlay the Heuristic.
- **Shield intervention:** line of `intervention_rate_20` over time, a total count, and plain text: 'The shield changed the agent's decision in X percent of the last Y steps.'
- **Decision table:** last 20 decisions with step, load per slice, chosen shares, whether the shield changed them, and a short reason built from real values (for example 'eMBB load up 40 percent, raised eMBB share, URLLC held at floor').
- **Radio versus compute:** per slice, bars for PRB share, vCPU share, and the effective capacity `min(radio, compute)`, with a note explaining the coupling.

### Page 4: SLA (`/sla`)

- **The promise:** SLA table from `/sla` or `/api/config/public` in plain words (URLLC, mURLLC, eMBB, with limits).
- **Grid:** rows = policies, columns = slices, tiles with status, value, limit and a small gauge bar. 'No traffic' when a slice has no arrivals.
- **Window compliance:** percent of 20-step windows within SLA per policy.
- **Overload:** a badge when `feasible` is false with the wording 'URLLC and mURLLC protected first'. Never claim all SLAs hold under overload.
- If `capabilities.sla` is false, show the limits from config and a note that live SLA status is not available.

### Page 5: Training (`/training`)

- Metric cards: timesteps, final reward, final costs against their limits, final lambda per constraint (labelled 'final trained value'), seed, file date.
- Curves from `/api/training/log`: reward, the three costs with dashed limit lines, the three lambdas.
- Empty state when no log exists: 'Run python train.py to create training data.'

### Page 6: Results (`/results`)

- **Headline card:** numbers come from `/api/results` (computed by the backend from the CSV files, never typed by hand).
- **Scenario chart:** grouped bars of violation rate per scenario and policy with confidence interval error bars.
- **SLA compliance matrix** and **ablation table and chart** (unconstrained PPO, constrained without shield, heuristic plus shield, full model).
- Tabs: Feasible load, Overload. Overload text: 'URLLC and mURLLC protected first'.
- Buttons to download each CSV. Footnote: 'Slice-level simulator, not a radio-level model. Delay values are model estimates.'

### Page 7: Presenter mode (`/present`, also toggle with key P)

- Full-screen layout: large SLA tiles, the two overlay charts, a one-line event ticker, large spike buttons. No navigation, no small text.
- Keyboard: `1`, `2`, `3` trigger the three spikes, `Space` pause or resume, `R` reset, `P` or `Esc` exit.
- Must be readable from 2 metres (text at least 24 px for key numbers).

### Page 8 (optional): Story (`/about`)

One static page: the real-world problem, the solution (joint radio plus compute, constrained RL, shield), the architecture diagram, the stack and the limitations. No live data.

## 9. Build phases (stop after each; wait for 'next')

| Phase | Goal | Deliverables | Acceptance |
| --- | --- | --- | --- |
| F0 | Gate and setup | `git tag pre-react`; old suite passes; Node check and install with permission; Vite React TS scaffold; Tailwind; ESLint; typecheck script; dev server runs | FT-1 to FT-4 |
| F1 | Backend additions | items in section 5, capture real fixtures, backend tests | FT-5 to FT-9 |
| F2 | Shell, design system, data layer | tokens, nav, connection badge, WebSocket hook, store, error boundary, types from real payload | FT-10 to FT-16 |
| F3 | Live Demo page | page 1 complete | FT-17 to FT-30 |
| F4 | Traffic and Bots page | page 2 | FT-31 to FT-38 |
| F5 | Agent Insights page | page 3 | FT-39 to FT-44 |
| F6 | SLA, Training and Results pages | pages 4 to 6 | FT-45 to FT-56 |
| F7 | Presenter mode and polish | page 7, shortcuts, empty and error states, responsiveness | FT-57 to FT-62 |
| F8 | Production cutover | build, FastAPI serves dist, `/legacy` kept, offline test, README, test log | FT-63 to FT-72 |
| F9 (optional) | Story page, and the Locations zone scene after Phase 10 | page 8 | FT-73 to FT-74 |

Commit once per phase with a clear message. Scripts expected in `package.json`: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`.

## 10. Tests

Automated: Vitest and React Testing Library for the store, formatting helpers, chart data builders and key components. Adding them is a new dependency, so the agent asks first. Playwright for browser smoke tests is optional and also needs approval. Manual checks use the browser with DevTools (F12) open and the Console watched.

### F0 and F1: setup and backend

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-1 | Old suite before changes | all earlier tests pass; `pre-react` tag exists | P0 |
| FT-2 | Node | `node --version` is 18 or newer (20 or 22 LTS preferred); `npm --version` works | P0 |
| FT-3 | Clean install | `npm ci` from the lockfile works in a fresh clone; versions are pinned | P0 |
| FT-4 | Scripts | `npm run typecheck`, `lint` and `build` all exit 0; dev server opens | P0 |
| FT-5 | Capabilities | `GET /api/capabilities` returns the six booleans and they match reality (disable a feature, value flips) | P0 |
| FT-6 | Public config | `GET /api/config/public` values equal `config.yaml`; change a limit, restart, value changes | P0 |
| FT-7 | Training and results endpoints | return real data from the files; clean empty response if files are missing | P1 |
| FT-8 | Shield stats | `changed` and `intervention_rate_20` are computed from real shield input and output; unit test: a forced override sets `changed` true | P0 |
| FT-9 | Old endpoints | `/health`, `/ws`, `/spike`, `/reset`, `/summary` (and `/bots`, `/sla`) behave exactly as before; `/legacy` works | P0 |

### F2: shell and data layer

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-10 | Types match reality | types in `api.ts` fit `stream_sample.json`; a test parses all 30 captured messages | P0 |
| FT-11 | Reconnect | stop the server, UI shows Reconnecting, start it, UI shows Live again without reload | P0 |
| FT-12 | Ring buffer | after 30 minutes no series exceeds 300 points; memory stays flat | P0 |
| FT-13 | Missing features | with `bots`, `sla` or `locations` false the UI hides those parts and does not crash | P0 |
| FT-14 | No mock data | search production code for `Math.random`, `faker`, `mock`, fixture imports: none | P0 |
| FT-15 | Error boundary | throw an error in one page: shell stays usable and shows an error card | P1 |
| FT-16 | Tokens | colours and radii come from tokens; slice and policy palettes are not swapped anywhere | P2 |

### F3: Live Demo page

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-17 | Data is real | stop the backend: nothing keeps moving; change the seed: numbers change | P0 |
| FT-18 | Overlay charts | three policy lines with the right colours and legend, SLA dashed line labelled | P0 |
| FT-19 | Axis rule | at zero violations the axis still shows 0 and the SLA line; during a spike nothing is clipped | P0 |
| FT-20 | Spike buttons | each button triggers the spike, a band marker appears on both charts within 1 second | P0 |
| FT-21 | Story | during an eMBB surge Static turns red or amber, the Agent stays green; during a mURLLC storm the same | P0 |
| FT-22 | SLA tiles | tiles equal `/sla` or the stream values at the same step | P0 |
| FT-23 | Shield meter | intervention rate equals the stream value; the feed has no spam (at most one shield line per 5 steps, repeats collapsed) | P0 |
| FT-24 | Nominal banner | shows at nominal load, disappears on the first spike | P1 |
| FT-25 | Pause and Reset | Pause stops updates; Resume continues; Reset clears charts, feed and counters | P0 |
| FT-26 | Feed filters | each filter chip shows only its events | P1 |
| FT-27 | Policy cards | share bars sum to 100 percent, queue bar matches the stream | P1 |
| FT-28 | Layout | no page scroll and no clipping at 1920x1080 and 1366x768 | P0 |
| FT-29 | Console | no red errors during a 10-minute run with all three spikes | P0 |
| FT-30 | Performance | about 5 updates per second, CPU use reasonable, no frame drops while spiking | P1 |

### F4: Traffic and Bots page

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-31 | Presets | each preset triggers the right spikes and bot changes | P1 |
| FT-32 | Add bots | slice URLLC, number 20, Add: counter and dots update, Live page reacts within 2 seconds | P0 |
| FT-33 | Remove and Set | counters and dots match the API response | P0 |
| FT-34 | Limits | beyond max shows 'Max reached', nothing breaks | P1 |
| FT-35 | Dot scaling | 500 bots show at most 60 dots with a scale label, no lag | P1 |
| FT-36 | Hidden when absent | with bots unavailable the panel is replaced by a note | P0 |
| FT-37 | Invalid input | decimals, negatives, text: rejected with a message, no request sent | P1 |
| FT-38 | Stress | 30 quick Add clicks with two tabs open: no crash, tabs stay consistent | P1 |

### F5: Agent Insights page

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-39 | Shares chart | stacked areas sum to 100 percent; toggles work | P1 |
| FT-40 | Shield text | 'changed the decision in X percent of the last Y steps' matches the stream | P0 |
| FT-41 | Decision table | 20 rows, values equal the stream, reasons use real numbers | P1 |
| FT-42 | Coupling bars | effective capacity equals min of radio and compute from the stream | P1 |
| FT-43 | Heuristic overlay | toggle adds and removes the line | P2 |
| FT-44 | Honesty | no text implies the shield is the learned policy | P0 |

### F6: SLA, Training and Results pages

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-45 | SLA promise | limits shown equal `config.yaml` (change, restart, page follows) | P0 |
| FT-46 | SLA grid | tiles equal `/sla`; 'No traffic' appears for an empty slice | P0 |
| FT-47 | Overload | many bots show the OVERLOAD badge and the 'protected first' wording; no claim that all SLAs hold | P0 |
| FT-48 | Window compliance | numbers equal the backend values | P1 |
| FT-49 | Training cards | final lambdas labelled 'final trained value'; match the last row of `runs/log.csv` | P0 |
| FT-50 | Training curves | three costs with dashed limit lines; lambdas plotted; empty state if no log | P1 |
| FT-51 | Headline | recompute it from the CSVs yourself: equals the card | P0 |
| FT-52 | Scenario chart | error bars present, values equal the CSV | P1 |
| FT-53 | Ablation | four rows, values equal the CSV, labels clear | P1 |
| FT-54 | Feasible and overload tabs | separate results; overload text correct | P0 |
| FT-55 | CSV download | files download and open correctly | P2 |
| FT-56 | Footnotes | slice-level simulator and model-estimate notes are visible | P0 |

### F7: Presenter mode and polish

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-57 | Presenter layout | key numbers at least 24 px, readable from 2 metres, no small text | P1 |
| FT-58 | Shortcuts | 1, 2, 3, Space, R, P and Esc work and are listed on a help overlay (key ?) | P0 |
| FT-59 | States | every page has loading, empty and error states with Retry | P1 |
| FT-60 | Window resize | resizing from 1920 to 1280 wide never overlaps or clips | P1 |
| FT-61 | Tab hidden | hide the tab for 2 minutes, show it: charts resume correctly, memory flat | P1 |
| FT-62 | Status never colour only | each status has icon and text | P2 |

### F8: production cutover

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-63 | Build | `npm run build` creates `frontend/dist`; size reported | P0 |
| FT-64 | Served by FastAPI | `uvicorn api:app`, open `http://localhost:8000`: the React app loads; deep links like `/sla` work after refresh | P0 |
| FT-65 | Legacy | `/legacy` still shows the old dashboard | P0 |
| FT-66 | Fallback | rename `frontend/dist`: `/` shows the legacy dashboard with a note; restore it afterwards | P1 |
| FT-67 | Offline | Wi-Fi off, cold start: everything works, fonts included | P0 |
| FT-68 | No external URLs | search `dist` for `http://` and `https://` other than localhost and XML namespaces: none | P0 |
| FT-69 | Clean clone | fresh clone, follow only the README: backend runs; `npm ci` and build work; or the committed or zipped `dist` works without Node | P0 |
| FT-70 | Soak | 30 minutes running with random spikes: memory flat, no console errors | P1 |
| FT-71 | Regression | the full earlier test suite and the E2E scenarios still pass | P0 |
| FT-72 | README and decisions log | frontend section, Node setup, build and demo steps, and the replaced 'zero npm build' decision are documented | P1 |

### F9 (optional)

| ID | Test | Expected | Sev |
| --- | --- | --- | --- |
| FT-73 | Story page | static, accurate, no live-data claims, no overclaiming | P2 |
| FT-74 | Locations placeholder | if Phase 10 exists, the zones scene uses only API data and keeps the honesty strip | P2 |

### Edge cases

| ID | Edge case | Expected |
| --- | --- | --- |
| EF-1 | Server is down when the page loads | Offline badge, clear message, auto-connect when it comes up |
| EF-2 | Connection drops during a surge | Reconnecting badge; charts resume without duplicate or missing steps shown as correct data |
| EF-3 | Backend sends a field as null or missing | no crash; value shown as a dash |
| EF-4 | Huge bot counts | numbers format with separators; no layout break |
| EF-5 | Two tabs open | both stay in sync; actions in one show in the other |
| EF-6 | Very long run | no growth in memory or DOM nodes |
| EF-7 | Browser zoom 80 and 125 percent | layout stays usable |
| EF-8 | Backend restarts while a spike is active | UI resets its buffers cleanly when the step counter goes back |

## 11. Rules for the agent

1. Work on one phase at a time. After each: run its tests, show the REAL output, update `TEST_LOG.md`, commit, give a 5-line report, then STOP and wait for 'next'.
2. Ask before: installing Node or any system software, adding any npm or Python dependency, changing an existing endpoint, changing `config.yaml`.
3. Do not modify the simulator, SLA module, shield logic or the RL model, except the approved backend additions in section 5.
4. Never use mock or random data in production code. Every number on screen comes from the backend.
5. Keep the legacy dashboard working until F8 passes.
6. Honest wording only: slice-level simulator, delay is a model estimate, lambda is a final trained value, overload protects URLLC and mURLLC first.
7. Windows host: give PowerShell commands.
8. If a test fails twice, stop and give the error and two options.

## 12. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Node install problems | keep using the legacy dashboard; ask the human for a laptop that has Node; or build on one machine and copy `frontend/dist` |
| Time runs short | ship F0 to F3 and F8 (Live Demo plus cutover), then add pages in this order: SLA, Results, Agent Insights, Training, Traffic |
| Chart performance issues | lower the history cap to 150 points and the update rate to 3 per second |
| Payload differs from the spec | types follow the real payload; the agent reports every difference before coding |
| React app breaks on demo day | switch to `/legacy` or the built `dist` copy from the USB stick |

## 13. Definition of done

- [ ] The React app serves from FastAPI at `/`, works offline, and `/legacy` still works
- [ ] Pages 1 to 7 exist and match this spec; every number comes from the backend
- [ ] The Live page shows overlay charts, SLA tiles, the measured shield intervention rate and a non-spammy feed
- [ ] FT tests passed (all P0), logged in `TEST_LOG.md`; the full earlier suite still passes
- [ ] Built `dist` is saved on a USB stick; a backup screen recording of the new dashboard exists
- [ ] README and the decisions log are updated
