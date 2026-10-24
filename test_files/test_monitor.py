"""Monitor page backend tests (MON-1 .. MON-10). Run: python test_files/test_monitor.py"""
import copy
import json
import os
import sys
import time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

from fastapi.testclient import TestClient  # noqa: E402

import api  # noqa: E402
from monitor import MAX_INCIDENTS, MAX_LOGS, MAX_TIMELINE, IncidentMonitor  # noqa: E402

CFG = api.sim_manager.cfg
results = []


def check(tid, ok, msg):
    results.append(bool(ok))
    print(f"[{'PASS' if ok else 'FAIL'}] {tid}: {msg}")


def frame(step, viol_urllc=0.0, status="ok", queue=0.0, logs=None, feasible=True):
    """Minimal synthetic stream frame with one policy."""
    pol = {"violations": {"embb": 0.0, "urllc": viol_urllc, "murllc": 0.0}, "arrivals": {"embb": 400.0, "urllc": 30.0, "murllc": 20.0},
           "queue": {"embb": queue, "urllc": 0.0, "murllc": 0.0},
           "sla": {s: {"status": status if s == "urllc" else "ok", "value": 0.03, "limit": 0.02} for s in ("embb", "urllc", "murllc")},
           "allocation": {"bottleneck": ["none", "none", "none"], "effective_capacity": [800, 200, 200]}, "shield": {"changed": False}}
    return {"step": step, "feasible": feasible, "policies": {"static": pol}, "event_logs": logs or [], "audit": {"total_arrivals": 450.0}}


def mon_1():
    m = IncidentMonitor(CFG)
    for t in range(1, 11):
        m.observe(frame(t, viol_urllc=2.0 if 3 <= t <= 5 else 0.0))
    inc = [i for i in m.snapshot()["incidents"] if i["type"] == "deadline_miss"]
    ok = len(inc) == 1 and inc[0]["start_step"] == 3 and inc[0]["end_step"] == 5 and inc[0]["duration_steps"] == 3 and inc[0]["total"] == 6.0 and not inc[0]["active"]
    check("MON-1", ok, f"a problem lasting steps 3-5 becomes ONE incident (start {inc[0]['start_step']}, end {inc[0]['end_step']}, {inc[0]['duration_steps']} steps, {inc[0]['total']} packets), closed when resolved")
    m.observe(frame(11, viol_urllc=1.0))
    act = m.snapshot()["active"]
    check("MON-2", len(act) == 1 and act[0]["active"] and act[0]["id"] != inc[0]["id"], "a recurrence opens a NEW incident and it is listed as active while ongoing")


def mon_3():
    m = IncidentMonitor(CFG)
    for t in range(1, 6):
        m.observe(frame(t, logs=["Step 1: Triggered URLLC spike", "Step 3: shield active"][: 1 + (t >= 3)]))
    sim_lines = [l for l in m.snapshot()["logs"] if l["source"] == "simulation"]
    check("MON-3", len(sim_lines) == 2, f"simulation event lines repeated in later frames are logged once ({len(sim_lines)} lines from 5 frames)")


def mon_4():
    m = IncidentMonitor(CFG)
    for t in range(1, 3000):
        m.observe(frame(t, viol_urllc=1.0 if t % 2 else 0.0, logs=[f"Step {t}: event"]))
    s = m.snapshot(limit=10_000)
    check("MON-4", len(s["incidents"]) == MAX_INCIDENTS and len(s["logs"]) == MAX_LOGS and len(s["timeline"]) == MAX_TIMELINE
          and s["totals"]["critical"] == 1500, f"memory bounded after 3,000 steps with a new incident every other step: incidents {len(s['incidents'])}, logs {len(s['logs'])}, timeline {len(s['timeline'])}; cumulative counter still exact ({s['totals']['critical']} critical)")
    t0 = time.perf_counter()
    for t in range(3000, 4000):
        m.observe(frame(t, viol_urllc=1.0 if t % 3 else 0.0))
    ms = (time.perf_counter() - t0)  # 1000 steps, so seconds == ms per step
    check("MON-5", ms < 1.0, f"observe() costs {ms:.3f} ms per step (< 1 ms; the 4-policy simulation step is about 2.4 ms)")


def drive(m, steps, events):
    frames = []
    for t in range(1, steps + 1):
        if t in events:
            events[t](m)
        f = m.step_simulation()
        frames.append(f)
    return frames


def mon_6():
    m = api.sim_manager
    m.reset_all(42)
    m.monitor.reset()
    frames = drive(m, 150, {10: lambda x: x.trigger_spike("murllc", 7.0, 15), 60: lambda x: x.trigger_spike("urllc", 3.0, 20),
                            100: lambda x: x.modify_bots("embb", 120, "add")})
    s = m.monitor.snapshot(limit=500)
    ok_missed, ok_inc = True, True
    detail = []
    for p in ("static", "heuristic", "agent", "enhanced"):
        stream = sum(f["policies"][p]["violations"]["urllc"] + f["policies"][p]["violations"]["murllc"] for f in frames)
        mon = s["missed_packets"].get(p, 0.0)
        inc = sum(i["total"] for i in s["incidents"] if i["type"] == "deadline_miss" and i["policy"] == p)
        ok_missed &= abs(stream - mon) < 1e-2
        ok_inc &= abs(stream - inc) < 1e-2
        detail.append(f"{p} {stream:.1f}")
    check("MON-6", ok_missed and ok_inc, f"packets missed per policy equal the sum of the stream's violations, and the deadline-miss incidents add up to the same ({', '.join(detail)})")
    ok, n = True, 0
    for p in ("static", "heuristic", "agent", "enhanced"):
        for sl in ("embb", "urllc", "murllc"):
            steps = sum(1 for f in frames if f["policies"][p]["sla"][sl]["status"] == "breach")
            dur = sum(i["duration_steps"] for i in s["incidents"] if i["type"] == "sla_breach" and i["policy"] == p and i["slice"] == sl)
            ok &= steps == dur
            n += steps
    check("MON-7", ok and n > 0, f"SLA-breach incident durations equal the number of steps sla.py reported 'breach' in the stream, for every policy and slice ({n} breach steps)")
    crit_static = s["by_policy"].get("static", {}).get("critical", 0)
    check("MON-7b", crit_static > 0 and s["missed_packets"].get("agent", 0.0) <= s["missed_packets"].get("static", 0.0),
          f"Static shows critical incidents ({crit_static}); Agent misses no more packets than Static")
    return frames


def mon_8():
    m = api.sim_manager
    m.reset_all(3)
    m.monitor.reset()
    m.trigger_spike("murllc", 7.0, 12)
    drive(m, 205, {})       # crosses the 200-step episode boundary (automatic rollover)
    s = m.monitor.snapshot(limit=500)
    rolled = [l for l in s["logs"] if "Episode 1 ended" in l["text"]]
    closed = [i for i in s["incidents"] if i["closed_reason"] == "episode ended"]
    check("MON-8", s["episode"] == 2 and rolled and s["tick"] == 205 and len(s["incidents"]) > 0,
          f"automatic episode rollover keeps the history (episode {s['episode']}, {s['tick']} steps observed, {len(s['incidents'])} incidents kept, "
          f"{len(closed)} open incident(s) closed with reason 'episode ended')")
    c = TestClient(api.app)
    c.post("/reset")
    s2 = m.monitor.snapshot()
    check("MON-9", s2["tick"] == 0 and not s2["incidents"] and s2["totals"] == {"critical": 0, "warning": 0, "info": 0},
          "POST /reset (user reset) clears incidents, counters, logs and the timeline")


def mon_10():
    m = api.sim_manager
    m.reset_all(5)
    f = m.step_simulation()
    snap = copy.deepcopy(f)
    m.monitor.observe(f)
    check("MON-10a", f == snap, "observe() never mutates the stream frame (the stream is unchanged by the monitor)")
    with TestClient(api.app) as c:
        r = c.get("/api/monitor?limit=5").json()
        cap = c.get("/api/capabilities").json()
        spa = c.get("/monitor")
    need = {"tick", "episode", "step", "totals", "by_type", "by_policy", "missed_packets", "active", "incidents", "logs", "timeline", "limits"}
    check("MON-10b", need <= set(r) and len(r["incidents"]) <= 5 and len(r["logs"]) <= 5 and cap.get("monitor") is True and cap.get("lending") is True
          and spa.status_code == 200 and "text/html" in spa.headers.get("content-type", ""),
          f"GET /api/monitor returns {sorted(need)[:4]}... honours limit; capabilities.monitor true; /monitor serves the SPA (HTTP {spa.status_code})")


if __name__ == "__main__":
    mon_1(); mon_3(); mon_4(); mon_6(); mon_8(); mon_10()
    api.sim_manager.reset_all(42); api.sim_manager.monitor.reset()
    print("=" * 60)
    print(f"{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)
