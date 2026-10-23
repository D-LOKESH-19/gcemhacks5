import React from "react";
import { BarChart3 } from "lucide-react";

export const ResultsPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="text-emerald-400" size={20} />
          <h1 className="text-lg font-bold text-text-primary tracking-tight">Benchmark Results & Model Ablation</h1>
        </div>
        <p className="text-xs text-text-muted">
          Validated experimental evaluation over multi-seed simulation runs from results/*.csv.
        </p>
      </div>

      <div className="p-12 text-center bg-bg-card border border-border-subtle rounded-xl text-text-muted text-xs">
        Phase F6 Component: Headline cards, scenario comparisons with error bars, and ablation studies.
      </div>
    </div>
  );
};
