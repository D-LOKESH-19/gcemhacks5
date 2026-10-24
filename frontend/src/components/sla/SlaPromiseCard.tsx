import React from "react";
import { ShieldCheck, ShieldAlert, FileText } from "lucide-react";
import { useSliceStore } from "../../store/useSliceStore";

export const SlaPromiseCard: React.FC = () => {
  const { latestPayload, publicConfig } = useSliceStore();

  const limits = publicConfig?.sla || {
    window_steps: 20,
    embb: { min_served_ratio: 0.7 },
    urllc: { max_violation_rate: 0.005, max_window_violation: 0.02 },
    murllc: { max_violation_rate: 0.01, max_window_violation: 0.03 },
  };

  const isFeasible = latestPayload?.feasible ?? true;

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-cyan-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            5G Network Slicing Service Level Agreements (SLA Contract)
          </h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-text-muted border border-border-subtle">
          Evaluation Window: {limits.window_steps} Steps (2.0s)
        </span>
      </div>

      {/* Contract Promises Strip (FT-45) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* eMBB Promise */}
        <div className="p-3 rounded-lg bg-bg-base/70 border border-cyan-950/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slice-embb uppercase">eMBB Throughput</span>
            <span className="text-[10px] font-mono text-cyan-400 font-semibold">&gt;= {(limits.embb.min_served_ratio * 100).toFixed(0)}%</span>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            Must serve at least <strong className="text-text-primary">{(limits.embb.min_served_ratio * 100).toFixed(0)}%</strong> of cumulative bit-rate demand over each 20-step evaluation window.
          </p>
        </div>

        {/* URLLC Promise */}
        <div className="p-3 rounded-lg bg-bg-base/70 border border-amber-950/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slice-urllc uppercase">URLLC Latency</span>
            <span className="text-[10px] font-mono text-amber-400 font-semibold">&lt; {(limits.urllc.max_violation_rate * 100).toFixed(1)}%</span>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            Packet deadline misses must stay strictly below <strong className="text-text-primary">{(limits.urllc.max_violation_rate * 100).toFixed(1)}%</strong> (window peak &lt; {(limits.urllc.max_window_violation * 100).toFixed(0)}%).
          </p>
        </div>

        {/* mURLLC Promise */}
        <div className="p-3 rounded-lg bg-bg-base/70 border border-purple-950/80 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slice-murllc uppercase">mURLLC Reliability</span>
            <span className="text-[10px] font-mono text-purple-400 font-semibold">&lt; {(limits.murllc.max_violation_rate * 100).toFixed(1)}%</span>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed">
            Massive IoT sensor telemetry violation rate must not exceed <strong className="text-text-primary">{(limits.murllc.max_violation_rate * 100).toFixed(1)}%</strong>.
          </p>
        </div>
      </div>

      {/* Mandatory Overload Condition Notice (FT-47) */}
      {!isFeasible ? (
        <div className="p-3 rounded-lg bg-purple-950/60 border border-purple-800 text-purple-200 flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-purple-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold uppercase tracking-wider text-purple-300 mr-2">[OVERLOAD ACTIVE]</span>
              <span>Cell traffic exceeds total network capacity. <strong>URLLC and mURLLC protected first.</strong></span>
            </div>
          </div>
          <span className="text-[10px] font-mono text-purple-300/80 hidden sm:inline">
            eMBB throughput safely throttled to avoid mission-critical drop
          </span>
        </div>
      ) : (
        <div className="p-2.5 rounded-lg bg-bg-base/60 border border-border-subtle flex items-center justify-between text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Operating under feasible load conditions (aggregate cell demand within provisioned PRB & vCPU envelope).</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-semibold">Feasible Envelope OK</span>
        </div>
      )}
    </div>
  );
};
