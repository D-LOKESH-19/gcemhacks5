import React from "react";
import { useSliceStore } from "../store/useSliceStore";
import { Activity, Zap } from "lucide-react";

export const LiveDemoPage: React.FC = () => {
  const { latestPayload, connectionStatus } = useSliceStore();

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="text-emerald-400" size={20} />
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Live Closed-Loop Network Slicing Demo
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Real-time comparative evaluation: Static Baseline vs Heuristic vs Constrained RL Agent with Shield.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-text-muted block">Status</span>
            <span className="text-xs font-semibold text-emerald-400 capitalize">
              {connectionStatus}
            </span>
          </div>
          <div className="text-right pl-3 border-l border-border-subtle">
            <span className="text-xs text-text-muted block">Current Step</span>
            <span className="text-xs font-mono font-bold text-text-primary">
              #{latestPayload?.step ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-6 rounded-xl bg-bg-card border border-border-subtle">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-rose-400">STATIC ALLOCATION</span>
            <span className="text-xs px-2 py-0.5 rounded bg-rose-950/60 border border-rose-800/80 text-rose-400">
              Fixed 33%
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Rigid partition baseline vulnerable to burst packet drops.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-bg-card border border-border-subtle">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-slate-300">HEURISTIC PROPORTIONAL</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
              Reactive
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Instantaneous demand matching prone to latency lag and queue blowup.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-bg-card border border-border-subtle">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <Zap size={14} /> RL AGENT + SAFETY SHIELD
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/80 text-emerald-400">
              Active Shield
            </span>
          </div>
          <p className="text-xs text-text-muted">
            Safe Lagrangian policy guaranteeing sub-millisecond URLLC latency.
          </p>
        </div>
      </div>
    </div>
  );
};
