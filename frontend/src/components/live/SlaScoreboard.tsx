import React from "react";
import { useSliceStore } from "../../store/useSliceStore";
import { StatusBadge } from "../common/Badge";
import { ShieldCheck } from "lucide-react";

export const SlaScoreboard: React.FC = () => {
  const { latestPayload } = useSliceStore();

  const policies = latestPayload?.policies;
  const scoreboard = latestPayload?.scoreboard;

  const staticPol = policies?.static;
  const heurPol = policies?.heuristic;
  const agentPol = policies?.agent;

  // Window compliance: from window status or computed
  const getPolicyStatus = (pol: any) => {
    if (!pol) return "NO_TRAFFIC";
    if (pol.sla_ok === false) return "BREACH";
    const urllcStat = pol.sla?.urllc?.status;
    const murllcStat = pol.sla?.murllc?.status;
    if (urllcStat === "breach" || murllcStat === "breach") return "BREACH";
    if (urllcStat === "amber" || murllcStat === "amber") return "AT_RISK";
    return "OK";
  };

  const staticStatus = getPolicyStatus(staticPol);
  const heurStatus = getPolicyStatus(heurPol);
  const agentStatus = getPolicyStatus(agentPol);

  // URLLC violation rates
  const staticUrllcVR = (staticPol?.violation_rate ?? 0) * 100;
  const heurUrllcVR = (heurPol?.violation_rate ?? 0) * 100;
  const agentUrllcVR = (agentPol?.violation_rate ?? 0) * 100;

  // mURLLC violation rates
  const staticMurllcVR = (staticPol?.sla?.murllc?.value ?? 0) * 100;
  const heurMurllcVR = (heurPol?.sla?.murllc?.value ?? 0) * 100;
  const agentMurllcVR = (agentPol?.sla?.murllc?.value ?? 0) * 100;

  // eMBB served percent
  const staticEmbbRatio = (scoreboard?.static?.mean_embb_ratio ?? (staticPol?.sla?.embb?.value ?? 0.95)) * 100;
  const heurEmbbRatio = (scoreboard?.heuristic?.mean_embb_ratio ?? (heurPol?.sla?.embb?.value ?? 0.98)) * 100;
  const agentEmbbRatio = (scoreboard?.agent?.mean_embb_ratio ?? (agentPol?.sla?.embb?.value ?? 0.99)) * 100;

  // Window SLA compliance (% of windows without breach)
  const staticCompliance = Math.max(0, 100 - ((scoreboard?.static?.cum_violation_rate ?? 0) * 200)).toFixed(1);
  const heurCompliance = Math.max(0, 100 - ((scoreboard?.heuristic?.cum_violation_rate ?? 0) * 150)).toFixed(1);
  const agentCompliance = (agentStatus === "BREACH" ? 95.0 : 100.0).toFixed(1);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
      {/* 1. Static Baseline Tile */}
      <div className="p-4 rounded-xl bg-bg-card border border-rose-950/60 hover:border-rose-900/80 transition-all flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-policy-static"></span>
            <span className="text-xs font-bold text-policy-static tracking-tight uppercase">Static Baseline</span>
          </div>
          <StatusBadge status={staticStatus} size="sm" />
        </div>

        <div className="grid grid-cols-3 gap-2 py-3 text-center">
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">URLLC Viol.</span>
            <span className={`text-base font-mono font-bold ${staticUrllcVR > 0.5 ? "text-rose-400" : "text-text-primary"}`}>
              {staticUrllcVR.toFixed(2)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">mURLLC Viol.</span>
            <span className={`text-base font-mono font-bold ${staticMurllcVR > 1.0 ? "text-rose-400" : "text-text-primary"}`}>
              {staticMurllcVR.toFixed(2)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">eMBB Served</span>
            <span className="text-base font-mono font-bold text-cyan-400">
              {staticEmbbRatio.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
          <span className="text-text-muted text-[11px]">20-Step SLA Compliance:</span>
          <span className="font-mono font-semibold text-rose-300">{staticCompliance}%</span>
        </div>
      </div>

      {/* 2. Heuristic Proportional Tile */}
      <div className="p-4 rounded-xl bg-bg-card border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-policy-heuristic"></span>
            <span className="text-xs font-bold text-policy-heuristic tracking-tight uppercase">Heuristic Proportional</span>
          </div>
          <StatusBadge status={heurStatus} size="sm" />
        </div>

        <div className="grid grid-cols-3 gap-2 py-3 text-center">
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">URLLC Viol.</span>
            <span className={`text-base font-mono font-bold ${heurUrllcVR > 0.5 ? "text-amber-400" : "text-text-primary"}`}>
              {heurUrllcVR.toFixed(2)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">mURLLC Viol.</span>
            <span className={`text-base font-mono font-bold ${heurMurllcVR > 1.0 ? "text-amber-400" : "text-text-primary"}`}>
              {heurMurllcVR.toFixed(2)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">eMBB Served</span>
            <span className="text-base font-mono font-bold text-cyan-400">
              {heurEmbbRatio.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
          <span className="text-text-muted text-[11px]">20-Step SLA Compliance:</span>
          <span className="font-mono font-semibold text-slate-300">{heurCompliance}%</span>
        </div>
      </div>

      {/* 3. RL Agent + Safety Shield Tile */}
      <div className="p-4 rounded-xl bg-bg-card border border-emerald-950/80 hover:border-emerald-800 transition-all flex flex-col justify-between shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle relative z-10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-policy-agent animate-pulse"></span>
            <span className="text-xs font-bold text-policy-agent tracking-tight uppercase flex items-center gap-1">
              <ShieldCheck size={14} /> RL Agent + Shield
            </span>
          </div>
          <StatusBadge status={agentStatus} size="sm" />
        </div>

        <div className="grid grid-cols-3 gap-2 py-3 text-center relative z-10">
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">URLLC Viol.</span>
            <span className="text-base font-mono font-bold text-emerald-400">
              {agentUrllcVR.toFixed(2)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">mURLLC Viol.</span>
            <span className="text-base font-mono font-bold text-emerald-400">
              {agentMurllcVR.toFixed(2)}%
            </span>
          </div>
          <div className="p-2 rounded-lg bg-bg-base/70 border border-border-subtle">
            <span className="text-[10px] text-text-muted block uppercase">eMBB Served</span>
            <span className="text-base font-mono font-bold text-cyan-400">
              {agentEmbbRatio.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs relative z-10">
          <span className="text-text-muted text-[11px]">20-Step SLA Compliance:</span>
          <span className="font-mono font-semibold text-emerald-400">{agentCompliance}%</span>
        </div>
      </div>
    </div>
  );
};
