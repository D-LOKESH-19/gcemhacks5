import React from "react";
import { Cpu } from "lucide-react";
import { SharesStackedChart } from "../components/agent/SharesStackedChart";
import { ShieldInterventionCard } from "../components/agent/ShieldInterventionCard";
import { CouplingBars } from "../components/agent/CouplingBars";
import { DecisionAuditTable } from "../components/agent/DecisionAuditTable";

export const AgentInsightsPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 w-full max-w-[1920px] mx-auto pb-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="text-emerald-400" size={20} />
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              RL Agent & Safety Shield Explainability Insights
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Continuous simplex share distribution, radio-compute coupling, safety shield telemetry, and 20-step decision audit logs.
          </p>
        </div>
      </div>

      {/* 1. Dynamic Stacked Shares Chart (FT-39, FT-43) */}
      <SharesStackedChart />

      {/* 2. Side-by-Side: Shield Interventions (FT-40) & Coupling Capacity (FT-42) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ShieldInterventionCard />
        <CouplingBars />
      </div>

      {/* 3. 20-Step Decision Audit Table (FT-41) */}
      <DecisionAuditTable />
    </div>
  );
};

export default AgentInsightsPage;
