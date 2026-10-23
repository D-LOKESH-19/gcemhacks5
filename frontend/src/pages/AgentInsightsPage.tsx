import React from "react";
import { Cpu } from "lucide-react";

export const AgentInsightsPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="text-emerald-400" size={20} />
          <h1 className="text-lg font-bold text-text-primary tracking-tight">RL Agent & Safety Shield Insights</h1>
        </div>
        <p className="text-xs text-text-muted">
          Stacked PRB vs vCPU joint resource allocation, shield intervention rates, and 20-step decision audit logs.
        </p>
      </div>

      <div className="p-12 text-center bg-bg-card border border-border-subtle rounded-xl text-text-muted text-xs">
        Phase F5 Component: Joint radio/compute coupling bars, live shield telemetry, and explainability audit table.
      </div>
    </div>
  );
};
