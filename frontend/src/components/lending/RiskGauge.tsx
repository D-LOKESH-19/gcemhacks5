import React from 'react';
import { SliceType } from '../../types/api';
import { SLICE_META } from './lendingUtils';

interface RiskGaugeProps {
  slice: SliceType;
  risk: number;            // 0..1, backend value at the agent's proposal
  riskAfter?: number;      // 0..1, after the lender's adjustment
  thresholds: { high: number; low: number; recall: number };
  warmingUp?: boolean;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export const RiskGauge: React.FC<RiskGaugeProps> = ({ slice, risk, riskAfter, thresholds, warmingUp }) => {
  const meta = SLICE_META[slice];
  const level = risk >= thresholds.high ? 'high' : risk >= thresholds.low ? 'watch' : 'low';
  const fill = level === 'high' ? '#EF4444' : level === 'watch' ? '#F59E0B' : '#10B981';
  const word = level === 'high' ? 'HIGH RISK' : level === 'watch' ? 'WATCH' : 'LOW';
  const tick = (v: number) => ({ left: `${Math.min(100, Math.max(0, v * 100))}%` });

  return (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80" data-testid={`risk-gauge-${slice}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
          {meta.name}
        </span>
        <span className="flex items-center gap-1.5">
          {warmingUp && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold"
              data-testid={`warming-${slice}`}
            >
              warming up
            </span>
          )}
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: fill }}>
            {word}
          </span>
        </span>
      </div>

      {/* Gauge: 0..100 percent, threshold ticks above (low, high) and below (recall) so labels never collide */}
      <div className="relative pt-4 pb-4">
        <div
          role="meter"
          aria-label={`${meta.name} SLA risk`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(risk * 100)}
          className="relative h-3 rounded-full bg-slate-200 overflow-hidden"
          data-risk={risk.toFixed(4)}
        >
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(1, risk * 100)}%`, backgroundColor: fill }} />
        </div>
        {/* labels start at their own tick and read to the right, so each is unambiguous */}
        <span className="absolute top-0 pl-0.5 text-[9px] text-slate-500 font-mono whitespace-nowrap" style={tick(thresholds.low)}>
          low {(thresholds.low * 100).toFixed(0)}%
        </span>
        <span className="absolute top-0 pl-0.5 text-[9px] text-rose-600 font-mono whitespace-nowrap" style={tick(thresholds.high)}>
          high {(thresholds.high * 100).toFixed(0)}%
        </span>
        {[thresholds.low, thresholds.high].map((t) => (
          <span key={`t-${t}`} className="absolute top-[14px] w-0.5 h-5 bg-slate-700/70" style={tick(t)} />
        ))}
        <span className="absolute top-[14px] w-0.5 h-5 bg-purple-600/80" style={tick(thresholds.recall)} />
        <span className="absolute bottom-0 pl-0.5 text-[9px] text-purple-700 font-mono whitespace-nowrap" style={tick(thresholds.recall)}>
          recall {(thresholds.recall * 100).toFixed(0)}%
        </span>
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-slate-900 font-bold" data-testid={`risk-value-${slice}`}>{pct(risk)}</span>
        {riskAfter !== undefined && (
          <span className="text-slate-500">after lender {pct(riskAfter)}</span>
        )}
      </div>
    </div>
  );
};
