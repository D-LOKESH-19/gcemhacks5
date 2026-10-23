import React from "react";
import { useSliceStore } from "../../store/useSliceStore";
import { Cpu, HardDrive, Zap, Info } from "lucide-react";

export const CouplingBars: React.FC = () => {
  const { latestPayload } = useSliceStore();

  const agentShares = latestPayload?.policies?.agent?.shares || {
    prb: { embb: 0.6, urllc: 0.25, murllc: 0.15 },
    vcpu: { embb: 0.5, urllc: 0.25, murllc: 0.25 },
  };

  const slices = [
    {
      key: "embb",
      name: "eMBB High-Throughput",
      color: "bg-slice-embb",
      textCol: "text-slice-embb",
      prb: agentShares.prb.embb,
      vcpu: agentShares.vcpu.embb,
    },
    {
      key: "urllc",
      name: "URLLC Ultra-Reliable",
      color: "bg-slice-urllc",
      textCol: "text-slice-urllc",
      prb: agentShares.prb.urllc,
      vcpu: agentShares.vcpu.urllc,
    },
    {
      key: "murllc",
      name: "mURLLC Low-Power IoT",
      color: "bg-slice-murllc",
      textCol: "text-slice-murllc",
      prb: agentShares.prb.murllc,
      vcpu: agentShares.vcpu.murllc,
    },
  ];

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle mb-3">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-amber-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            Radio-Compute Joint Coupling & Effective Capacity (FT-42)
          </h2>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded">
          C_eff = min(Radio, Compute)
        </span>
      </div>

      {/* 3 Slices Comparison Bars */}
      <div className="space-y-3.5 my-1">
        {slices.map((slice) => {
          const prbPct = Number((slice.prb * 100).toFixed(1));
          const vcpuPct = Number((slice.vcpu * 100).toFixed(1));
          // FT-42: Effective capacity equals min of radio and compute
          const effCapacityPct = Math.min(prbPct, vcpuPct);
          const bottleneck = prbPct < vcpuPct ? "Radio (PRB) Bottleneck" : prbPct > vcpuPct ? "Compute (vCPU) Bottleneck" : "Balanced";

          return (
            <div key={slice.key} className="p-2.5 rounded-lg bg-bg-base/70 border border-border-subtle">
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-xs font-bold ${slice.textCol}`}>{slice.name}</span>
                <span className="text-[10px] font-mono text-text-muted">
                  Bottleneck: <span className="text-amber-300 font-semibold">{bottleneck}</span>
                </span>
              </div>

              {/* Progress Rows */}
              <div className="space-y-1.5 text-[10px] font-mono">
                {/* PRB Row */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-muted flex items-center gap-1 w-24">
                    <HardDrive size={10} className="text-cyan-400" /> PRB Radio:
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div style={{ width: `${prbPct}%` }} className="h-full bg-cyan-400" />
                  </div>
                  <span className="w-10 text-right text-cyan-300 font-bold">{prbPct}%</span>
                </div>

                {/* vCPU Row */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-muted flex items-center gap-1 w-24">
                    <Cpu size={10} className="text-purple-400" /> vCPU Compute:
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div style={{ width: `${vcpuPct}%` }} className="h-full bg-purple-400" />
                  </div>
                  <span className="w-10 text-right text-purple-300 font-bold">{vcpuPct}%</span>
                </div>

                {/* Effective Coupled Capacity Row */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-emerald-400 font-semibold flex items-center gap-1 w-24">
                    <Zap size={10} /> Effective:
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden border border-emerald-900/60">
                    <div style={{ width: `${effCapacityPct}%` }} className="h-full bg-emerald-400" />
                  </div>
                  <span className="w-10 text-right text-emerald-400 font-bold">{effCapacityPct}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Coupling Explanation Note */}
      <div className="pt-2 border-t border-border-subtle flex items-start gap-2 text-[10px] text-text-muted">
        <Info size={13} className="text-cyan-400 shrink-0 mt-0.5" />
        <span>
          <strong className="text-text-primary font-medium">Coupling Mechanics:</strong> Network slicing in Open RAN requires
          simultaneous radio scheduling and edge compute execution. Any mismatch creates unutilized resource waste
          and queuing delays at the bottleneck domain.
        </span>
      </div>
    </div>
  );
};
