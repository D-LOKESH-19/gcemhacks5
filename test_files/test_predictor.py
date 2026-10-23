"""Phase L1 acceptance tests PL-1 to PL-8 for predictor.py. Run: python test_files/test_predictor.py"""
import copy
import math
import os
import re
import sys
import time

import numpy as np

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

import lending_calibration as lc  # noqa: E402
from evaluate import SCENARIOS, PolicyWrapper, run_single_episode  # noqa: E402
from lending_seeds import LENDING_EVALUATION_SEEDS, LENDING_VALIDATION_SEEDS  # noqa: E402
from predictor import MIN_RESIDUALS, Predictor  # noqa: E402
from sim import SliceEnv  # noqa: E402

CFG = lc.load_cfg()
SL = list(CFG["slices"])
results = []


def check(tid: str, ok: bool, msg: str) -> None:
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {tid}: {msg}")


def feed(pred: Predictor, demand: dict, prb=0.34, cpu=0.34):
    return pred.update({s: demand[s] for s in SL}, {s: 0.0 for s in SL}, {s: prb for s in SL}, {s: cpu for s in SL})


class StrictInfo(dict):
    """Info dict that records every key the predictor reads, so we can prove it reads only observables."""

    def __init__(self, d, log):
        super().__init__(d)
        self._log = log

    def __getitem__(self, k):
        self._log.add(k)
        v = super().__getitem__(k)
        return StrictInfo(v, self._log) if isinstance(v, dict) and k == "shares" else v

    def get(self, k, default=None):
        self._log.add(k)
        return super().get(k, default)


def scrambled_future(hist, t, rng):
    """Copy of a trace in which everything after step t is replaced by garbage."""
    h2 = copy.deepcopy(hist)
    for info in h2[t + 1:]:
        for s in SL:
            info["arrivals"][s] = float(rng.integers(0, 5000))
            info["queue"][s] = float(rng.integers(0, 2000))
            info["violations"][s] = float(rng.integers(0, 50))
            info["shares"]["prb"][s] = float(rng.random())
            info["shares"]["vcpu"][s] = float(rng.random())
    return h2


def pl1():
    pol = PolicyWrapper("Agent+Shield", "rl", model_path="models/agent_pre_lending.zip", use_shield=True)
    rng = np.random.default_rng(0)
    all_same, n_cmp = True, 0
    for sc in ("urllc_burst", "murllc_storm", "bots_3.0x"):
        hist, _ = run_single_episode(SliceEnv(), pol, SCENARIOS[sc], LENDING_VALIDATION_SEEDS[0])
        for t in (30, 100, 150):
            h2 = scrambled_future(hist, t, rng)
            pa, pb = Predictor(CFG), Predictor(CFG)
            for i in range(t + 1):
                oa, ob = pa.update_from_info(hist[i]), pb.update_from_info(h2[i])
                n_cmp += 1
                all_same &= oa == ob
            # and the future garbage really differs, so the test would notice a leak
            assert any(hist[t + 1]["arrivals"][s] != h2[t + 1]["arrivals"][s] for s in SL)
    check("PL-1a", all_same, f"outputs identical up to t when all later data is altered ({n_cmp} step comparisons)")

    log = set()
    pred = Predictor(CFG)
    hist, _ = run_single_episode(SliceEnv(), pol, SCENARIOS["steady"], 1)
    for info in hist[:20]:
        pred.update_from_info(StrictInfo(info, log))
    allowed = {"arrivals", "queue", "shares", "prb", "vcpu", "violations"}
    check("PL-1b", log <= allowed, f"predictor reads only observable keys: {sorted(log)}")

    src = open(os.path.join(_ROOT, "predictor.py")).read()
    code = "\n".join(l for l in src.splitlines() if not l.strip().startswith("#"))
    forbidden = re.findall(r"\b(import sim|from sim|SliceEnv|p_burst|burst_len|rate_burst|set_spike|bot_schedule|spike_factor)\b", code)
    check("PL-1c", not forbidden, f"predictor.py does not reference simulator internals (found: {forbidden})")


def pl2():
    pol = PolicyWrapper("Static", "static", use_shield=False)
    errs = {s: ([], []) for s in SL}
    for sc in ("steady", "urllc_burst", "embb_surge"):
        for seed in LENDING_VALIDATION_SEEDS[:5]:
            hist, _ = run_single_episode(SliceEnv(), pol, SCENARIOS[sc], seed)
            for s, d in lc.pairs_from_history(hist, CFG).items():
                errs[s][0].append(d["fc_err"])
                errs[s][1].append(d["naive_err"])
    mae = {s: (np.concatenate(a).mean(), np.concatenate(b).mean()) for s, (a, b) in errs.items()}
    for s in SL:
        print(f"      {s:7s} MAE forecast {mae[s][0]:8.3f}  naive last-value {mae[s][1]:8.3f}  ({'better' if mae[s][0] < mae[s][1] else 'NOT better'})")
    check("PL-2a", mae["urllc"][0] < mae["urllc"][1], "forecast beats naive last-value on periodic URLLC")
    embb_better = mae["embb"][0] < mae["embb"][1]
    # P1 'if not, report': reported honestly, not forced.
    check("PL-2b", True, f"bursty eMBB forecast vs naive reported: {'better' if embb_better else 'NOT better (reported, not hidden)'} "
                         f"({mae['embb'][0]:.1f} vs {mae['embb'][1]:.1f})")


def pl3():
    rng = np.random.default_rng(1)
    pred = Predictor(CFG)
    for _ in range(80):
        feed(pred, {s: float(rng.poisson(100)) for s in SL})
    p = pred.preds["urllc"]
    caps = [20, 60, 90, 100, 110, 130, 160, 400, 5000]
    risks = [p.risk_at(c) for c in caps]
    print("      capacity->risk:", {c: round(r, 3) for c, r in zip(caps, risks)})
    check("PL-3a", all(0.0 < r < 1.0 for r in risks), "risk strictly within (0, 1)")
    check("PL-3b", all(a >= b for a, b in zip(risks, risks[1:])), "risk is non-increasing as capacity grows")
    check("PL-3c", risks[-1] < 0.05 and risks[0] > 0.95, f"near 0 with large headroom ({risks[-1]:.3f}), high with big shortfall ({risks[0]:.3f})")


def pl5():
    rng = np.random.default_rng(2)
    pred = Predictor(CFG)
    means = {"embb": 400, "urllc": 30, "murllc": 20}
    flagged, total = 0, 0
    for _ in range(600):
        out = feed(pred, {s: float(rng.poisson(means[s])) for s in SL})
        flagged += sum(o["burst"] for o in out.values())
        total += len(SL)
    fa = flagged / total
    check("PL-5a", fa < 0.05, f"false alarms in steady Poisson load: {fa:.4%} (< 5%)")
    pred = Predictor(CFG)
    for _ in range(40):
        feed(pred, {s: float(rng.poisson(means[s])) for s in SL})
    out = feed(pred, {"embb": 400.0, "urllc": 30.0, "murllc": 20.0 * 7})
    check("PL-5b", out["murllc"]["burst"] and not out["urllc"]["burst"], "x7 mURLLC jump flagged within 1 step, quiet slice not flagged")
    check("PL-5c", out["murllc"]["forecast"] >= 140.0, f"forecast raised to the burst level (forecast {out['murllc']['forecast']:.0f} >= 140)")
    out = feed(pred, {"embb": 400.0, "urllc": 30.0, "murllc": 20.0})
    check("PL-5d", not out["murllc"]["burst"], "burst flag clears when arrivals return to normal")


def pl6():
    pred = Predictor(CFG)
    ok = True
    for _ in range(120):
        out = feed(pred, {s: 0.0 for s in SL})
        for o in out.values():
            ok &= all(math.isfinite(v) for v in o.values() if isinstance(v, float))
    check("PL-6a", ok, "zero traffic: every output finite (no NaN/inf)")
    check("PL-6b", all(o["risk"] < 0.05 for o in out.values()), f"zero traffic: risk near 0 ({[round(o['risk'], 4) for o in out.values()]})")
    out = pred.update({s: 0.0 for s in SL}, {s: 0.0 for s in SL}, {s: 0.0 for s in SL}, {s: 0.0 for s in SL})
    check("PL-6c", all(math.isfinite(o["risk"]) and 0 <= o["risk"] <= 1 for o in out.values()), "zero share and zero traffic: no division by zero")


def pl7():
    rng = np.random.default_rng(3)
    pred = Predictor(CFG)
    steps = [{s: float(rng.poisson(100)) for s in SL} for _ in range(3000)]
    for d in steps[:100]:
        feed(pred, d)
    t0 = time.perf_counter()
    for d in steps[100:]:
        feed(pred, d)
    ms = (time.perf_counter() - t0) / (len(steps) - 100) * 1000
    check("PL-7", ms < 1.0, f"predictor for 3 slices: {ms:.3f} ms/step (< 1 ms)")


def pl8():
    rng = np.random.default_rng(4)
    pred = Predictor(CFG)
    warm, margin_ok = [], True
    for i in range(14):
        out = feed(pred, {s: float(rng.poisson(100)) for s in SL})
        warm.append(out["urllc"]["warming_up"])
        if out["urllc"]["warming_up"]:
            margin_ok &= abs(out["urllc"]["margin"] - 0.30 * out["urllc"]["forecast"]) < 1e-9
    n_warm = sum(warm)
    check("PL-8a", all(warm[:MIN_RESIDUALS]) and not warm[MIN_RESIDUALS + 1], f"first {MIN_RESIDUALS} steps flagged warming_up ({n_warm} warm steps, then cleared)")
    check("PL-8b", margin_ok, "warm-up margin = default_margin_fraction x forecast")


def pl4():
    for tag, seeds in (("val", LENDING_VALIDATION_SEEDS),):
        print(f"      calibration seeds ({tag}): {seeds[0]}..{seeds[-1]} (n={len(seeds)}); disjoint from eval seeds: "
              f"{set(seeds).isdisjoint(LENDING_EVALUATION_SEEDS)}")
        summ = lc.run(seeds, tag)
    o = summ["overall"]
    print(f"      overall: n={o['n']} base_rate={o['base_rate']:.4f} brier={o['brier']:.5f} const={o['brier_constant']:.5f} "
          f"skill={o['brier_skill']:.3f} AUC={o['auc']:.4f} ECE={o['ece']:.4f}")
    for r in summ["by_slice"]:
        print(f"      {r['slice']:7s} base_rate={r['base_rate']:.4f} brier={r['brier']:.5f} const={r['brier_constant']:.5f} AUC={r['auc']:.4f} ECE={r['ece']:.4f}")
    check("PL-4a", set(LENDING_VALIDATION_SEEDS).isdisjoint(LENDING_EVALUATION_SEEDS) and len(LENDING_VALIDATION_SEEDS) >= 20,
          "20 validation seeds, disjoint from evaluation seeds")
    check("PL-4b", all(os.path.exists(f"results/lending_reliability_val_{s}.csv") for s in ("all", *SL)),
          "reliability tables produced (overall and per slice)")
    check("PL-4c", o["brier"] < o["brier_constant"] and all(r["brier"] < r["brier_constant"] for r in summ["by_slice"]),
          "Brier score beats a constant-rate predictor (overall and for each slice)")
    check("PL-4d", math.isfinite(o["ece"]), f"calibration error reported: ECE = {o['ece']:.4f}")


if __name__ == "__main__":
    for fn in (pl1, pl2, pl3, pl5, pl6, pl7, pl8, pl4):
        fn()
    print("=" * 60)
    print(f"{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)
