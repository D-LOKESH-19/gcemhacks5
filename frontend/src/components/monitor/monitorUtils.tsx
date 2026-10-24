import React from 'react';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { IncidentSeverity, IncidentType } from '../../types/api';

export const POLICIES = ['static', 'heuristic', 'agent', 'enhanced'] as const;

export const POLICY_LABEL: Record<string, string> = {
  static: 'Static', heuristic: 'Heuristic', agent: 'Agent + Shield', enhanced: 'Enhanced', system: 'System',
};

// project policy palette (tailwind policy.*), slate for system-wide problems
export const POLICY_COLOR: Record<string, string> = {
  static: '#F87171', heuristic: '#CBD5E1', agent: '#34D399', enhanced: '#F472B6', system: '#64748B',
};

export const TYPE_LABEL: Record<IncidentType, string> = {
  deadline_miss: 'Deadline miss',
  sla_breach: 'SLA breach',
  sla_at_risk: 'SLA at risk',
  embb_queue_full: 'eMBB queue full',
  infeasible_load: 'Infeasible load',
  lending_overload: 'Lending overload',
  bottleneck: 'Capacity bottleneck',
  shield_clamp: 'Shield clamp',
};

export const TYPE_HELP: Record<IncidentType, string> = {
  deadline_miss: 'URLLC/mURLLC packets not served in their 100 ms step (they cannot queue).',
  sla_breach: 'sla.py 20-step window status is breach.',
  sla_at_risk: 'sla.py window status is amber: above 80 percent of a limit.',
  embb_queue_full: 'eMBB queue at its maximum; overflow is dropped.',
  infeasible_load: 'Offered load above the feasible fraction of capacity.',
  lending_overload: 'The lender cannot fund a slice at risk; URLLC and mURLLC protected first.',
  bottleneck: 'Demand above 90 percent of effective capacity; radio or compute limited.',
  shield_clamp: 'The shield changed the proposal by more than 3 percentage points.',
};

export const SLICE_LABEL: Record<string, string> = { embb: 'eMBB', urllc: 'URLLC', murllc: 'mURLLC', all: '' };

const SEV_STYLE: Record<IncidentSeverity, { cls: string; label: string; Icon: typeof Info }> = {
  critical: { cls: 'bg-rose-50 text-rose-700 border-rose-300', label: 'Critical', Icon: AlertOctagon },
  warning: { cls: 'bg-amber-50 text-amber-800 border-amber-300', label: 'Warning', Icon: AlertTriangle },
  info: { cls: 'bg-slate-100 text-slate-700 border-slate-300', label: 'Info', Icon: Info },
};

/** Severity chip: icon plus label, never colour alone. */
export const SeverityBadge: React.FC<{ severity: IncidentSeverity }> = ({ severity }) => {
  const s = SEV_STYLE[severity];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${s.cls}`} data-severity={severity}>
      <s.Icon size={11} /> {s.label}
    </span>
  );
};

export const PolicyTag: React.FC<{ policy: string }> = ({ policy }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: POLICY_COLOR[policy] ?? '#64748B' }} />
    {POLICY_LABEL[policy] ?? policy}
  </span>
);

export const CARD = 'p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)]';
