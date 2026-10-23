import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSliceStore } from "../store/useSliceStore";
import { Tv, X, Zap } from "lucide-react";
import { StatusBadge } from "../components/common/Badge";

export const PresenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { latestPayload } = useSliceStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        navigate("/");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const staticStatus = latestPayload?.policies?.static?.sla?.urllc?.status?.toUpperCase() || 
    (latestPayload?.policies?.static?.sla_ok === false ? "BREACH" : "OK");
  const heuristicStatus = latestPayload?.policies?.heuristic?.sla?.urllc?.status?.toUpperCase() || 
    (latestPayload?.policies?.heuristic?.sla_ok === false ? "BREACH" : "OK");
  const agentStatus = latestPayload?.policies?.agent?.sla?.urllc?.status?.toUpperCase() || 
    (latestPayload?.policies?.agent?.sla_ok === false ? "BREACH" : "OK");

  return (
    <div className="flex-1 flex flex-col justify-between min-h-[calc(100vh-2rem)] p-4 sm:p-8 bg-bg-base select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-6 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-950/80 border border-purple-800/80 text-purple-400">
            <Tv size={28} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              5G Autonomous NOC — Executive Presenter
            </h1>
            <p className="text-sm text-text-muted mt-0.5 font-mono">
              High-Contrast Large-Format Projection Display
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="px-4 py-2 rounded-xl bg-bg-card border border-border-subtle text-right">
            <span className="text-xs text-text-muted block">Simulation Step</span>
            <span className="text-2xl font-mono font-bold text-emerald-400">
              #{latestPayload?.step ?? 0}
            </span>
          </div>
          <button
            onClick={() => navigate("/")}
            className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-text-muted hover:text-text-primary transition-colors"
            title="Exit Presenter Mode (Esc or P)"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Hero Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
        <div className="p-6 rounded-2xl bg-bg-card border border-rose-900/40 flex flex-col justify-between min-h-[220px]">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-rose-400">STATIC SLICING</span>
            <StatusBadge status={staticStatus} size="md" />
          </div>
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider block">URLLC Violation</span>
            <span className="text-5xl font-mono font-black text-rose-400">
              {((latestPayload?.policies?.static?.violation_rate ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
          <p className="text-sm text-text-muted">Rigid 33% allocation fails under burst traffic.</p>
        </div>

        <div className="p-6 rounded-2xl bg-bg-card border border-slate-700 flex flex-col justify-between min-h-[220px]">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-slate-300">HEURISTIC SLICING</span>
            <StatusBadge status={heuristicStatus} size="md" />
          </div>
          <div>
            <span className="text-xs text-text-muted uppercase tracking-wider block">URLLC Violation</span>
            <span className="text-5xl font-mono font-black text-slate-300">
              {((latestPayload?.policies?.heuristic?.violation_rate ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
          <p className="text-sm text-text-muted">Proportional reactive rebalancing lags dynamic surges.</p>
        </div>

        <div className="p-6 rounded-2xl bg-bg-card border border-emerald-900/60 flex flex-col justify-between min-h-[220px] shadow-lg shadow-emerald-950/30">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-emerald-400 flex items-center gap-2">
              <Zap size={20} /> RL AGENT + SHIELD
            </span>
            <StatusBadge status={agentStatus} size="md" />
          </div>
          <div>
            <span className="text-xs text-emerald-400/80 uppercase tracking-wider block">URLLC Violation</span>
            <span className="text-5xl font-mono font-black text-emerald-400">
              {((latestPayload?.policies?.agent?.violation_rate ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
          <p className="text-sm text-emerald-300/80">Guaranteed 0% breach under Lagrangian safety shield.</p>
        </div>
      </div>

      {/* Keyboard Shortcuts Strip */}
      <div className="p-4 rounded-xl bg-bg-card/70 border border-border-subtle flex flex-wrap items-center justify-between gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-text-primary">Shortcuts:</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-text-primary border border-slate-700 font-mono text-[11px]">1</kbd> eMBB Surge</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-text-primary border border-slate-700 font-mono text-[11px]">2</kbd> URLLC Burst</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-text-primary border border-slate-700 font-mono text-[11px]">3</kbd> mURLLC Storm</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-text-primary border border-slate-700 font-mono text-[11px]">Space</kbd> Pause/Resume</span>
          <span><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-text-primary border border-slate-700 font-mono text-[11px]">R</kbd> Reset</span>
        </div>
        <div>
          <span>Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-text-primary border border-slate-700 font-mono text-[11px]">Esc</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-text-primary border border-slate-700 font-mono text-[11px]">P</kbd> to return to standard view</span>
        </div>
      </div>
    </div>
  );
};
