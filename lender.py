"""SLA-aware predictive resource lending (Phase L2).

Pipeline position: Agent proposes raw shares -> Lender adjusts -> Shield enforces floors. The lender
only moves share between slices (offsets that sum to zero), never touches the RL model, and uses only
the predictor's past-observable outputs. With mode 'off' it returns the agent's shares unchanged.

Units: loan amounts are shares of the resource pool (0..1); *_units fields are PRBs / vCPUs.
Recall units, return ramp and TTL rules follow LENDING_SPEC.md section 5.
"""
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np

from predictor import Predictor

RESOURCES = ("prb", "cpu")
UNIT_NAMES = {"prb": "PRB", "cpu": "vCPU"}
MIN_LOAN = 0.005   # share; a returning loan below this is closed (ramp is geometric, so it needs a cut-off)
EPS = 1e-9
BOTTLENECK_TOL = 0.05  # radio and compute within 5% of each other: both are bottlenecks
LEDGER_CAP = 200


class Lender:
    """Stateful lender: loan ledger, risk streak counters and an owned predictor."""

    def __init__(self, cfg: Dict[str, Any]) -> None:
        self.cfg = cfg
        self.slices = tuple(cfg["slices"])
        self.n = len(self.slices)
        self.idx = {s: i for i, s in enumerate(self.slices)}
        self.pool = {"prb": float(cfg["prb_total"]), "cpu": float(cfg["vcpu_total"])}
        rate = {"prb": float(cfg["prb_rate"]), "cpu": float(cfg["cpu_rate"])}
        self.pk = {r: self.pool[r] * rate[r] for r in RESOURCES}  # packets per step per unit of share
        self.floor = np.array([float(cfg.get("shield_floor", {}).get(s, 0.0)) for s in self.slices])
        ratio = float(cfg["sla"]["embb"]["min_served_ratio"])
        self.scale = np.array([ratio if s == "embb" else 1.0 for s in self.slices])
        self.predictor = Predictor(cfg)
        self.reset()

    # ------------------------------------------------------------------ state
    def reset(self) -> None:
        """Clear predictor state, loans, streaks and ledger."""
        self.predictor.reset()
        self.loans: List[Dict[str, Any]] = []
        self.next_id = 1
        self.step_no = 0
        self.high_streak = np.zeros(self.n, dtype=int)
        self.low_streak = np.zeros(self.n, dtype=int)
        self.ledger: List[Dict[str, Any]] = []
        self.prev_overload = False
        self.closed: List[Dict[str, Any]] = []
        self.counters = {"opened": 0, "enlarged": 0, "returned_events": 0, "recalls": 0, "expired": 0,
                         "overload_steps": 0, "steps": 0}
        self.low_since: Dict[int, int] = {}

    def stats(self) -> Dict[str, Any]:
        """Loan statistics: count, mean amount, mean duration, return lag, recalls."""
        done = self.closed
        lags = [c["return_lag"] for c in done if c["return_lag"] is not None]
        return {
            "loans_opened": self.counters["opened"],
            "loans_closed": len(done),
            "loans_open": len(self.loans),
            "enlargements": self.counters["enlarged"],
            "mean_amount": float(np.mean([c["peak"] for c in done])) if done else 0.0,
            "mean_duration_steps": float(np.mean([c["duration"] for c in done])) if done else 0.0,
            "mean_return_lag_steps": float(np.mean(lags)) if lags else 0.0,
            "recalls": self.counters["recalls"],
            "expired": self.counters["expired"],
            "overload_steps": self.counters["overload_steps"],
            "steps": self.counters["steps"],
        }

    def risk_at_shares(self, prb: np.ndarray, cpu: np.ndarray) -> Optional[List[float]]:
        """Predicted risk per slice if the given shares were applied next step; None before any data."""
        if self.cfg["lending"]["mode"] == "off" or self.predictor.preds[self.slices[0]].n == 0:
            return None
        return [self.predictor.preds[s].risk_at(min(float(prb[i]) * self.pk["prb"], float(cpu[i]) * self.pk["cpu"]))
                for i, s in enumerate(self.slices)]

    # ------------------------------------------------------------- entry points
    def step(self, info: Optional[Dict[str, Any]], raw_prb: np.ndarray, raw_cpu: np.ndarray):
        """Convenience wrapper: ingest the last env step's observables, build history, then adjust."""
        mode = self.cfg["lending"]["mode"]
        history = None
        if info is not None and info.get("step", 1) > 0 and mode != "off":
            out = self.predictor.update_from_info(info)
            history = {}
            for s in self.slices:
                p = self.predictor.preds[s]
                history[s] = dict(out[s], risk_at=p.risk_at)
        return self.adjust(raw_prb, raw_cpu, history, self.cfg)

    def adjust(self, raw_prb, raw_cpu, history: Optional[Dict[str, Dict[str, Any]]], config: Optional[Dict[str, Any]] = None):
        """Return (adjusted_prb, adjusted_cpu, loans, lending_info).

        history[slice] needs: forecast, margin, risk_at(capacity_packets), and optionally burst,
        violations_last, queue_growth, demand_last, warming_up. None means no data yet: pass-through.
        """
        cfg = config or self.cfg
        lc = cfg["lending"]
        mode = lc["mode"]
        raw = {"prb": np.array(raw_prb), "cpu": np.array(raw_cpu)}
        events: List[Dict[str, Any]] = []
        messages: List[str] = []
        self.step_no += 1
        self.counters["steps"] += 1

        if mode == "off" or history is None:
            return self._finish(raw, raw, np.zeros((2, self.n)), np.zeros((2, self.n)), events, messages, history, None, mode,
                                np.zeros(self.n), np.zeros(self.n), {r: np.zeros(self.n) for r in RESOURCES}, False, lc)

        reactive = mode == "reactive"
        high, low, recall = (float(lc["risk"][k]) for k in ("high", "low", "recall"))
        confirm = 1 if reactive else int(lc["risk"]["confirm_steps"])
        rconfirm = int(lc["risk"]["return_confirm_steps"])
        maxfrac, ramp, ttl = float(lc["max_loan_fraction"]), float(lc["ramp_return_pct"]), int(lc["ttl_steps"])
        returns_on = bool(lc.get("returns", True))
        aware = bool(lc.get("bottleneck_aware", True))
        prio = [self.idx[s] for s in lc["priority"] if s in self.idx]
        rank = {i: k for k, i in enumerate(prio)}
        pmargin = np.array([float(lc["protected_margin"].get(s, 1.0)) for s in self.slices])

        h = [history[s] for s in self.slices]
        fc = np.array([x["forecast"] for x in h], dtype=float)
        mg = np.array([x["margin"] for x in h], dtype=float)
        dem = np.array([x.get("demand_last", x["forecast"]) for x in h], dtype=float)
        viol = np.array([x.get("violations_last", 0.0) for x in h], dtype=float)
        qg = np.array([x.get("queue_growth", 0.0) for x in h], dtype=float)
        burst = np.array([bool(x.get("burst", False)) for x in h])
        base = dem if reactive else fc
        req_pk = self.scale * (dem if reactive else fc + mg)  # packets/step the slice needs next step
        prot = {r: np.maximum(self.floor, pmargin * self.scale * base / self.pk[r]) for r in RESOURCES}

        def risk_fn(i: int, prb_share: float, cpu_share: float) -> float:
            if reactive:
                return 1.0 if (viol[i] > 0 or qg[i] > 0) else 0.0
            return float(h[i]["risk_at"](min(prb_share * self.pk["prb"], cpu_share * self.pk["cpu"])))

        lent, borrowed = self._tally()
        risk_raw = np.array([risk_fn(i, raw["prb"][i], raw["cpu"][i]) for i in range(self.n)])
        self.high_streak = np.where(risk_raw >= high, self.high_streak + 1, 0)
        self.low_streak = np.where(risk_raw < low, self.low_streak + 1, 0)
        trig = (risk_raw >= high) & ((self.high_streak >= confirm) | burst)

        eff = {r: raw[r] - lent[r] + borrowed[r] for r in RESOURCES}
        risk_eff = np.array([risk_fn(i, eff["prb"][i], eff["cpu"][i]) for i in range(self.n)])

        touched = set()

        # --- time limit: renew only if borrower risk is still high
        for loan in self.loans:
            if self.step_no - loan["ttl_start"] >= ttl and not loan["expiring"]:
                if risk_raw[self.idx[loan["borrower"]]] >= high:
                    loan["ttl_start"] = self.step_no
                    loan["renewals"] += 1
                else:
                    loan["expiring"] = True
                    self.counters["expired"] += 1
                    events.append(self._event("expired", loan, 0.0, f"loan older than {ttl} steps and {loan['borrower']} risk "
                                                                    f"{risk_raw[self.idx[loan['borrower']]]:.2f} < {high:.2f}: not renewed"))

        # --- recall: donor at risk gets its share back in the same step
        for d in range(self.n):
            if risk_eff[d] <= recall:
                continue
            for r in RESOURCES:
                mine = [l for l in self.loans if l["donor"] == self.slices[d] and l["resource"] == r]
                if not mine:
                    continue
                lent_d = sum(l["amount"] for l in mine)
                target = max(prot[r][d], req_pk[d] / self.pk[r])
                amt = min(lent_d, max(0.0, target - (raw[r][d] - lent_d)))
                if amt > EPS:
                    self._reduce(mine, amt, "recalled", events, rank, touched,
                                 f"{self.slices[d].upper()} risk {risk_eff[d]:.2f} > recall {recall:.2f}: needs "
                                 f"{target * self.pool[r]:.1f} {UNIT_NAMES[r]}, has {(raw[r][d] - lent_d) * self.pool[r]:.1f}")

        # --- gradual return once the borrower has been calm long enough (hysteresis)
        if returns_on:
            for loan in self.loans:
                b = self.idx[loan["borrower"]]
                if id(loan) in touched or trig[b]:
                    continue
                if self.low_streak[b] >= rconfirm or loan["expiring"]:
                    give = ramp * loan["amount"]
                    if loan["amount"] - give < MIN_LOAN:
                        give = loan["amount"]
                    loan["amount"] -= give
                    self.low_since.setdefault(id(loan), self.step_no - int(self.low_streak[b]))
                    events.append(self._event("returned", loan, give, f"{loan['borrower'].upper()} risk below {low:.2f} for "
                                                                     f"{int(self.low_streak[b])} steps: returning {ramp:.0%} of remaining"))
                    self.counters["returned_events"] += 1

        # --- donor protected-minimum clip (agent may have shrunk the donor's raw share under an active loan)
        lent, borrowed = self._tally()
        for r in RESOURCES:
            for d in range(self.n):
                limit = min(raw[r][d], prot[r][d])
                excess = limit - (raw[r][d] - lent[r][d])
                if excess > EPS and lent[r][d] > EPS:
                    mine = [l for l in self.loans if l["donor"] == self.slices[d] and l["resource"] == r]
                    self._reduce(mine, min(excess, lent[r][d]), "recalled", events, rank, touched,
                                 f"{self.slices[d].upper()} lendable share fell below its protected minimum "
                                 f"({prot[r][d] * self.pool[r]:.1f} {UNIT_NAMES[r]})")
        self._close_empty(events)

        # --- fund new loans (priority order), bottleneck resource only
        lent, borrowed = self._tally()
        eff = {r: raw[r] - lent[r] + borrowed[r] for r in RESOURCES}
        need: Dict[str, np.ndarray] = {r: np.zeros(self.n) for r in RESOURCES}
        for i in range(self.n):
            if not trig[i]:
                continue
            for r in self._resources_for(i, eff, aware):
                need[r][i] = max(0.0, req_pk[i] / self.pk[r] - eff[r][i])
        borrower_set = {r: {i for i in range(self.n) if need[r][i] > EPS} for r in RESOURCES}
        unfunded = {r: np.zeros(self.n) for r in RESOURCES}
        overload_notes: List[str] = []

        for r in RESOURCES:
            # donors for this resource, lowest risk first, then largest lendable amount
            rem: Dict[int, float] = {}
            order: List[Tuple[float, float, int]] = []
            for j in range(self.n):
                if j in borrower_set[r] or borrowed[r][j] > EPS or risk_eff[j] > recall:
                    continue
                lendable = max(0.0, raw[r][j] - lent[r][j] - prot[r][j])
                if lendable > EPS:
                    rem[j] = lendable
                    order.append((risk_eff[j], -lendable, j))
            order.sort()
            avail = sum(rem.values())
            for i in sorted(borrower_set[r], key=lambda k: rank.get(k, 99)):
                blocked = lent[r][i] > EPS  # a slice that lent this resource cannot borrow it in the same step
                claim = 0.0 if blocked else min(need[r][i], avail)  # what donors can ever cover, priority order
                want = min(claim, maxfrac)                           # how fast it is drawn: capped per step
                funded = 0.0
                for _, _, j in order:
                    if funded >= want - EPS:
                        break
                    take = min(rem[j], want - funded)
                    if take <= EPS:
                        continue
                    self._open_or_enlarge(r, self.slices[j], self.slices[i], take, burst[i], risk_raw[i], events,
                                          f"{self.slices[i].upper()} risk {risk_raw[i]:.2f} >= {high:.2f}: forecast "
                                          f"{fc[i]:.0f}+margin {mg[i]:.0f} pkt/step vs capacity "
                                          f"{eff[r][i] * self.pk[r]:.0f} ({UNIT_NAMES[r]}-limited)")
                    funded += take
                    rem[j] -= take
                    lent[r][j] += take
                    borrowed[r][i] += take
                if need[r][i] - claim > 1e-9:
                    unfunded[r][i] = need[r][i] - claim
                    overload_notes.append(
                        f"Cannot fully fund {self.slices[i].upper()} risk: lendable {avail * self.pool[r]:.1f} "
                        f"{UNIT_NAMES[r]}, need {need[r][i] * self.pool[r]:.1f} {UNIT_NAMES[r]}. Protecting URLLC and mURLLC first."
                        + (" (blocked: slice is lending this resource)" if blocked else ""))
                avail -= claim
        overload = bool(overload_notes)
        if overload:
            self.counters["overload_steps"] += 1
            if not self.prev_overload:
                messages.extend(overload_notes)
        elif self.prev_overload:
            messages.append("Overload cleared: all lending needs are funded.")
        self.prev_overload = overload

        lent, borrowed = self._tally()
        adj = {r: (raw[r] - lent[r] + borrowed[r]).astype(raw[r].dtype) if self.loans else raw[r] for r in RESOURCES}
        risk_after = np.array([risk_fn(i, adj["prb"][i], adj["cpu"][i]) for i in range(self.n)])
        return self._finish(raw, adj, lent, borrowed, events, messages, history, risk_after, mode, risk_raw, req_pk,
                            unfunded, overload, lc)

    # ----------------------------------------------------------------- helpers
    def _tally(self) -> Tuple[Dict[str, np.ndarray], Dict[str, np.ndarray]]:
        lent = {r: np.zeros(self.n) for r in RESOURCES}
        borrowed = {r: np.zeros(self.n) for r in RESOURCES}
        for l in self.loans:
            lent[l["resource"]][self.idx[l["donor"]]] += l["amount"]
            borrowed[l["resource"]][self.idx[l["borrower"]]] += l["amount"]
        return lent, borrowed

    def _resources_for(self, i: int, eff: Dict[str, np.ndarray], aware: bool) -> List[str]:
        """Which resources a borrower may receive. Not bottleneck-aware means radio-only (ablation)."""
        if not aware:
            return ["prb"]
        radio, cpu = eff["prb"][i] * self.pk["prb"], eff["cpu"][i] * self.pk["cpu"]
        if abs(radio - cpu) <= BOTTLENECK_TOL * max(radio, cpu, 1e-12):
            return ["prb", "cpu"]
        return ["prb"] if radio < cpu else ["cpu"]

    def _event(self, kind: str, loan: Dict[str, Any], amount: float, reason: str) -> Dict[str, Any]:
        ev = {"kind": kind, "step": self.step_no, "loan_id": loan["id"], "resource": loan["resource"],
              "donor": loan["donor"], "borrower": loan["borrower"], "amount": float(amount),
              "amount_units": float(amount * self.pool[loan["resource"]]), "remaining": float(loan["amount"]),
              "reason": reason}
        self.ledger.append(ev)
        del self.ledger[:-LEDGER_CAP]
        return ev

    def _reduce(self, loans: List[Dict[str, Any]], amount: float, kind: str, events: List[Dict[str, Any]],
                rank: Dict[int, int], touched: set, reason: str) -> None:
        """Take `amount` back from a donor's loans, lowest-priority borrower first."""
        for l in sorted(loans, key=lambda x: -rank.get(self.idx[x["borrower"]], 99)):
            if amount <= EPS:
                break
            cut = min(l["amount"], amount)
            if cut <= EPS:
                continue
            l["amount"] -= cut
            amount -= cut
            touched.add(id(l))
            if kind == "recalled":
                self.counters["recalls"] += 1
                l["recalled"] = True
            events.append(self._event(kind, l, cut, reason))

    def _close_empty(self, events: List[Dict[str, Any]]) -> None:
        keep = []
        for l in self.loans:
            if l["amount"] <= EPS:
                since = self.low_since.pop(id(l), None)
                self.closed.append({"duration": self.step_no - l["opened_step"], "peak": l["peak"],
                                    "return_lag": (self.step_no - since) if since is not None else None,
                                    "recalled": l.get("recalled", False)})
            else:
                keep.append(l)
        self.loans = keep

    def _open_or_enlarge(self, r: str, donor: str, borrower: str, amount: float, burst: bool, risk: float,
                         events: List[Dict[str, Any]], reason: str) -> None:
        for l in self.loans:
            if l["resource"] == r and l["donor"] == donor and l["borrower"] == borrower:
                l["amount"] += amount
                l["peak"] = max(l["peak"], l["amount"])
                l["expiring"] = False
                l["ttl_start"] = self.step_no
                self.counters["enlarged"] += 1
                events.append(self._event("enlarged", l, amount, reason))
                return
        loan = {"id": self.next_id, "resource": r, "donor": donor, "borrower": borrower, "amount": amount, "peak": amount,
                "opened_step": self.step_no, "ttl_start": self.step_no, "reason_code": "burst_detected" if burst else
                ("reactive_violation" if self.cfg["lending"]["mode"] == "reactive" else "predicted_risk"),
                "risk_at_open": float(risk), "expiring": False, "renewals": 0}
        self.next_id += 1
        self.loans.append(loan)
        self.counters["opened"] += 1
        events.append(self._event("opened", loan, amount, reason))

    def _finish(self, raw, adj, lent, borrowed, events, messages, history, risk_after, mode, risk_raw, req_pk,
                unfunded, overload, lc):
        if events:  # closing happens after events are produced so durations include the final step
            self._close_empty(events)
        lent_d = lent if isinstance(lent, dict) else {r: np.zeros(self.n) for r in RESOURCES}
        bor_d = borrowed if isinstance(borrowed, dict) else {r: np.zeros(self.n) for r in RESOURCES}
        loans_out = []
        for l in self.loans:
            loans_out.append({**{k: l[k] for k in ("id", "resource", "donor", "borrower", "amount", "opened_step",
                                                   "reason_code", "risk_at_open", "renewals")},
                              "amount_units": l["amount"] * self.pool[l["resource"]],
                              "ttl": max(0, int(lc["ttl_steps"]) - (self.step_no - l["ttl_start"])),
                              "expiring": l["expiring"]})
        zeros = [0.0] * self.n
        if history is not None and mode != "off":
            fc = [float(history[s]["forecast"]) for s in self.slices]
            mgn = [float(history[s]["margin"]) for s in self.slices]
            cap = [min(adj["prb"][i] * self.pk["prb"], adj["cpu"][i] * self.pk["cpu"]) for i in range(self.n)]
            head = [float(cap[i] - float(req_pk[i])) for i in range(self.n)]
            warm = any(bool(history[s].get("warming_up", False)) for s in self.slices)
            risk_l = [float(x) for x in risk_raw]
            risk_a = [float(x) for x in risk_after] if risk_after is not None else risk_l
        else:
            fc = mgn = head = zeros
            warm, risk_l, risk_a = False, zeros, zeros
        info = {
            "mode": mode, "risk": risk_l, "risk_after": risk_a, "forecast": fc, "margin": mgn, "headroom": head,
            "warming_up": warm, "loans_active": loans_out, "loans_events": events, "messages": messages,
            "lent": {r: [float(x) for x in lent_d[r]] for r in RESOURCES},
            "borrowed": {r: [float(x) for x in bor_d[r]] for r in RESOURCES},
            "overload": bool(overload),
            "unfunded": {r: [float(x * self.pool[r]) for x in unfunded[r]] for r in RESOURCES},
            "unfunded_share": {r: [float(x) for x in unfunded[r]] for r in RESOURCES},
            "pipeline": {"raw": {r: [float(x) for x in raw[r]] for r in RESOURCES},
                         "post_lender": {r: [float(x) for x in adj[r]] for r in RESOURCES}, "final": None},
        }
        return adj["prb"], adj["cpu"], loans_out, info


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / np.sum(e)


class EnhancedPolicy:
    """Agent + Lender + Shield, same call shape as evaluate.PolicyWrapper: predict(obs, info, cfg) -> action."""

    def __init__(self, model: Any, cfg: Dict[str, Any]) -> None:
        self.model = model
        self.cfg = cfg
        self.lender = Lender(cfg)
        self.last_info: Optional[Dict[str, Any]] = None
        self.last_shield_active = False
        self.last_raw: Optional[Dict[str, List[float]]] = None  # the agent's own proposal, before the lender

    def predict(self, obs: np.ndarray, info: Dict[str, Any], cfg: Optional[Dict[str, Any]] = None) -> np.ndarray:
        from shield import apply_shield, shares_to_action_logits  # the existing shield, applied last
        cfg = cfg or self.cfg
        if info is not None and info.get("step", 1) == 0:
            self.lender.reset()  # new episode
        action, _ = self.model.predict(obs, deterministic=True)
        raw_prb, raw_cpu = _softmax(action[:3]), _softmax(action[3:])
        adj_prb, adj_cpu, _, linfo = self.lender.step(info, raw_prb, raw_cpu)
        recent_load = {"embb": float(obs[1]), "urllc": float(obs[5]), "murllc": float(obs[9])}
        sh_prb, sh_cpu, shield_active = apply_shield(adj_prb, adj_cpu, recent_load, cfg)
        linfo["pipeline"]["final"] = {"prb": [float(x) for x in sh_prb], "cpu": [float(x) for x in sh_cpu]}
        linfo["risk_final"] = self.lender.risk_at_shares(sh_prb, sh_cpu)
        self.last_shield_active = bool(shield_active)
        self.last_raw = {"prb": [float(x) for x in raw_prb], "cpu": [float(x) for x in raw_cpu]}
        self.last_info = linfo
        return shares_to_action_logits(sh_prb, sh_cpu)
