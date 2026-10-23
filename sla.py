"""SLA Evaluation and Monitoring Module (sla.py).

Single source of truth for 5G network slicing Service Level Agreements (SLAs).
Pure functions, zero global state, laptop-friendly, and fully deterministic.
All SLA targets, thresholds, and window parameters are dynamically loaded from configuration.
"""

from typing import Any, Dict, List, Optional
import os
import yaml


def load_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """Load configuration dictionary safely."""
    if not os.path.exists(config_path):
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _get_sla_cfg(cfg: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Extract SLA configuration section, falling back to config.yaml if needed."""
    if cfg is None:
        cfg = load_config()
    if "sla" not in cfg:
        cfg = load_config()
    return cfg["sla"]


def is_feasible(arrivals_total: float, capacity_total: float, cfg: Optional[Dict[str, Any]] = None) -> bool:
    """Determine if total offered load is within feasible capacity threshold.
    
    If offered load exceeds feasible_load_fraction of total capacity,
    the scenario is flagged as overload/infeasible.
    """
    if capacity_total <= 0.0:
        return False
    sla_cfg = _get_sla_cfg(cfg)
    fraction = float(sla_cfg["feasible_load_fraction"])
    return bool(float(arrivals_total) <= fraction * float(capacity_total))


def get_status_level(value: float, limit: float, amber_fraction: float, higher_is_better: bool = False) -> str:
    """Classify metric value into 'ok', 'amber', or 'breach' based on limit threshold."""
    if higher_is_better:
        if value >= limit:
            return "ok"
        elif value >= limit * amber_fraction:
            return "amber"
        else:
            return "breach"
    else:
        if value < amber_fraction * limit:
            return "ok"
        elif value <= limit:
            return "amber"
        else:
            return "breach"


def window_status(
    history: List[Dict[str, Any]],
    slice_name: str,
    cfg: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute SLA status over the most recent evaluation window.
    
    Returns a dictionary with:
      - 'status': 'ok' | 'amber' | 'breach'
      - 'value': calculated metric value over window
      - 'limit': SLA target threshold
      - 'metric': metric name
    """
    sla_cfg = _get_sla_cfg(cfg)
    window_steps = int(sla_cfg["window_steps"])
    amber_frac = float(sla_cfg["amber_fraction"])
    slice_key = slice_name.lower()

    if not history:
        if slice_key == "embb":
            lim = float(sla_cfg["embb"]["min_served_ratio"])
            return {"status": "ok", "value": 1.0, "limit": lim, "metric": "served_ratio"}
        elif slice_key == "urllc":
            lim = float(sla_cfg["urllc"]["max_window_violation"])
            return {"status": "ok", "value": 0.0, "limit": lim, "metric": "violation_rate"}
        elif slice_key == "murllc":
            lim = float(sla_cfg["murllc"]["max_window_violation"])
            return {"status": "ok", "value": 0.0, "limit": lim, "metric": "violation_rate"}
        else:
            return {"status": "ok", "value": 0.0, "limit": 0.0, "metric": "unknown"}

    recent = history[-window_steps:]

    if slice_key == "urllc":
        limit = float(sla_cfg["urllc"]["max_window_violation"])
        total_arr = sum(float(step.get("arrivals", {}).get("urllc", 0.0)) for step in recent)
        total_viol = sum(float(step.get("violations", {}).get("urllc", 0.0)) for step in recent)
        val = (total_viol / total_arr) if total_arr > 0.0 else 0.0
        status = get_status_level(val, limit, amber_fraction=amber_frac, higher_is_better=False)
        return {"status": status, "value": float(val), "limit": limit, "metric": "violation_rate"}

    elif slice_key == "murllc":
        limit = float(sla_cfg["murllc"]["max_window_violation"])
        total_arr = sum(float(step.get("arrivals", {}).get("murllc", 0.0)) for step in recent)
        total_viol = sum(float(step.get("violations", {}).get("murllc", 0.0)) for step in recent)
        val = (total_viol / total_arr) if total_arr > 0.0 else 0.0
        status = get_status_level(val, limit, amber_fraction=amber_frac, higher_is_better=False)
        return {"status": status, "value": float(val), "limit": limit, "metric": "violation_rate"}

    elif slice_key == "embb":
        limit = float(sla_cfg["embb"]["min_served_ratio"])
        total_served = sum(float(step.get("throughput", {}).get("embb", 0.0)) for step in recent)
        total_offered = sum(
            float(step.get("arrivals", {}).get("embb", 0.0)) + float(step.get("queue", {}).get("embb", 0.0))
            for step in recent
        )
        val = (total_served / total_offered) if total_offered > 0.0 else 1.0
        status = get_status_level(val, limit, amber_fraction=amber_frac, higher_is_better=True)
        return {"status": status, "value": float(val), "limit": limit, "metric": "served_ratio"}

    else:
        raise ValueError(f"Unknown slice: {slice_name}")


def episode_status(
    history: List[Dict[str, Any]],
    cfg: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, Any]]:
    """Compute per-slice SLA compliance over the full episode history.
    
    Returns a dictionary keyed by slice name with:
      - 'metric': calculated metric value
      - 'limit': SLA target
      - 'met': bool indicating whether the SLA was satisfied
      - 'margin': positive means compliant margin, negative means breach
      - 'status': 'ok' | 'amber' | 'breach'
    """
    sla_cfg = _get_sla_cfg(cfg)
    amber_frac = float(sla_cfg["amber_fraction"])

    res: Dict[str, Dict[str, Any]] = {}

    # 1. URLLC
    urllc_lim = float(sla_cfg["urllc"]["max_violation_rate"])
    urllc_arr = sum(float(step.get("arrivals", {}).get("urllc", 0.0)) for step in history)
    urllc_viol = sum(float(step.get("violations", {}).get("urllc", 0.0)) for step in history)
    urllc_metric = (urllc_viol / urllc_arr) if urllc_arr > 0.0 else 0.0
    urllc_met = bool(urllc_metric <= urllc_lim)
    urllc_margin = float(urllc_lim - urllc_metric)
    urllc_status = get_status_level(urllc_metric, urllc_lim, amber_fraction=amber_frac, higher_is_better=False)
    res["urllc"] = {
        "metric": float(urllc_metric),
        "limit": urllc_lim,
        "met": urllc_met,
        "margin": urllc_margin,
        "status": urllc_status,
    }

    # 2. mURLLC
    murllc_lim = float(sla_cfg["murllc"]["max_violation_rate"])
    murllc_arr = sum(float(step.get("arrivals", {}).get("murllc", 0.0)) for step in history)
    murllc_viol = sum(float(step.get("violations", {}).get("murllc", 0.0)) for step in history)
    murllc_metric = (murllc_viol / murllc_arr) if murllc_arr > 0.0 else 0.0
    murllc_met = bool(murllc_metric <= murllc_lim)
    murllc_margin = float(murllc_lim - murllc_metric)
    murllc_status = get_status_level(murllc_metric, murllc_lim, amber_fraction=amber_frac, higher_is_better=False)
    res["murllc"] = {
        "metric": float(murllc_metric),
        "limit": murllc_lim,
        "met": murllc_met,
        "margin": murllc_margin,
        "status": murllc_status,
    }

    # 3. eMBB
    embb_lim = float(sla_cfg["embb"]["min_served_ratio"])
    embb_served = sum(float(step.get("throughput", {}).get("embb", 0.0)) for step in history)
    embb_offered = sum(
        float(step.get("arrivals", {}).get("embb", 0.0)) + float(step.get("queue", {}).get("embb", 0.0))
        for step in history
    )
    embb_metric = (embb_served / embb_offered) if embb_offered > 0.0 else 1.0
    embb_met = bool(embb_metric >= embb_lim)
    embb_margin = float(embb_metric - embb_lim)
    embb_status = get_status_level(embb_metric, embb_lim, amber_fraction=amber_frac, higher_is_better=True)
    res["embb"] = {
        "metric": float(embb_metric),
        "limit": embb_lim,
        "met": embb_met,
        "margin": embb_margin,
        "status": embb_status,
    }

    return res


def sla_compliance_rate(
    histories: List[List[Dict[str, Any]]],
    cfg: Optional[Dict[str, Any]] = None,
    slice_name: Optional[str] = None,
) -> float:
    """Calculate fraction of evaluation windows satisfying SLA targets across episodes."""
    sla_cfg = _get_sla_cfg(cfg)
    window_steps = int(sla_cfg["window_steps"])

    total_windows = 0
    compliant_windows = 0

    for history in histories:
        if len(history) < window_steps:
            continue
        num_windows = len(history) // window_steps
        for w_idx in range(num_windows):
            window = history[w_idx * window_steps : (w_idx + 1) * window_steps]
            total_windows += 1

            if slice_name is not None:
                stat = window_status(window, slice_name, cfg=cfg)
                if stat["status"] != "breach":
                    compliant_windows += 1
            else:
                u_stat = window_status(window, "urllc", cfg=cfg)
                m_stat = window_status(window, "murllc", cfg=cfg)
                e_stat = window_status(window, "embb", cfg=cfg)
                if (
                    u_stat["status"] != "breach"
                    and m_stat["status"] != "breach"
                    and e_stat["status"] != "breach"
                ):
                    compliant_windows += 1

    if total_windows == 0:
        return 1.0
    return float(compliant_windows / total_windows)
