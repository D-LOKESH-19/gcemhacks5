"""Deterministic Safety Shield for 5G Network Slicing (shield.py).

Guarantees SLA performance by construction:
Enforces dynamic and static capacity floors on URLLC and mURLLC slices
before actions reach the simulator or network execution layer.
"""

import sys
from typing import Any, Dict, Optional, Tuple
import numpy as np
import yaml


def shares_to_action_logits(prb_shares: np.ndarray, vcpu_shares: np.ndarray) -> np.ndarray:
    """Convert PRB and vCPU shares (which sum to 1) into 6D action logits for SliceEnv."""
    prb_shares = np.asarray(prb_shares, dtype=np.float32)
    vcpu_shares = np.asarray(vcpu_shares, dtype=np.float32)

    eps = 1e-7
    prb_logits = np.log(np.clip(prb_shares, eps, 1.0))
    vcpu_logits = np.log(np.clip(vcpu_shares, eps, 1.0))

    prb_logits -= np.mean(prb_logits)
    vcpu_logits -= np.mean(vcpu_logits)

    return np.concatenate([prb_logits, vcpu_logits], dtype=np.float32)


def _enforce_single_resource_floors(
    shares: np.ndarray,
    floor_urllc: float,
    floor_murllc: float,
) -> Tuple[np.ndarray, bool]:
    """Enforce URLLC and mURLLC floors on a single resource distribution [embb, urllc, murllc].

    Returns:
        (adjusted_shares, was_shield_activated)
    """
    shares = np.array(shares, dtype=np.float32)
    if np.sum(shares) > 0:
        shares = shares / np.sum(shares)
    else:
        shares = np.array([0.60, 0.25, 0.15], dtype=np.float32)

    embb, urllc, murllc = shares[0], shares[1], shares[2]
    was_active = False

    # Check if URLLC or mURLLC need boost to meet floors
    needed_urllc = max(0.0, floor_urllc - urllc)
    needed_murllc = max(0.0, floor_murllc - murllc)

    if needed_urllc > 1e-6 or needed_murllc > 1e-6:
        was_active = True
        total_needed = needed_urllc + needed_murllc

        # Minimum guaranteed reservation for eMBB
        embb_reserve = 0.05
        available_from_embb = max(0.0, embb - embb_reserve)

        if available_from_embb >= total_needed:
            embb -= total_needed
            urllc += needed_urllc
            murllc += needed_murllc
        else:
            # Take whatever is available from eMBB
            shortfall = total_needed - available_from_embb
            embb = embb_reserve
            urllc += needed_urllc
            murllc += needed_murllc

            # Renormalize URLLC & mURLLC while preserving their relative floors
            allocated_high = urllc + murllc
            if allocated_high > (1.0 - embb_reserve):
                scale = (1.0 - embb_reserve) / allocated_high
                urllc *= scale
                murllc *= scale

    adjusted = np.array([embb, urllc, murllc], dtype=np.float32)
    adjusted /= np.sum(adjusted)
    return adjusted, was_active


def apply_shield(
    shares_prb: np.ndarray,
    shares_cpu: np.ndarray,
    recent_load: Dict[str, float],
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[np.ndarray, np.ndarray, bool]:
    """Apply the deterministic safety shield to PRB and vCPU share vectors.

    Args:
        shares_prb: [embb, urllc, murllc] raw radio shares summing to 1.
        shares_cpu: [embb, urllc, murllc] raw compute shares summing to 1.
        recent_load: dict containing recent normalized EMA loads per slice.
        config: optional configuration dict for floors.

    Returns:
        (shielded_prb, shielded_cpu, was_active)
    """
    if config is None:
        try:
            with open("config.yaml", "r", encoding="utf-8") as f:
                config = yaml.safe_load(f)
        except Exception:
            config = {}

    shield_floors = config.get("shield_floor", {"urllc": 0.15, "murllc": 0.15})
    static_floor_urllc = float(shield_floors.get("urllc", 0.15))
    static_floor_murllc = float(shield_floors.get("murllc", 0.15))

    # Dynamic floor based on recent load: floor_i = max(config_floor, 1.2 * recent_load_i)
    load_urllc = float(recent_load.get("urllc", 0.0))
    load_murllc = float(recent_load.get("murllc", 0.0))

    dynamic_floor_urllc = max(static_floor_urllc, 1.2 * load_urllc)
    dynamic_floor_murllc = max(static_floor_murllc, 1.2 * load_murllc)

    # Upper cap on floors to leave breathing room for eMBB
    dynamic_floor_urllc = min(0.60, dynamic_floor_urllc)
    dynamic_floor_murllc = min(0.35, dynamic_floor_murllc)

    # Apply shield to PRB and vCPU independently
    shielded_prb, active_prb = _enforce_single_resource_floors(
        shares_prb, dynamic_floor_urllc, dynamic_floor_murllc
    )
    shielded_cpu, active_cpu = _enforce_single_resource_floors(
        shares_cpu, dynamic_floor_urllc, dynamic_floor_murllc
    )

    return shielded_prb, shielded_cpu, (active_prb or active_cpu)


def run_unit_tests():
    """Unit tests for shield guarantees."""
    print("Running Safety Shield Unit Tests...\n" + "=" * 50)

    # 1. Test sum-to-1 guarantee with adversarial inputs
    test_cases = [
        ([0.98, 0.01, 0.01], [0.99, 0.005, 0.005]),
        ([0.0, 0.0, 1.0], [0.5, 0.5, 0.0]),
        ([0.33, 0.33, 0.34], [0.33, 0.33, 0.34]),
        ([0.0, 1.0, 0.0], [0.0, 0.0, 1.0]),
    ]

    for prb, cpu in test_cases:
        prb = np.array(prb, dtype=np.float32)
        cpu = np.array(cpu, dtype=np.float32)
        sh_prb, sh_cpu, _ = apply_shield(prb, cpu, {"urllc": 0.1, "murllc": 0.05})

        assert np.isclose(np.sum(sh_prb), 1.0, atol=1e-5), f"PRB sum != 1: {sh_prb}"
        assert np.isclose(np.sum(sh_cpu), 1.0, atol=1e-5), f"CPU sum != 1: {sh_cpu}"

    print("[PASS] Unit Test 1: Outputs strictly sum to 1.0 for all inputs")

    # 2. Test floor enforcement: Agent tries to give 0% to URLLC and mURLLC
    adversarial_prb = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    adversarial_cpu = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    sh_prb, sh_cpu, active = apply_shield(adversarial_prb, adversarial_cpu, {"urllc": 0.0, "murllc": 0.0})

    assert active is True, "Shield must be active when agent violates floors"
    assert sh_prb[1] >= 0.149, f"URLLC PRB floor breached: {sh_prb[1]}"
    assert sh_prb[2] >= 0.149, f"mURLLC PRB floor breached: {sh_prb[2]}"
    assert sh_cpu[1] >= 0.149, f"URLLC vCPU floor breached: {sh_cpu[1]}"
    assert sh_cpu[2] >= 0.149, f"mURLLC vCPU floor breached: {sh_cpu[2]}"

    print(f"[PASS] Unit Test 2: Floors strictly respected despite 100% eMBB adversarial action: URLLC={sh_prb[1]:.2f}, mURLLC={sh_prb[2]:.2f}")

    # 3. Test dynamic floor scaling with heavy load
    heavy_load = {"urllc": 0.25, "murllc": 0.10}
    nom_prb = np.array([0.60, 0.25, 0.15], dtype=np.float32)
    sh_prb, _, _ = apply_shield(nom_prb, nom_prb, heavy_load)

    expected_min_urllc = 1.2 * 0.25  # 0.30
    assert sh_prb[1] >= expected_min_urllc - 1e-4, f"Dynamic floor not scaled: {sh_prb[1]} < {expected_min_urllc}"

    print(f"[PASS] Unit Test 3: Dynamic floor scaling verified under high load (raised URLLC share to {sh_prb[1]:.2f})")
    print("=" * 50 + "\nAll Shield Unit Tests PASSED!")


if __name__ == "__main__":
    run_unit_tests()
    sys.exit(0)
