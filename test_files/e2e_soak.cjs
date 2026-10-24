// E2E-L5 soak: the real app in headless Chromium with random spikes, bot changes and resets for SOAK_MIN minutes
// (default 30). Samples browser heap, DOM size, server memory and ledger size every 20 s and writes results/lending_soak.json.
// Run: node test_files/e2e_soak.cjs          (SOAK_MIN=2 node test_files/e2e_soak.cjs for a quick check)
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8125, CDP_PORT = 9335, BASE = `http://127.0.0.1:${PORT}`;
const MIN = Number(process.env.SOAK_MIN || 30);
const CHROME = path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1148', 'chrome-win', 'chrome.exe');
const PY = path.join(ROOT, 'venv', 'Scripts', 'python.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rng = (() => { let a = 20261024; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randint = (a, b) => a + Math.floor(rng() * (b - a + 1));

class Cdp { constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.p = new Map(); this.h = [];
  this.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && this.p.has(m.id)) { const x = this.p.get(m.id); this.p.delete(m.id); m.error ? x.rej(new Error(JSON.stringify(m.error))) : x.res(m.result); } else this.h.forEach((f) => f(m)); }); }
  ready() { return new Promise((r) => this.ws.addEventListener('open', r)); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.p.set(id, { res, rej })); } }

function rssMB(pid) {  // working set of the process tree (the venv python.exe is only a launcher for the real interpreter)
  const cmd = `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid} or ParentProcessId=${pid}" | Measure-Object WorkingSetSize -Sum).Sum`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
  const v = Number(String(r.stdout).trim());
  return Number.isFinite(v) && v > 0 ? v / 1048576 : NaN;
}

(async () => {
  const out = { minutes: MIN, samples: [], actions: { spike: 0, bots: 0, reset: 0 }, errors: [] };
  const server = spawn(PY, ['-m', 'uvicorn', 'api:app', '--port', String(PORT), '--log-level', 'warning'], { cwd: ROOT, stdio: 'ignore' });
  let chrome, cdp;
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch (e) { /* starting */ } await sleep(250); }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soak-chrome-'));
    chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${tmp}`, '--no-first-run', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
    let t = null; for (let i = 0; i < 80 && !t; i++) { try { t = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((x) => x.type === 'page'); } catch (e) { /* starting */ } await sleep(250); }
    cdp = new Cdp(t.webSocketDebuggerUrl); await cdp.ready();
    cdp.h.push((m) => {
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') out.errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
      if (m.method === 'Runtime.exceptionThrown') out.errors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') out.errors.push('log: ' + m.params.entry.text);
    });
    for (const d of ['Page', 'Runtime', 'Log', 'Performance', 'HeapProfiler']) await cdp.send(d + '.enable');
    const ev = async (e) => (await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: BASE + '/allocation' });
    await sleep(4000);
    await ev(`document.querySelector('[data-testid=tab-enhanced]')?.click(); true`);

    const post = async (p, body) => { try { await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); } catch (e) { out.errors.push('http: ' + e.message); } };
    const factor = { embb: 2.5, urllc: 3.0, murllc: 7.0 };
    const t0 = Date.now(), end = t0 + MIN * 60000;
    let nextSample = t0 + 20000, nextAction = t0 + 8000, nextReset = t0 + 4 * 60000, lastStep = -1;
    while (Date.now() < end) {
      const now = Date.now();
      if (now >= nextAction) {
        if (rng() < 0.55) { const s = pick(['embb', 'urllc', 'murllc']); await post('/spike', { slice: s, factor: Number((factor[s] * (0.7 + 0.6 * rng())).toFixed(2)), duration: randint(8, 25) }); out.actions.spike++; }
        else { await post('/bots', { slice: pick(['embb', 'urllc', 'murllc']), count: randint(5, 60), mode: pick(['add', 'remove']) }); out.actions.bots++; }
        nextAction = now + randint(3000, 8000);
      }
      if (now >= nextReset) { await post('/reset'); out.actions.reset++; nextReset = now + randint(3, 6) * 60000; }
      if (now >= nextSample) {
        await cdp.send('HeapProfiler.collectGarbage');   // live memory, not garbage waiting to be collected
        const m = await cdp.send('Performance.getMetrics');
        const g = (n) => (m.metrics.find((x) => x.name === n) || {}).value;
        const dom = await ev(`({ step: Number((document.body.innerText.match(/Step:\\s*([\\d,]+)/) || [0, 0])[1].toString().replace(/,/g, '')), ledger: document.querySelector('[data-testid=ledger-count]')?.innerText || '', rows: document.querySelectorAll('[data-testid=ledger-row]').length,
          live: /Live/.test(document.body.innerText), loans: document.querySelectorAll('[data-testid=loan-arrow]').length })`);
        const kept = Number((dom.ledger.match(/\/\s*(\d+)\s*kept/) || [0, -1])[1]);
        const s = { t_min: Number(((now - t0) / 60000).toFixed(2)), heap_mb: g('JSHeapUsedSize') / 1048576, dom_nodes: g('Nodes'), listeners: g('JSEventListeners'), server_rss_mb: rssMB(server.pid), step: dom.step, ledger_kept: kept, ledger_rows: dom.rows, live: dom.live, loans: dom.loans };
        out.samples.push(s);
        console.log(JSON.stringify(s));
        lastStep = dom.step;
        nextSample = now + 20000;
      }
      await sleep(250);
    }
    // ---- verdict
    const S = out.samples, n = S.length;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    // thirds of the run: the first third is warm-up; compare the MAXIMUM of the last third with the middle third
    // (state-dependent quantities such as DOM rows rise and fall with resets, so means of short windows are noise)
    const third = Math.max(1, Math.floor(n / 3));
    const mid = S.slice(third, 2 * third), late = S.slice(2 * third);
    const mx = (a, k) => Math.max(...a.map((x) => x[k]));
    const ratio = (k) => mx(late, k) / Math.max(1e-9, mx(mid, k));
    out.summary = {
      samples: n, heap_mb_max_mid: mx(mid, 'heap_mb'), heap_mb_max_late: mx(late, 'heap_mb'), heap_ratio: ratio('heap_mb'),
      dom_nodes_max_mid: mx(mid, 'dom_nodes'), dom_nodes_max_late: mx(late, 'dom_nodes'), dom_ratio: ratio('dom_nodes'),
      rss_mb_max_mid: mx(mid, 'server_rss_mb'), rss_mb_max_late: mx(late, 'server_rss_mb'), rss_ratio: ratio('server_rss_mb'),
      max_ledger_kept: Math.max(...S.map((x) => x.ledger_kept)), max_ledger_rows: Math.max(...S.map((x) => x.ledger_rows)), max_heap_mb: mx(S, 'heap_mb'),
      always_live: S.every((x) => x.live), console_errors: out.errors.length,
    };
    const R = out.summary;
    out.checks = {
      'no console errors': R.console_errors === 0,
      'stream stayed live (UI shows Live in every sample)': R.always_live,
      'ledger capped at 200 (kept <= 200, rows shown <= 200)': R.max_ledger_kept <= 200 && R.max_ledger_rows <= 200 && R.max_ledger_kept >= 0,
      'browser heap stable (max of last third / max of middle third <= 1.5)': R.heap_ratio <= 1.5,
      'DOM size stable (last third / middle third <= 1.5)': R.dom_ratio <= 1.5,
      'server memory stable (last third / middle third <= 1.3)': R.rss_ratio <= 1.3,
    };
  } catch (e) {
    out.errors.push('soak aborted: ' + e.stack);
    out.checks = { 'soak completed': false };
  } finally {
    try { cdp && cdp.ws.close(); } catch (e) { /* ignore */ }
    for (const p of [chrome, server]) if (p && p.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  fs.writeFileSync(path.join(ROOT, 'results', 'lending_soak.json'), JSON.stringify(out, null, 1));
  console.log('\nSUMMARY', JSON.stringify(out.summary || {}, null, 1));
  let bad = 0;
  for (const [k, v] of Object.entries(out.checks || {})) { console.log(`${v ? '✅ PASS' : '❌ FAIL'}: E2E-L5 ${k}`); if (!v) bad++; }
  if (out.errors.length) console.log('errors:', out.errors.slice(0, 5));
  process.exit(bad ? 1 : 0);
})();
