import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Incident, IncidentSeverity, IncidentType } from '../../types/api';
import { CARD, POLICY_LABEL, PolicyTag, SeverityBadge, SLICE_LABEL, TYPE_HELP, TYPE_LABEL } from './monitorUtils';

const SEVERITIES: Array<'all' | IncidentSeverity> = ['all', 'critical', 'warning', 'info'];

const fmtAmount = (i: Incident) => {
  if (i.type === 'deadline_miss') return `${i.total.toFixed(1)} pkts (peak ${i.peak.toFixed(1)}/step)`;
  if (i.type === 'embb_queue_full') return `${i.peak.toFixed(0)} queued`;
  if (i.type === 'bottleneck') return `peak ${(i.peak * 100).toFixed(0)}% of capacity`;
  if (i.type === 'shield_clamp') return `peak ${i.peak.toFixed(1)} pts`;
  if (i.type === 'lending_overload') return `${i.peak.toFixed(1)} unfunded`;
  return '';
};

export const IncidentTable: React.FC<{ incidents: Incident[]; limit: number }> = ({ incidents, limit }) => {
  const [sev, setSev] = useState<'all' | IncidentSeverity>('all');
  const [policy, setPolicy] = useState('all');
  const [type, setType] = useState<'all' | IncidentType>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [q, setQ] = useState('');

  const rows = useMemo(() => incidents.filter((i) =>
    (sev === 'all' || i.severity === sev) && (policy === 'all' || i.policy === policy) && (type === 'all' || i.type === type)
    && (!activeOnly || i.active) && (q === '' || `${i.detail} ${TYPE_LABEL[i.type]} ${POLICY_LABEL[i.policy]}`.toLowerCase().includes(q.toLowerCase())),
  ), [incidents, sev, policy, type, activeOnly, q]);

  const policies = Array.from(new Set(incidents.map((i) => i.policy)));

  return (
    <div className={CARD} data-testid="incident-table">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-900">
          Incidents <span className="text-[11px] font-normal text-slate-500" data-testid="incident-count">{rows.length} shown / {incidents.length} newest (max {limit} kept)</span>
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {SEVERITIES.map((s) => (
            <button key={s} data-testid={`incident-sev-${s}`} onClick={() => setSev(s)}
              className={`px-2 py-0.5 rounded-full border ${sev === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
              {s === 'all' ? 'all' : s}
            </button>
          ))}
          <select data-testid="incident-policy" value={policy} onChange={(e) => setPolicy(e.target.value)} className="px-1.5 py-0.5 rounded-lg border border-slate-300 bg-white">
            <option value="all">all policies</option>
            {policies.map((p) => <option key={p} value={p}>{POLICY_LABEL[p] ?? p}</option>)}
          </select>
          <select data-testid="incident-type" value={type} onChange={(e) => setType(e.target.value as any)} className="px-1.5 py-0.5 rounded-lg border border-slate-300 bg-white">
            <option value="all">all problems</option>
            {(Object.keys(TYPE_LABEL) as IncidentType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <label className="flex items-center gap-1 px-1.5 text-slate-600">
            <input type="checkbox" data-testid="incident-active-only" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> active only
          </label>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-slate-300 bg-white">
            <Search size={11} className="text-slate-400" />
            <input data-testid="incident-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search" className="w-28 outline-none bg-transparent" />
          </span>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[420px] overflow-y-auto rounded-xl border border-slate-200">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10">
            <tr>
              {['#', 'Severity', 'Problem', 'Policy', 'When', 'Duration', 'Size', 'Detail'].map((h) => (
                <th key={h} className="text-left px-2 py-1.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} data-testid="incident-row" data-type={i.type} data-policy={i.policy} data-active={i.active ? 'true' : 'false'}
                className={`border-t border-slate-100 ${i.active ? 'bg-amber-50/40' : ''}`}>
                <td className="px-2 py-1 font-mono text-slate-500">{i.id}</td>
                <td className="px-2 py-1"><SeverityBadge severity={i.severity} /></td>
                <td className="px-2 py-1 whitespace-nowrap" title={TYPE_HELP[i.type]}>
                  <span className="font-semibold text-slate-800">{TYPE_LABEL[i.type]}</span>
                  {SLICE_LABEL[i.slice] && <span className="text-slate-500"> ({SLICE_LABEL[i.slice]})</span>}
                </td>
                <td className="px-2 py-1"><PolicyTag policy={i.policy} /></td>
                <td className="px-2 py-1 font-mono whitespace-nowrap text-slate-600">
                  ep {i.episode}, step {i.start_step}{i.end_step !== i.start_step ? `-${i.end_step}` : ''}
                </td>
                <td className="px-2 py-1 font-mono whitespace-nowrap">
                  {i.duration_steps} step{i.duration_steps === 1 ? '' : 's'}
                  {i.active && <span className="ml-1 text-amber-700 font-semibold">ongoing</span>}
                </td>
                <td className="px-2 py-1 font-mono whitespace-nowrap text-slate-600">{fmtAmount(i)}</td>
                <td className="px-2 py-1 text-slate-700 min-w-[260px]">{i.detail}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-500">No incidents match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
