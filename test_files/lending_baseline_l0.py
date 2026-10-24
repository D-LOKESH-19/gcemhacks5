"""LL-12 baseline: fingerprint of the original Agent + Shield on fixed seeds (pre-lending).

Run: python test_files/lending_baseline_l0.py [--check]
Writes/compares results/lending_baseline_pre.json. These seeds are for the equality check only.
"""
import hashlib
import json
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

from evaluate import SCENARIOS, PolicyWrapper, run_single_episode  # noqa: E402
from sim import SliceEnv  # noqa: E402

SEEDS = [9001, 9002, 9003]
OUT = os.path.join("results", "lending_baseline_pre.json")


def fingerprint(model_path: str) -> dict:
    """Return per-scenario/seed SHA256 of the full per-step trace plus headline totals."""
    out = {}
    policy = PolicyWrapper("Agent + Shield", "rl", model_path=model_path, use_shield=True)
    for sc_key, sc in SCENARIOS.items():
        for seed in SEEDS:
            env = SliceEnv()
            hist, _ = run_single_episode(env, policy, sc, seed)
            trace = [
                [info["shares"], info["violations"], info["throughput"], info["queue"], info["arrivals"]]
                for info in hist
            ]
            blob = json.dumps(trace, sort_keys=True, default=lambda o: float(o)).encode()
            viol = sum(i["violations"][s] for i in hist for s in ("urllc", "murllc"))
            out[f"{sc_key}|{seed}"] = {"sha256": hashlib.sha256(blob).hexdigest(), "steps": len(hist), "urllc_murllc_violations": float(viol)}
    return out


if __name__ == "__main__":
    fp = fingerprint("models/agent_pre_lending.zip")
    if "--check" in sys.argv:
        ref = json.load(open(OUT))
        bad = [k for k in ref if ref[k] != fp.get(k)]
        print(f"checked {len(ref)} runs, mismatches: {len(bad)} {bad}")
        sys.exit(1 if bad else 0)
    json.dump(fp, open(OUT, "w"), indent=1)
    print(f"wrote {OUT}: {len(fp)} runs (scenarios={len(SCENARIOS)}, seeds={SEEDS})")
    for k, v in list(fp.items())[:4]:
        print(k, v)
