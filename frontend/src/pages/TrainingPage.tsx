import React from "react";
import { TrendingUp } from "lucide-react";

export const TrainingPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="text-cyan-400" size={20} />
          <h1 className="text-lg font-bold text-text-primary tracking-tight">RL Training & Lagrangian Convergence</h1>
        </div>
        <p className="text-xs text-text-muted">
          PPO policy loss, penalty costs against thresholds, and dual multiplier (λ) convergence history.
        </p>
      </div>

      <div className="p-12 text-center bg-bg-card border border-border-subtle rounded-xl text-text-muted text-xs">
        Phase F6 Component: Real training log curves from runs/log.csv and model metadata cards.
      </div>
    </div>
  );
};
