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

## 3. How to Run Complete End-to-End Regression

Execute all test suites with a single PowerShell command:

```powershell
.\venv\Scripts\python sim_selftest.py
.\venv\Scripts\python shield.py
.\venv\Scripts\python test_bots_9a.py
.\venv\Scripts\python test_bots_9b.py
.\venv\Scripts\python test_bots_9c.py
.\venv\Scripts\python test_bots_9d.py
.\venv\Scripts\python evaluate.py
```
