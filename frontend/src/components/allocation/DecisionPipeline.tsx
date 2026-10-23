import React from 'react';
import { Eye, Cpu, ShieldCheck, CheckCircle2, ArrowRight, Activity, Landmark } from 'lucide-react';
import { AllocationBlock, PolicyType, PolicyTelemetry, SliceType, LendingBlock } from '../../types/api';

interface DecisionPipelineProps {
  policy: PolicyType;
  telemetry: PolicyTelemetry;
  allocation?: AllocationBlock;
  observation?: number[]; // 12-dim observation vector
  lending?: LendingBlock; // Enhanced only: raw, post-lender and final shares
}

const SLICE_COLORS: Record<SliceType, string> = {
  embb: '#22D3EE',
  urllc: '#F59E0B',
  murllc: '#A78BFA',
};

const SLICES: SliceType[] = ['embb', 'urllc', 'murllc'];

export const DecisionPipeline: React.FC<DecisionPipelineProps> = ({
  policy,
  telemetry,
  allocation,
  observation = [0.1, 0.4, 0.6, 0.5, 0.05, 0.1, 0.25, 0.25, 0.02, 0.1, 0.15, 0.25],
  lending,
}) => {
  const isHeuristic = policy === 'heuristic';
  const isStatic = policy === 'static';

  const rawPrb = allocation?.prb.raw ?? [0.6, 0.25, 0.15];
  const finalPrb = allocation?.prb.final ?? [0.6, 0.25, 0.15];
  const shield = allocation?.shield ?? { changed: false, delta_pct: [0, 0, 0] };

  // Calculate maximum shift
  const maxShift = Math.max(...shield.delta_pct);

  return (
    <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] flex flex-col justify-between">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-sky-600" />
          <span className="font-bold text-sm text-slate-900 tracking-tight">
            Decision Pipeline (5-Stage Explainability)
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-mono">
          Step-Synchronized
        </span>
      </div>

      {/* 5 Vertical Stages */}
      <div className="space-y-3 select-none text-xs">
        {/* Stage 1: Observe */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Eye size={13} className="text-sky-600" /> 1. Observe (12-dim Network State)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Queue | Load | Shares</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SLICES.map((s, idx) => {
              const q = observation[idx * 4] || 0;
              const load = observation[idx * 4 + 1] || 0;
              return (
                <div key={`obs-${s}`} className="p-1.5 rounded-lg bg-white border border-slate-200 text-center">
                  <span className="text-[10px] font-bold uppercase block" style={{ color: SLICE_COLORS[s] }}>
                    {s}
                  </span>
                  <div className="flex items-center justify-around text-[9px] font-mono text-slate-600 mt-0.5">
                    <span>Q: {(q * 100).toFixed(0)}</span>
                    <span>L: {(load * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stage 2: Policy Proposal */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Cpu size={13} className="text-purple-600" /> 2. Policy Proposes (Raw PRB Shares)
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              {isStatic ? 'Fixed rule' : isHeuristic ? 'Rule: queue plus smoothed load' : 'Learned CMDP PPO'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SLICES.map((s, idx) => (
              <div key={`raw-${s}`} className="p-1.5 rounded-lg bg-white border border-slate-200 text-center">
                <span className="text-[10px] text-slate-500 block">{s.toUpperCase()}</span>
                <span className="text-xs font-mono font-bold text-slate-800">
                  {(rawPrb[idx] * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stage 2b (Enhanced only): Lender adjusts, between the agent's proposal and the shield */}
        {policy === 'enhanced' && lending?.pipeline && lending.pipeline.post_lender && (
          <div className="p-2.5 rounded-xl border border-pink-300 bg-pink-50/60" data-testid="stage-lender">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Landmark size={13} style={{ color: '#F472B6' }} /> 2b. Lender Adjusts (predictive loans)
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {lending.loans_active?.length ?? 0} active loan(s), mode {lending.mode}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
              <span className="text-slate-500 text-left">PRB share</span>
              {SLICES.map((s) => (
                <span key={`lh-${s}`} className="font-bold uppercase" style={{ color: SLICE_COLORS[s] }}>{s}</span>
              ))}
              {(['raw', 'post_lender', 'final'] as const).map((stage) => (
                <React.Fragment key={`ls-${stage}`}>
                  <span className="text-slate-600 text-left">
                    {stage === 'raw' ? 'Agent proposes' : stage === 'post_lender' ? 'After lender' : 'Final (after shield)'}
                  </span>
                  {SLICES.map((s, idx) => (
                    <span key={`lv-${stage}-${s}`} className="font-mono font-bold text-slate-800" data-testid={`lender-${stage}-${s}`}>
                      {lending.pipeline?.[stage] ? (lending.pipeline[stage]!.prb[idx] * 100).toFixed(1) : '-'}%
                    </span>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Stage 3: Safety Shield Checks */}
        <div className={`p-2.5 rounded-xl border transition-colors ${
          shield.changed ? 'bg-amber-50/70 border-amber-300' : 'bg-slate-50 border-slate-200/80'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck size={13} className={shield.changed ? 'text-amber-600' : 'text-emerald-600'} />
              3. Shield Checks (Floor Bounds)
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              shield.changed ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {shield.changed ? 'Clamped Decision' : 'Passed Clean'}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 leading-tight">
            {shield.changed
              ? `Shield changed the decision by ${maxShift.toFixed(1)} percentage points to enforce SLA floors.`
              : 'Shield did not change the decision. Policy proposal respected all safety boundaries.'}
          </p>
        </div>

        {/* Stage 4: Applied Shares */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <ArrowRight size={13} className="text-sky-600" /> 4. Applied (Final Shares)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Simulator Info</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SLICES.map((s, idx) => {
              const diff = finalPrb[idx] - rawPrb[idx];
              return (
                <div key={`final-${s}`} className="p-1.5 rounded-lg bg-white border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 block">{s.toUpperCase()}</span>
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs font-mono font-bold text-sky-700">
                      {(finalPrb[idx] * 100).toFixed(1)}%
                    </span>
                    {Math.abs(diff) > 0.005 && (
                      <span className={`text-[9px] font-mono ${diff > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {diff > 0 ? `+${(diff * 100).toFixed(0)}` : `${(diff * 100).toFixed(0)}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stage 5: Result & SLA Chip */}
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-800 block">5. Result & SLA Impact</span>
              <span className="text-[11px] text-slate-500">
                Served {telemetry.throughput.embb.toFixed(0)} eMBB | Violations: {telemetry.violations.urllc} URLLC
              </span>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
            telemetry.sla_ok !== false ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' : 'bg-rose-50 text-rose-700 border border-rose-300'
          }`}>
            {telemetry.sla_ok !== false ? 'SLA OK' : 'SLA Breach'}
          </span>
        </div>
      </div>
    </div>
  );
};
