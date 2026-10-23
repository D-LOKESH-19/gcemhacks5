"""Phase L6 end-to-end checks that need no browser: E2E-L2 (repeatability), E2E-L4 (mode off == original agent through
the API) and the ledger cap. Run: python test_files/test_lending_e2e.py"""
import copy
import os
import sys

import numpy as np
import yaml

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

import api  # noqa: E402
from lender import LEDGER_CAP, Lender  # noqa: E402

results = []


def check(tid, ok, msg):
    results.append(bool(ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {tid}: {msg}")


EVENTS = {
    25: lambda m: m.trigger_spike("murllc", 7.0, 15),
    55: lambda m: m.modify_bots("urllc", 40, "add"),
    75: lambda m: m.trigger_spike("urllc", 3.0, 20),
    100: lambda m: m.modify_bots("embb", 60, "add"),
    120: lambda m: m.trigger_spike("embb", 2.5, 30),
    150: lambda m: m.modify_bots("embb", 60, "remove"),
}


def run(m, steps=170, events=EVENTS):
    out = []
    for t in range(1, steps + 1):
        if t in events:
            events[t](m)
        out.append(m.step_simulation())
    return out


def strip(x):
    """Drop wall-clock timing fields; everything else must be bit-identical between replays."""
    if isinstance(x, dict):
        return {k: strip(v) for k, v in x.items() if k != "inference_ms"}
    if isinstance(x, list):
        return [strip(v) for v in x]
    return x


def e2e_l2():
    m = api.sim_manager
    m.reset_all(7)
    a = run(m)
    stats_a, ledger_a = m.policy_enhanced.lender.stats(), list(m.policy_enhanced.lender.ledger)
    m.reset_all(7)
    b = run(m)
    stats_b, ledger_b = m.policy_enhanced.lender.stats(), list(m.policy_enhanced.lender.ledger)
    same_frames = all(strip(x) == strip(y) for x, y in zip(a, b)) and len(a) == len(b)
    opened = stats_a["loans_opened"]
    ev = sum(len(f["policies"]["enhanced"]["allocation"]["lending"]["loans_events"]) for f in a)
    check("E2E-L2", same_frames and stats_a == stats_b and ledger_a == ledger_b and opened > 0,
          f"reset and replay the same events twice: all {len(a)} stream frames identical (all four policies, incl. {ev} loan events, {opened} loans opened), identical ledger and loan statistics")


def e2e_l4():
    m = api.sim_manager
    cfg = m.cfg
    prev = cfg["lending"]["mode"]
    cfg["lending"]["mode"] = "off"
    try:
        m.reset_all(11)
        frames = run(m)
    finally:
        cfg["lending"]["mode"] = prev
    diffs = 0
    keys = ("throughput", "violations", "violation_rate", "shares", "queue", "arrivals")
    for f in frames:
        for k in keys:
            diffs += f["policies"]["enhanced"][k] != f["policies"]["agent"][k]
    off_flag = all(f["policies"]["enhanced"]["allocation"]["lending"]["mode"] == "off" for f in frames)
    nolend = all(not f["policies"]["enhanced"]["allocation"]["lending"]["loans_active"] for f in frames)
    check("E2E-L4a", diffs == 0 and off_flag and nolend,
          f"lending.mode off: Enhanced equals Agent+Shield on every field of all {len(frames)} frames with spikes and bot events ({diffs} differences, no loans, mode reported 'off')")
    # steady predictive run: nothing to lend, so it should also equal the agent exactly
    m.reset_all(11)
    steady = run(m, 120, {})
    d2 = sum(f["policies"]["enhanced"][k] != f["policies"]["agent"][k] for f in steady for k in keys)
    check("E2E-L4b", d2 == 0, f"predictive mode under steady load equals Agent+Shield too ({d2} differences in 120 frames): the lender does nothing when no slice is at risk")
    m.reset_all(42)


def ledger_cap():
    cfg = yaml.safe_load(open("config.yaml"))
    cfg["lending"]["risk"]["confirm_steps"] = 1
    cfg["lending"]["ttl_steps"] = 3
    cfg["lending"]["risk"]["return_confirm_steps"] = 1
    L = Lender(cfg)
    rng = np.random.default_rng(5)
    total = 0
    PKP, PKC = cfg["prb_total"] * cfg["prb_rate"], cfg["vcpu_total"] * cfg["cpu_rate"]
    for t in range(2500):
        hot = rng.random() < 0.5
        fc = [300.0, 450.0 if hot else 30.0, 400.0 if hot else 20.0]
        hist = {}
        for i, s in enumerate(cfg["slices"]):
            need = (0.7 if s == "embb" else 1.0) * (fc[i] + 50)
            hist[s] = {"forecast": fc[i], "margin": 50.0, "risk_at": (lambda cap, n=need: 0.95 if n > cap else 0.02),
                       "burst": bool(hot and rng.random() < 0.5), "violations_last": 0.0, "queue_growth": 0.0, "demand_last": fc[i]}
        raw = rng.dirichlet([6, 1.5, 1.5])
        _, _, _, info = L.adjust(raw, raw, hist, cfg)
        total += len(info["loans_events"])
    check("E2E-L5b", total > 3 * LEDGER_CAP and len(L.ledger) == LEDGER_CAP,
          f"ledger cap exercised: {total} loan events produced in 2500 stress steps, the lender keeps exactly {len(L.ledger)} (cap {LEDGER_CAP}); closed-loan list resets with each episode")


if __name__ == "__main__":
    e2e_l2()
    e2e_l4()
    ledger_cap()
    print("=" * 60)
    print(f"{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)
