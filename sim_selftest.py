"""Self-test verification for the 5G Slice Simulator (sim.py).

Acceptance checks:
(a) Shares always sum to 1 (both PRB and vCPU).
(b) With static 60/25/15 split and eMBB spike, eMBB drops packets while URLLC stays idle.
(c) Reducing vCPU share to near zero collapses served throughput even with full PRB share (radio+compute coupling).
(d) Identical seeds produce identical traffic arrival sequences.
(e) Spikes on URLLC/mURLLC cause violations under Static policy.
"""

import sys
import numpy as np
from sim import SliceEnv


def get_static_logits(shares: list) -> np.ndarray:
    """Convert desired shares to softmax logits."""
    return np.log(np.array(shares, dtype=np.float32) + 1e-8)


def test_shares_sum_to_one():
    """Test (a): Generated PRB and vCPU shares always sum to 1.0."""
    env = SliceEnv()
    env.reset(seed=123)

    for _ in range(20):
        random_action = np.random.uniform(-1.0, 1.0, size=(6,)).astype(np.float32)
        _, _, _, _, info = env.step(random_action)
        prb_sum = sum(info["shares"]["prb"].values())
        vcpu_sum = sum(info["shares"]["vcpu"].values())

        assert np.isclose(prb_sum, 1.0, atol=1e-5), f"PRB shares sum to {prb_sum}, expected 1.0"
        assert np.isclose(vcpu_sum, 1.0, atol=1e-5), f"vCPU shares sum to {vcpu_sum}, expected 1.0"

    print("[PASS] Test (a): Shares always sum to 1.0")


def test_embb_spike_static_failure():
    """Test (b): Static 60/25/15 split drops eMBB packets during surge while URLLC stays idle."""
    env = SliceEnv()
    env.reset(seed=42)

    # Static 60/25/15 split logits
    static_prb_logits = get_static_logits([0.60, 0.25, 0.15])
    static_vcpu_logits = get_static_logits([0.60, 0.25, 0.15])
    static_action = np.concatenate([static_prb_logits, static_vcpu_logits])

    # Trigger strong eMBB surge for 25 steps
    env.set_spike("embb", factor=3.0, duration_steps=25)

    total_embb_dropped = 0.0
    urllc_served_sum = 0.0
    urllc_cap_sum = 0.0

    for _ in range(50):
        _, _, _, _, info = env.step(static_action)
        total_embb_dropped += info["violations"]["embb"]
        urllc_served_sum += info["throughput"]["urllc"]
        urllc_cap_sum += info["shares"]["prb"]["urllc"] * env.prb_total * env.prb_rate

    urllc_utilization = urllc_served_sum / max(1.0, urllc_cap_sum)

    assert total_embb_dropped > 0, "eMBB should have dropped packets during severe surge under static split"
    assert urllc_utilization < 0.25, f"URLLC should remain mostly idle, got utilization {urllc_utilization:.2f}"

    print(f"[PASS] Test (b): Static 60/25/15 dropped {total_embb_dropped:.0f} eMBB packets, URLLC utilization was only {urllc_utilization*100:.1f}%")


def test_radio_compute_coupling():
    """Test (c): Reducing vCPU share to near zero bottlenecks served throughput despite 98% PRB share."""
    env = SliceEnv()
    env.reset(seed=10)

    # 98% PRB to eMBB, but only 1% vCPU to eMBB
    prb_logits = get_static_logits([0.98, 0.01, 0.01])
    vcpu_logits = get_static_logits([0.01, 0.50, 0.49])
    bottleneck_action = np.concatenate([prb_logits, vcpu_logits])

    _, _, _, _, info = env.step(bottleneck_action)
    embb_served = info["throughput"]["embb"]
    embb_prb_cap = info["shares"]["prb"]["embb"] * env.prb_total * env.prb_rate
    embb_cpu_cap = info["shares"]["vcpu"]["embb"] * env.vcpu_total * env.cpu_rate

    assert embb_served <= embb_cpu_cap + 1.0, f"Served ({embb_served}) exceeded compute cap ({embb_cpu_cap})"
    assert embb_prb_cap > 1000.0, f"Radio capacity expected > 1000, got {embb_prb_cap}"
    assert embb_served < 50.0, f"Compute bottleneck should have crushed served packets, got {embb_served}"

    print(f"[PASS] Test (c): Radio+Compute coupling verified (PRB cap: {embb_prb_cap:.0f}, CPU cap: {embb_cpu_cap:.1f}, Served: {embb_served:.1f})")


def test_seed_reproducibility():
    """Test (d): Same random seed gives identical traffic arrivals across runs."""
    env1 = SliceEnv()
    env2 = SliceEnv()

    env1.reset(seed=999)
    env2.reset(seed=999)

    action = np.zeros(6, dtype=np.float32)

    for step_idx in range(30):
        _, _, _, _, info1 = env1.step(action)
        _, _, _, _, info2 = env2.step(action)

        for s in ["embb", "urllc", "murllc"]:
            assert info1["arrivals"][s] == info2["arrivals"][s], (
                f"Mismatch at step {step_idx} for slice {s}: {info1['arrivals'][s]} vs {info2['arrivals'][s]}"
            )

    print("[PASS] Test (d): Deterministic identical traffic for identical seeds")


def test_static_urllc_violation_in_spike():
    """Test (e): Under an extreme URLLC burst (x12), Static 25% share incurs SLA violations."""
    env = SliceEnv()
    env.reset(seed=77)

    static_prb_logits = get_static_logits([0.60, 0.25, 0.15])
    static_vcpu_logits = get_static_logits([0.60, 0.25, 0.15])
    static_action = np.concatenate([static_prb_logits, static_vcpu_logits])

    # Trigger URLLC spike
    env.set_spike("urllc", factor=12.0, duration_steps=10)

    total_urllc_violations = 0.0
    for _ in range(30):
        _, _, _, _, info = env.step(static_action)
        total_urllc_violations += info["violations"]["urllc"]

    assert total_urllc_violations > 0, "Static allocation must incur URLLC violations during URLLC spike"
    print(f"[PASS] Test (e): Static allocation suffered {total_urllc_violations:.0f} URLLC violations during surge")


if __name__ == "__main__":
    print("Running 5G Slicing Simulator Acceptance Tests...\n" + "=" * 50)
    test_shares_sum_to_one()
    test_embb_spike_static_failure()
    test_radio_compute_coupling()
    test_seed_reproducibility()
    test_static_urllc_violation_in_spike()
    print("=" * 50 + "\nAll 5 Simulator Acceptance Tests PASSED!")
    sys.exit(0)
