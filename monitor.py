"""Incident monitor for the live simulation (Monitor page).

Observes each telemetry frame produced by `api.SimulationManager.step_simulation` and turns problems into
incidents with a start, an end and a peak, instead of one line per step. It only reads the frame; it never
changes the simulation, the policies or the stream. Everything it reports comes from simulator telemetry and
`sla.py` statuses already in the frame.

Incident types (severity):
  deadline_miss (critical)    URLLC/mURLLC packets not served in their step
  sla_breach (critical)       sla.py 20-step window status 'breach'
  sla_at_risk (warning)       sla.py window status 'amber' (above 80 percent of a limit)
  embb_queue_full (warning)   eMBB queue at its maximum: overflow is dropped
  infeasible_load (warning)   offered load above the feasible fraction of capacity (sla.is_feasible)
  lending_overload (warning)  Enhanced lender cannot fund a slice at risk
  bottleneck (info)           demand above 90 percent of effective capacity, radio or compute limited
  shield_clamp (info)         the shield changed the policy's proposal by more than 3 points
"""
from collections import deque
from typing import Any, Deque, Dict, List, Optional, Tuple

SLICES = ("embb", "urllc", "murllc")
NAMES = {"embb": "eMBB", "urllc": "URLLC", "murllc": "mURLLC"}
POLICY_NAMES = {"static": "Static", "heuristic": "Heuristic", "agent": "Agent + Shield", "enhanced": "Enhanced", "system": "System"}
SEVERITY = {
    "deadline_miss": "critical", "sla_breach": "critical", "sla_at_risk": "warning", "embb_queue_full": "warning",
    "infeasible_load": "warning", "lending_overload": "warning", "bottleneck": "info", "shield_clamp": "info",
}
MAX_INCIDENTS = 500
MAX_LOGS = 500
MAX_TIMELINE = 300


class IncidentMonitor:
    """Stateful incident detector. Call observe(frame) once per simulation step."""

    def __init__(self, cfg: Dict[str, Any]) -> None:
        self.queue_max = {s: float(cfg.get("queue_max", {}).get(s, 0)) for s in SLICES}
        self.reset()

    def reset(self) -> None:
        """Clear everything (user reset)."""
        self.tick = 0
        self.episode = 1
        self.last_step: Optional[int] = None
        self.next_id = 1
        self.open: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
        self.incidents: Deque[Dict[str, Any]] = deque(maxlen=MAX_INCIDENTS)
        self.logs: Deque[Dict[str, Any]] = deque(maxlen=MAX_LOGS)
        self.timeline: Deque[Dict[str, Any]] = deque(maxlen=MAX_TIMELINE)
        self.seen_events: Deque[str] = deque(maxlen=60)
        self.totals = {"critical": 0, "warning": 0, "info": 0}
        self.by_type: Dict[str, int] = {t: 0 for t in SEVERITY}
        self.by_policy: Dict[str, Dict[str, int]] = {}
        self.missed_packets: Dict[str, float] = {}
        self._log("monitor", "info", "Monitor started. Problems are detected from simulator telemetry and sla.py statuses.")

    # ------------------------------------------------------------------ observe
    def observe(self, frame: Dict[str, Any]) -> None:
        """Ingest one stream frame."""
        self.tick += 1
        step = int(frame.get("step", 0))
        if self.last_step is not None and step < self.last_step:
            self._close_all(self.last_step, "episode ended")
            self.episode += 1
            self._log("simulation", "info", f"Episode {self.episode - 1} ended at step {self.last_step}; episode {self.episode} started.")
        self.last_step = step

        active: Dict[Tuple[str, str, str], Tuple[float, str, float]] = {}  # key -> (value, detail, amount)
        pols = frame.get("policies", {})
        for p, d in pols.items():
            self._detect_policy(p, d, active)
        if frame.get("feasible") is False:
            arr = frame.get("audit", {}).get("total_arrivals")
            active[("infeasible_load", "system", "all")] = (1.0, f"Offered load {arr:.0f} packets/step is above the feasible fraction of capacity; "
                                                                  "only URLLC and mURLLC are protected first." if arr is not None else
                                                                  "Offered load is above the feasible fraction of capacity.", 0.0)
        self._ingest_logs(frame, step)

        for key, (value, detail, amount) in active.items():
            inc = self.open.get(key)
            if inc is None:
                inc = self._open(key, step, value, detail)
            inc["end_step"] = step
            inc["duration_steps"] += 1
            inc["peak"] = max(inc["peak"], value)
            inc["total"] += amount
            inc["detail"] = detail
            inc["last_tick"] = self.tick
        for key in [k for k in self.open if k not in active]:
            self._close(key, step, "resolved")

        self.timeline.append({
            "tick": self.tick, "step": step, "episode": self.episode,
            "missed": {p: float(sum(d.get("violations", {}).get(s, 0.0) for s in ("urllc", "murllc"))) for p, d in pols.items()},
            "active": {p: sum(1 for k in self.open if k[1] == p and SEVERITY[k[0]] != "info") for p in list(pols) + ["system"]},
        })

    def _detect_policy(self, p: str, d: Dict[str, Any], active: Dict) -> None:
        viol, arr = d.get("violations", {}), d.get("arrivals", {})
        for s in ("urllc", "murllc"):
            v = float(viol.get(s, 0.0))
            if v > 0:
                a = float(arr.get(s, 0.0))
                active[("deadline_miss", p, s)] = (v, f"{NAMES[s]}: {v:.1f} of {a:.0f} packets missed their deadline this step.", v)
                self.missed_packets[p] = self.missed_packets.get(p, 0.0) + v
        for s in SLICES:
            st = d.get("sla", {}).get(s, {})
            status = st.get("status")
            if status in ("breach", "amber"):
                val, lim = float(st.get("value", 0.0)), float(st.get("limit", 0.0))
                what = (f"served ratio {val * 100:.1f}% (minimum {lim * 100:.0f}%)" if s == "embb"
                        else f"window violation rate {val * 100:.2f}% (limit {lim * 100:.2f}%)")
                typ = "sla_breach" if status == "breach" else "sla_at_risk"
                severity_val = (lim - val) if s == "embb" else val
                active[(typ, p, s)] = (severity_val, f"{NAMES[s]} SLA {'breached' if typ == 'sla_breach' else 'at risk'} over the last 20 steps: {what}.", 0.0)
        q = float(d.get("queue", {}).get("embb", 0.0))
        if self.queue_max["embb"] > 0 and q >= self.queue_max["embb"] - 0.5:
            active[("embb_queue_full", p, "embb")] = (q, f"eMBB queue full ({q:.0f}/{self.queue_max['embb']:.0f}): overflow packets are dropped.", 0.0)
        alloc = d.get("allocation") or {}
        bn = alloc.get("bottleneck") or []
        eff = alloc.get("effective_capacity") or []
        for i, s in enumerate(SLICES):
            if i < len(bn) and bn[i] in ("radio", "compute", "both"):
                dem = float(arr.get(s, 0.0)) + float(d.get("queue", {}).get(s, 0.0))
                cap = float(eff[i]) if i < len(eff) else 0.0
                limit = {"radio": "radio (PRB)", "compute": "compute (vCPU)", "both": "radio and compute"}[bn[i]]
                active[("bottleneck", p, s)] = (dem / cap if cap > 0 else 0.0, f"{NAMES[s]} demand {dem:.0f} packets/step vs effective capacity {cap:.0f}: {limit}-limited.", 0.0)
        sh = d.get("shield") or {}
        if sh.get("changed"):
            delta = float(sh.get("delta_pct", 0.0) or 0.0)
            active[("shield_clamp", p, "all")] = (delta, f"Shield changed the {POLICY_NAMES.get(p, p)} proposal by {delta:.1f} percentage points to enforce URLLC/mURLLC floors.", 0.0)
        lend = alloc.get("lending") or {}
        if lend.get("overload"):
            notes = lend.get("overload_notes") or []
            unf = sum(sum(v) for v in (lend.get("unfunded") or {}).values())
            active[("lending_overload", p, "all")] = (unf, " ".join(notes) or "Lender cannot fund every slice at risk; URLLC and mURLLC protected first.", 0.0)

    # ------------------------------------------------------------------ logs
    def _ingest_logs(self, frame: Dict[str, Any], step: int) -> None:
        for line in frame.get("event_logs") or []:
            if line not in self.seen_events:
                self.seen_events.append(line)
                self._log("simulation", "info", line, step)
        lend = ((frame.get("policies", {}).get("enhanced") or {}).get("allocation") or {}).get("lending") or {}
        for m in lend.get("messages") or []:
            self._log("lending", "warning" if m.startswith("Cannot") else "info", m, step)
        for e in lend.get("loans_events") or []:
            unit = "PRB" if e.get("resource") == "prb" else "vCPU"
            lvl = "warning" if e.get("kind") in ("recalled", "expired") else "info"
            self._log("lending", lvl, f"Loan #{e.get('loan_id')} {e.get('kind')}: {NAMES.get(e.get('donor'), e.get('donor'))} -> "
                                      f"{NAMES.get(e.get('borrower'), e.get('borrower'))}, {e.get('amount_units', 0):.2f} {unit}. {e.get('reason', '')}", step)

    def _log(self, source: str, level: str, text: str, step: Optional[int] = None) -> None:
        self.logs.append({"tick": self.tick, "episode": self.episode, "step": self.last_step if step is None else step,
                          "source": source, "level": level, "text": text})

    # ------------------------------------------------------------------ incident lifecycle
    def _open(self, key: Tuple[str, str, str], step: int, value: float, detail: str) -> Dict[str, Any]:
        typ, p, s = key
        sev = SEVERITY[typ]
        inc = {"id": self.next_id, "type": typ, "severity": sev, "policy": p, "slice": s, "episode": self.episode,
               "start_step": step, "end_step": step, "start_tick": self.tick, "last_tick": self.tick, "duration_steps": 0,
               "peak": value, "total": 0.0, "detail": detail, "active": True, "closed_reason": None}
        self.next_id += 1
        self.open[key] = inc
        self.incidents.append(inc)
        self.totals[sev] += 1
        self.by_type[typ] += 1
        self.by_policy.setdefault(p, {"critical": 0, "warning": 0, "info": 0})[sev] += 1
        if sev != "info":
            self._log("monitor", sev, f"{sev.upper()} opened #{inc['id']}: {POLICY_NAMES.get(p, p)} {typ.replace('_', ' ')}"
                                      f"{'' if s == 'all' else ' (' + NAMES[s] + ')'}. {detail}", step)
        return inc

    def _close(self, key: Tuple[str, str, str], step: int, reason: str) -> None:
        inc = self.open.pop(key)
        inc["active"] = False
        inc["closed_reason"] = reason
        if inc["severity"] != "info":
            tot = f", {inc['total']:.1f} packets missed in total" if inc["type"] == "deadline_miss" else ""
            self._log("monitor", "info", f"Closed #{inc['id']} ({inc['type'].replace('_', ' ')}, {POLICY_NAMES.get(inc['policy'], inc['policy'])}) "
                                         f"after {inc['duration_steps']} step(s){tot}: {reason}.", step)

    def _close_all(self, step: int, reason: str) -> None:
        for key in list(self.open):
            self._close(key, step, reason)

    # ------------------------------------------------------------------ query
    def snapshot(self, limit: int = 200) -> Dict[str, Any]:
        """JSON-ready state for GET /api/monitor (newest first)."""
        limit = max(1, min(int(limit), MAX_INCIDENTS))
        inc = list(self.incidents)[-limit:][::-1]
        return {
            "tick": self.tick, "episode": self.episode, "step": self.last_step,
            "totals": dict(self.totals), "by_type": dict(self.by_type), "by_policy": {k: dict(v) for k, v in self.by_policy.items()},
            "missed_packets": {k: round(v, 3) for k, v in self.missed_packets.items()},
            "active": [dict(i) for i in sorted(self.open.values(), key=lambda x: ({"critical": 0, "warning": 1, "info": 2}[x["severity"]], x["start_tick"]))],
            "incidents": [dict(i) for i in inc],
            "logs": list(self.logs)[-limit:][::-1],
            "timeline": list(self.timeline),
            "limits": {"incidents": MAX_INCIDENTS, "logs": MAX_LOGS, "timeline": MAX_TIMELINE},
            "severity_of": dict(SEVERITY),
        }
