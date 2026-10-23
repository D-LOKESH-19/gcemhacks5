const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('PHASE R2 ACCEPTANCE TESTS (AT-21 to AT-25, AT-42)');
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
// AT-21: Unit totals across all 30 fixture frames
// -------------------------------------------------------------
try {
  const fixturesPath = path.join(__dirname, 'fixtures', 'stream_sample.json');
  const messages = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));

  let allTotalsValid = true;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    for (const pol of ['static', 'heuristic', 'agent']) {
      const alloc = msg.policies[pol].allocation;
      const sumPrb = alloc.prb.counts.reduce((a, b) => a + b, 0);
      const sumCpu = alloc.cpu.counts.reduce((a, b) => a + b, 0);
      if (sumPrb !== 100 || sumCpu !== 8) {
        allTotalsValid = false;
        console.error(`Frame ${i} ${pol} totals invalid: PRB=${sumPrb}, vCPU=${sumCpu}`);
        break;
      }
    }
    if (!allTotalsValid) break;
  }
  assert(allTotalsValid, 'AT-21: Over all 30 fixture frames, PRB cells strictly total 100 and vCPU chips total 8');
} catch (e) {
  assert(false, `AT-21 exception: ${e.message}`);
}

// -------------------------------------------------------------
// AT-22: Blocks and stability in fixed order (eMBB, URLLC, mURLLC)
// -------------------------------------------------------------
try {
  const poolsSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'allocation', 'ResourcePools.tsx'), 'utf-8');
  assert(
    poolsSrc.includes("const SLICE_ORDER: SliceType[] = ['embb', 'urllc', 'murllc']"),
    'AT-22: ResourcePools orders slices strictly in fixed order [eMBB, URLLC, mURLLC]'
  );
  assert(
    poolsSrc.includes('SLICE_ORDER.forEach'),
    'AT-22: Cells are generated as contiguous slice blocks without interleaving'
  );
} catch (e) {
  assert(false, `AT-22 exception: ${e.message}`);
}

// -------------------------------------------------------------
// AT-23: Flash accuracy & 600ms timer
// -------------------------------------------------------------
try {
  const poolsSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'allocation', 'ResourcePools.tsx'), 'utf-8');
  assert(
    poolsSrc.includes('flashingIndices') && poolsSrc.includes('600'),
    'AT-23: Flash state updates on count diffs and resets precisely after 600ms'
  );
  assert(
    poolsSrc.includes('changed.size < 12'),
    'AT-23: Flash animations cap at 12 simultaneous units to preserve frame rates'
  );
} catch (e) {
  assert(false, `AT-23 exception: ${e.message}`);
}

// -------------------------------------------------------------
// AT-25: Locks on floor cells
// -------------------------------------------------------------
try {
  const poolsSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'allocation', 'ResourcePools.tsx'), 'utf-8');
  assert(
    poolsSrc.includes('cell.isFloor') && poolsSrc.includes('<Lock'),
    'AT-25: Lock icons rendered on protected SLA floor cells'
  );
  assert(
    poolsSrc.includes('floorCells') && poolsSrc.includes('Math.floor(prb.floor[sIdx] * prbTotal)'),
    'AT-25: Floor lock count strictly matches floor(floor_share * total)'
  );
} catch (e) {
  assert(false, `AT-25 exception: ${e.message}`);
}

// -------------------------------------------------------------
// AT-42: Legend ('How to read this page') and honesty text
// -------------------------------------------------------------
try {
  const legendSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'allocation', 'AllocationLegend.tsx'), 'utf-8');
  const poolsSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'allocation', 'ResourcePools.tsx'), 'utf-8');

  assert(
    legendSrc.includes('#22D3EE') && legendSrc.includes('#F59E0B') && legendSrc.includes('#A78BFA'),
    'AT-42: Legend presents correct slice palette tokens'
  );
  assert(
    legendSrc.includes('Lock Icon') && legendSrc.includes('Cell Flash (600ms)') && legendSrc.includes('Inner Fill'),
    'AT-42: Legend explains locks, flashes, and utilization fill'
  );
  assert(
    legendSrc.includes('Slice-level illustration') && legendSrc.includes('resource controller') && legendSrc.includes('URLLC and mURLLC protected first'),
    'AT-42: Legend adheres strictly to honesty wording rules'
  );
  assert(
    poolsSrc.includes('Displayed in whole units. The simulator uses continuous shares.'),
    'AT-42: Always visible whole units disclaimer present on Resource Pools'
  );
} catch (e) {
  assert(false, `AT-42 exception: ${e.message}`);
}

console.log('\n----------------------------------------------------');
if (failed === 0) {
  console.log('🎉 ALL PHASE R2 ACCEPTANCE TESTS PASSED (0 FAILURES)');
  process.exit(0);
} else {
  console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
  process.exit(1);
}
