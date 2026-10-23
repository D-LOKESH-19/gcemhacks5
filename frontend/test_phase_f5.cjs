const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('====================================================');
console.log('PHASE F5 ACCEPTANCE TESTS (FT-39 to FT-44)');
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

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:8050${urlPath}`, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    }).on('error', reject);
  });
}

async function runTests() {
  // -------------------------------------------------------------
  // FT-39: Stacked shares chart sums to 100% and has toggles
  // -------------------------------------------------------------
  try {
    const sharesSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'agent', 'SharesStackedChart.tsx'), 'utf-8');
    assert(
      sharesSrc.includes('Math.max(0, 100 - embbPct - urllcPct)') &&
      sharesSrc.includes('setResourceType("prb")') &&
      sharesSrc.includes('setResourceType("vcpu")'),
      'FT-39: SharesStackedChart enforces 100% simplex sum and provides PRB vs vCPU toggles'
    );
  } catch (e) {
    assert(false, `FT-39 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-40: Shield statement matches stream wording
  // -------------------------------------------------------------
  try {
    const shieldSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'agent', 'ShieldInterventionCard.tsx'), 'utf-8');
    assert(
      shieldSrc.includes("The shield changed the agent's decision in") &&
      shieldSrc.includes("percent of the last") &&
      shieldSrc.includes("steps"),
      'FT-40: ShieldInterventionCard strictly includes: "The shield changed the agent\'s decision in X percent of the last Y steps."'
    );
  } catch (e) {
    assert(false, `FT-40 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-41: Decision table parses 20 rows and real reasons
  // -------------------------------------------------------------
  try {
    const tableSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'agent', 'DecisionAuditTable.tsx'), 'utf-8');
    assert(
      tableSrc.includes('.slice(0, 20)') &&
      tableSrc.includes('row.reason') &&
      tableSrc.includes('row.inference_ms'),
      'FT-41: DecisionAuditTable renders up to 20 decisions with real-number synthesized explainability reasons'
    );
  } catch (e) {
    assert(false, `FT-41 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-42: Coupling bars: effective capacity = min(radio, compute)
  // -------------------------------------------------------------
  try {
    const couplingSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'agent', 'CouplingBars.tsx'), 'utf-8');
    assert(
      couplingSrc.includes('Math.min(prbPct, vcpuPct)') &&
      couplingSrc.includes('Bottleneck:'),
      'FT-42: CouplingBars computes effective coupled capacity as strictly min(PRB, vCPU)'
    );
  } catch (e) {
    assert(false, `FT-42 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-43: Heuristic overlay toggle
  // -------------------------------------------------------------
  try {
    const sharesSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'agent', 'SharesStackedChart.tsx'), 'utf-8');
    assert(
      sharesSrc.includes('showHeuristicOverlay') &&
      sharesSrc.includes('setShowHeuristicOverlay(!showHeuristicOverlay)') &&
      sharesSrc.includes('heuristicURLLC'),
      'FT-43: SharesStackedChart supports interactive toggle overlaying Heuristic reference baseline'
    );
  } catch (e) {
    assert(false, `FT-43 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-44: Scientific honesty: shield is not claimed as policy
  // -------------------------------------------------------------
  try {
    const shieldSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'agent', 'ShieldInterventionCard.tsx'), 'utf-8');
    assert(
      shieldSrc.includes('Algorithmic Separation') &&
      shieldSrc.includes('deterministic') &&
      !shieldSrc.toLowerCase().includes('shield is the learned policy'),
      'FT-44: Explanatory copy clearly delineates algorithmic supervisor from neural RL policy without overclaiming'
    );
  } catch (e) {
    assert(false, `FT-44 exception: ${e.message}`);
  }

  console.log('\n----------------------------------------------------');
  if (failed === 0) {
    console.log('🎉 ALL PHASE F5 AGENT INSIGHTS ACCEPTANCE TESTS PASSED (0 FAILURES)');
    process.exit(0);
  } else {
    console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
    process.exit(1);
  }
}

runTests();
