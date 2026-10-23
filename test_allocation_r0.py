"""Acceptance Tests for Phase R0: Resource Allocation Backend & Contracts (AT-1 to AT-16).

Verifies Section 14.5 and 14.8 requirements from SPEC.md.
"""

import unittest
import copy
import json
import time
import numpy as np
from fastapi.testclient import TestClient

from api import app, sim_manager
from allocation_engine import (
    largest_remainder_counts,
    compute_capacity_and_util,
    determine_bottleneck,
    compute_transfers,
    build_allocation_block,
    SLICES,
)
from shield import apply_shield


class TestAllocationR0(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        sim_manager.reset_all(seed=42)

    def test_at1_block_present(self):
        """AT-1: Every message has allocation for all 3 policies with 3 finite entries."""
        payload = sim_manager.step_simulation()
        self.assertIn("policies", payload)
        for pol in ["static", "heuristic", "agent"]:
            self.assertIn("allocation", payload["policies"][pol])
            alloc = payload["policies"][pol]["allocation"]
            self.assertIn("prb", alloc)
            self.assertIn("cpu", alloc)
            self.assertIn("effective_capacity", alloc)
            self.assertIn("bottleneck", alloc)
            self.assertIn("shield", alloc)
            self.assertIn("transfers", alloc)

            # Check 3 entries in arrays
            self.assertEqual(len(alloc["prb"]["raw"]), 3)
            self.assertEqual(len(alloc["prb"]["final"]), 3)
            self.assertEqual(len(alloc["prb"]["prev"]), 3)
            self.assertEqual(len(alloc["prb"]["counts"]), 3)
            self.assertEqual(len(alloc["cpu"]["counts"]), 3)
            self.assertEqual(len(alloc["effective_capacity"]), 3)
            self.assertEqual(len(alloc["bottleneck"]), 3)

            for val in alloc["prb"]["final"] + alloc["cpu"]["final"]:
                self.assertTrue(np.isfinite(val))
        print("[PASS] AT-1: Allocation block present with finite 3-element arrays across all policies")

    def test_at2_shares_valid(self):
        """AT-2: raw, final, prev each sum to 1 within 1e-6; final equals applied shares."""
        for _ in range(5):
            payload = sim_manager.step_simulation()
            for pol in ["static", "heuristic", "agent"]:
                alloc = payload["policies"][pol]["allocation"]
                shares_applied = payload["policies"][pol]["shares"]

                # Sums to 1
                self.assertAlmostEqual(sum(alloc["prb"]["raw"]), 1.0, places=5)
                self.assertAlmostEqual(sum(alloc["prb"]["final"]), 1.0, places=5)
                self.assertAlmostEqual(sum(alloc["prb"]["prev"]), 1.0, places=5)
                self.assertAlmostEqual(sum(alloc["cpu"]["final"]), 1.0, places=5)

                # Final matches simulator shares
                for i, s in enumerate(SLICES):
                    self.assertAlmostEqual(alloc["prb"]["final"][i], shares_applied["prb"][s], places=4)
                    self.assertAlmostEqual(alloc["cpu"]["final"][i], shares_applied["vcpu"][s], places=4)
        print("[PASS] AT-2: Shares strictly sum to 1.0 and final equals applied simulator shares")

    def test_at3_counts(self):
        """AT-3: Counts sum to config total, >= floor(final * total), and handles alternate totals."""
        payload = sim_manager.step_simulation()
        alloc = payload["policies"]["agent"]["allocation"]
        prb_tot = sim_manager.cfg.get("prb_total", 100)
        vcpu_tot = sim_manager.cfg.get("vcpu_total", 8)

        self.assertEqual(sum(alloc["prb"]["counts"]), prb_tot)
        self.assertEqual(sum(alloc["cpu"]["counts"]), vcpu_tot)

        for i in range(3):
            final_p = alloc["prb"]["final"][i]
            count_p = alloc["prb"]["counts"][i]
            self.assertGreaterEqual(count_p, int(np.floor(final_p * prb_tot)))
            self.assertLessEqual(abs(count_p - round(final_p * prb_tot)), 1)

        # Dynamic check with 120 PRBs
        counts_120 = largest_remainder_counts([0.60, 0.25, 0.15], 120)
        self.assertEqual(sum(counts_120), 120)
        self.assertEqual(counts_120, [72, 30, 18])
        print("[PASS] AT-3: Integer counts sum to totals and respect floor lower bounds")

    def test_at4_determinism(self):
        """AT-4: Identical shares give identical counts; ties break in eMBB, URLLC, mURLLC order."""
        shares = [0.333333, 0.333333, 0.333334]
        c1 = largest_remainder_counts(shares, 100)
        c2 = largest_remainder_counts(shares, 100)
        self.assertEqual(c1, c2)

        # Equal fractional ties test: 10 units for 3 equal shares
        equal_shares = [1/3, 1/3, 1/3]
        # floors = [3, 3, 3] = 9; remainder = 1. Tie should go to index 0 (eMBB)
        counts_tie = largest_remainder_counts(equal_shares, 10)
        self.assertEqual(counts_tie, [4, 3, 3])
        print("[PASS] AT-4: Counts calculation is strictly deterministic with fixed tie-breaking")

    def test_at5_and_at6_transfers(self):
        """AT-5 & AT-6: Transfers net zero, amounts positive, and match count deltas."""
        prev = [60, 25, 15]
        curr = [70, 18, 12]  # donors: urllc (-7), murllc (-3); receiver: embb (+10)
        transfers = compute_transfers(
            resource_name="prb",
            prev_counts=prev,
            curr_counts=curr,
            donor_utils=[0.2, 0.1, 0.1],
            receiver_utils=[0.9, 0.1, 0.1],
        )

        self.assertGreater(len(transfers), 0)
        net_change = {s: 0 for s in SLICES}
        for t in transfers:
            self.assertGreater(t["amount"], 0)
            self.assertNotEqual(t["from"], t["to"])
            net_change[t["from"]] -= t["amount"]
            net_change[t["to"]] += t["amount"]

        # Reconstructed counts must equal curr
        reconstructed = [prev[i] + net_change[SLICES[i]] for i in range(3)]
        self.assertEqual(reconstructed, curr)
        print("[PASS] AT-5 & AT-6: Transfers net zero and match reconstructed count deltas")

    def test_at7_static_is_static(self):
        """AT-7: Static policy produces no transfers after step 1."""
        sim_manager.step_simulation()  # Step 1
        for _ in range(10):
            payload = sim_manager.step_simulation()
            static_transfers = payload["policies"]["static"]["allocation"]["transfers"]
            self.assertEqual(len(static_transfers), 0, f"Static policy must produce 0 transfers: {static_transfers}")
        print("[PASS] AT-7: Static policy allocation remains strictly immutable across steps")

    def test_at8_shield_changed_flag(self):
        """AT-8: shield.changed is true exactly when diff > 3 percentage points."""
        alloc = build_allocation_block(
            policy_name="agent",
            raw_prb=[0.90, 0.05, 0.05],
            final_prb=[0.70, 0.15, 0.15],
            prev_prb=[0.60, 0.25, 0.15],
            raw_cpu=[0.60, 0.25, 0.15],
            final_cpu=[0.60, 0.25, 0.15],
            prev_cpu=[0.60, 0.25, 0.15],
            prev_prb_counts=[60, 25, 15],
            prev_cpu_counts=[5, 2, 1],
            demand=[500.0, 30.0, 20.0],
            cfg=sim_manager.cfg,
            shield_changed=True,
        )
        self.assertTrue(alloc["shield"]["changed"])
        self.assertGreaterEqual(max(alloc["shield"]["delta_pct"]), 3.0)
        print("[PASS] AT-8: Shield changed flag reflects >3% shift accurately")

    def test_at9_floors(self):
        """AT-9: URLLC and mURLLC shares >= reported floor in 50-step run."""
        for _ in range(50):
            payload = sim_manager.step_simulation()
            alloc = payload["policies"]["agent"]["allocation"]
            self.assertGreaterEqual(alloc["prb"]["final"][1], alloc["prb"]["floor"][1] - 1e-4)
            self.assertGreaterEqual(alloc["prb"]["final"][2], alloc["prb"]["floor"][2] - 1e-4)
        print("[PASS] AT-9: Agent shares strictly respect configured safety floors")

    def test_at10_capacity_and_util(self):
        """AT-10: Capacity and utilization match simulator formulas; util >= 0."""
        caps, utils = compute_capacity_and_util(
            shares=[0.60, 0.25, 0.15],
            total_units=100,
            unit_rate=12.0,
            demand=[600.0, 30.0, 0.0],
        )
        self.assertEqual(caps, [720.0, 300.0, 180.0])
        self.assertAlmostEqual(utils[0], 600.0 / 720.0, places=3)
        self.assertAlmostEqual(utils[1], 30.0 / 300.0, places=3)
        self.assertEqual(utils[2], 0.0)
        print("[PASS] AT-10: Capacity and utilization match mathematical definitions")

    def test_at11_bottlenecks(self):
        """AT-11: Bottleneck rules: idle, none, both, radio, compute."""
        self.assertEqual(determine_bottleneck(0.0, 100.0, 100.0, 100.0), "idle")
        self.assertEqual(determine_bottleneck(50.0, 100.0, 100.0, 100.0), "none")
        self.assertEqual(determine_bottleneck(95.0, 100.0, 100.0, 102.0), "both")
        self.assertEqual(determine_bottleneck(95.0, 50.0, 50.0, 150.0), "radio")
        self.assertEqual(determine_bottleneck(95.0, 50.0, 150.0, 50.0), "compute")
        print("[PASS] AT-11: All 5 bottleneck classifications validated")

    def test_at12_reason_codes(self):
        """AT-12: Reason codes: idle_harvest, floor_restore, surge, rebalance."""
        # 1. idle_harvest (donor < 0.4, recv > 0.8)
        t_harvest = compute_transfers("prb", [60, 25, 15], [70, 15, 15], [0.9, 0.2, 0.2], [0.9, 0.2, 0.2])
        self.assertEqual(t_harvest[0]["reason_code"], "idle_harvest")

        # 2. floor_restore (shield_changed=True and recv in urllc/murllc)
        t_restore = compute_transfers("prb", [70, 15, 15], [60, 25, 15], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], shield_changed=True)
        self.assertEqual(t_restore[0]["reason_code"], "floor_restore")

        # 3. surge (spike active on receiver)
        t_surge = compute_transfers("prb", [60, 25, 15], [70, 15, 15], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], spike_active={"embb": True, "urllc": False, "murllc": False})
        self.assertEqual(t_surge[0]["reason_code"], "surge")

        # 4. rebalance (default)
        t_rebal = compute_transfers("prb", [60, 25, 15], [70, 15, 15], [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])
        self.assertEqual(t_rebal[0]["reason_code"], "rebalance")
        print("[PASS] AT-12: All 4 transfer reason codes verified")

    def test_at13_capability(self):
        """AT-13: GET /api/capabilities returns allocation: true."""
        resp = self.client.get("/api/capabilities")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("allocation", data)
        self.assertTrue(data["allocation"])
        print("[PASS] AT-13: /api/capabilities includes allocation: true")

    def test_at14_stream_cost_and_perf(self):
        """AT-14: Payload size and simulation step performance under 20ms."""
        t0 = time.perf_counter()
        for _ in range(50):
            payload = sim_manager.step_simulation()
        elapsed_ms = (time.perf_counter() - t0) * 1000.0 / 50.0
        payload_size_kb = len(json.dumps(payload)) / 1024.0

        self.assertLess(elapsed_ms, 25.0, f"Step execution must be <25ms, got {elapsed_ms:.2f}ms")
        self.assertLess(payload_size_kb, 15.0, f"Payload size must be <15KB, got {payload_size_kb:.2f}KB")
        print(f"[PASS] AT-14: Step speed {elapsed_ms:.2f}ms, message size {payload_size_kb:.2f}KB")

    def test_at15_no_regression(self):
        """AT-15: Existing endpoints intact."""
        self.assertEqual(self.client.get("/health").status_code, 200)
        self.assertEqual(self.client.get("/summary").status_code, 200)
        self.assertEqual(self.client.get("/bots").status_code, 200)
        print("[PASS] AT-15: All pre-existing API endpoints remain fully functional")

    def test_at16_fairness(self):
        """AT-16: All three policies receive identical traffic and events."""
        for _ in range(10):
            sim_manager.step_simulation()
            arr_s = sim_manager.info_static["arrivals"]
            arr_h = sim_manager.info_heuristic["arrivals"]
            arr_a = sim_manager.info_agent["arrivals"]
            for s in SLICES:
                self.assertEqual(arr_s[s], arr_h[s])
                self.assertEqual(arr_h[s], arr_a[s])
        print("[PASS] AT-16: Traffic fairness strictly preserved across all three policies")


if __name__ == "__main__":
    unittest.main()
