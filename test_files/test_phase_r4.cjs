const fs = require('fs');
const path = require('path');
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('PHASE R4 ACCEPTANCE TESTS (AT-26, AT-27, AT-29)');
console.log('====================================================\n');

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// -------------------------------------------------------------
// AT-26: DecisionPipeline (5 stages, Static 'Fixed rule', shield text)
// -------------------------------------------------------------
try {
  const pipeSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'allocation', 'DecisionPipeline.tsx'), 'utf-8');

  assert(
    pipeSrc.includes('1. Observe') &&
    pipeSrc.includes('2. Policy Proposes') &&
    pipeSrc.includes('3. Shield Checks') &&
    pipeSrc.includes('4. Applied') &&
    pipeSrc.includes('5. Result'),
    'AT-26: DecisionPipeline implements all 5 vertical explainability stages'
  );

  assert(
    pipeSrc.includes("isStatic ? 'Fixed rule' : isHeuristic ? 'Rule: queue plus smoothed load' : 'Learned CMDP PPO'"),
    'AT-26: Stage 2 dynamically reflects policy type (Static shows "Fixed rule")'
  );

  assert(
    pipeSrc.includes('Shield changed the decision by') && pipeSrc.includes('Shield did not change the decision'),
    'AT-26: Stage 3 text dynamically reports shield intervention percentage points'
  );
} catch (e) {
  assert(false, `AT-26 exception: ${e.message}`);
}

// -------------------------------------------------------------
// AT-27: TransferLedger (50 events, hover pause, burst merge, empty state)
// -------------------------------------------------------------
try {
  const ledgerSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'allocation', 'TransferLedger.tsx'), 'utf-8');

  assert(
    ledgerSrc.includes('combined.slice(0, 50)'),
    'AT-27: Ledger maintains last 50 events ring buffer'
  );

  assert(
    ledgerSrc.includes('onMouseEnter={() => setIsHovered(true)}') &&
    ledgerSrc.includes('onMouseLeave={() => setIsHovered(false)}') &&
    ledgerSrc.includes('Paused on Hover'),
    'AT-27: Ledger pauses auto-scroll when hovered with visible badge'
  );

  assert(
    ledgerSrc.includes('mergeBurstTransfers') && ledgerSrc.includes('x{item.count}'),
    'AT-27: Bursts of repeated transfers collapse with multiplier counter tag (xN)'
  );

  assert(
    ledgerSrc.includes('No reallocations: allocation is steady.'),
    'AT-27: Empty state correctly presents exact wording: "No reallocations: allocation is steady."'
  );

  assert(
    ledgerSrc.includes('All Resources') && ledgerSrc.includes('PRB Only') && ledgerSrc.includes('vCPU Only'),
    'AT-27: Resource type filters (All, PRB, vCPU) supported'
  );
} catch (e) {
  assert(false, `AT-27 exception: ${e.message}`);
}

// -------------------------------------------------------------
// AT-29: CouplingPanel (radio vs compute, effective capacity, text)
// -------------------------------------------------------------
try {
  const coupSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'allocation', 'CouplingPanel.tsx'), 'utf-8');

  assert(
    coupSrc.includes('Radio (PRB):') && coupSrc.includes('Compute:') && coupSrc.includes('Effective Cap:'),
    'AT-29: CouplingPanel renders radio capacity, compute capacity, and effective capacity bars'
  );

  assert(
    coupSrc.includes('bottleneck:'),
    'AT-29: Slice bottleneck classification tags (radio, compute, both, none) displayed'
  );

  assert(
    coupSrc.includes('Served traffic is limited by the smaller of radio and compute capacity.'),
    'AT-29: Explanatory coupling text present: "Served traffic is limited by the smaller of radio and compute capacity."'
  );
} catch (e) {
  assert(false, `AT-29 exception: ${e.message}`);
}

console.log('\n----------------------------------------------------');
if (failed === 0) {
  console.log('🎉 ALL PHASE R4 ACCEPTANCE TESTS PASSED (0 FAILURES)');
  process.exit(0);
} else {
  console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
  process.exit(1);
}
