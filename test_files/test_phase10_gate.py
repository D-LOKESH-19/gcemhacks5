"""Phase 10 Pre-conditions Gate Test Runner (LOCATIONS_FEATURE.md Section 12.3).

Verifies that the SLA upgrade is complete and all gate tests pass with real output:
- SM-11: Old contract intact (12-dim obs, 6-dim action, info['cost'])
- SM-12: Old suite in both traffic modes (aggregate and bots)
- SM-25: Same traffic for all policies
- SM-28: Agent meets SLAs in feasible scenarios
- BT-1: Phase 9 aggregate traffic mode intact
- BT-6: Phase 9 synchronized bot arrivals across policies
"""

import sys, os
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
os.chdir(_ROOT)

import sys
import unittest

from test_sla_11a import (
    test_sm11_old_contract,
    test_sm12_old_suite,
)
from test_sla_11c import (
    test_sm25_traffic_synchrony,
    test_sm28_agent_meets_slas_in_feasible,
)
from test_bots_9a import test_bt1_aggregate_mode
from test_bots_9b import test_bt6_same_traffic_for_all_policies


def run_phase10_gate():
    print("=" * 65)
    print("RUNNING PHASE 10 ENTRY GATE TESTS (LOCATIONS_FEATURE.MD 12.3)")
    print("=" * 65)

    try:
        print("\n1. Testing SM-11: Old contract intact...")
        test_sm11_old_contract()

        print("\n2. Testing SM-12: Old suite in aggregate & bots modes...")
        test_sm12_old_suite()

        print("\n3. Testing SM-25: Same traffic for all policies (eval seeds)...")
        test_sm25_traffic_synchrony()

        print("\n4. Testing SM-28: Agent meets SLAs in feasible scenarios...")
        test_sm28_agent_meets_slas_in_feasible()

        print("\n5. Testing BT-1: Bots feature aggregate mode...")
        test_bt1_aggregate_mode()

        print("\n6. Testing BT-6: Synchronized bot traffic across policies...")
        test_bt6_same_traffic_for_all_policies()

        print("\n" + "=" * 65)
        print("ALL PHASE 10 GATE TESTS PASSED WITH REAL OUTPUT!")
        print("=" * 65)
        return True

    except Exception as e:
        print(f"\n[GATE FAILED] Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_phase10_gate()
    if not success:
        sys.exit(1)
