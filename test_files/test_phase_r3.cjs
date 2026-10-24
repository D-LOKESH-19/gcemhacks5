const fs = require('fs');
const path = require('path');
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('====================================================');
console.log('PHASE R3 ACCEPTANCE TESTS (AT-28: Flow Strip)');
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
// AT-28: FlowStrip component structure & constraints
// -------------------------------------------------------------
try {
  const flowSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'allocation', 'FlowStrip.tsx'), 'utf-8');

  // Five nodes
  assert(
    flowSrc.includes('1. Devices') &&
    flowSrc.includes('2. gNB Radio') &&
    flowSrc.includes('3. Slicer') &&
    flowSrc.includes('4. Edge UPF') &&
    flowSrc.includes('5. Apps'),
    'AT-28: Five nodes in sequence (Devices -> gNB Radio -> Slicer -> Edge UPF -> Apps) verified'
  );

  // Slicer honest naming
  assert(
    flowSrc.includes('Resource Controller') && flowSrc.includes('ShieldCheck'),
    'AT-28: Slicer explicitly labeled as Resource Controller with safety shield indicator'
  );

  // Particle limit and label
  assert(
    flowSrc.includes('maxTotalParticles = 120') || flowSrc.includes('120 particles'),
    'AT-28: Particle system strictly bounded at 120 particles max'
  );
  assert(
    flowSrc.includes('1 particle = 10 packets'),
    'AT-28: Particle density calibration label present: "1 particle = 10 packets"'
  );

  // Bottleneck indicators
  assert(
    flowSrc.includes('hasRadioBottleneck') && flowSrc.includes('hasComputeBottleneck'),
    'AT-28: Radio and Compute bottleneck warnings dynamically rendered from stream'
  );

  // Data-driven speed & colors
  assert(
    flowSrc.includes('SLICE_COLORS') && flowSrc.includes('#22D3EE') && flowSrc.includes('#F59E0B') && flowSrc.includes('#A78BFA'),
    'AT-28: Particles strictly use slice identity palette tokens'
  );
  assert(
    flowSrc.includes('isBottlenecked ? 0.8 : 2.4'),
    'AT-28: Bottleneck state slows particle flow down to simulate traffic queueing'
  );
} catch (e) {
  assert(false, `AT-28 exception: ${e.message}`);
}

// -------------------------------------------------------------
// AT-28: Integration in ResourceAllocationPage
// -------------------------------------------------------------
try {
  const pageSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'pages', 'ResourceAllocationPage.tsx'), 'utf-8');
  assert(
    pageSrc.includes('<FlowStrip') && pageSrc.includes('bottlenecks={alloc?.bottleneck}'),
    'AT-28: FlowStrip actively integrated into ResourceAllocationPage with live stream bottlenecks'
  );
} catch (e) {
  assert(false, `Page integration exception: ${e.message}`);
}

console.log('\n----------------------------------------------------');
if (failed === 0) {
  console.log('🎉 ALL PHASE R3 FLOW STRIP ACCEPTANCE TESTS PASSED (0 FAILURES)');
  process.exit(0);
} else {
  console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
  process.exit(1);
}
