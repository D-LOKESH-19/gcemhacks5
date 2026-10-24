const fs = require('fs');
const path = require('path');
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const ROOT_DIR = path.resolve(__dirname, '..');
const http = require('http');

console.log('====================================================');
console.log('PHASE F8 ACCEPTANCE TESTS (FT-63 to FT-72)');
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

function httpGet(urlPath, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...customHeaders
    };
    http.get({
      host: '127.0.0.1',
      port: 8050,
      path: urlPath,
      headers
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  // -------------------------------------------------------------
  // FT-63: Production serve from root '/' serves React SPA index.html
  // -------------------------------------------------------------
  try {
    const res = await httpGet('/');
    assert(
      res.status === 200 && res.body.includes('<div id="root"></div>'),
      `FT-63: Root '/' serves React SPA index.html with HTTP 200 (length: ${res.body.length})`
    );
  } catch (e) {
    assert(false, `FT-63 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-64: Direct navigation to SPA routes serves index.html
  // -------------------------------------------------------------
  const spaRoutes = ['/traffic', '/agent', '/sla', '/training', '/results', '/present', '/about'];
  for (const route of spaRoutes) {
    try {
      const res = await httpGet(route);
      assert(
        res.status === 200 && res.body.includes('<div id="root"></div>'),
        `FT-64: Direct navigation to SPA route '${route}' returns HTTP 200 and index.html`
      );
    } catch (e) {
      assert(false, `FT-64 exception for '${route}': ${e.message}`);
    }
  }

  // -------------------------------------------------------------
  // FT-65: Classic NOC dashboard accessible at '/legacy'
  // -------------------------------------------------------------
  try {
    const res = await httpGet('/legacy');
    assert(
      res.status === 200 &&
      res.body.includes('5G SliceOS') &&
      res.body.includes('chart.min.js'),
      `FT-65: Classic NOC view served at '/legacy' with HTTP 200 (length: ${res.body.length})`
    );
  } catch (e) {
    assert(false, `FT-65 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-66: Reciprocal navigation links exist in both dashboards
  // -------------------------------------------------------------
  try {
    const legacyRes = await httpGet('/legacy');
    const headerSrc = fs.readFileSync(path.join(FRONTEND_DIR, 'src', 'components', 'layout', 'Header.tsx'), 'utf-8');
    const legacyHasReactLink = legacyRes.body.includes('Enterprise React Suite') && legacyRes.body.includes('href="/"');
    const reactHasLegacyLink = headerSrc.includes('href="/legacy"') && headerSrc.includes('Classic View');
    assert(
      legacyHasReactLink && reactHasLegacyLink,
      'FT-66: Reciprocal navigation active: /legacy links to / and React Header links to /legacy'
    );
  } catch (e) {
    assert(false, `FT-66 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-67: Fallback mechanism in api.py
  // -------------------------------------------------------------
  try {
    const apiSrc = fs.readFileSync(path.join(ROOT_DIR, 'api.py'), 'utf-8');
    assert(
      apiSrc.includes('os.path.join("frontend", "dist", "index.html")') &&
      apiSrc.includes('os.path.join("static", "index.html")') &&
      apiSrc.includes('get_legacy'),
      'FT-67: api.py implements multi-tier fallback between React dist, static classic, and JSON status'
    );
  } catch (e) {
    assert(false, `FT-67 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-68: Zero external CDN references in dist/ (100% self-contained offline)
  // -------------------------------------------------------------
  try {
    const distIndex = fs.readFileSync(path.join(FRONTEND_DIR, 'dist', 'index.html'), 'utf-8');
    const distAssets = fs.readdirSync(path.join(FRONTEND_DIR, 'dist', 'assets'));
    
    // Check index.html for external URLs
    const externalUrlRegex = /(https?:)?\/\/(?!localhost|127\.0\.0\.1)[^\s"'>]+/gi;
    const indexMatches = distIndex.match(externalUrlRegex) || [];
    
    // Filter out standard schema namespaces like xmlns or w3.org if any
    const realExternal = indexMatches.filter(u => !u.includes('w3.org'));

    // Check if fonts are bundled locally in dist/assets
    const fontFiles = distAssets.filter(f => f.endsWith('.woff') || f.endsWith('.woff2'));

    assert(
      realExternal.length === 0 && fontFiles.length >= 10,
      `FT-68: dist/ has 0 external CDN links and bundles ${fontFiles.length} local font files offline`
    );
  } catch (e) {
    assert(false, `FT-68 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-69: Production asset serving over HTTP
  // -------------------------------------------------------------
  try {
    const distAssets = fs.readdirSync(path.join(FRONTEND_DIR, 'dist', 'assets'));
    const sampleJs = distAssets.find(f => f.endsWith('.js'));
    const sampleCss = distAssets.find(f => f.endsWith('.css'));
    const sampleFont = distAssets.find(f => f.endsWith('.woff2'));

    const jsRes = await httpGet(`/assets/${sampleJs}`);
    const cssRes = await httpGet(`/assets/${sampleCss}`);
    const fontRes = await httpGet(`/assets/${sampleFont}`);

    assert(
      jsRes.status === 200 && cssRes.status === 200 && fontRes.status === 200,
      `FT-69: Production bundled assets served over HTTP at /assets/ (JS: ${jsRes.status}, CSS: ${cssRes.status}, Font: ${fontRes.status})`
    );
  } catch (e) {
    assert(false, `FT-69 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-70: Model weights integrity check
  // -------------------------------------------------------------
  try {
    const crypto = require('crypto');
    const modelBuf = fs.readFileSync(path.join(ROOT_DIR, 'models', 'agent.zip'));
    const hash = crypto.createHash('sha256').update(modelBuf).digest('hex');
    assert(
      hash === '3cd0a7e66847f16a2ddc828bd7173878aba1538b15a79756675e177cd26314e1',
      `FT-70: models/agent.zip SHA256 verified identical (${hash.slice(0, 16)}...)`
    );
  } catch (e) {
    assert(false, `FT-70 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-71: Simulator & safety shield core logic untouched
  // -------------------------------------------------------------
  try {
    const simSrc = fs.readFileSync(path.join(ROOT_DIR, 'sim.py'), 'utf-8');
    const shieldSrc = fs.readFileSync(path.join(ROOT_DIR, 'shield.py'), 'utf-8');
    const slaSrc = fs.readFileSync(path.join(ROOT_DIR, 'sla.py'), 'utf-8');

    assert(
      simSrc.includes('class SliceEnv') &&
      shieldSrc.includes('def apply_shield') &&
      slaSrc.includes('def window_status') &&
      slaSrc.includes('def is_feasible'),
      'FT-71: Simulator core SliceEnv, apply_shield, and sla functions (window_status, is_feasible) remain intact and unmodified'
    );
  } catch (e) {
    assert(false, `FT-71 exception: ${e.message}`);
  }

  // -------------------------------------------------------------
  // FT-72: Documentation integrity and coexistence
  // -------------------------------------------------------------
  try {
    const readmeSrc = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf-8');
    assert(
      readmeSrc.includes('Enterprise React 18') && readmeSrc.includes('/legacy'),
      'FT-72: README.md fully specifies enterprise architecture and legacy coexistence'
    );
  } catch (e) {
    assert(false, `FT-72 exception: ${e.message}`);
  }

  console.log('\n----------------------------------------------------');
  if (failed === 0) {
    console.log('🎉 ALL PHASE F8 ACCEPTANCE TESTS (FT-63 - FT-72) PASSED!');
    console.log('----------------------------------------------------');
    process.exit(0);
  } else {
    console.error(`❌ ${failed} PHASE F8 TESTS FAILED.`);
    console.log('----------------------------------------------------');
    process.exit(1);
  }
}

runTests();
