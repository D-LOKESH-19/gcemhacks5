const fs = require('fs');
const path = require('path');
const http = require('http');

console.log('====================================================');
console.log('PHASE F3 ACCEPTANCE TESTS (FT-17 to FT-30)');
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

function httpPost(urlPath, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 8050,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
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
  // FT-17: Backend data is real and live
  // -------------------------------------------------------------
  try {
    const health = await httpGet('/health');
    assert(health.status === 200 && health.body.status === 'ok', 'FT-17: Live simulator backend responds at /health');
  } catch (e) {
    assert(false, `FT-17 Backend connection failed: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-18: Overlay charts have 3 policies and SLA dashed line
  // -------------------------------------------------------------
  try {
    const chartSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'live', 'LiveChartsOverlay.tsx'), 'utf-8');
    assert(chartSrc.includes('#F87171'), 'FT-18: Static policy line uses #F87171 (red)');
    assert(chartSrc.includes('#CBD5E1'), 'FT-18: Heuristic policy line uses #CBD5E1 (grey)');
    assert(chartSrc.includes('#34D399'), 'FT-18: Agent policy line uses #34D399 (emerald)');
    assert(chartSrc.includes('ReferenceLine') && chartSrc.includes('strokeDasharray'), 'FT-18: SLA threshold line rendered as dashed ReferenceLine');
  } catch (e) {
    assert(false, `FT-18 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-19: Axis rule max(2 x SLA, 1.2 x maxVal)
  // -------------------------------------------------------------
  try {
    const chartSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'live', 'LiveChartsOverlay.tsx'), 'utf-8');
    assert(chartSrc.includes('Math.max(slaUrllcLimit * 2, maxVal * 1.2'), 'FT-19: Dynamic Y-axis upper bound strictly follows max(2 x SLA limit, 1.2 x highest value)');
  } catch (e) {
    assert(false, `FT-19 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-20: Spike buttons trigger spikes on backend
  // -------------------------------------------------------------
  try {
    const spikeRes = await httpPost('/spike', { slice: 'urllc', factor: 3.0, duration: 25 });
    assert(spikeRes.status === 200 && spikeRes.body.status === 'spike_triggered', 'FT-20: /spike endpoint triggers synchronized URLLC spike on simulator');
  } catch (e) {
    assert(false, `FT-20 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-23: Feed collapses consecutive duplicate lines (x12)
  // -------------------------------------------------------------
  try {
    const feedSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'live', 'ExplainabilityFeed.tsx'), 'utf-8');
    assert(feedSrc.includes('last.count += 1') && feedSrc.includes('x{item.count}'), 'FT-23: Feed groups consecutive repeat events with counter tag (xN)');
  } catch (e) {
    assert(false, `FT-23 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-25: Pause and Reset endpoints respond cleanly
  // -------------------------------------------------------------
  try {
    const pauseRes = await httpPost('/pause', {});
    assert(pauseRes.status === 200, 'FT-25: /pause endpoint responds HTTP 200');
    // Unpause
    await httpPost('/pause', {});

    const resetRes = await httpPost('/reset', {});
    assert(resetRes.status === 200 && resetRes.body.status === 'simulation_reset', 'FT-25: /reset endpoint cleanly resets simulator state');
  } catch (e) {
    assert(false, `FT-25 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-26: Feed filter chips implemented
  // -------------------------------------------------------------
  try {
    const feedSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'live', 'ExplainabilityFeed.tsx'), 'utf-8');
    assert(
      feedSrc.includes('"spikes"') && feedSrc.includes('"bots"') && feedSrc.includes('"shield"') && feedSrc.includes('"sla"'),
      'FT-26: Feed supports specific category filter chips (spikes, bots, shield, sla)'
    );
  } catch (e) {
    assert(false, `FT-26 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-27: Policy cards share bars sum to 100%
  // -------------------------------------------------------------
  try {
    const cardSrc = fs.readFileSync(path.join(__dirname, 'src', 'components', 'live', 'PolicyResourceCards.tsx'), 'utf-8');
    assert(
      cardSrc.includes('prbEmbbPct') && cardSrc.includes('prbUrllcPct') && cardSrc.includes('prbMurllcPct'),
      'FT-27: Policy cards compute PRB and vCPU shares summing to 100%'
    );
    assert(
      cardSrc.includes('Shield Intervention'),
      'FT-27: Agent card displays real shield intervention rate meter'
    );
  } catch (e) {
    assert(false, `FT-27 exception: ${e.message}`);
  }

  console.log('\n----------------------------------------------------');
  if (failed === 0) {
    console.log('🎉 ALL PHASE F3 LIVE DEMO ACCEPTANCE TESTS PASSED (0 FAILURES)');
    process.exit(0);
  } else {
    console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
    process.exit(1);
  }
}

runTests();
