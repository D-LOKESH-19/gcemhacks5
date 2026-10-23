// Phase L5 acceptance tests LU-1 .. LU-10 in a REAL browser (Chromium over the DevTools Protocol, no extra dependency).
// Starts uvicorn on :8123, drives the built React app, compares the DOM with the live WebSocket frames.
// Run: node test_files/test_lending_ui.cjs   (needs frontend/dist built and models/agent.zip)
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8123, CDP_PORT = 9333, BASE = `http://127.0.0.1:${PORT}`;
const CHROME = path.join(process.env.USERPROFILE || os.homedir(), 'AppData', 'Local', 'ms-playwright', 'chromium-1148', 'chrome-win', 'chrome.exe');
const PY = path.join(ROOT, 'venv', 'Scripts', 'python.exe');
const SHOT_DIR = process.env.LU_SHOTS || path.join(ROOT, 'results');

let failed = 0, passed = 0;
function assert(ok, msg) { if (ok) { passed++; console.log(`✅ PASS: ${msg}`); } else { failed++; console.error(`❌ FAIL: ${msg}`); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function http(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}

class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.handlers = [];
    this.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
      if (m.id) { const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } }
      else this.handlers.forEach((h) => h(m)); }); }
  ready() { return new Promise((r) => this.ws.addEventListener('open', r)); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  on(h) { this.handlers.push(h); }
}

let cdp, server, chrome;
const consoleErrors = [], requests = new Set();

async function ev(expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr, timeout = 15000, interval = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { const v = await ev(expr); if (v) return v; } catch (e) { /* page navigating */ } await sleep(interval); }
  return false;
}
async function viewport(w, h) { await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(400); }
async function goto(p) {
  await cdp.send('Page.navigate', { url: BASE + p });
  await waitFor(`document.readyState === 'complete'`, 15000);
  await ev(`window.__frames = []; window.__tap = new WebSocket('ws://' + location.host + '/ws');
            window.__tap.onmessage = (e) => { const m = JSON.parse(e.data); window.__frames.push(m); if (window.__frames.length > 600) window.__frames.shift(); }; true`);
}
const lastFrame = () => ev(`window.__frames[window.__frames.length - 1] || null`);
const lend = (f) => f?.policies?.enhanced?.allocation?.lending;
async function shot(name) {  // full page, so loan arrows, loaned cells and the ledger below the fold are captured too
  const m = await cdp.send('Page.getLayoutMetrics');
  const clip = { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 2600), scale: 1 };
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip }); fs.mkdirSync(SHOT_DIR, { recursive: true }); fs.writeFileSync(path.join(SHOT_DIR, name), Buffer.from(r.data, 'base64')); }

const OVERLAP_FN = `(function(){
  const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 2 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 2;
  const pairs = (els) => { const out = []; const rs = els.map(rect).filter((r) => r.w > 0 && r.h > 0);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (hit(rs[i], rs[j])) out.push([i, j]); return out; };
  const q = (s, root) => Array.from((root || document).querySelectorAll(s));
  const res = { gauges: pairs(q('[data-testid^=risk-gauge-]')), forecasts: pairs(q('[data-testid^=forecast-]')),
    flowText: pairs(q('[data-testid=loan-flow] svg text')), panelStack: pairs(q('[data-testid=lending-panel] > *')),
    gaugeLabels: q('[data-testid^=risk-gauge-]').map((g) => pairs(q('span.absolute', g)).length).reduce((a, b) => a + b, 0),
    hscroll: document.documentElement.scrollWidth - window.innerWidth };
  return res; })()`;

async function main() {
  // ---------------------------------------------------------------- setup
  server = spawn(PY, ['-m', 'uvicorn', 'api:app', '--port', String(PORT), '--log-level', 'warning'], { cwd: ROOT, stdio: 'ignore' });
  assert(await (async () => { for (let i = 0; i < 80; i++) { try { const r = await fetch(BASE + '/health'); if (r.ok) return true; } catch (e) { /* starting */ } await sleep(250); } return false; })(), 'server started on :' + PORT);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lu-chrome-'));
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${tmp}`, '--no-first-run', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { try { const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json(); target = l.find((t) => t.type === 'page'); } catch (e) { /* starting */ } await sleep(250); }
  assert(!!target, 'Chromium started with DevTools Protocol');
  cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready();
  cdp.on((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') consoleErrors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    if (m.method === 'Network.requestWillBeSent') requests.add(m.params.request.url);
  });
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await cdp.send(d + '.enable');

  await http('POST', '/reset');
  await viewport(1920, 1080);

  // ---------------------------------------------------------------- LU-1 Enhanced everywhere
  await goto('/');
  assert(await waitFor(`!!document.querySelector('[data-testid=tile-enhanced]')`, 20000), 'LU-1: scoreboard tile for Enhanced rendered on the Live page');
  const lu1 = await ev(`(() => { const c = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
    return { tileBorder: c('[data-testid=tile-enhanced]', 'borderTopColor'), dotEnh: c('.bg-policy-enhanced', 'backgroundColor'),
      dotStatic: c('.bg-policy-static', 'backgroundColor'), dotHeur: c('.bg-policy-heuristic', 'backgroundColor'), dotAgent: c('.bg-policy-agent', 'backgroundColor'),
      line: !!document.querySelector('svg path[stroke="#F472B6"]'), card: Array.from(document.querySelectorAll('h2,span,div')).some((e) => e.children.length === 0 && e.textContent.trim() === 'Enhanced: Agent + Lender + Shield') }; })()`);
  assert(lu1.tileBorder === 'rgb(244, 114, 182)' && lu1.dotEnh === 'rgb(244, 114, 182)', `LU-1: Enhanced tile border and card dot use pink #F472B6 (${lu1.tileBorder}, ${lu1.dotEnh})`);
  assert(await waitFor(`!!document.querySelector('svg path[stroke="#F472B6"]')`, 15000), 'LU-1: Enhanced chart line (#F472B6) drawn in the live charts');
  assert(lu1.card, 'LU-1: Enhanced policy card rendered with its title');
  assert(lu1.dotStatic === 'rgb(248, 113, 113)' && lu1.dotHeur === 'rgb(203, 213, 225)' && lu1.dotAgent === 'rgb(52, 211, 153)', `LU-1: other policy colours unchanged (static ${lu1.dotStatic}, heuristic ${lu1.dotHeur}, agent ${lu1.dotAgent})`);

  // ---------------------------------------------------------------- allocation page: LU-2, LU-9a
  await goto('/allocation');
  assert(await waitFor(`!!document.querySelector('[data-testid=lending-panel]')`, 20000), 'LU-2: Lending panel rendered on the Allocation page');
  const tab = await ev(`(() => { const t = document.querySelector('[data-testid=tab-enhanced]'); if (!t) return null; t.click(); return true; })()`);
  await sleep(300);
  assert(tab && (await ev(`getComputedStyle(document.querySelector('[data-testid=tab-enhanced]')).backgroundColor`)) === 'rgb(244, 114, 182)', 'LU-1: Enhanced tab present on the Allocation page and pink when active');

  await sleep(2500);
  const g = await ev(`Array.from(document.querySelectorAll('[data-testid^=risk-gauge-]')).map((el) => ({ id: el.dataset.testid, risk: el.querySelector('[role=meter]').dataset.risk,
      text: el.innerText }))`);
  const frames = await ev(`window.__frames.slice(-12)`);
  const sl = ['embb', 'urllc', 'murllc'];
  const match = g.length === 3 && g.every((x, i) => frames.some((f) => lend(f)?.risk && Math.abs(lend(f).risk[i] - Number(x.risk)) < 1e-4));
  assert(match, `LU-2: gauge values equal the stream (gauges ${g.map((x) => (Number(x.risk) * 100).toFixed(1) + '%').join(' | ')})`);
  const th = lend(frames[frames.length - 1]).thresholds;
  const txt = g[0].text.toLowerCase();
  assert(txt.includes(`low ${(th.low * 100).toFixed(0)}%`) && txt.includes(`high ${(th.high * 100).toFixed(0)}%`) && txt.includes(`recall ${(th.recall * 100).toFixed(0)}%`),
    `LU-2: low, high and recall thresholds marked on every gauge and equal to the backend (${th.low}, ${th.high}, ${th.recall})`);
  await http('POST', '/reset');
  const warmShown = await waitFor(`!!document.querySelector('[data-testid=warming-up-tag]')`, 6000, 50);
  const warmGone = await waitFor(`!document.querySelector('[data-testid=warming-up-tag]')`, 12000, 100);
  assert(warmShown && warmGone, `LU-2: 'warming up' tag appears after a reset and clears once the predictor has history (shown ${!!warmShown}, cleared ${!!warmGone})`);
  const honesty = await ev(`document.querySelector('[data-testid=lending-honesty]')?.innerText || ''`);
  assert(honesty.includes('Risk is a forecast from past traffic only.') && honesty.includes('Slice-level simulator.'), 'LU-9: honesty labels visible on the Lending panel');

  // ---------------------------------------------------------------- LU-3 / LU-4 / LU-6 storm story
  await sleep(4500);  // steady load, predictor warmed up
  const riskBefore = lend(await lastFrame()).risk[2];
  await ev(`window.__frames = []`);
  await http('POST', '/spike', { slice: 'murllc', factor: 7.0, duration: 15 });
  const seen = { maxRisk: 0, arrows: 0, onLoan: 0, amounts: [], returned: false, stripes: false, clock: false, dashed: false, donorColor: false, chips: 0, sampleN: 0, sampleEq: 0 };
  const t0 = Date.now();
  let lastShot = false;
  while (Date.now() - t0 < 60000) {
    const s = await ev(`(() => { const f = window.__frames[window.__frames.length - 1]; const L = f?.policies?.enhanced?.allocation?.lending; const m = document.querySelector('[data-testid=risk-gauge-murllc] [role=meter]');
      const cells = Array.from(document.querySelectorAll('[data-onloan=true]'));
      const c0 = cells[0];
      return { risk: m ? Number(m.dataset.risk) : 0, arrows: document.querySelectorAll('[data-testid=loan-arrow]').length, chips: document.querySelectorAll('[data-testid=loan-chips] > span').length,
        onLoan: cells.length, returned: document.querySelectorAll('[data-testid=loan-returned]').length,
        stripes: !!(c0 && c0.querySelector('.loan-stripes')), clock: !!(c0 && c0.querySelector('svg.lucide-clock')),
        dashed: c0 ? getComputedStyle(c0).borderTopStyle : null, border: c0 ? getComputedStyle(c0).borderTopColor : null, donor: c0 ? c0.dataset.donor : null,
        chipText: document.querySelector('[data-testid=loan-chips] > span')?.innerText || '', loans: L?.loans_active || [], frameStep: f?.step }; })()`);
    seen.maxRisk = Math.max(seen.maxRisk, s.risk);
    if (s.arrows > 0) {
      seen.arrows = Math.max(seen.arrows, s.arrows);
      seen.chips = Math.max(seen.chips, s.chips);
      const m = s.chipText.match(/([\d.]+) (PRB|vCPU)/); if (m) seen.amounts.push(Number(m[1]));
      if (s.onLoan > 0) { seen.onLoan = Math.max(seen.onLoan, s.onLoan); seen.stripes ||= s.stripes; seen.clock ||= s.clock; seen.dashed ||= s.dashed === 'dashed';
        seen.donorColor ||= s.border === { embb: 'rgb(34, 211, 238)', urllc: 'rgb(245, 158, 11)', murllc: 'rgb(167, 139, 250)' }[s.donor]; }
      if (!lastShot && s.onLoan > 0) { await shot('lending_ui_storm.png'); lastShot = true; }
      seen.sampleN++;
      if (s.arrows === s.loans.length) seen.sampleEq++;
    }
    if (s.returned > 0) seen.returned = true;
    if (seen.arrows > 0 && s.arrows === 0 && Date.now() - t0 > 4000) break;
    await sleep(100);
  }
  assert(seen.arrows > 0 && seen.onLoan > 0, `LU-3: loaned cells appear in the pools while loans are active (max ${seen.onLoan} cells, ${seen.arrows} arrow(s))`);
  assert(seen.stripes && seen.clock, 'LU-3: cells on loan show a striped fill and a clock icon');
  assert(seen.dashed && seen.donorColor, "LU-3: loaned cells carry a dashed outline in the donor slice's colour");
  assert(seen.sampleN > 3 && seen.sampleEq / seen.sampleN >= 0.8 && seen.chips >= 1, `LU-3: arrow count equals the number of active loans in the stream in ${seen.sampleEq}/${seen.sampleN} samples (any difference is one-step timing skew between two sockets), TTL labels on chips`);
  assert(seen.returned, 'LU-3: a reversed, fading arrow is drawn when a loan is returned');
  assert(seen.maxRisk >= th.high && riskBefore < th.high, `LU-6: mURLLC risk rises from ${(riskBefore * 100).toFixed(1)}% to ${(seen.maxRisk * 100).toFixed(1)}% (high threshold ${th.high * 100}%) when the storm starts`);
  const dec = seen.amounts.filter((a, i) => i === 0 || a !== seen.amounts[i - 1]);
  const falling = dec.length >= 3 && dec.slice(-3).every((a, i, arr) => i === 0 || a < arr[i - 1]);
  assert(falling, `LU-6: after the burst the loan is returned step by step (observed amounts ${dec.slice(-6).join(' > ')})`);
  assert(await waitFor(`document.querySelectorAll('[data-testid=loan-arrow]').length === 0`, 15000), 'LU-6: loan fully returned, no arrows remain');

  // ---------------------------------------------------------------- LU-4 ledger equals stream
  const events = await ev(`(() => { const set = new Set(); window.__frames.forEach((f) => (f?.policies?.enhanced?.allocation?.lending?.loans_events || []).forEach((e) => set.add([e.loan_id, e.step, e.kind, e.resource, e.donor].join('|')))); return Array.from(set); })()`);
  const rows = await ev(`Array.from(document.querySelectorAll('[data-testid=ledger-row]')).map((r) => r.dataset.kind)`);
  assert(rows.length > 0 && rows.length === events.length, `LU-4: ledger rows (${rows.length}) equal the loan events in the stream (${events.length})`);
  const kinds = new Set(rows);
  assert(['opened', 'returned'].every((k) => kinds.has(k)), `LU-4: ledger shows opened and returned entries (kinds ${[...kinds].join(', ')})`);
  await ev(`document.querySelector('[data-testid=ledger-filter-opened]').click()`); await sleep(200);
  const onlyOpened = await ev(`Array.from(document.querySelectorAll('[data-testid=ledger-row]')).every((r) => r.dataset.kind === 'opened') && document.querySelectorAll('[data-testid=ledger-row]').length > 0`);
  await ev(`document.querySelector('[data-testid=ledger-filter-all]').click()`);
  await ev(`(() => { const s = document.querySelector('[data-testid=ledger-filter-slice]'); s.value = 'urllc'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(200);
  const urllcRows = await ev(`document.querySelectorAll('[data-testid=ledger-row]').length`);
  await ev(`(() => { const s = document.querySelector('[data-testid=ledger-filter-slice]'); s.value = 'all'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  assert(onlyOpened && urllcRows === 0, `LU-4: filters work (kind filter shows only 'opened'; slice filter 'URLLC' shows ${urllcRows} rows since no loan involved URLLC)`);
  const reason = await ev(`document.querySelector('[data-testid=ledger-row] td:last-child')?.innerText || ''`);
  assert(/\d\.\d\d/.test(reason) && /(risk|forecast|share)/.test(reason),`LU-4: ledger reason text is built from real numbers ("${reason.slice(0, 90)}")`);

  // ---------------------------------------------------------------- LU-5 overload banner
  await http('POST', '/reset');
  await sleep(1500);
  const noBanner = !(await ev(`!!document.querySelector('[data-testid=overload-banner]')`));
  await http('POST', '/bots', { slice: 'embb', count: 200, mode: 'set' });
  await ev(`window.__frames = []`);
  const bannerOn = await waitFor(`!!document.querySelector('[data-testid=overload-banner]')`, 30000, 100);
  const banner = bannerOn ? await ev(`document.querySelector('[data-testid=overload-banner]').innerText`) : '';
  const notes = await ev(`(() => { const s = new Set(); window.__frames.slice(-8).forEach((f) => (lendOf(f)?.overload_notes || []).forEach((n) => s.add(n))); function lendOf(f) { return f?.policies?.enhanced?.allocation?.lending; } return Array.from(s); })()`);
  assert(noBanner && bannerOn, `LU-5: banner hidden at nominal load and shown under overload (eMBB bots at the maximum)`);
  assert(banner.includes('URLLC and mURLLC protected first') && /lendable [\d.]+ (PRB|vCPU), need [\d.]+ (PRB|vCPU)/.test(banner), `LU-5: banner carries the exact numbers and the 'protected first' wording ("${(banner.split('\n').find((l) => l.includes('lendable')) || '').slice(0, 100)}")`);
  assert(notes.length > 0 && notes.some((n) => banner.includes(n)), 'LU-5: banner text equals the backend overload_notes of the stream');
  assert(!/all SLAs (hold|are met)/i.test(banner) && banner.includes('does not mean every SLA holds'), 'LU-5/LU-9: banner never claims all SLAs hold under overload');
  await shot('lending_ui_overload.png');
  await http('POST', '/reset');
  assert(await waitFor(`!document.querySelector('[data-testid=overload-banner]')`, 20000, 100), 'LU-5: banner disappears when the overload is resolved (reset restores default bots)');

  // ---------------------------------------------------------------- LU-10 reduced motion
  await sleep(5000);
  await http('POST', '/spike', { slice: 'murllc', factor: 7.0, duration: 15 });
  await waitFor(`document.querySelectorAll('[data-testid=loan-arrow] path.loan-arrow-live').length > 0`, 30000, 100);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const reduced = await ev(`getComputedStyle(document.querySelector('path.loan-arrow-live')).animationName`);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const normal = await ev(`getComputedStyle(document.querySelector('path.loan-arrow-live')).animationName`);
  assert(reduced === 'none' && normal === 'loan-dash', `LU-10: loan arrow animation is off with prefers-reduced-motion (reduce: ${reduced}, no-preference: ${normal})`);

  // ---------------------------------------------------------------- LU-8 layout at two resolutions (with loans on screen)
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    await viewport(w, h);
    await http('POST', '/reset'); await sleep(4500);
    await http('POST', '/spike', { slice: 'murllc', factor: 7.0, duration: 15 });
    await waitFor(`document.querySelectorAll('[data-testid=loan-arrow]').length > 0`, 30000, 100);
    await sleep(300);
    const o = await ev(OVERLAP_FN);
    const bad = o.gauges.length + o.forecasts.length + o.flowText.length + o.panelStack.length + o.gaugeLabels;
    assert(bad === 0 && o.hscroll <= 1, `LU-8: no overlapping elements and no horizontal scroll at ${w}x${h} (gauges ${o.gauges.length}, forecasts ${o.forecasts.length}, loan labels ${o.flowText.length}, panel stack ${o.panelStack.length}, gauge tick labels ${o.gaugeLabels}, h-scroll ${o.hscroll}px)`);
    await shot(`lending_ui_${w}.png`);
    await waitFor(`document.querySelectorAll('[data-testid=loan-arrow]').length === 0`, 30000, 150);
  }

  // ---------------------------------------------------------------- LU-7 / LU-9b results section
  await viewport(1920, 1080);
  await goto('/results');
  assert(await waitFor(`!!document.querySelector('[data-testid=lending-headline-table] tbody tr')`, 20000), 'LU-7: Results page shows the lending section');
  const R = path.join(ROOT, 'results');
  const hl = JSON.parse(fs.readFileSync(path.join(R, 'lending_headline.json'), 'utf8'));
  const pe = JSON.parse(fs.readFileSync(path.join(R, 'lending_predictor_eval.json'), 'utf8'));
  const csv = fs.readFileSync(path.join(R, 'lending_paired.csv'), 'utf8').trim().split('\n');
  const head = csv[0].split(','); const col = (r, n) => r[head.indexOf(n)];
  const vsAgent = csv.slice(1).map((l) => l.split(',')).filter((r) => col(r, 'baseline') === 'agent_shield' && ['viol_total', 'onset_viol_total', 'embb_ratio', 'util'].includes(col(r, 'metric')));
  const ui = await ev(`(() => { const t = (id) => Array.from(document.querySelectorAll('[data-testid=' + id + '] tbody tr')).map((r) => Array.from(r.children).map((c) => c.innerText.trim()));
    return { hl: t('lending-headline-table'), paired: t('lending-paired-table'), pred: t('lending-predictor-table'), takeaway: document.querySelector('[data-testid=lending-takeaway]')?.innerText || '',
      curves: document.querySelectorAll('[data-testid=lending-calibration] path.recharts-line-curve').length, text: document.querySelector('[data-testid=lending-results]').innerText }; })()`);
  const fx = (x, d = 4) => Number(x).toFixed(d);
  const h0 = hl['viol_total__enhanced_vs_agent_shield'];
  assert(ui.hl[0][2] === fx(h0.enhanced) && ui.hl[0][3] === fx(h0.baseline) && ui.hl[0][4].startsWith(fx(h0.improvement)), `LU-7: headline row equals lending_headline.json (${ui.hl[0].slice(0, 5).join(' | ')})`);
  // numeric comparison: the API serialises floats with 10 decimals, so -4.9e-11 in the CSV arrives as 0
  const pairedOk = ui.paired.length === vsAgent.length && vsAgent.every((r) => ui.paired.some((u) =>
    u[0].length && u[2].length && Math.abs(parseFloat(u[5]) - Number(col(r, 'improvement'))) < 1e-4 && Math.abs(parseFloat(u[3]) - Number(col(r, 'baseline_mean'))) < 1e-4));
  assert(pairedOk, `LU-7: per-scenario paired table has ${ui.paired.length} rows equal to lending_paired.csv (${vsAgent.length} rows) with intervals`);
  const o = pe.overall;
  assert(ui.pred[0][1] === fx(o.brier, 5) && ui.pred[0][3] === fx(o.auc, 4), `LU-7: predictor Brier ${ui.pred[0][1]} and AUC ${ui.pred[0][3]} equal lending_predictor_eval.json`);
  assert(ui.curves >= 5, `LU-7: calibration chart drawn (${ui.curves} curves: perfect line, all slices, 3 slices)`);
  assert(/did not reduce|avoided|more violations/.test(ui.takeaway) && (h0.ci_lo > 0 ? /avoided/ : h0.ci_hi < 0 ? /more violations/ : /did not reduce/).test(ui.takeaway), `LU-7: takeaway sentence follows the interval ("${ui.takeaway.split('\n')[0].slice(0, 110)}...")`);
  assert(ui.text.includes('Risk is a forecast from past traffic only.') && ui.text.includes('Slice-level simulator.') && ui.text.includes('protected first'), 'LU-9: honesty labels and the overload wording are visible on the Results section');
  assert(!/all SLAs (hold|are met)|guarantee/i.test(ui.text), 'LU-9: Results section makes no all-SLAs or guarantee claim');
  await shot('lending_ui_results.png');

  // ---------------------------------------------------------------- LU-8 basics
  const external = [...requests].filter((u) => !u.startsWith(BASE) && !u.startsWith('ws://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('about:') && !u.startsWith('blob:'));
  assert(external.length === 0, `LU-8: works offline, every request stays on localhost (${requests.size} requests, external: ${external.join(', ') || 'none'})`);
  assert(consoleErrors.length === 0, `LU-8: no console errors across the whole session (${consoleErrors.length}${consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' || ') : ''})`);
  const src = ['lending/lendingUtils.ts', 'lending/RiskGauge.tsx', 'lending/ForecastMini.tsx', 'lending/LoanFlow.tsx', 'lending/LoanLedger.tsx', 'lending/LendingPanel.tsx', 'results/LendingResultsSection.tsx']
    .map((f) => fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'components', f), 'utf8')).join('\n');
  assert(!/Math\.random|\bmock\b|\bfake\b|lorem/i.test(src), 'LU-8: no Math.random, mock or fake data in the new components');
  await http('POST', '/reset');
}

(async () => {
  try { await main(); } catch (e) { failed++; console.error('❌ FAIL: test run aborted: ' + e.stack); }
  finally {
    try { cdp && cdp.ws.close(); } catch (e) { /* ignore */ }
    for (const p of [chrome, server]) if (p && p.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  console.log('\n----------------------------------------------------');
  console.log(`${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
