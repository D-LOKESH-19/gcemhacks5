import React from 'react';
import { Clock } from 'lucide-react';
import { LedgerEntry, LoanRecord } from '../../types/api';
import { SLICE_META, SLICES, fmtUnits } from './lendingUtils';

interface LoanFlowProps {
  loans: LoanRecord[];
  recent: LedgerEntry[];   // returned / recalled / expired events from the last few frames
}

const X = { embb: 90, urllc: 330, murllc: 570 } as const;
const W = 660;
const H = 190;
const NODE_Y = 92;

/** Donor -> borrower arrows for the active loans (dashed, labelled with amount and time to live). A repaid
 *  loan shows a reversed arrow that fades. Positions come from the stream; nothing is computed here. */
export const LoanFlow: React.FC<LoanFlowProps> = ({ loans, recent }) => {
  const arrow = (from: 'embb' | 'urllc' | 'murllc', to: 'embb' | 'urllc' | 'murllc', lane: number, kind: 'live' | 'return') => {
    const x1 = X[from] + (X[to] > X[from] ? 46 : -46);
    const x2 = X[to] + (X[to] > X[from] ? -46 : 46);
    const dir = lane % 2 === 0 ? -1 : 1;                 // radio above, compute below
    const lift = 26 + Math.floor(lane / 2) * 18;
    const mx = (x1 + x2) / 2;
    const my = NODE_Y + dir * (lift + 14);
    return { d: `M ${x1} ${NODE_Y + dir * 14} Q ${mx} ${my} ${x2} ${NODE_Y + dir * 14}`, mx, my: my - dir * 6, x1, x2, kind };
  };

  return (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80" data-testid="loan-flow">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-800">Active loans (donor to borrower)</span>
        <span className="text-[10px] text-slate-500 font-mono" data-testid="loan-count">{loans.length} active</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[190px]" role="img" aria-label="Loans between slices">
        <defs>
          <marker id="loan-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
          </marker>
        </defs>
        {SLICES.map((s) => (
          <g key={`node-${s}`}>
            <rect x={X[s] - 44} y={NODE_Y - 14} width={88} height={28} rx={8} fill={`${SLICE_META[s].color}33`} stroke={SLICE_META[s].color} strokeWidth={2} />
            <text x={X[s]} y={NODE_Y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#0F172A">{SLICE_META[s].name}</text>
          </g>
        ))}

        {recent.map((e, k) => {
          const a = arrow(e.borrower, e.donor, e.resource === 'prb' ? 0 : 1, 'return');
          const verb = e.kind === 'returned' ? 'returned' : e.kind === 'recalled' ? 'recalled' : 'expired';
          return (
            <g key={`ret-${e.loan_id}-${e.step}-${e.kind}-${k}`} data-testid="loan-returned">
              <path d={a.d} fill="none" stroke={e.kind === 'recalled' ? '#EF4444' : '#64748B'} strokeWidth={2} className="loan-arrow-return" markerEnd="url(#loan-head)" />
              <text x={a.mx} y={a.my + (k % 2 === 0 ? -10 : 18)} textAnchor="middle" fontSize={10} fill="#64748B">{verb} {fmtUnits(e.amount_units, e.resource)}</text>
            </g>
          );
        })}

        {loans.map((l, k) => {
          const a = arrow(l.donor, l.borrower, l.resource === 'prb' ? 0 : 1, 'live');
          return (
            <g key={`loan-${l.id}`} data-testid="loan-arrow" data-loan-id={l.id}>
              <path d={a.d} fill="none" stroke={SLICE_META[l.borrower].color} strokeWidth={3} className="loan-arrow-live" markerEnd="url(#loan-head)" />
              <text x={a.mx} y={a.my + (k % 2 === 0 ? 0 : 14)} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0F172A">
                {fmtUnits(l.amount_units, l.resource)} · ttl {l.ttl}
              </text>
            </g>
          );
        })}
      </svg>

      {loans.length === 0 ? (
        <p className="text-[11px] text-slate-500 text-center -mt-2">No loans open. Lending only moves share when forecast risk is high.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mt-1" data-testid="loan-chips">
          {loans.map((l) => (
            <span
              key={`chip-${l.id}`}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono border border-dashed"
              style={{ borderColor: SLICE_META[l.donor].color, backgroundColor: `${SLICE_META[l.borrower].color}22` }}
              title={`opened at step ${l.opened_step}, risk at open ${l.risk_at_open.toFixed(2)}, ${l.reason_code}`}
            >
              <Clock size={10} />
              {SLICE_META[l.donor].name} → {SLICE_META[l.borrower].name} · {fmtUnits(l.amount_units, l.resource)} · ttl {l.ttl}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
