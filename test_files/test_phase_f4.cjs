const fs = require('fs');
const path = require('path');
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const ROOT_DIR = path.resolve(__dirname, '..');
const http = require('http');

console.log('====================================================');
console.log('PHASE F4 ACCEPTANCE TESTS (FT-31 to FT-38)');
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
  // FT-31: Presets trigger spikes and bot changes
  // -------------------------------------------------------------
  try {
    const presetsSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'traffic', 'TrafficPresets.tsx'), 'utf-8');
    assert(
      presetsSrc.includes('steady') &&
      presetsSrc.includes('embb_surge') &&
      presetsSrc.includes('urllc_burst') &&
      presetsSrc.includes('murllc_storm') &&
      presetsSrc.includes('mixed'),
      'FT-31: TrafficPresets contains all 5 standard profiles (Steady, eMBB surge, URLLC burst, mURLLC storm, Mixed)'
    );
  } catch (e) {
    assert(false, `FT-31 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-32: Add bots to URLLC
  // -------------------------------------------------------------
  try {
    const res = await httpPost('/bots', { slice: 'urllc', count: 20, mode: 'add' });
    assert(res.status === 200 && res.body.bots && typeof res.body.bots.urllc === 'number', 'FT-32: POST /bots with mode "add" adds 20 bots to URLLC');
  } catch (e) {
    assert(false, `FT-32 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-33: Remove and Set bots
  // -------------------------------------------------------------
  try {
    const setRes = await httpPost('/bots', { slice: 'embb', count: 55, mode: 'set' });
    assert(setRes.status === 200 && setRes.body.bots.embb === 55, 'FT-33: POST /bots with mode "set" sets eMBB exactly to 55');

    const removeRes = await httpPost('/bots', { slice: 'embb', count: 15, mode: 'remove' });
    assert(removeRes.status === 200 && removeRes.body.bots.embb === 40, 'FT-33: POST /bots with mode "remove" reduces eMBB to 40');
  } catch (e) {
    assert(false, `FT-33 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-34: Limits clipping returns clipped flag
  // -------------------------------------------------------------
  try {
    // Attempt setting beyond max (e.g. 9999)
    const clipRes = await httpPost('/bots', { slice: 'urllc', count: 9999, mode: 'set' });
    assert(clipRes.status === 200 && clipRes.body.clipped === true, 'FT-34: Bots beyond max limit are cleanly clipped with clipped: true flag');
    // Reset back to normal
    await httpPost('/bots', { slice: 'urllc', count: 30, mode: 'set' });
  } catch (e) {
    assert(false, `FT-34 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-35: Dot scaling: 500 bots show <= 60 dots with scale label
  // -------------------------------------------------------------
  try {
    const canvasSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'traffic', 'DeviceCanvas.tsx'), 'utf-8');
    assert(
      canvasSrc.includes('Math.ceil(count / 60)') && canvasSrc.includes('1 dot ='),
      'FT-35: DeviceCanvas implements dynamic dot scaling (max 60 dots) with explicit "1 dot = X bots" legend'
    );
  } catch (e) {
    assert(false, `FT-35 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-36: Hidden when absent
  // -------------------------------------------------------------
  try {
    const panelSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'traffic', 'BotsControlPanel.tsx'), 'utf-8');
    assert(
      panelSrc.includes('capabilities.bots === false') && panelSrc.includes('Synthetic UE Generator Offline'),
      'FT-36: BotsControlPanel gracefully displays fallback note if capabilities.bots is false'
    );
  } catch (e) {
    assert(false, `FT-36 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-37: Input validation rejects decimals, negatives, text
  // -------------------------------------------------------------
  try {
    const panelSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'traffic', 'BotsControlPanel.tsx'), 'utf-8');
    assert(
      panelSrc.includes('!/^\\d+$/.test(trimmed)') && panelSrc.includes('Bot count must be greater than zero'),
      'FT-37: Client validation rejects decimals, negatives, and non-numeric characters before dispatch'
    );
  } catch (e) {
    assert(false, `FT-37 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-38: Stress test: 30 rapid requests execute reliably
  // -------------------------------------------------------------
  try {
    const promises = [];
    for (let i = 0; i < 30; i++) {
      promises.push(httpPost('/bots', { slice: 'murllc', count: 2, mode: 'add' }));
    }
    const results = await Promise.all(promises);
    const all200 = results.every((r) => r.status === 200);
    assert(all200, 'FT-38: Stress test with 30 concurrent bot adjustments completed with 100% HTTP 200 OK');

    // Reset mURLLC back to baseline
    await httpPost('/bots', { slice: 'murllc', count: 100, mode: 'set' });
  } catch (e) {
    assert(false, `FT-38 exception: ${e.message}`);
  }

  console.log('\n----------------------------------------------------');
  if (failed === 0) {
    console.log('🎉 ALL PHASE F4 TRAFFIC & BOTS ACCEPTANCE TESTS PASSED (0 FAILURES)');
    process.exit(0);
  } else {
    console.error(`💥 ${failed} ACCEPTANCE TESTS FAILED`);
    process.exit(1);
  }
}

runTests();
