import React from "react";
import { useSliceStore } from "../../store/useSliceStore";
import { StatusBadge } from "../common/Badge";
import { ShieldCheck, HardDrive, Cpu, Gauge, Clock } from "lucide-react";
import { PolicyTelemetry } from "../../types/api";

export const PolicyResourceCards: React.FC = () => {
  const { latestPayload } = useSliceStore();

  const pols = latestPayload?.policies;
  const staticPol = pols?.static;
  const heurPol = pols?.heuristic;
  const agentPol = pols?.agent;

  const getStatus = (p?: PolicyTelemetry) => {
    if (!p) return "NO_TRAFFIC";
    if (p.sla_ok === false) return "BREACH";
    if (p.sla?.urllc?.status === "breach" || p.sla?.murllc?.status === "breach") return "BREACH";
    if (p.sla?.urllc?.status === "amber" || p.sla?.murllc?.status === "amber") return "AT_RISK";
    return "OK";
  };

  const renderResourceCard = (
    title: string,
    pol: PolicyTelemetry | undefined,
    policyKey: "static" | "heuristic" | "agent",
    colorClass: string
  ) => {
    const prb = pol?.shares?.prb || { embb: 0.33, urllc: 0.33, murllc: 0.34 };
    const vcpu = pol?.shares?.vcpu || { embb: 0.33, urllc: 0.33, murllc: 0.34 };
    const queue = pol?.queue || { embb: 0, urllc: 0, murllc: 0 };
    const delays = pol?.est_delay_ms || latestPayload?.est_delay_ms?.[policyKey] || { embb: 0, urllc: 0, murllc: 0 };
    const status = getStatus(pol);

    // Summing check
    const prbEmbbPct = Math.round(prb.embb * 100);
    const prbUrllcPct = Math.round(prb.urllc * 100);
    const prbMurllcPct = Math.max(0, 100 - prbEmbbPct - prbUrllcPct);

    const vcpuEmbbPct = Math.round(vcpu.embb * 100);
    const vcpuUrllcPct = Math.round(vcpu.urllc * 100);
    const vcpuMurllcPct = Math.max(0, 100 - vcpuEmbbPct - vcpuUrllcPct);

    const isAgent = policyKey === "agent";
    const shieldData = pol?.shield;
    const interventionRate = ((shieldData?.intervention_rate_20 ?? (latestPayload?.audit?.shield_rate_20 ?? 0)) * 100);

    return (
      <div className="p-3.5 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${colorClass}`}></span>
            <span className="text-xs font-bold text-text-primary tracking-tight">{title}</span>
          </div>
          <StatusBadge status={status} size="sm" />
        </div>

        {/* Resource Allocation Bars */}
        <div className="space-y-2.5 my-2.5">
          {/* PRB Shares */}
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-text-muted flex items-center gap-1">
                <HardDrive size={11} className="text-cyan-400" /> PRB Radio Shares:
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                <span className="text-slice-embb">{prbEmbbPct}%</span> /{" "}
                <span className="text-slice-urllc">{prbUrllcPct}%</span> /{" "}
                <span className="text-slice-murllc">{prbMurllcPct}%</span>
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden flex bg-bg-base border border-border-subtle">
              <div style={{ width: `${prbEmbbPct}%` }} className="bg-slice-embb h-full" title={`eMBB: ${prbEmbbPct}%`} />
              <div style={{ width: `${prbUrllcPct}%` }} className="bg-slice-urllc h-full" title={`URLLC: ${prbUrllcPct}%`} />
              <div style={{ width: `${prbMurllcPct}%` }} className="bg-slice-murllc h-full" title={`mURLLC: ${prbMurllcPct}%`} />
            </div>
          </div>

          {/* vCPU Shares */}
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-text-muted flex items-center gap-1">
                <Cpu size={11} className="text-purple-400" /> vCPU Compute:
              </span>
              <span className="font-mono text-[10px] text-text-muted">
                <span className="text-slice-embb">{vcpuEmbbPct}%</span> /{" "}
                <span className="text-slice-urllc">{vcpuUrllcPct}%</span> /{" "}
                <span className="text-slice-murllc">{vcpuMurllcPct}%</span>
              </span>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden flex bg-bg-base border border-border-subtle">
              <div style={{ width: `${vcpuEmbbPct}%` }} className="bg-slice-embb h-full" title={`eMBB: ${vcpuEmbbPct}%`} />
              <div style={{ width: `${vcpuUrllcPct}%` }} className="bg-slice-urllc h-full" title={`URLLC: ${vcpuUrllcPct}%`} />
              <div style={{ width: `${vcpuMurllcPct}%` }} className="bg-slice-murllc h-full" title={`mURLLC: ${vcpuMurllcPct}%`} />
            </div>
          </div>

          {/* Queue & Delay Row */}
          <div className="grid grid-cols-2 gap-2 pt-1 text-center">
            <div className="p-1.5 rounded-lg bg-bg-base/60 border border-border-subtle">
              <span className="text-[10px] text-text-muted flex items-center justify-center gap-1">
                <Gauge size={10} className="text-cyan-400" /> eMBB Queue:
              </span>
              <span className="text-xs font-mono font-bold text-text-primary">
                {Math.round(queue.embb || 0)} pkts
              </span>
            </div>
            <div className="p-1.5 rounded-lg bg-bg-base/60 border border-border-subtle">
              <span className="text-[10px] text-text-muted flex items-center justify-center gap-1">
                <Clock size={10} className="text-amber-400" /> URLLC Delay:
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {(delays.urllc || 0.35).toFixed(2)} ms
              </span>
            </div>
          </div>
        </div>

        {/* Shield Intervention Rate Meter (for Agent) or Static/Heuristic footnote */}
        {isAgent ? (
          <div className="pt-2 border-t border-border-subtle">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-text-muted flex items-center gap-1 font-medium">
                <ShieldCheck size={12} className="text-emerald-400" /> Shield Intervention (20 steps):
              </span>
              <span className="font-mono text-xs font-bold text-emerald-400">
                {interventionRate.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-bg-base border border-border-subtle">
              <div
                style={{ width: `${Math.min(100, Math.max(0, interventionRate))}%` }}
                className="bg-emerald-500 h-full transition-all duration-300"
              />
            </div>
          </div>
        ) : (
          <div className="pt-2 border-t border-border-subtle flex items-center justify-between text-[10px] text-text-muted font-mono">
            <span>Control Mode:</span>
            <span>{policyKey === "static" ? "Hard Partition" : "Proportional Feedback"}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
      {renderResourceCard("Static Baseline", staticPol, "static", "bg-policy-static")}
      {renderResourceCard("Heuristic Reactive", heurPol, "heuristic", "bg-policy-heuristic")}
      {renderResourceCard("RL Agent + Safety Shield", agentPol, "agent", "bg-policy-agent")}
    </div>
  );
};
