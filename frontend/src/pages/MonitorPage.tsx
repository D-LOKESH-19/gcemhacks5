import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Download, Pause, Play, RefreshCw, Siren } from 'lucide-react';
import { MonitorSnapshot } from '../types/api';
import { CARD, POLICIES, POLICY_COLOR, POLICY_LABEL, PolicyTag, SeverityBadge, SLICE_LABEL, TYPE_LABEL } from '../components/monitor/monitorUtils';
import { ProblemTimeline } from '../components/monitor/ProblemTimeline';
import { IncidentTable } from '../components/monitor/IncidentTable';
import { LogConsole } from '../components/monitor/LogConsole';

const POLL_MS = 1500;

const Tile: React.FC<{ label: string; value: React.ReactNode; sub?: string; testid: string; tone?: string }> = ({ label, value, sub, testid, tone }) => (
  <div className={`${CARD} flex flex-col gap-0.5`} data-testid={testid}>
    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
    <span className={`text-2xl font-bold font-mono ${tone ?? 'text-slate-900'}`}>{value}</span>
    {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
  </div>
);

export const MonitorPage: React.FC = () => {
  const [snap, setSnap] = useState<MonitorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    fetch('/api/monitor?limit=200')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j: MonitorSnapshot) => { setSnap(j); setError(null); setUpdatedAt(new Date().toLocaleTimeString()); })
      .catch((e) => setError(e.message || 'Failed to load monitor data'))
      .finally(() => { inFlight.current = false; });
  }, []);

  useEffect(() => {
    load();
    if (frozen) return undefined;
    const id = window.setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => window.clearInterval(id);
  }, [frozen, load]);

  const download = () => {
    if (!snap) return;
    const blob = new Blob([JSON.stringify(snap, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `monitor_ep${snap.episode}_tick${snap.tick}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const active = snap?.active ?? [];
  const activeCrit = active.filter((i) => i.severity === 'critical').length;
  const activeWarn = active.filter((i) => i.severity === 'warning').length;
  const missedTotal = Object.values(snap?.missed_packets ?? {}).reduce((a, b) => a + b, 0);
  const shownActive = active.filter((i) => i.severity !== 'info');

  return (
    <div className="space-y-4" data-testid="monitor-page">
      <div className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <div className="flex items-center gap-2">
            <Siren size={18} className="text-rose-500" />
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Simulation Monitor</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${frozen ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`} data-testid="monitor-state">
              {frozen ? 'frozen' : 'live'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Problems during allocation, SLA breaks and logs, detected by the backend from simulator telemetry and sla.py. Slice-level simulator.
            History survives episode rollover and clears on Reset.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-slate-500" data-testid="monitor-position">
            {snap ? `episode ${snap.episode}, step ${snap.step ?? '-'}` : ''}{updatedAt ? ` · updated ${updatedAt}` : ''}
          </span>
          <button onClick={() => setFrozen(!frozen)} data-testid="monitor-freeze"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700">
            {frozen ? <Play size={13} /> : <Pause size={13} />} {frozen ? 'Resume' : 'Freeze'}
          </button>
          <button onClick={load} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700">
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={download} disabled={!snap} data-testid="monitor-download"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white">
            <Download size={13} /> Export JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs" role="alert" data-testid="monitor-error">
          Unable to load monitor data: {error}. Retrying every {POLL_MS / 1000} s.
        </div>
      )}
      {!snap && !error && <div className={`${CARD} text-xs text-slate-500`}>Loading monitor data...</div>}

      {snap && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <Tile testid="tile-active" label="Active now" value={`${activeCrit} / ${activeWarn}`} sub="critical / warning problems ongoing"
              tone={activeCrit ? 'text-rose-600' : activeWarn ? 'text-amber-600' : 'text-emerald-600'} />
            <Tile testid="tile-critical" label="Critical incidents" value={snap.totals.critical} sub="deadline misses and SLA breaches" tone={snap.totals.critical ? 'text-rose-600' : undefined} />
            <Tile testid="tile-warning" label="Warnings" value={snap.totals.warning} sub="at risk, queue full, overload" />
            <Tile testid="tile-missed" label="Packets missed" value={missedTotal.toFixed(1)} sub="URLLC + mURLLC, all policies" />
            <Tile testid="tile-episodes" label="Observed" value={snap.tick} sub={`steps over ${snap.episode} episode${snap.episode === 1 ? '' : 's'}`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {POLICIES.filter((p) => snap.timeline.some((t) => t.missed[p] !== undefined)).map((p) => {
              const tot = snap.by_policy[p] ?? { critical: 0, warning: 0, info: 0 };
              const act = active.filter((i) => i.policy === p && i.severity !== 'info');
              return (
                <div key={p} className={`${CARD} border-l-4`} style={{ borderLeftColor: POLICY_COLOR[p] }} data-testid={`policy-health-${p}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900"><PolicyTag policy={p} /></span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${act.length ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-emerald-50 text-emerald-700 border-emerald-300'}`}>
                      {act.length ? `${act.length} active` : 'no active problems'}
                    </span>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 mt-2 text-center text-[11px]">
                    <div><dt className="text-slate-500">critical</dt><dd className="font-mono font-bold" data-testid={`policy-critical-${p}`}>{tot.critical}</dd></div>
                    <div><dt className="text-slate-500">warnings</dt><dd className="font-mono font-bold">{tot.warning}</dd></div>
                    <div><dt className="text-slate-500">pkts missed</dt><dd className="font-mono font-bold" data-testid={`policy-missed-${p}`}>{(snap.missed_packets[p] ?? 0).toFixed(1)}</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ProblemTimeline timeline={snap.timeline} />
            <div className={CARD} data-testid="active-problems">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Activity size={15} className="text-sky-600" /> Active problems</h2>
                <span className="text-[10px] text-slate-500">critical and warning; bottlenecks and shield clamps are in the table</span>
              </div>
              <ul className="space-y-1.5 max-h-[220px] overflow-y-auto">
                {shownActive.map((i) => (
                  <li key={i.id} data-testid="active-row" className="flex items-start gap-2 text-[11px] p-1.5 rounded-lg bg-slate-50 border border-slate-200">
                    <SeverityBadge severity={i.severity} />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">
                        {TYPE_LABEL[i.type]}{SLICE_LABEL[i.slice] ? ` (${SLICE_LABEL[i.slice]})` : ''} · <PolicyTag policy={i.policy} />
                        <span className="font-mono font-normal text-slate-500"> · {i.duration_steps} step{i.duration_steps === 1 ? '' : 's'} since step {i.start_step}</span>
                      </div>
                      <div className="text-slate-600">{i.detail}</div>
                    </div>
                  </li>
                ))}
                {shownActive.length === 0 && <li className="text-xs text-emerald-700 py-6 text-center">No critical or warning problems right now.</li>}
              </ul>
            </div>
          </div>

          <IncidentTable incidents={snap.incidents} limit={snap.limits.incidents} />
          <LogConsole logs={snap.logs} limit={snap.limits.logs} />

          <p className="text-[10px] text-slate-500" data-testid="monitor-honesty">
            Counts are cumulative since the last Reset ({POLICY_LABEL.static}, {POLICY_LABEL.heuristic}, {POLICY_LABEL.agent} and {POLICY_LABEL.enhanced} run on identical traffic).
            Under overload the claim is only that URLLC and mURLLC are protected first; it never means every SLA holds.
          </p>
        </>
      )}
    </div>
  );
};

export default MonitorPage;
