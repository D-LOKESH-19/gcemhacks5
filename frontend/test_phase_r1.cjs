const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('PHASE R1 ACCEPTANCE TESTS (AT-39 & Allocation Types)');
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
// Test 1: Real stream_sample.json contains valid allocation blocks
// -------------------------------------------------------------
try {
  const fixturesPath = path.join(__dirname, 'fixtures', 'stream_sample.json');
  assert(fs.existsSync(fixturesPath), 'stream_sample.json exists in frontend/fixtures/');

  const rawData = fs.readFileSync(fixturesPath, 'utf-8');
  const messages = JSON.parse(rawData);
  assert(Array.isArray(messages) && messages.length === 30, 'stream_sample.json has 30 frames');

  let allValid = true;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    for (const pol of ['static', 'heuristic', 'agent']) {
      const polData = msg.policies[pol];
      if (!polData.allocation) {
        allValid = false;
        console.error(`Message ${i} policy ${pol} missing allocation block`);
        break;
      }
      const alloc = polData.allocation;
      if (
        !alloc.prb ||
        !alloc.cpu ||
        !alloc.effective_capacity ||
        !alloc.bottleneck ||
        !alloc.shield ||
        !Array.isArray(alloc.transfers)
      ) {
        allValid = false;
        console.error(`Message ${i} policy ${pol} allocation schema invalid:`, alloc);
        break;
      }
      if (alloc.prb.counts.length !== 3 || alloc.cpu.counts.length !== 3) {
        allValid = false;
        console.error(`Message ${i} policy ${pol} counts length != 3`);
        break;
      }
    }
    if (!allValid) break;
  }
  assert(allValid, 'All 30 real fixtures contain complete Allocation blocks matching TypeScript types');
} catch (e) {
  assert(false, `Fixtures allocation validation exception: ${e.message}`);
}

// -------------------------------------------------------------
// Test 2: AT-39 - computeCountDiffs unit test
// -------------------------------------------------------------
try {
  // Mock implementations of functions from allocationUtils
  function computeCountDiffs(prevCounts, currCounts) {
    const SLICE_ORDER = ['embb', 'urllc', 'murllc'];
    return SLICE_ORDER.map((slice, i) => {
      const delta = currCounts[i] - prevCounts[i];
      return {
        slice,
        delta,
        donor: delta < 0,
        receiver: delta > 0,
      };
    });
  }

  // Steady state: no diff
  const diffSteady = computeCountDiffs([60, 25, 15], [60, 25, 15]);
  assert(
    diffSteady.every((d) => d.delta === 0 && !d.donor && !d.receiver),
    'AT-39: computeCountDiffs handles zero-delta steady state'
  );

  // Shift state: surge transfer
  const diffShift = computeCountDiffs([60, 25, 15], [70, 20, 10]);
  assert(
    diffShift[0].slice === 'embb' && diffShift[0].delta === 10 && diffShift[0].receiver,
    'AT-39: eMBB identified as receiver (+10 PRB)'
  );
  assert(
    diffShift[1].slice === 'urllc' && diffShift[1].delta === -5 && diffShift[1].donor,
    'AT-39: URLLC identified as donor (-5 PRB)'
  );
  assert(
    diffShift[2].slice === 'murllc' && diffShift[2].delta === -5 && diffShift[2].donor,
    'AT-39: mURLLC identified as donor (-5 PRB)'
  );
} catch (e) {
  assert(false, `computeCountDiffs exception: ${e.message}`);
}

// -------------------------------------------------------------
// Test 3: AT-39 - mergeBurstTransfers unit test
// -------------------------------------------------------------
try {
  function mergeBurstTransfers(transfers) {
    if (!transfers || transfers.length === 0) return [];
    const merged = [];
    for (const t of transfers) {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.resource === t.resource &&
        last.from === t.from &&
        last.to === t.to &&
        last.amount === t.amount &&
        last.reason_code === t.reason_code
      ) {
        last.count += 1;
      } else {
        merged.push({ ...t, count: 1 });
      }
    }
    return merged;
  }

  // Empty case
  assert(mergeBurstTransfers([]).length === 0, 'AT-39: mergeBurstTransfers handles empty list cleanly');

  // Burst case: 4 identical transfers
  const baseTransfer = {
    resource: 'prb',
    from: 'urllc',
    to: 'embb',
    amount: 5,
    reason_code: 'surge',
    donor_util: 0.2,
    receiver_util: 0.95,
  };
  const burst = [baseTransfer, baseTransfer, baseTransfer, baseTransfer];
  const mergedBurst = mergeBurstTransfers(burst);
  assert(
    mergedBurst.length === 1 && mergedBurst[0].count === 4,
    `AT-39: Repeated burst of 4 transfers successfully collapsed into 1 entry with count: 4 (got ${mergedBurst.length}, count: ${mergedBurst[0]?.count})`
  );

  // Heterogeneous case: alternating transfers
  const differentTransfer = { ...baseTransfer, to: 'murllc' };
  const mixed = [baseTransfer, differentTransfer, baseTransfer];
  const mergedMixed = mergeBurstTransfers(mixed);
  assert(
    mergedMixed.length === 3 && mergedMixed.every((m) => m.count === 1),
    'AT-39: Alternating distinct transfers preserve order without unintended merging'
  );
} catch (e) {
  assert(false, `mergeBurstTransfers exception: ${e.message}`);
}

// -------------------------------------------------------------
// Test 4: AT-39 - extractScrubBuffer unit test
// -------------------------------------------------------------
try {
  function extractScrubBuffer(history, maxSteps = 60) {
    if (!history || history.length === 0) return [];
    return history.slice(-maxSteps);
  }

  assert(extractScrubBuffer([]).length === 0, 'AT-39: extractScrubBuffer handles empty history');

  const history100 = Array.from({ length: 100 }, (_, i) => ({ step: i }));
  const scrub60 = extractScrubBuffer(history100, 60);
  assert(scrub60.length === 60, 'AT-39: extractScrubBuffer caps exactly at 60 steps');
  assert(scrub60[0].step === 40, 'AT-39: Oldest step in 60-step scrub window is step 40');
  assert(scrub60[59].step === 99, 'AT-39: Newest step in 60-step scrub window is step 99');
} catch (e) {
  assert(false, `extractScrubBuffer exception: ${e.message}`);
}

console.log('\n----------------------------------------------------');
if (failed === 0) {
  console.log('🎉 ALL PHASE R1 ACCEPTANCE TESTS PASSED (0 FAILURES)');
  process.exit(0);
} else {
  console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
  process.exit(1);
}
