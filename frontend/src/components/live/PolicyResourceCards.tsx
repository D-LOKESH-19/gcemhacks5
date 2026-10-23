import React from "react";
import { useSliceStore } from "../../store/useSliceStore";
import { StatusBadge } from "../common/Badge";
import { ShieldCheck } from "lucide-react";
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
    const queue = pol?.queue || { embb: 0, urllc: 0, murllc: 0 };
    const delays = pol?.est_delay_ms || latestPayload?.est_delay_ms?.[policyKey] || { embb: 0, urllc: 0, murllc: 0 };
    const status = getStatus(pol);

    // Summing check
    const prbEmbbPct = Math.round(prb.embb * 100);
    const prbUrllcPct = Math.round(prb.urllc * 100);
    const prbMurllcPct = Math.max(0, 100 - prbEmbbPct - prbUrllcPct);

    const isAgent = policyKey === "agent";
    const shieldData = pol?.shield;
    const interventionRate = ((shieldData?.intervention_rate_20 ?? (latestPayload?.audit?.shield_rate_20 ?? 0)) * 100);
    const lambdaVal = (pol?.lambda ?? 0).toFixed(3);

    return (
      <div 
        className={`p-4 rounded-2xl flex flex-col justify-between transition-all ${
          isAgent 
            ? "bg-white/95 backdrop-blur-md border-2 border-sky-400 shadow-[0_12px_28px_-4px_rgba(2,132,199,0.16)]" 
            : "bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)]"
        }`}
      >
        {/* Card Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${colorClass}`}></span>
            <div>
              <span className="text-sm font-bold text-slate-900 tracking-tight block">{title}</span>
              <span className="text-[11px] text-slate-500 block">
                {policyKey === "static" ? "Fixed 60/25/15 PRB & vCPU" : policyKey === "heuristic" ? "Queue + Smoothed Load with Floors" : "Lagrangian PPO Orchestration"}
              </span>
            </div>
          </div>
          <StatusBadge status={status} size="sm" />
        </div>

        {/* Resource Allocation Bars */}
        <div className="space-y-3 my-3">
          {/* PRB Shares */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
              <span className="text-slate-700 flex items-center gap-1 font-semibold">
                Radio PRB Share
              </span>
              <span className="font-mono text-xs text-slate-600 font-bold">
                {prbEmbbPct}% | {prbUrllcPct}% | {prbMurllcPct}%
              </span>
            </div>
            {/* High visual fidelity segmented bar matching screenshot */}
            <div className="w-full h-6 rounded-md overflow-hidden flex bg-slate-100 shadow-inner">
              <div 
                style={{ width: `${prbEmbbPct}%` }} 
                className="bg-[#0ea5e9] h-full flex items-center justify-center text-[11px] font-bold text-white transition-all duration-300" 
                title={`eMBB: ${prbEmbbPct}%`}
              >
                {prbEmbbPct >= 18 ? "eMBB" : ""}
              </div>
              <div 
                style={{ width: `${prbUrllcPct}%` }} 
                className="bg-[#f59e0b] h-full flex items-center justify-center text-[11px] font-bold text-white transition-all duration-300" 
                title={`URLLC: ${prbUrllcPct}%`}
              >
                {prbUrllcPct >= 18 ? "URLLC" : ""}
              </div>
              <div 
                style={{ width: `${prbMurllcPct}%` }} 
                className="bg-[#a855f7] h-full flex items-center justify-center text-[11px] font-bold text-white transition-all duration-300" 
                title={`mURLLC: ${prbMurllcPct}%`}
              >
                {prbMurllcPct >= 16 ? "mURLLC" : ""}
              </div>
            </div>
          </div>

          {/* If Agent: Lagrangian Multiplier & Shield ACTIVE badge */}
          {isAgent && (
            <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50/50 border border-amber-200/80">
              <span className="text-xs font-mono font-bold text-sky-800">
                Lagrangian Multiplier &lambda;: {lambdaVal}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-[#f59e0b] text-white text-[11px] font-extrabold flex items-center gap-1 shadow-sm">
                <ShieldCheck size={13} /> Shield ACTIVE
              </span>
            </div>
          )}

          {/* eMBB Queue Buffer Slider Track */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-600 font-medium">eMBB Queue Buffer</span>
              <span className="font-mono text-xs text-slate-700 font-bold">
                {Math.round(queue.embb || 0)} / 2000
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-200 relative overflow-visible flex items-center">
              <div
                style={{ width: `${Math.min(100, ((queue.embb || 0) / 2000) * 100)}%` }}
                className="h-full bg-sky-500 rounded-full"
              />
              <span 
                style={{ left: `${Math.min(98, Math.max(1, ((queue.embb || 0) / 2000) * 100))}%` }}
                className="w-3 h-3 rounded-full bg-sky-500 border-2 border-white shadow absolute transform -translate-x-1/2"
              />
            </div>
          </div>

          {/* Estimated delay (model) */}
          <div className="pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 text-[11px] block mb-1">Estimated delay (model):</span>
            <div className="font-mono text-xs flex flex-wrap items-center gap-3">
              <span className="text-sky-600 font-semibold">eMBB: {(delays.embb || 15.8).toFixed(1)}ms</span>
              <span className="text-slate-300">|</span>
              <span className="text-amber-700 font-semibold">URLLC: {(delays.urllc || 0.33).toFixed(2)}ms</span>
              <span className="text-slate-300">|</span>
              <span className="text-purple-700 font-semibold">mURLLC: {(delays.murllc || 2.4).toFixed(1)}ms</span>
            </div>
          </div>
        </div>

        {/* Shield Intervention Rate Meter (for Agent) */}
        {isAgent && (
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-slate-600 flex items-center gap-1 font-medium">
                <ShieldCheck size={12} className="text-emerald-600" /> Shield Intervention (20 steps):
              </span>
              <span className="font-mono text-xs font-bold text-emerald-700">
                {interventionRate.toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-slate-200 border border-slate-300">
              <div
                style={{ width: `${Math.min(100, Math.max(0, interventionRate))}%` }}
                className="bg-emerald-500 h-full transition-all duration-300"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {renderResourceCard("Static Partition", staticPol, "static", "bg-policy-static")}
      {renderResourceCard("Demand Heuristic", heurPol, "heuristic", "bg-policy-heuristic")}
      {renderResourceCard("Constrained RL + Hard Shield", agentPol, "agent", "bg-policy-agent")}
    </div>
  );
};
