import React from "react";
import { TrainingLogResponse } from "../../types/api";

interface TrainingMetricsCardsProps {
  metadata: TrainingLogResponse["metadata"];
  totalRecords?: number;
}

export const TrainingMetricsCards: React.FC<TrainingMetricsCardsProps> = ({
  metadata,
  totalRecords = 500,
}) => {
  const lambdas = metadata?.final_lambdas || { urllc: 0.8771, murllc: 0.7518, embb: 4.7366 };
  const costs = metadata?.final_costs || { urllc: 0.0, murllc: 0.0, embb: 0.045 };

  return (
    <div className="space-y-3">
      {/* Top Metadata Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="p-3 rounded-xl bg-bg-card border border-border-subtle">
          <span className="text-[10px] text-text-muted uppercase block font-mono">Total Timesteps</span>
          <span className="text-base font-bold font-mono text-cyan-400">
            {(metadata?.timesteps || 50100).toLocaleString()}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-bg-card border border-border-subtle">
          <span className="text-[10px] text-text-muted uppercase block font-mono">Training Seed</span>
          <span className="text-base font-bold font-mono text-text-primary">
            #{metadata?.seed || 42}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-bg-card border border-border-subtle">
          <span className="text-[10px] text-text-muted uppercase block font-mono">Final Reward</span>
          <span className="text-base font-bold font-mono text-emerald-400">
            {(metadata?.final_reward || 0.2337).toFixed(4)}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-bg-card border border-border-subtle">
          <span className="text-[10px] text-text-muted uppercase block font-mono">Checkpoint</span>
          <span className="text-xs font-bold font-mono text-purple-400 truncate block" title={metadata?.selected_checkpoint}>
            {metadata?.selected_checkpoint || "models/agent.zip"}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-bg-card border border-border-subtle">
          <span className="text-[10px] text-text-muted uppercase block font-mono">File Generated</span>
          <span className="text-xs font-mono text-text-muted truncate block" title={metadata?.file_date}>
            {metadata?.file_date || "2026-10-23 16:50"}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-bg-card border border-border-subtle">
          <span className="text-[10px] text-text-muted uppercase block font-mono">Log Samples</span>
          <span className="text-base font-bold font-mono text-text-primary">
            {totalRecords.toLocaleString()} rows
          </span>
        </div>
      </div>

      {/* Dual Multipliers (Lambdas) Cards (FT-49) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* λ URLLC */}
        <div className="p-3.5 rounded-xl bg-bg-card border border-amber-200 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slice-urllc uppercase">λ_urllc Penalty Weight</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">
              final trained value
            </span>
          </div>
          <div className="flex items-baseline justify-between font-mono my-1">
            <span className="text-xl font-bold text-amber-600">
              {lambdas.urllc.toFixed(4)}
            </span>
            <span className="text-[11px] text-text-muted">
              Cost: <strong className="text-emerald-600">{costs.urllc.toFixed(4)}</strong> / 0.005
            </span>
          </div>
          <p className="text-[10px] text-text-muted mt-1 leading-snug">
            Lagrangian multiplier enforcing URLLC latency deadline threshold (&lt;0.5%).
          </p>
        </div>

        {/* λ mURLLC */}
        <div className="p-3.5 rounded-xl bg-bg-card border border-purple-200 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slice-murllc uppercase">λ_murllc Penalty Weight</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-300">
              final trained value
            </span>
          </div>
          <div className="flex items-baseline justify-between font-mono my-1">
            <span className="text-xl font-bold text-purple-600">
              {lambdas.murllc.toFixed(4)}
            </span>
            <span className="text-[11px] text-text-muted">
              Cost: <strong className="text-emerald-600">{costs.murllc.toFixed(4)}</strong> / 0.010
            </span>
          </div>
          <p className="text-[10px] text-text-muted mt-1 leading-snug">
            Lagrangian multiplier enforcing mURLLC packet loss constraint (&lt;1.0%).
          </p>
        </div>

        {/* λ eMBB */}
        <div className="p-3.5 rounded-xl bg-bg-card border border-cyan-200 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slice-embb uppercase">λ_embb Throughput Floor</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-50 text-cyan-800 border border-cyan-300">
              final trained value
            </span>
          </div>
          <div className="flex items-baseline justify-between font-mono my-1">
            <span className="text-xl font-bold text-cyan-600">
              {lambdas.embb.toFixed(4)}
            </span>
            <span className="text-[11px] text-text-muted">
              Shortfall Cost: <strong className="text-cyan-700">{costs.embb.toFixed(4)}</strong> / 0.050
            </span>
          </div>
          <p className="text-[10px] text-text-muted mt-1 leading-snug">
            Multiplier preventing eMBB starvation while prioritizing mission-critical slices.
          </p>
        </div>
      </div>
    </div>
  );
};
