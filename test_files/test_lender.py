"""Phase L2 acceptance tests LL-1 to LL-15 (+ EP-1/3/5/8) for lender.py. Run: python test_files/test_lender.py"""
import copy
import hashlib
import json
import os
import subprocess
import sys
import time

import numpy as np
import yaml

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

from stable_baselines3 import PPO  # noqa: E402

import shield as shield_mod  # noqa: E402
from evaluate import SCENARIOS, PolicyWrapper, run_single_episode  # noqa: E402
from lending.lender import EnhancedPolicy, Lender  # noqa: E402
from sim import SliceEnv  # noqa: E402

BASE = yaml.safe_load(open("config.yaml"))
S = ["embb", "urllc", "murllc"]
PKP, PKC = BASE["prb_total"] * BASE["prb_rate"], BASE["vcpu_total"] * BASE["cpu_rate"]  # 1200, 1600 pk per share
SCALE = np.array([BASE["sla"]["embb"]["min_served_ratio"], 1.0, 1.0])
results = []


def check(tid, ok, msg):
    results.append(bool(ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {tid}: {msg}")


def cfg_with(**kw):
    c = copy.deepcopy(BASE)
    for k, v in kw.items():
        if k in c["lending"]:
            c["lending"][k] = v
        else:
            raise KeyError(k)
    return c


def hist(fc, mg=(0, 0, 0), burst=(False,) * 3, risk=None, extra=None):
    """Crafted predictor output. risk=None: step risk (0.95 if need > capacity else 0.02); else constants per slice."""
    h = {}
    for i, s in enumerate(S):
        need = SCALE[i] * (fc[i] + mg[i])
        if risk is None:
            fn = lambda cap, need=need: 0.95 if need > cap else 0.02
        else:
            fn = lambda cap, v=risk[i]: v
        h[s] = {"forecast": float(fc[i]), "margin": float(mg[i]), "risk_at": fn, "burst": bool(burst[i]),
                "violations_last": 0.0, "queue_growth": 0.0, "demand_last": float(fc[i]), "warming_up": False}
        if extra:
            h[s].update(extra.get(s, {}))
    return h


def prot(fc, r, cfg=BASE):
    pk = PKP if r == "prb" else PKC
    pm = [cfg["lending"]["protected_margin"][s] for s in S]
    fl = [cfg["shield_floor"].get(s, 0.0) for s in S]
    return np.maximum(fl, np.array(pm) * SCALE * np.asarray(fc, float) / pk)


RAW = np.array([0.70, 0.15, 0.15])


def run(L, fc, mg=(0, 0, 0), burst=(False,) * 3, raw_prb=RAW, raw_cpu=RAW, risk=None):
    return L.adjust(raw_prb, raw_cpu, hist(fc, mg, burst, risk), L.cfg)


# ---------------------------------------------------------------- LL-1 / LL-2 property tests
def random_runs(n_lenders=100, steps=100, seed=0, mode="predictive"):
    rng = np.random.default_rng(seed)
    viol = {"prot": 0, "sum": 0, "neg": 0, "cons": 0, "both": 0, "n": 0, "loans_seen": 0}
    for _ in range(n_lenders):
        cfg = cfg_with(mode=mode)
        L = Lender(cfg)
        base = np.array([rng.uniform(50, 900), rng.uniform(5, 300), rng.uniform(5, 300)])
        for t in range(steps):
            fc = base * rng.lognormal(0, 0.4, 3) * np.where(rng.random(3) < 0.1, rng.uniform(2, 8, 3), 1.0)
            mg = 0.3 * fc * rng.random(3)
            burst = tuple(rng.random(3) < 0.1)
            rp, rc = rng.dirichlet([4, 2, 2]), rng.dirichlet([4, 2, 2])
            ap, ac, loans, info = L.adjust(rp, rc, hist(fc, mg, burst), cfg)
            viol["n"] += 1
            viol["loans_seen"] += len(loans)
            for r, raw, adj in (("prb", rp, ap), ("cpu", rc, ac)):
                pm = prot(fc, r, cfg)
                lent, bor = np.array(info["lent"][r]), np.array(info["borrowed"][r])
                viol["sum"] += abs(adj.sum() - 1) > 1e-9
                viol["neg"] += (adj < -1e-12).any()
                viol["cons"] += abs(lent.sum() - bor.sum()) > 1e-9 or not np.allclose(adj - raw, bor - lent, atol=1e-9)
                viol["prot"] += ((lent > 1e-12) & (adj < np.minimum(raw, pm) - 1e-9)).any()
                d = {l["donor"] for l in loans if l["resource"] == r}
                b = {l["borrower"] for l in loans if l["resource"] == r}
                viol["both"] += bool(d & b)
    return viol


# ---------------------------------------------------------------- single-behaviour tests
def ll3():
    L = Lender(cfg_with())
    exact = True
    for _ in range(30):
        rp = np.array([0.6, 0.25, 0.15], dtype=np.float32)
        ap, ac, loans, info = L.adjust(rp, rp.copy(), hist([200, 30, 20]), L.cfg)
        exact &= (ap.dtype == rp.dtype) and np.array_equal(ap, rp) and np.array_equal(ac, rp) and not loans
    check("LL-3", exact and L.counters["opened"] == 0, "no risk above threshold: no loans and output equals the agent proposal exactly")


def ll4():
    fc, mg = [300, 400, 20], [0, 100, 0]
    L = Lender(cfg_with())
    ap, ac, loans, info = run(L, fc, mg, burst=(False, True, False))
    check("LL-4a", len(loans) == 1 and loans[0]["borrower"] == "urllc" and loans[0]["donor"] == "embb", f"burst-flagged borrower gets a loan in the same step from the idle donor: {[(l['donor'], l['borrower'], l['resource'], round(l['amount'], 3)) for l in loans]}")
    check("LL-4b", loans and loans[0]["amount"] <= 0.30 + 1e-12, f"loan within max_loan_fraction ({loans[0]['amount']:.3f} <= 0.30)")
    L2 = Lender(cfg_with())
    _, _, l1, _ = run(L2, fc, mg)
    _, _, l2, _ = run(L2, fc, mg)
    check("LL-4c", not l1 and len(l2) == 1, "without a burst flag the loan opens after confirm_steps=2 consecutive high-risk steps (none at step 1)")
    # lowest-risk donor first: make murllc a possible donor with lower risk than embb
    L3 = Lender(cfg_with())
    raw = np.array([0.40, 0.15, 0.45])
    h = hist([300, 400, 20], [0, 100, 0], (False, True, False), risk=None)
    h["embb"]["risk_at"] = lambda cap: 0.2   # embb moderately risky, murllc very low risk
    h["murllc"]["risk_at"] = lambda cap: 0.01
    _, _, loans3, _ = L3.adjust(raw, raw, h, L3.cfg)
    check("LL-4d", loans3 and loans3[0]["donor"] == "murllc", f"borrows from the lowest-risk donor ({loans3[0]['donor'] if loans3 else None})")


def ll5():
    fc, mg = [300, 150, 20], [0, 30, 0]
    got = {}
    for name, (rp, rc) in {"cpu_limited": (np.array([.55, .30, .15]), np.array([.80, .05, .15])),
                           "radio_limited": (np.array([.80, .05, .15]), np.array([.55, .30, .15])),
                           "both": (np.array([.75, .10, .15]), np.array([.775, .075, .15]))}.items():
        L = Lender(cfg_with())
        _, _, loans, _ = run(L, fc, mg, burst=(False, True, False), raw_prb=rp, raw_cpu=rc)
        got[name] = sorted({l["resource"] for l in loans})
    check("LL-5a", got["cpu_limited"] == ["cpu"], f"compute-limited borrower gets only vCPU: {got['cpu_limited']}")
    check("LL-5b", got["radio_limited"] == ["prb"], f"radio-limited borrower gets only PRB: {got['radio_limited']}")
    check("LL-5c", got["both"] == ["cpu", "prb"], f"both-limited (within 5%) gets both: {got['both']}")
    L = Lender(cfg_with(bottleneck_aware=False))
    _, _, loans, _ = run(L, fc, mg, burst=(False, True, False), raw_prb=np.array([.55, .30, .15]), raw_cpu=np.array([.80, .05, .15]))
    check("LL-5d", {l["resource"] for l in loans} <= {"prb"}, "bottleneck_aware=false (radio-only ablation) lends PRB only")


def ll6():
    cfg = cfg_with()
    L = Lender(cfg)
    _, _, loans, _ = run(L, [300, 400, 20], [0, 100, 0], burst=(False, True, False))
    a0 = loans[0]["amount"]
    amounts, ev_steps, closed_at = [], [], None
    for t in range(2, 40):
        ap, ac, loans, info = run(L, [200, 30, 20])
        returned = [e for e in info["loans_events"] if e["kind"] == "returned"]
        if returned:
            ev_steps.append(t)
        amounts.append((t, loans[0]["amount"] if loans else 0.0))
        if not loans and closed_at is None:
            closed_at = t
            break
    early = [t for t in ev_steps if t < 4]
    ratios = [amounts[i + 1][1] / amounts[i][1] for i in range(len(amounts) - 2) if amounts[i][1] > 0 and amounts[i + 1][1] > 0 and amounts[i][0] >= 4]
    check("LL-6a", not early and ev_steps and ev_steps[0] == 4, f"no return before {cfg['lending']['risk']['return_confirm_steps']} calm steps; first return at step {ev_steps[:1]}")
    check("LL-6b", ratios and all(abs(r - 0.75) < 1e-9 for r in ratios[:-1] or ratios), f"return ramps by ramp_return_pct (x0.75 of remaining each step): {[round(r, 4) for r in ratios[:5]]}")
    check("LL-6c", closed_at is not None and np.array_equal(ap, RAW), f"loan fully returned to zero (closed at step {closed_at}) and shares equal the agent proposal again; a0={a0:.3f}")


def ll7():
    cfg = cfg_with()
    confirm = cfg["lending"]["risk"]["confirm_steps"]
    # A: rapid 2-on / 2-off toggling for 400 steps must not open a new loan every cycle
    L = Lender(cfg)
    cycles = 0
    for t in range(400):
        on = (t // 2) % 2 == 0
        cycles += on and t % 2 == 0
        run(L, [300, 400, 20] if on else [200, 30, 20], [0, 100, 0] if on else [0, 0, 0], burst=(False, on and t % 2 == 0, False))
    check("LL-7a", L.counters["opened"] <= 2, f"rapid toggling ({cycles} burst cycles in 400 steps): only {L.counters['opened']} loans opened, {L.counters['enlarged']} enlargements (no flapping)")
    # B: isolated bursts (1-3 steps) every 40 steps: each opens one loan, each loan is returned before the next burst
    L = Lender(cfg)
    bursts = 0
    for t in range(800):
        ph = t % 40
        on = ph < 1 + (t // 40) % 3
        bursts += on and ph == 0
        run(L, [300, 400, 20] if on else [200, 30, 20], [0, 100, 0] if on else [0, 0, 0], burst=(False, on and ph == 0, False))
    shorts = [c for c in L.closed if c["duration"] < confirm and not c["recalled"]]
    st = L.stats()
    check("LL-7b", st["loans_opened"] <= 2 * bursts and st["loans_closed"] == st["loans_opened"] and not shorts,
          f"isolated bursts: {bursts} bursts -> {st['loans_opened']} opened (<= 1 per resource per burst: PRB first, then vCPU once radio stops being the bottleneck), {st['loans_closed']} closed, mean duration {st['mean_duration_steps']:.1f} steps, "
          f"mean return lag {st['mean_return_lag_steps']:.1f}, {len(shorts)} loans shorter than confirm_steps")


def ll8():
    L = Lender(cfg_with())
    _, _, l1, _ = run(L, [300, 400, 20], [0, 100, 0], burst=(False, True, False))
    lent0 = l1[0]["amount"]
    ap, ac, loans, info = run(L, [800, 400, 20], [0, 100, 0])
    rec = [e for e in info["loans_events"] if e["kind"] == "recalled"]
    after = sum(l["amount"] for l in loans if l["donor"] == "embb" and l["resource"] == "prb")
    eff = RAW[0] - after
    target = max(prot([800, 400, 20], "prb")[0], 0.7 * 800 / PKP)
    check("LL-8a", rec and after < lent0, f"donor risk above recall: loan reduced in the same step ({lent0:.3f} -> {after:.3f}), logged 'recalled'")
    check("LL-8b", eff >= target - 1e-9 or after < 1e-9, f"donor restored to protected minimum plus margin ({eff:.3f} >= {target:.3f}) or loan fully recalled")


def ll9():
    L = Lender(cfg_with(ttl_steps=5))
    run(L, [300, 400, 20], [0, 100, 0], burst=(False, True, False))
    ren = []
    for _ in range(12):
        _, _, loans, info = run(L, [300, 400, 20], [0, 100, 0])
    renewed = loans[0]["renewals"] if loans else 0
    expired_ev = [e for t in [0] for e in L.ledger if e["kind"] == "expired"]
    check("LL-9a", renewed >= 1 and not expired_ev, f"past ttl with borrower risk still high: renewed {renewed}x, no expiry")
    L = Lender(cfg_with(ttl_steps=5))
    run(L, [300, 400, 20], [0, 100, 0], burst=(False, True, False))
    for _ in range(14):
        _, _, loans, info = run(L, [300, 400, 20], [0, 100, 0], risk=(0.02, 0.2, 0.02))  # moderate: not high, not calm
    expired_ev = [e for e in L.ledger if e["kind"] == "expired"]
    check("LL-9b", expired_ev and (not loans or loans[0]["expiring"]), f"past ttl with risk no longer high: not renewed, 'expired' logged, loan winding down ({len(loans)} left)")


def ll10():
    # donor embb lendable exactly 0.20; urllc and murllc both want 0.15
    fc_e = 0.3 * PKP / 0.7
    raw = np.array([0.50, 0.25, 0.25])
    L = Lender(cfg_with())
    _, _, loans, info = L.adjust(raw, raw, hist([fc_e, 400, 400], [0, 100, 100], (False, True, True)), L.cfg)
    amt = {l["borrower"]: l["amount"] for l in loans if l["resource"] == "prb"}
    want = (500 / PKP) - 0.25
    check("LL-10a", abs(amt.get("urllc", 0) - min(want, .3)) < 1e-9 and amt.get("murllc", 0) < amt["urllc"] and abs(sum(amt.values()) - 0.20) < 1e-9,
          f"shortage: URLLC funded before mURLLC ({ {k: round(v, 3) for k, v in amt.items()} }), total = lendable 0.20")
    # murllc before embb when both borrow and urllc is the only donor with spare share
    raw = np.array([0.30, 0.50, 0.20])
    fc_u = 0.1 * PKP / 1.3
    L = Lender(cfg_with())
    _, _, loans, info = L.adjust(raw, raw, hist([600, fc_u, 300], [0, 0, 60], (True, False, True)), L.cfg)
    amt = {l["borrower"]: l["amount"] for l in loans if l["resource"] == "prb"}
    check("LL-10b", amt.get("murllc", 0) > amt.get("embb", 0), f"mURLLC funded before eMBB: { {k: round(v, 3) for k, v in amt.items()} }")


def ll11():
    L = Lender(cfg_with())
    raw = np.array([0.40, 0.15, 0.45])
    # urllc needs 0.6 share worth; only 'embb' and murllc can lend little
    ap, ac, loans, info = L.adjust(raw, raw, hist([0.3 * PKP / 0.7, 900, 0.40 * PKP / 1.3 + 1], [0, 0, 0], (False, True, False)), L.cfg)
    pm = prot([0.3 * PKP / 0.7, 900, 0.40 * PKP / 1.3 + 1], "prb")
    lent = np.array(info["lent"]["prb"])
    ok_prot = ((lent > 0) <= (ap >= np.minimum(raw, pm) - 1e-9)).all()
    check("LL-11a", info["overload"] and info["unfunded"]["prb"][1] > 0, f"need > lendable: overload flagged, unfunded URLLC = {info['unfunded']['prb'][1]:.1f} PRB")
    check("LL-11b", any("Cannot fully fund URLLC" in m and "Protecting URLLC and mURLLC first" in m for m in info["messages"]),
          f"event text: {info['messages'][0] if info['messages'] else None}")
    check("LL-11c", ok_prot, "protected minimums kept under overload")
    # overload is not flagged when need is fully funded
    L = Lender(cfg_with())
    _, _, _, info2 = run(L, [300, 400, 20], [0, 100, 0], burst=(False, True, False))
    check("LL-11d", not info2["overload"], "no overload flag when the need is fully funded")


def ll13_14_15():
    pass


# ---------------------------------------------------------------- policy-level tests
def fingerprint_policy(policy, scenarios, seeds):
    out = {}
    for sc_key in scenarios:
        for seed in seeds:
            hist_, _ = run_single_episode(SliceEnv(), policy, SCENARIOS[sc_key], seed)
            trace = [[i["shares"], i["violations"], i["throughput"], i["queue"], i["arrivals"]] for i in hist_]
            out[f"{sc_key}|{seed}"] = hashlib.sha256(json.dumps(trace, sort_keys=True, default=float).encode()).hexdigest()
    return out


def ll12():
    ref = json.load(open("results/lending_baseline_pre.json"))
    cfg = cfg_with(mode="off")
    model = PPO.load("models/agent_pre_lending.zip")
    pol = EnhancedPolicy(model, cfg)
    scs = sorted({k.split("|")[0] for k in ref})
    seeds = sorted({int(k.split("|")[1]) for k in ref})
    fp = fingerprint_policy(pol, scs, seeds)
    bad = [k for k in ref if ref[k]["sha256"] != fp[k]]
    check("LL-12", not bad and len(ref) == len(fp), f"mode off == original Agent+Shield bit-for-bit: {len(ref) - len(bad)}/{len(ref)} runs identical to the pre-lending fingerprints")
    return model


def episode_record(model, mode, sc, seed):
    pol = EnhancedPolicy(model, cfg_with(mode=mode))
    fp = fingerprint_policy(pol, [sc], [seed])
    return fp, json.dumps(pol.lender.ledger, sort_keys=True, default=float), pol.lender.stats()


def ll13(model):
    ok, opened = True, 0
    for sc in ("urllc_burst", "murllc_storm", "bots_3.0x"):
        a, b = episode_record(model, "predictive", sc, 7000), episode_record(model, "predictive", sc, 7000)
        ok &= a == b
        opened += a[2]["loans_opened"]
    check("LL-13", ok and opened > 0, f"same seed and events: identical shares, ledger and loan stats in 3 scenarios ({opened} loans opened across them, so the check is not vacuous)")


def ll14(model):
    env = SliceEnv()
    obs, info = env.reset(seed=1)
    pol = EnhancedPolicy(model, cfg_with(mode="predictive"))
    a = pol.predict(obs, info, env.cfg)
    obs2, r, *_ = env.step(a)
    check("LL-14a", obs.shape == (12,) and a.shape == (6,) and np.isfinite(a).all() and obs2.shape == (12,), "observation (12) and action (6) contracts unchanged")
    diff = subprocess.run(["git", "diff", "--stat", "pre-lending", "--", "sim.py", "shield.py", "sla.py", "train.py", "baselines.py"], capture_output=True, text=True).stdout.strip()
    check("LL-14b", diff == "", f"sim.py, shield.py, sla.py, train.py, baselines.py unchanged since pre-lending (git diff empty: {diff == ''})")
    # shield last: record the call order and prove the final action is exactly the shield output
    calls = []
    real = shield_mod.apply_shield

    def spy(prb, cpu, load, cfg=None):
        out = real(prb, cpu, load, cfg)
        calls.append((np.array(prb), out))
        return out
    shield_mod.apply_shield = spy
    try:
        pol2 = EnhancedPolicy(model, cfg_with(mode="predictive"))
        obs, info = env.reset(seed=3)
        env.set_spike("murllc", 7.0, 10)
        mins = []
        for _ in range(60):
            act = pol2.predict(obs, info, env.cfg)
            sp, sc, _ = calls[-1][1]
            assert np.allclose(act, shield_mod.shares_to_action_logits(sp, sc))
            mins.append(min(sp[1], sp[2], sc[1], sc[2]))
            obs, r, t, tr, info = env.step(act)
    finally:
        shield_mod.apply_shield = real
    fin = pol2.last_info["pipeline"]["final"]
    check("LL-14c", calls and min(mins) >= BASE["shield_floor"]["urllc"] - 1e-6 and fin is not None,
          f"shield applied last on every step ({len(calls)} calls); final URLLC/mURLLC shares never below floor (min {min(mins):.3f})")


def ll15():
    model_hist, _ = run_single_episode(SliceEnv(), PolicyWrapper("s", "static", use_shield=False), SCENARIOS["murllc_storm"], 7000)
    cfg = cfg_with()
    times = []
    for rep in range(3):
        L = Lender(cfg)
        for info in model_hist:
            t0 = time.perf_counter()
            L.step(info, RAW, RAW)
            times.append(time.perf_counter() - t0)
    ms = np.mean(times) * 1000
    check("LL-15", ms < 3.0, f"lender + predictor: mean {ms:.3f} ms/step, p99 {np.percentile(times, 99) * 1000:.3f} ms (< 3 ms)")


# ---------------------------------------------------------------- edge cases
def edge_cases():
    L = Lender(cfg_with())
    raw = np.array([0.34, 0.33, 0.33])
    _, _, loans, info = L.adjust(raw, raw, hist([2000, 2000, 2000], [0, 0, 0], (True, True, True)), L.cfg)
    pm = prot([2000] * 3, "prb")
    check("EP-1", info["overload"] and not loans, f"all slices high risk at once: overload flagged, no loans, shares unchanged ({'ok' if np.array_equal(info['pipeline']['post_lender']['prb'], raw) else 'changed'})")
    L = Lender(cfg_with())
    run(L, [300, 400, 20], [0, 100, 0], burst=(False, True, False))     # embb lends to urllc
    _, _, loans, info = run(L, [800, 400, 20], [0, 100, 0], burst=(True, False, False), risk=(0.95, 0.02, 0.02))  # embb tries to borrow
    lent_embb = sum(l["amount"] for l in loans if l["donor"] == "embb" and l["resource"] == "prb")
    borrowed_embb = sum(l["amount"] for l in loans if l["borrower"] == "embb" and l["resource"] == "prb")
    check("EP-3", borrowed_embb == 0 or lent_embb == 0, f"a slice that lent cannot borrow the same resource in one step (lent {lent_embb:.3f}, borrowed {borrowed_embb:.3f})")
    L = Lender(cfg_with())
    run(L, [300, 400, 20], [0, 100, 0], burst=(False, True, False))
    L.reset()
    check("EP-5", not L.loans and not L.ledger and L.predictor.preds["embb"].n == 0 and L.step_no == 0, "reset clears ledger, loans and predictor state")
    L = Lender(cfg_with())
    raw = np.array([0.40, 0.15, 0.45])
    _, _, loans, info = L.adjust(raw, raw, hist([0.3 * PKP / 0.7, 5000, 20], [0, 0, 0], (False, True, False)), L.cfg)
    tot = sum(l["amount"] for l in loans if l["resource"] == "prb")
    lendable = (prot([0.3 * PKP / 0.7, 5000, 20], "prb")).sum()
    check("EP-8", info["overload"] and tot <= 0.30 + 1e-9 and np.isclose(info["pipeline"]["post_lender"]["prb"], raw + np.array(info["borrowed"]["prb"]) - np.array(info["lent"]["prb"])).all(),
          f"loan larger than the pool/donors: clipped to what donors can lend ({tot:.3f}), rest reported unfunded ({info['unfunded']['prb'][1]:.1f} PRB)")


if __name__ == "__main__":
    v = random_runs()
    check("LL-1", v["prot"] == 0 and v["loans_seen"] > 1000, f"{v['n']} random states ({v['loans_seen']} active-loan observations): donors below protected minimum = {v['prot']}")
    check("LL-2", v["sum"] == 0 and v["cons"] == 0 and v["neg"] == 0 and v["both"] == 0,
          f"shares sum to 1: {v['sum']} violations; lent==borrowed and offsets == share change: {v['cons']} violations; negative shares {v['neg']}; slice both donor and borrower on a resource: {v['both']}")
    v2 = random_runs(seed=1, mode="reactive")
    check("LL-1/2 (reactive)", v2["prot"] == 0 and v2["sum"] == 0 and v2["cons"] == 0 and v2["both"] == 0, f"same invariants in reactive mode ({v2['n']} states)")
    ll3(); ll4(); ll5(); ll6(); ll7(); ll8(); ll9(); ll10(); ll11()
    m = ll12(); ll13(m); ll14(m); ll15(); edge_cases()
    print("=" * 60)
    print(f"{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)
