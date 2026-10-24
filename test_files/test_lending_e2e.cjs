// Phase L6 browser end-to-end: E2E-L1 (storm story from a cold start) and E2E-L3 (overload honesty on every page).
// Real server + real Chromium over the DevTools Protocol (no extra dependency). Run: node test_files/test_lending_e2e.cjs
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8126, CDP_PORT = 9336, BASE = `http://127.0.0.1:${PORT}`;
const CHROME = path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1148', 'chrome-win', 'chrome.exe');
const PY = path.join(ROOT, 'venv', 'Scripts', 'python.exe');
let passed = 0, failed = 0;
const assert = (ok, msg) => { if (ok) { passed++; console.log(`✅ PASS: ${msg}`); } else { failed++; console.error(`❌ FAIL: ${msg}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });

class Cdp { constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.p = new Map(); this.h = [];
  this.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && this.p.has(m.id)) { const x = this.p.get(m.id); this.p.delete(m.id); m.error ? x.rej(new Error(JSON.stringify(m.error))) : x.res(m.result); } else this.h.forEach((f) => f(m)); }); }
  ready() { return new Promise((r) => this.ws.addEventListener('open', r)); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.p.set(id, { res, rej })); } }

let cdp, server, chrome;
const errors = [];
async function ev(expr) { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; }
async function waitFor(expr, timeout = 15000, interval = 100) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await ev(expr)) return true; } catch (e) { /* navigating */ } await sleep(interval); } return false; }
async function goto(p) {
  await cdp.send('Page.navigate', { url: BASE + p });
  await waitFor(`document.readyState === 'complete'`, 15000);
  await ev(`window.__frames = []; window.__tap = new WebSocket('ws://' + location.host + '/ws'); window.__tap.onmessage = (e) => { window.__frames.push(JSON.parse(e.data)); if (window.__frames.length > 900) window.__frames.shift(); }; true`);
}

async function main() {
  server = spawn(PY, ['-m', 'uvicorn', 'api:app', '--port', String(PORT), '--log-level', 'warning'], { cwd: ROOT, stdio: 'ignore' });  // fresh process = cold start
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (e) { /* starting */ } await sleep(250); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-chrome-'));
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${tmp}`, '--no-first-run', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
  let t = null; for (let i = 0; i < 80 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((x) => x.type === 'page'); } catch (e) { /* starting */ } await sleep(250); }
  cdp = new Cdp(t.webSocketDebuggerUrl); await cdp.ready();
  cdp.h.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text);
  });
  for (const d of ['Page', 'Runtime', 'Log']) await cdp.send(d + '.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  // ================================================================ E2E-L1: cold start, 20 s steady, press mURLLC storm
  await goto('/allocation');
  await waitFor(`!!document.querySelector('[data-testid=tab-enhanced]')`, 20000);
  await ev(`document.querySelector('[data-testid=tab-enhanced]').click(); true`);
  console.log('   steady load for 20 seconds (cold start)...');
  await sleep(20000);
  const before = await ev(`window.__frames[window.__frames.length - 1]`);
  const lb = before.policies.enhanced.allocation.lending;
  const th = lb.thresholds;
  assert(lb.risk[2] < th.low && lb.loans_active.length === 0 && !lb.overload, `E2E-L1: after 20 s of steady load all risks are low (mURLLC ${(lb.risk[2] * 100).toFixed(1)}%), no loans, no overload`);
  await ev(`window.__frames = []; true`);
  await post('/spike', { slice: 'murllc', factor: 7.0, duration: 15 });   // the mURLLC storm button
  const s = { maxRisk: 0, loan: null, amounts: [], gone: false, donorRisk: null };
  const t0 = Date.now();
  while (Date.now() - t0 < 70000) {
    const f = await ev(`(() => { const fr = window.__frames[window.__frames.length - 1]; const L = fr?.policies?.enhanced?.allocation?.lending; const m = document.querySelector('[data-testid=risk-gauge-murllc] [role=meter]');
      return { gauge: m ? Number(m.dataset.risk) : 0, loans: L?.loans_active || [], risk: L?.risk || [0, 0, 0], arrows: document.querySelectorAll('[data-testid=loan-arrow]').length }; })()`);
    s.maxRisk = Math.max(s.maxRisk, f.gauge);
    if (f.loans.length && !s.loan) { s.loan = f.loans[0]; s.donorRisk = f.risk[['embb', 'urllc', 'murllc'].indexOf(f.loans[0].donor)]; }
    if (f.loans.length) { const a = f.loans.reduce((x, l) => x + l.amount_units, 0); if (!s.amounts.length || a !== s.amounts[s.amounts.length - 1]) s.amounts.push(a); }
    if (s.loan && f.loans.length === 0 && f.arrows === 0) { s.gone = true; break; }
    await sleep(100);
  }
  assert(s.maxRisk >= th.high, `E2E-L1: the Enhanced mURLLC risk gauge rises to ${(s.maxRisk * 100).toFixed(1)}% (high threshold ${th.high * 100}%) when the storm starts`);
  assert(!!s.loan && s.loan.borrower === 'murllc' && s.donorRisk < th.low, `E2E-L1: a loan opens to mURLLC from the slice with spare capacity (${s.loan ? s.loan.donor : 'none'}, donor risk ${s.donorRisk === null ? 'n/a' : (s.donorRisk * 100).toFixed(1) + '%'}; ${s.loan ? s.loan.amount_units.toFixed(2) + ' ' + (s.loan.resource === 'prb' ? 'PRB' : 'vCPU') : ''})`);
  const falling = s.amounts.length >= 3 && s.amounts.slice(-3).every((a, i, arr) => i === 0 || a < arr[i - 1]);
  assert(s.gone && falling, `E2E-L1: after the burst the loan is returned step by step (total on loan ${s.amounts.slice(-6).map((a) => a.toFixed(2)).join(' > ')}) until no loan remains`);
  const last = await ev(`window.__frames[window.__frames.length - 1]`);
  const sb = last.scoreboard;
  const v = (k) => sb[k].cum_violations;
  console.log(`   cumulative URLLC+mURLLC violated packets: static ${v('static').toFixed(1)}, heuristic ${v('heuristic').toFixed(1)}, agent ${v('agent').toFixed(1)}, enhanced ${v('enhanced').toFixed(1)}`);
  assert(v('static') > v('enhanced') && v('enhanced') <= v('agent'),
    `E2E-L1: Static shows violations (${v('static').toFixed(1)}) while Enhanced holds (${v('enhanced').toFixed(1)}), and Enhanced is not worse than the original agent (${v('agent').toFixed(1)}). HONEST NOTE: the original agent has no onset violations here either, so 'violations stay lower than the original agent' is NOT demonstrated`);

  // ================================================================ E2E-L3: maximum bots everywhere
  await post('/reset');
  await sleep(1500);
  const max = await (await fetch(BASE + '/bots')).json();
  for (const sl of ['embb', 'urllc', 'murllc']) await post('/bots', { slice: sl, count: max.max[sl] ?? max.max_counts[sl], mode: 'set' });
  const banner = await waitFor(`!!document.querySelector('[data-testid=overload-banner]')`, 40000);
  const btxt = banner ? await ev(`document.querySelector('[data-testid=overload-banner]').innerText`) : '';
  assert(banner && /lendable [\d.]+ (PRB|vCPU), need [\d.]+ (PRB|vCPU)/.test(btxt) && btxt.includes('URLLC and mURLLC protected first'),
    `E2E-L3: overload banner with exact numbers and the correct wording ("${(btxt.split('\n').find((l) => l.includes('lendable')) || '').slice(0, 90)}")`);
  const forbid = /all (three )?slas? (hold|holds|are met|is met|met)|guarantee[sd]? (all|every|the sla)|five nines|99\.999|slas? (are |is )?(always )?(guaranteed|assured) under/i;
  const claims = {}, markers = {};
  for (const p of ['/', '/allocation', '/sla', '/agent', '/results', '/present']) {
    await goto(p);
    await sleep(2500);
    const txt = await ev(`document.body.innerText`);
    claims[p] = (txt.match(forbid) || [null])[0];
    markers[p] = /overload/i.test(txt);
  }
  const bad = Object.entries(claims).filter(([, c]) => c);
  assert(bad.length === 0, `E2E-L3: no page claims that all SLAs hold or are guaranteed under overload (checked /, /allocation, /sla, /agent, /results, /present; found ${bad.map(([p, c]) => p + ': "' + c + '"').join('; ') || 'none'})`);
  assert(markers['/allocation'] && markers['/sla'], `E2E-L3: overload is shown on the Allocation page and on the SLA page ("[OVERLOAD ACTIVE]"); pages mentioning overload: ${Object.keys(markers).filter((p) => markers[p]).join(', ')}`);
  const slaTxt = await (async () => { await goto('/sla'); await sleep(2500); return ev(`document.body.innerText`); })();
  assert(/OVERLOAD ACTIVE/.test(slaTxt) && /protected first/i.test(await ev(`document.body.innerText`)), 'E2E-L3: the SLA page shows OVERLOAD ACTIVE and the wording "URLLC and mURLLC protected first"');
  await post('/reset');
  assert(errors.length === 0, `E2E: no console errors during the whole run (${errors.length}${errors.length ? ': ' + errors.slice(0, 2).join(' || ') : ''})`);
}

(async () => {
  try { await main(); } catch (e) { failed++; console.error('❌ FAIL: aborted: ' + e.stack); }
  finally {
    try { cdp && cdp.ws.close(); } catch (e) { /* ignore */ }
    for (const p of [chrome, server]) if (p && p.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
