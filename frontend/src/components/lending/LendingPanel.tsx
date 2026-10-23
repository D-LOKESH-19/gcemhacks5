import React from 'react';
import { AlertTriangle, Hourglass, Landmark } from 'lucide-react';
import { LendingBlock, LedgerEntry } from '../../types/api';
import { useSliceStore } from '../../store/useSliceStore';
import { RiskGauge } from './RiskGauge';
import { ForecastMini } from './ForecastMini';
import { LoanFlow } from './LoanFlow';
import { LoanLedger } from './LoanLedger';
import { HONESTY_RISK, HONESTY_SIM, POLICY_ENHANCED_COLOR, SLICES } from './lendingUtils';

const RECENT_FRAMES = 3;

interface LendingPanelProps {
  lending?: LendingBlock;
  step: number;
}

export const LendingPanel: React.FC<LendingPanelProps> = ({ lending, step }) => {
  const ledger = useSliceStore((s) => s.lendingLedger) as LedgerEntry[];
  const th = lending?.thresholds;
  const have = lending && lending.available !== false && lending.risk && th;

  if (!have) {
    return (
      <div className="p-4 rounded-2xl bg-white/95 border border-slate-200 text-xs text-slate-500" data-testid="lending-panel-empty">
        Waiting for lending telemetry from the backend (Enhanced policy: Agent + Lender + Shield).
      </div>
    );
  }

  const loans = lending.loans_active ?? [];
  const recent = ledger.filter((e) => e.kind !== 'opened' && e.kind !== 'enlarged' && e.seen_step >= step - RECENT_FRAMES && e.seen_step <= step);
  const notes = lending.overload_notes ?? [];

  return (
    <section className="space-y-3 p-4 rounded-2xl bg-white/95 backdrop-blur-md border-2 shadow-[0_8px_24px_rgba(244,114,182,0.12)]" style={{ borderColor: POLICY_ENHANCED_COLOR }} data-testid="lending-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark size={16} style={{ color: POLICY_ENHANCED_COLOR }} />
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Predictive Lending (Enhanced)</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold text-white" style={{ backgroundColor: POLICY_ENHANCED_COLOR }} data-testid="lending-mode">
            mode: {lending.mode}
          </span>
          {lending.warming_up && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold" data-testid="warming-up-tag">
              <Hourglass size={10} /> warming up
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600" data-testid="lending-honesty">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">{HONESTY_RISK}</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">{HONESTY_SIM}</span>
        </div>
      </div>

      {lending.overload && (
        <div role="alert" className="p-3 rounded-xl bg-purple-50 border border-purple-300 text-purple-900 text-xs flex gap-2" data-testid="overload-banner">
          <AlertTriangle size={16} className="shrink-0 text-purple-600 mt-0.5" />
          <div>
            <p className="font-bold">Overload: lendable capacity is not enough. URLLC and mURLLC protected first; eMBB degrades.</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-purple-800">This does not mean every SLA holds. The lender reports the unfunded amount instead of hiding it.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SLICES.map((s, i) => (
          <RiskGauge key={s} slice={s} risk={lending.risk![i]} riskAfter={lending.risk_after?.[i]} thresholds={th!} warmingUp={lending.warming_up} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SLICES.map((s) => (
          <ForecastMini key={s} slice={s} />
        ))}
      </div>

      <LoanFlow loans={loans} recent={recent} />
      <LoanLedger />
    </section>
  );
};
