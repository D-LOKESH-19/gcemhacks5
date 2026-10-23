# 5G SliceOS: Comprehensive Testing Guide & Verification Log

This guide documents the verification matrix, automated test suites, acceptance criteria, and execution results across Phases 0 to 9 (including Phase 9 Bots Feature BT-1 through BT-18).

---

## 1. Automated Test Suites Overview

| Suite | File | Coverage | How to Run |
| :--- | :--- | :--- | :--- |
| **Simulator Acceptance** | `sim_selftest.py` | Simplex conservation, static failure in surge, radio-compute coupling, seed determinism | `python sim_selftest.py` |
| **Safety Shield Units** | `shield.py` | Floor preservation, adversarial override, dynamic scaling | `python shield.py` |
| **API Endpoints** | `test_api.py` | `/health`, `/summary`, `/spike`, `/reset`, step telemetry | `python test_api.py` |
| **Evaluation Harness** | `evaluate.py` | 4 standardized scenarios across seeds | `python evaluate.py` |
| **Bots Simulator Suite** | `test_bots_9a.py` | BT-1 to BT-5, BT-8 to BT-11 (calibration, count control, vectorization speed) | `python test_bots_9a.py` |
| **Bots Model & Fairness** | `test_bots_9b.py` | BT-6, BT-7, BT-16 (traffic fairness across policies, mURLLC storms, multi-scale PPO) | `python test_bots_9b.py` |
| **Bots API & WebSockets** | `test_bots_9c.py` | BT-12, BT-13 (`/bots` endpoints, stream payloads, error handling) | `python test_bots_9c.py` |
| **Bots UI & Stress Suite** | `test_bots_9d.py` | BT-14, BT-15, BT-17, BT-18 (markup structure, bounds clipping, fake-work check, stress concurrency) | `python test_bots_9d.py` |

---

## 2. Phase 9 Bot Test Matrix (BT-1 to BT-18)

| ID | Category | Description | Acceptance Criteria | Severity | Verified Status |
| :---: | :--- | :--- | :--- | :---: | :---: |
| **BT-1** | Backward Compat | `traffic_mode: aggregate` | All legacy test cases pass unchanged | P0 | **PASSED** |
| **BT-2** | Calibration | Default counts over 200 steps | Mean arrivals within 15% of nominal targets (eMBB ~400, URLLC ~30, mURLLC ~20) | P0 | **PASSED** |
| **BT-3** | Control | `set_bots`, `add_bots`, `remove_bots` | Proper arithmetic, capped at `max_count`, floored at 0 | P0 | **PASSED** |
| **BT-4** | Linearity | Bot count scaling | Doubling URLLC bots roughly doubles URLLC packet arrivals (ratio ~2.0) | P1 | **PASSED** |
| **BT-5** | Determinism | Seed consistency | Identical seeds and bot events produce bit-for-bit identical arrivals | P0 | **PASSED** |
| **BT-6** | Policy Fairness | Traffic synchronization | Static, Heuristic, and Agent receive strictly identical arrivals on every step | P0 | **PASSED** |
| **BT-7** | Stress Event | mURLLC storm (500 bots) | Generates correlated packet surges without NaN or arithmetic overflow | P1 | **PASSED** |
| **BT-8** | Performance | 1,000 bots execution speed | 200 simulation steps execute in $<0.20$ seconds (Actual: **31.1 ms**) | P1 | **PASSED** |
| **BT-9** | Lifecycle | `reset()` state restoration | Resets active bot populations back to configured default counts | P1 | **PASSED** |
| **BT-10** | Robustness | Observation bounds | 12-dim observation vector strictly bounded in $[0.0, 1.0]$ at 0 and max bots | P0 | **PASSED** |
| **BT-11** | Boundary | Zero bot population | Slices with 0 bots produce 0 arrivals without division-by-zero or NaNs | P0 | **PASSED** |
| **BT-12** | API Valid | `GET /bots` & `POST /bots` | Accurate counts returned, synchronized across policies at exact step | P0 | **PASSED** |
| **BT-13** | API Security | Malformed requests | Bad slices, negative numbers, invalid modes return 4xx; server keeps streaming | P1 | **PASSED** |
| **BT-14** | UI Integration | Frontend bot injection | Typing a count and clicking Add creates bots and reflects on live charts within 2s | P0 | **PASSED** |
| **BT-15** | UI Bounds | Excessive count request | Adding beyond maximum displays "⚠️ Max reached" badge and preserves layout | P1 | **PASSED** |
| **BT-16** | Model Validation | Multi-scale evaluation | Agent beats Static on eMBB throughput while keeping violations $\le 1.0\%$ at 0.3x, 1x, 3x | P0 | **PASSED** |
| **BT-17** | Integrity | Fake-work audit | **0 occurrences of `Math.random`** in `index.html`; 100% telemetry driven by Python | P0 | **PASSED** |
| **BT-18** | Concurrency | Rapid-fire stress | 30 rapid consecutive bot modification calls process without dropping socket | P1 | **PASSED** |

---

## 2b. Phase L (predictive lending) suites

| Suite | File | Coverage | How to Run |
| :--- | :--- | :--- | :--- |
| Predictor | `test_files/test_predictor.py` | PL-1 to PL-8: no oracle, forecast quality, risk behaviour, calibration, burst detection, zero traffic, speed, warm-up | `python test_files/test_predictor.py` |
| Lender | `test_files/test_lender.py` | LL-1 to LL-15 and EP-1/3/5/8: protected minimum, conservation, bottleneck, return, recall, TTL, funding order, overload, mode off == original, determinism, speed | `python test_files/test_lender.py` |
| Integration | `test_files/test_lending_integration.py` | LI-1 to LI-6: four policies on identical traffic, pipeline fields, shield last, stream fields, capabilities, no regression vs the `pre-lending` api.py | `python test_files/test_lending_integration.py` |
| Evaluation | `test_files/test_lending_eval.py` | LE-1 to LE-10 (run after `lending_tune.py`, `lending_run_eval.py`, `lending_report.py`) | `python test_files/test_lending_eval.py` |
| UI (real browser) | `test_files/test_lending_ui.cjs` | LU-1 to LU-10 in Chromium over the DevTools Protocol: DOM vs live stream, console errors, overlap at 1920x1080 and 1366x768, reduced motion | `node test_files/test_lending_ui.cjs` |
| E2E (Python) | `test_files/test_lending_e2e.py` | E2E-L2 repeatability, E2E-L4 mode off == agent via the API, ledger cap | `python test_files/test_lending_e2e.py` |
| E2E (browser) | `test_files/test_lending_e2e.cjs` | E2E-L1 storm story from a cold start, E2E-L3 overload honesty on every page | `node test_files/test_lending_e2e.cjs` |
| Soak | `test_files/e2e_soak.cjs` | E2E-L5: 30 minutes of random spikes, bot changes and resets; heap, DOM, server memory, ledger cap, console errors (`SOAK_MIN=2` for a quick check) | `node test_files/e2e_soak.cjs` |
| Baseline fingerprint | `test_files/lending_baseline_l0.py` | LL-12 baseline of the original Agent + Shield (21 runs) | `python test_files/lending_baseline_l0.py --check` |

Note: the Node UI suites need `frontend/dist` built (`npm --prefix frontend run build`) and use ports 8123/8125/8126 and Chromium from the user's Playwright cache; nothing is installed.

---

## 3. How to Run Complete End-to-End Regression

Execute all test suites with a single PowerShell command:

```powershell
# Python (from the repo root; tests live in test_files/)
.\venv\Scripts\python sim_selftest.py
.\venv\Scripts\python shield.py
Get-ChildItem test_files\test_*.py | ForEach-Object { $env:PYTHONPATH="."; .\venv\Scripts\python $_.FullName }
.\venv\Scripts\python test_files\lending_baseline_l0.py --check
# Node (needs frontend/dist built)
Get-ChildItem test_files\test_phase_*.cjs | ForEach-Object { node $_.FullName }
node test_files\test_lending_ui.cjs
node test_files\test_lending_e2e.cjs
```
