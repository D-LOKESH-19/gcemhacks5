"""Allocation Engine (Section 14.5) for 5G SliceOS.

Provides pure functions to compute:
- Integer counts using the largest-remainder method
- Capacity and utilization per slice
- Effective capacity and bottleneck identification
- Resource transfer ledger matching deltas
- Allocation block generation for policies
"""

import math
from typing import List, Dict, Any, Tuple, Optional


SLICES = ["embb", "urllc", "murllc"]


def largest_remainder_counts(shares: List[float], total: int) -> List[int]:
    """Compute integer unit counts summing exactly to total using largest-remainder method.
    
    Ties break in fixed slice order: eMBB, URLLC, mURLLC.
    Guarantees every count is at least floor(shares[i] * total).
    """
    if total <= 0:
        return [0, 0, 0]
    
    # 1. Base floor allocation
    floors = [int(math.floor(s * total)) for s in shares]
    allocated = sum(floors)
    remainder = total - allocated
    
    # 2. Fractional remainders
    # Maintain original index to preserve fixed tie-breaking order (eMBB < URLLC < mURLLC)
    fractions = [(shares[i] * total - floors[i], i) for i in range(len(shares))]
    # Sort descending by fraction; on tie, smaller index i comes first (-i is not used, stable sort keeps i ascending)
    fractions.sort(key=lambda x: x[0], reverse=True)
    
    counts = list(floors)
    for k in range(min(remainder, len(counts))):
        idx = fractions[k][1]
        counts[idx] += 1
        
    return counts


def compute_capacity_and_util(
    shares: List[float],
    total_units: int,
    unit_rate: float,
    demand: List[float],
) -> Tuple[List[float], List[float]]:
    """Compute capacity (packets/step) and utilization per slice.
    
    capacity = shares[i] * total_units * unit_rate
    util = min(demand[i] / capacity[i], 1.5)
    """
    capacities = []
    utils = []
    for i in range(len(shares)):
        cap = float(shares[i] * total_units * unit_rate)
        capacities.append(cap)
        if cap <= 1e-6:
            u = 1.5 if demand[i] > 0 else 0.0
        else:
            u = min(demand[i] / cap, 1.5)
        utils.append(round(float(u), 4))
    return capacities, utils


def determine_bottleneck(
    demand: float,
    effective_capacity: float,
    radio_cap: float,
    compute_cap: float,
) -> str:
    """Identify bottleneck tag for a slice: 'idle' | 'none' | 'both' | 'radio' | 'compute'."""
    if demand <= 1e-4:
        return "idle"
    if demand <= 0.90 * effective_capacity:
        return "none"
    
    # When demand > 90% of effective capacity, check which resource limits
    max_cap = max(radio_cap, compute_cap, 1e-6)
    if abs(radio_cap - compute_cap) / max_cap <= 0.05:
        return "both"
    elif radio_cap < compute_cap:
        return "radio"
    else:
        return "compute"


def compute_transfers(
    resource_name: str,
    prev_counts: List[int],
    curr_counts: List[int],
    donor_utils: List[float],
    receiver_utils: List[float],
    shield_changed: bool = False,
    spike_active: Optional[Dict[str, bool]] = None,
    load_deltas: Optional[List[float]] = None,
) -> List[Dict[str, Any]]:
    """Compute resource transfer list from integer count deltas.
    
    Matches largest donor to largest receiver repeatedly until all deltas are used.
    Net change is strictly zero.
    """
    spike_active = spike_active or {s: False for s in SLICES}
    load_deltas = load_deltas or [0.0, 0.0, 0.0]
    
    deltas = [curr_counts[i] - prev_counts[i] for i in range(len(SLICES))]
    
    # Donors (decreased units, negative delta)
    donors = []
    # Receivers (increased units, positive delta)
    receivers = []
    
    for i, d in enumerate(deltas):
        if d < 0:
            donors.append({"idx": i, "slice": SLICES[i], "amount": -d})
        elif d > 0:
            receivers.append({"idx": i, "slice": SLICES[i], "amount": d})
            
    # Sort donors and receivers descending by amount
    donors.sort(key=lambda x: x["amount"], reverse=True)
    receivers.sort(key=lambda x: x["amount"], reverse=True)
    
    transfers = []
    d_ptr = 0
    r_ptr = 0
    
    while d_ptr < len(donors) and r_ptr < len(receivers):
        donor = donors[d_ptr]
        recv = receivers[r_ptr]
        
        transfer_amt = min(donor["amount"], recv["amount"])
        if transfer_amt > 0:
            # Determine reason code
            d_idx = donor["idx"]
            r_idx = recv["idx"]
            r_slice = recv["slice"]
            
            d_util = donor_utils[d_idx]
            r_util = receiver_utils[r_idx]
            
            if d_util < 0.40 and r_util > 0.80:
                reason = "idle_harvest"
            elif shield_changed and r_slice in ["urllc", "murllc"]:
                reason = "floor_restore"
            elif spike_active.get(r_slice, False) or load_deltas[r_idx] > 0.25:
                reason = "surge"
            else:
                reason = "rebalance"
                
            transfers.append({
                "resource": resource_name,
                "from": donor["slice"],
                "to": recv["slice"],
                "amount": int(transfer_amt),
                "reason_code": reason,
                "donor_util": round(float(d_util), 3),
                "receiver_util": round(float(r_util), 3),
            })
            
            donor["amount"] -= transfer_amt
            recv["amount"] -= transfer_amt
            
        if donor["amount"] == 0:
            d_ptr += 1
        if recv["amount"] == 0:
            r_ptr += 1
            
    return transfers


def build_allocation_block(
    policy_name: str,
    raw_prb: List[float],
    final_prb: List[float],
    prev_prb: List[float],
    raw_cpu: List[float],
    final_cpu: List[float],
    prev_cpu: List[float],
    prev_prb_counts: List[int],
    prev_cpu_counts: List[int],
    demand: List[float],
    cfg: Dict[str, Any],
    shield_changed: bool = False,
    shield_delta_pct: Optional[List[float]] = None,
    spike_active: Optional[Dict[str, bool]] = None,
    load_deltas: Optional[List[float]] = None,
) -> Dict[str, Any]:
    """Build the complete allocation block for a policy according to Section 14.5."""
    prb_total = int(cfg.get("prb_total", 100))
    vcpu_total = int(cfg.get("vcpu_total", 8))
    prb_rate = float(cfg.get("prb_rate", 12.0))
    cpu_rate = float(cfg.get("cpu_rate", 150.0))
    
    # Minimum floors
    shield_cfg = cfg.get("shield", {})
    floor_prb = [
        0.0,
        float(shield_cfg.get("min_share_urllc", 0.15)),
        float(shield_cfg.get("min_share_murllc", 0.15)),
    ]
    floor_cpu = list(floor_prb)
    
    # Counts via largest remainder
    counts_prb = largest_remainder_counts(final_prb, prb_total)
    counts_cpu = largest_remainder_counts(final_cpu, vcpu_total)
    
    # Capacities and utils
    cap_prb, util_prb = compute_capacity_and_util(final_prb, prb_total, prb_rate, demand)
    cap_cpu, util_cpu = compute_capacity_and_util(final_cpu, vcpu_total, cpu_rate, demand)
    
    # Effective capacity & bottlenecks
    effective_cap = [min(cap_prb[i], cap_cpu[i]) for i in range(3)]
    bottlenecks = [
        determine_bottleneck(demand[i], effective_cap[i], cap_prb[i], cap_cpu[i])
        for i in range(3)
    ]
    
    # Transfers
    transfers_prb = compute_transfers(
        resource_name="prb",
        prev_counts=prev_prb_counts,
        curr_counts=counts_prb,
        donor_utils=util_prb,
        receiver_utils=util_prb,
        shield_changed=shield_changed,
        spike_active=spike_active,
        load_deltas=load_deltas,
    )
    transfers_cpu = compute_transfers(
        resource_name="cpu",
        prev_counts=prev_cpu_counts,
        curr_counts=counts_cpu,
        donor_utils=util_cpu,
        receiver_utils=util_cpu,
        shield_changed=shield_changed,
        spike_active=spike_active,
        load_deltas=load_deltas,
    )
    all_transfers = transfers_prb + transfers_cpu
    
    if shield_delta_pct is None:
        shield_delta_pct = [round(abs(final_prb[i] - raw_prb[i]) * 100.0, 2) for i in range(3)]
        
    return {
        "prb": {
            "raw": [round(float(x), 4) for x in raw_prb],
            "final": [round(float(x), 4) for x in final_prb],
            "prev": [round(float(x), 4) for x in prev_prb],
            "counts": counts_prb,
            "capacity": [round(float(x), 1) for x in cap_prb],
            "util": util_prb,
            "floor": floor_prb,
        },
        "cpu": {
            "raw": [round(float(x), 4) for x in raw_cpu],
            "final": [round(float(x), 4) for x in final_cpu],
            "prev": [round(float(x), 4) for x in prev_cpu],
            "counts": counts_cpu,
            "capacity": [round(float(x), 1) for x in cap_cpu],
            "util": util_cpu,
            "floor": floor_cpu,
        },
        "effective_capacity": [round(float(x), 1) for x in effective_cap],
        "bottleneck": bottlenecks,
        "shield": {
            "changed": bool(shield_changed),
            "delta_pct": shield_delta_pct,
        },
        "transfers": all_transfers,
    }
