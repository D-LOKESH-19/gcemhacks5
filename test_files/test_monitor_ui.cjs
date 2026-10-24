// Monitor page in a REAL browser (Chromium over the DevTools Protocol, no extra dependency).
// Run: node test_files/test_monitor_ui.cjs   (needs frontend/dist built)
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8127, CDP_PORT = 9337, BASE = `http://127.0.0.1:${PORT}`;
const CHROME = path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1148', 'chrome-win', 'chrome.exe');
const PY = path.join(ROOT, 'venv', 'Scripts', 'python.exe');
let passed = 0, failed = 0;
const assert = (ok, msg) => { if (ok) { passed++; console.log(`✅ PASS: ${msg}`); } else { failed++; console.error(`❌ FAIL: ${msg}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());

class Cdp { constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.p = new Map(); this.h = [];
  this.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && this.p.has(m.id)) { const x = this.p.get(m.id); this.p.delete(m.id); m.error ? x.rej(new Error(JSON.stringify(m.error))) : x.res(m.result); } else this.h.forEach((f) => f(m)); }); }
  ready() { return new Promise((r) => this.ws.addEventListener('open', r)); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.p.set(id, { res, rej })); } }

let cdp, server, chrome;
const errors = [];
async function ev(expr) { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; }
async function waitFor(expr, timeout = 15000, interval = 100) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await ev(expr)) return true; } catch (e) { /* navigating */ } await sleep(interval); } return false; }
async function viewport(w, h) { await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(500); }
async function setPaused(want) { for (let i = 0; i < 2; i++) { const r = await post('/pause'); if (r.paused === want) return; } }
const txt = (sel) => ev(`(document.querySelector('${sel}')?.innerText || '').trim()`);

async function main() {
  server = spawn(PY, ['-m', 'uvicorn', 'api:app', '--port', String(PORT), '--log-level', 'warning'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (e) { /* starting */ } await sleep(250); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mon-chrome-'));
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${tmp}`, '--no-first-run', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
  let t = null; for (let i = 0; i < 80 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((x) => x.type === 'page'); } catch (e) { /* starting */ } await sleep(250); }
  cdp = new Cdp(t.webSocketDebuggerUrl); await cdp.ready();
  cdp.h.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text);
  });
  for (const d of ['Page', 'Runtime', 'Log']) await cdp.send(d + '.enable');
  await viewport(1920, 1080);

  // generate real problems: start on the Live page (the stream runs while a client is connected), storm + overload
  await cdp.send('Page.navigate', { url: BASE + '/' });
  await waitFor(`document.readyState === 'complete'`);
  await post('/reset');
  await sleep(2500);
  await post('/spike', { slice: 'murllc', factor: 7.0, duration: 15 });
  await post('/bots', { slice: 'murllc', count: 1000, mode: 'set' });   // ~200 pkts/step > Static's fixed mURLLC capacity (180): deadline misses every step
  await sleep(5000);
  await post('/bots', { slice: 'embb', count: 200, mode: 'set' });
  await sleep(5000);

  // navigate through the header link, like a user
  const link = await ev(`(() => { const a = Array.from(document.querySelectorAll('header a')).find((x) => x.getAttribute('href') === '/monitor'); if (!a) return false; a.click(); return a.innerText.trim(); })()`);
  assert(link === 'Monitor', `header shows a 'Monitor' link and it opens the page (${link})`);
  assert(await waitFor(`!!document.querySelector('[data-testid=incident-row]')`, 20000), 'Monitor page loads incidents from /api/monitor');

  // ---- freeze the simulation, then compare the screen with the backend exactly
  await setPaused(true);
  await sleep(400);
  const snap = await (await fetch(BASE + '/api/monitor?limit=200')).json();
  // the page polls every 1.5 s; wait until its next poll has caught up with the paused backend, then compare exactly
  const caught = await waitFor(`document.querySelector('[data-testid=monitor-position]').innerText.startsWith('episode ${snap.episode}, step ${snap.step} ')`, 8000, 100);
  assert(caught, `page catches up with the paused backend (episode ${snap.episode}, step ${snap.step}) within one poll`);
  const ui = await ev(`({ crit: document.querySelector('[data-testid=tile-critical]').innerText, warn: document.querySelector('[data-testid=tile-warning]').innerText,
     missed: document.querySelector('[data-testid=tile-missed]').innerText, rows: document.querySelectorAll('[data-testid=incident-row]').length,
     ids: Array.from(document.querySelectorAll('[data-testid=incident-row] td:first-child')).map((x) => Number(x.innerText)),
     logs: document.querySelectorAll('[data-testid=log-line]').length, pos: document.querySelector('[data-testid=monitor-position]').innerText,
     staticMissed: document.querySelector('[data-testid=policy-missed-static]')?.innerText, agentMissed: document.querySelector('[data-testid=policy-missed-agent]')?.innerText,
     active: document.querySelectorAll('[data-testid=active-row]').length })`);
  const missedTot = Object.values(snap.missed_packets).reduce((a, b) => a + b, 0);
  assert(ui.crit.includes(String(snap.totals.critical)) && ui.warn.includes(String(snap.totals.warning)) && ui.missed.includes(missedTot.toFixed(1)),
    `summary tiles equal the backend (critical ${snap.totals.critical}, warnings ${snap.totals.warning}, packets missed ${missedTot.toFixed(1)})`);
  assert(ui.rows === snap.incidents.length && JSON.stringify(ui.ids) === JSON.stringify(snap.incidents.map((i) => i.id)),
    `incident table shows exactly the backend incidents, newest first (${ui.rows} rows, ids ${ui.ids.slice(0, 4).join(', ')}...)`);
  assert(ui.logs === snap.logs.length && ui.pos.includes(`episode ${snap.episode}, step ${snap.step}`), `log console shows the backend's ${snap.logs.length} log lines (UI ${ui.logs}); position 'episode ${snap.episode}, step ${snap.step}' (UI '${ui.pos}')`);
  assert(ui.staticMissed === (snap.missed_packets.static ?? 0).toFixed(1) && ui.agentMissed === (snap.missed_packets.agent ?? 0).toFixed(1),
    `per-policy cards equal the backend (Static ${ui.staticMissed} packets missed, Agent ${ui.agentMissed})`);
  assert(ui.active === snap.active.filter((i) => i.severity !== 'info').length, `active-problems list matches the backend (${ui.active} critical/warning ongoing)`);
  const kinds = new Set(snap.incidents.map((i) => i.type));
  assert(kinds.has('deadline_miss') && (kinds.has('infeasible_load') || kinds.has('lending_overload')) && (kinds.has('sla_breach') || kinds.has('sla_at_risk')),
    `the storm and the overload produced the expected kinds of problem (${[...kinds].join(', ')})`);

  // ---- filters
  await ev(`document.querySelector('[data-testid=incident-sev-critical]').click(); true`); await sleep(150);
  const sevOk = await ev(`Array.from(document.querySelectorAll('[data-testid=incident-row] [data-severity]')).every((e) => e.dataset.severity === 'critical')`);
  const nCrit = await ev(`document.querySelectorAll('[data-testid=incident-row]').length`);
  await ev(`document.querySelector('[data-testid=incident-sev-all]').click(); true`);
  await ev(`(() => { const s = document.querySelector('[data-testid=incident-policy]'); s.value = 'static'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(150);
  const polOk = await ev(`Array.from(document.querySelectorAll('[data-testid=incident-row]')).every((r) => r.dataset.policy === 'static')`);
  const nStatic = await ev(`document.querySelectorAll('[data-testid=incident-row]').length`);
  await ev(`(() => { const s = document.querySelector('[data-testid=incident-policy]'); s.value = 'all'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert(sevOk && nCrit === snap.incidents.filter((i) => i.severity === 'critical').length && polOk && nStatic === snap.incidents.filter((i) => i.policy === 'static').length,
    `incident filters work (critical only: ${nCrit} rows; Static only: ${nStatic} rows; both equal the backend counts)`);
  await ev(`document.querySelector('[data-testid=log-source-lending]').click(); true`); await sleep(150);
  const lend = await ev(`Array.from(document.querySelectorAll('[data-testid=log-line]')).map((l) => l.dataset.source)`);
  await ev(`document.querySelector('[data-testid=log-source-all]').click(); true`);
  await ev(`(() => { const i = document.querySelector('[data-testid=log-search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'closed'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(150);
  const srch = await ev(`Array.from(document.querySelectorAll('[data-testid=log-line]')).map((l) => l.innerText.toLowerCase())`);
  assert(lend.length === snap.logs.filter((l) => l.source === 'lending').length && lend.every((s) => s === 'lending') && srch.length > 0 && srch.every((s) => s.includes('closed')),
    `log filters work (source 'lending': ${lend.length} lines; search 'closed': ${srch.length} lines)`);
  await ev(`(() => { const i = document.querySelector('[data-testid=log-search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  assert(await ev(`document.querySelector('[data-testid=monitor-timeline] path.recharts-line-curve') !== null`), 'deadline-miss timeline chart is drawn');

  // ---- live updates and freeze
  await setPaused(false);
  const tick0 = snap.tick;
  const moved = await waitFor(`(() => { const m = document.querySelector('[data-testid=monitor-position]').innerText.match(/step (\\d+)/); return true; })()`, 100);
  await sleep(3500);
  const snap2 = await (await fetch(BASE + '/api/monitor?limit=1')).json();
  const pos2 = await txt('[data-testid=monitor-position]');
  assert(moved && snap2.tick > tick0 && pos2.includes(`episode ${snap2.episode}`), `page updates live while the simulation runs (backend moved from ${tick0} to ${snap2.tick} observed steps)`);
  await ev(`document.querySelector('[data-testid=monitor-freeze]').click(); true`); await sleep(300);
  const f1 = await txt('[data-testid=monitor-position]');
  await sleep(3500);
  const f2 = await txt('[data-testid=monitor-position]');
  assert(f1 === f2 && (await txt('[data-testid=monitor-state]')) === 'frozen', 'Freeze stops the page from updating (simulation keeps running)');
  await ev(`document.querySelector('[data-testid=monitor-freeze]').click(); true`);

  // ---- layout at both demo resolutions, every page header (one more nav link)
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    await viewport(w, h);
    for (const p of ['/monitor', '/allocation', '/']) {
      await cdp.send('Page.navigate', { url: BASE + p }); await waitFor(`document.readyState === 'complete'`); await sleep(2500);
      const o = await ev(`(() => { const hs = document.documentElement.scrollWidth - window.innerWidth; const links = Array.from(document.querySelectorAll('header nav a')).map((a) => a.getBoundingClientRect());
        let ov = 0; for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) { const a = links[i], b = links[j]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) ov++; }
        const tiles = Array.from(document.querySelectorAll('[data-testid=monitor-page] [data-testid^=tile-],[data-testid=monitor-page] [data-testid^=policy-health-]')).map((e) => e.getBoundingClientRect()); let tov = 0;
        for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) { const a = tiles[i], b = tiles[j]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) tov++; }
        return { hs, ov, tov }; })()`);
      assert(o.hs <= 1 && o.ov === 0 && o.tov === 0, `${w}x${h} ${p}: no horizontal scroll (${o.hs}px), no overlapping nav links (${o.ov}) or tiles (${o.tov})`);
    }
    if (w === 1920) { await cdp.send('Page.navigate', { url: BASE + '/monitor' }); await waitFor(`!!document.querySelector('[data-testid=incident-row]')`, 15000);
      const m = await cdp.send('Page.getLayoutMetrics'); const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 2600), scale: 1 } });
      fs.writeFileSync(path.join(ROOT, 'results', 'monitor_ui.png'), Buffer.from(r.data, 'base64')); }
  }
  const src = ['pages/MonitorPage.tsx', 'components/monitor/IncidentTable.tsx', 'components/monitor/LogConsole.tsx', 'components/monitor/ProblemTimeline.tsx', 'components/monitor/monitorUtils.tsx']
    .map((f) => fs.readFileSync(path.join(ROOT, 'frontend', 'src', f), 'utf8')).join('\n');
  assert(!/Math\.random|\bmock\b|\bfake\b/i.test(src), 'no Math.random, mock or fake data in the Monitor page code');
  await post('/reset');
  assert(errors.length === 0, `no console errors during the whole run (${errors.length}${errors.length ? ': ' + errors.slice(0, 2).join(' || ') : ''})`);
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
