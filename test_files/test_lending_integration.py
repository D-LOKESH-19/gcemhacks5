"""Phase L3 acceptance tests LI-1 to LI-6. Run: python test_files/test_lending_integration.py"""
import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time

import numpy as np

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

from fastapi.testclient import TestClient  # noqa: E402

import api  # noqa: E402
import shield as shield_mod  # noqa: E402
from lending.lender import EnhancedPolicy  # noqa: E402
from sim import SliceEnv  # noqa: E402

S = ["embb", "urllc", "murllc"]
results = []


def check(tid, ok, msg):
    results.append(bool(ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {tid}: {msg}")


def load_old_api():
    """Import api.py exactly as it was at the pre-lending tag."""
    src = subprocess.run(["git", "show", "pre-lending:api.py"], capture_output=True, text=True, check=True).stdout
    d = tempfile.mkdtemp()
    p = os.path.join(d, "api_pre_lending.py")
    open(p, "w", encoding="utf-8").write(src)
    spec = importlib.util.spec_from_file_location("api_pre_lending", p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def drive(m, steps, events):
    """Run a manager for `steps` steps applying events={step: callable(manager)}; return all payloads."""
    out = []
    for t in range(1, steps + 1):
        if t in events:
            events[t](m)
        out.append(m.step_simulation())
    return out


EVENTS = {
    20: lambda m: m.trigger_spike("murllc", 7.0, 15),
    45: lambda m: m.modify_bots("urllc", 40, "add"),
    60: lambda m: m.trigger_spike("urllc", 3.0, 20),
    80: lambda m: m.modify_bots("embb", 30, "remove"),
}


def strip_time(x):
    if isinstance(x, dict):
        return {k: strip_time(v) for k, v in x.items() if k != "inference_ms"}
    if isinstance(x, list):
        return [strip_time(v) for v in x]
    return x


def subset_diff(old, new, path=""):
    """First difference where `new` fails to contain `old` exactly (extra keys in new are allowed)."""
    if isinstance(old, dict):
        if not isinstance(new, dict):
            return path
        for k, v in old.items():
            if k not in new:
                return f"{path}/{k} missing"
            d = subset_diff(v, new[k], f"{path}/{k}")
            if d:
                return d
        return None
    return None if old == new else f"{path}: {old!r} != {new!r}"


def li1(new_payloads):
    bad = 0
    for p in new_payloads:
        a = [p["policies"][k]["arrivals"] for k in ("static", "heuristic", "agent", "enhanced")]
        bad += any(x != a[0] for x in a[1:])
    check("LI-1a", bad == 0, f"arrivals identical for Static, Heuristic, Agent and Enhanced on all {len(new_payloads)} steps (spikes, bots add/remove included)")
    m = api.SimulationManager()
    m.reset_all(5)
    bad = 0
    for t in range(1, 40):
        if t == 10:
            m.trigger_spike("urllc", 3.0, 10)
        if t == 25:
            m.reset_all(6)   # reset mid-run must keep the four copies in step
        p = m.step_simulation()
        bad += any(p["policies"][k]["arrivals"] != p["policies"]["static"]["arrivals"] for k in ("heuristic", "agent", "enhanced"))
    check("LI-1b", bad == 0, "arrivals still identical after a spike and a reset")


def li2(new_payloads):
    worst, n, with_loans = 0.0, 0, 0
    for p in new_payloads:
        lb = p["policies"]["enhanced"]["allocation"]["lending"]
        with_loans += bool(lb["loans_active"])
        for stage in ("raw", "post_lender", "final"):
            for r in ("prb", "cpu"):
                worst = max(worst, abs(sum(lb["pipeline"][stage][r]) - 1.0))
                n += 1
    check("LI-2", worst < 5e-4 and with_loans > 0, f"raw, post_lender and final shares each sum to 1 ({n} vectors, max error {worst:.1e} from 4-decimal rounding), {with_loans} steps had active loans")


def li3():
    cfg = copy.deepcopy(api.sim_manager.cfg)
    cfg["lending"]["risk"].update({"high": 0.001, "confirm_steps": 1, "low": 0.0001, "recall": 0.999})
    cfg["lending"]["max_loan_fraction"] = 0.9
    from stable_baselines3 import PPO
    model = PPO.load("models/agent.zip")
    pol = EnhancedPolicy(model, cfg)
    env = SliceEnv(config=cfg, seed=11)
    obs, info = env.reset(seed=11)
    worst_floor, exact, loans_seen = 1.0, True, 0
    real = shield_mod.apply_shield
    for t in range(150):
        if t == 10:
            env.set_spike("murllc", 7.0, 15); env.set_spike("urllc", 3.0, 15); env.set_spike("embb", 2.5, 30)
        if t == 50:
            env.apply_bot_event("murllc", env.DEFAULT_SLICE_LOC["murllc"], "add", 600)
        act = pol.predict(obs, info, cfg)
        li = pol.last_info
        loans_seen += len(li["loans_active"])
        recent = {"embb": float(obs[1]), "urllc": float(obs[5]), "murllc": float(obs[9])}
        sp, sc, _ = real(np.array(li["pipeline"]["post_lender"]["prb"]), np.array(li["pipeline"]["post_lender"]["cpu"]), recent, cfg)
        exact &= np.allclose(sp, li["pipeline"]["final"]["prb"], atol=1e-12) and np.allclose(sc, li["pipeline"]["final"]["cpu"], atol=1e-12)
        fin = li["pipeline"]["final"]
        worst_floor = min(worst_floor, fin["prb"][1], fin["prb"][2], fin["cpu"][1], fin["cpu"][2])
        obs, r, term, trunc, info = env.step(act)
    check("LI-3a", exact and loans_seen > 0, f"adversarial run (lender forced to lend aggressively, {loans_seen} loan-steps): final == shield(post_lender) on all 150 steps")
    check("LI-3b", worst_floor >= cfg["shield_floor"]["urllc"] - 1e-6, f"final URLLC/mURLLC shares never below the shield floor (min {worst_floor:.4f} >= {cfg['shield_floor']['urllc']})")


def li4():
    m = api.SimulationManager()
    m.reset_all(21)
    nominal = drive(m, 60, {})
    lb_n = [p["policies"]["enhanced"]["allocation"]["lending"] for p in nominal]
    m.trigger_spike("murllc", 7.0, 15)
    storm = drive(m, 25, {})
    lb_s = [p["policies"]["enhanced"]["allocation"]["lending"] for p in storm]
    f_n = np.mean([b["forecast"][2] for b in lb_n[20:]])
    f_s = max(b["forecast"][2] for b in lb_s)
    r_n = max(b["risk"][2] for b in lb_n[20:])
    r_s = max(b["risk"][2] for b in lb_s)
    loans = sum(len(b["loans_active"]) > 0 for b in lb_s)
    events = [e["kind"] for b in lb_s for e in b["loans_events"]]
    check("LI-4a", f_s > 2.5 * f_n and r_s > r_n and loans > 0,
          f"lending block follows the load: mURLLC forecast {f_n:.0f} -> {f_s:.0f}, max risk {r_n:.2f} -> {r_s:.2f}, {loans} steps with loans, events {sorted(set(events))}")
    check("LI-4b", len({tuple(b["risk"]) for b in lb_n + lb_s}) > 5 and all(b["mode"] == "predictive" for b in lb_s), "risk values vary step to step (not constant/mock) and carry the configured mode")
    with TestClient(api.app) as c:
        with c.websocket_connect("/ws") as ws:
            msgs = [ws.receive_json() for _ in range(3)]
    ok = all("enhanced" in x["policies"] and "lending" in x["policies"]["enhanced"]["allocation"] for x in msgs)
    check("LI-4c", ok, "WebSocket /ws messages carry policies.enhanced.allocation.lending")


def li5():
    with TestClient(api.app) as c:
        cap_on = c.get("/api/capabilities").json()
        api.sim_manager.cfg["lending"]["mode"] = "off"
        cap_off = c.get("/api/capabilities").json()
        api.sim_manager.cfg["lending"]["mode"] = "predictive"
        cap_on2 = c.get("/api/capabilities").json()
        L = c.get("/api/lending").json()
    check("LI-5a", cap_on["lending"] is True and cap_off["lending"] is False and cap_on2["lending"] is True and cap_on["allocation"] is True,
          f"capabilities.lending follows the feature (on={cap_on['lending']}, mode off={cap_off['lending']}, back on={cap_on2['lending']}); old flags intact")
    need = {"enabled", "config", "loans_open", "stats", "ledger", "overload", "calibration"}
    check("LI-5b", need <= set(L) and L["config"]["mode"] == "predictive" and "live" in L["calibration"] and L["calibration"]["offline"] is not None
          and {"loans_opened", "mean_amount", "mean_duration_steps", "mean_return_lag_steps", "recalls"} <= set(L["stats"]),
          f"GET /api/lending returns config, open loans, stats {sorted(L['stats'])[:5]}..., ledger and calibration (offline Brier {L['calibration']['offline']['overall']['brier']:.4f})")


def li6(new_payloads):
    old = load_old_api()
    om = old.SimulationManager()
    om.reset_all(42)
    api.sim_manager.reset_all(42)
    nm = api.sim_manager
    old_payloads = drive(om, 100, EVENTS)
    new_payloads = drive(nm, 100, EVENTS)
    first = None
    for i, (o, n) in enumerate(zip(old_payloads, new_payloads)):
        first = subset_diff(strip_time(o), strip_time(n))
        if first:
            first = f"step {i + 1}: {first}"
            break
    check("LI-6a", first is None, f"all old stream fields identical to the pre-lending api.py on 100 steps with spikes and bot events ({first or 'no difference'})")
    so = np.mean([len(json.dumps(p)) for p in old_payloads])
    sn = np.mean([len(json.dumps(p)) for p in new_payloads])
    growth = sn / so - 1
    check("LI-6b", growth < 0.40, f"message size {so:.0f} -> {sn:.0f} bytes, growth {growth:.1%} (< 40%)")
    t = time.perf_counter()
    for _ in range(100):
        nm.step_simulation()
    ms_new = (time.perf_counter() - t) / 100 * 1000
    t = time.perf_counter()
    for _ in range(100):
        om.step_simulation()
    ms_old = (time.perf_counter() - t) / 100 * 1000
    check("LI-6c", ms_new < 50, f"step time old {ms_old:.2f} ms -> new {ms_new:.2f} ms (budget 200 ms per step at 5/s)")
    with TestClient(api.app) as c:
        api.sim_manager.paused = False
        with c.websocket_connect("/ws") as ws:
            ws.receive_json()
            t0 = time.perf_counter()
            for _ in range(12):
                ws.receive_json()
            rate = 12 / (time.perf_counter() - t0)
    check("LI-6d", 4.0 <= rate <= 5.6, f"live WebSocket rate {rate:.2f} steps/s (target about 5)")
    return old_payloads


if __name__ == "__main__":
    api.sim_manager.reset_all(42)
    payloads = drive(api.sim_manager, 100, EVENTS)
    li1(payloads)
    li2(payloads)
    li3()
    li4()
    li5()
    li6(payloads)
    print("=" * 60)
    print(f"{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)
