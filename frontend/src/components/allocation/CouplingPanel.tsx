import React from 'react';
import { Layers } from 'lucide-react';
import { AllocationBlock, SliceType } from '../../types/api';

interface CouplingPanelProps {
  allocation?: AllocationBlock;
  demand?: { embb: number; urllc: number; murllc: number };
}

const SLICE_CONFIG: Record<SliceType, { name: string; color: string }> = {
  embb: { name: 'eMBB', color: '#22D3EE' },
  urllc: { name: 'URLLC', color: '#F59E0B' },
  murllc: { name: 'mURLLC', color: '#A78BFA' },
};

const SLICES: SliceType[] = ['embb', 'urllc', 'murllc'];

export const CouplingPanel: React.FC<CouplingPanelProps> = ({
  allocation,
  demand = { embb: 400, urllc: 30, murllc: 20 },
}) => {
  const prbCap = allocation?.prb.capacity ?? [720, 300, 180];
  const cpuCap = allocation?.cpu.capacity ?? [600, 300, 300];
  const effectiveCap = allocation?.effective_capacity ?? [600, 300, 180];
  const bottlenecks = allocation?.bottleneck ?? ['none', 'none', 'none'];

  return (
    <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-sky-600" />
            <span className="font-bold text-sm text-slate-900 tracking-tight">
              Radio-Compute Joint Coupling Panel
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">pkts/step capacity</span>
        </div>

        {/* 3 Slices Joint Coupling Bars */}
        <div className="space-y-3.5 select-none text-xs">
          {SLICES.map((slice, idx) => {
            const radio = prbCap[idx];
            const compute = cpuCap[idx];
            const effective = effectiveCap[idx];
            const dem = demand[slice] || 0;
            const bottleneck = bottlenecks[idx];
            const maxVal = Math.max(radio, compute, dem, 100);
            const cfg = SLICE_CONFIG[slice];

            return (
              <div key={`coupling-${slice}`} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                    <span className="font-bold text-slate-800">{cfg.name} Slice</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      bottleneck === 'compute'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : bottleneck === 'radio'
                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                        : bottleneck === 'both'
                        ? 'bg-rose-100 text-rose-800 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    bottleneck: {bottleneck}
                  </span>
                </div>

                {/* Capacity Comparison Bars */}
                <div className="space-y-1.5 text-[11px] font-mono">
                  {/* Radio Capacity */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-slate-500 text-[10px]">Radio (PRB):</span>
                    <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden relative">
                      <div
                        className="h-full bg-sky-500 rounded-full"
                        style={{ width: `${(radio / maxVal) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-bold text-slate-700">{radio.toFixed(0)}</span>
                  </div>

                  {/* Compute Capacity */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-slate-500 text-[10px]">Compute:</span>
                    <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden relative">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${(compute / maxVal) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-bold text-slate-700">{compute.toFixed(0)}</span>
                  </div>

                  {/* Effective vs Demand Summary */}
                  <div className="flex items-center justify-between pt-1.5 text-[10px] text-slate-500 border-t border-slate-200/60">
                    <span>
                      Effective Cap: <strong className="text-slate-900">{effective.toFixed(0)} pkts</strong>
                    </span>
                    <span>
                      Offered Demand: <strong className="text-sky-700">{dem.toFixed(0)} pkts</strong>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-100 italic text-center">
        Served traffic is limited by the smaller of radio and compute capacity.
      </p>
    </div>
  );
};
