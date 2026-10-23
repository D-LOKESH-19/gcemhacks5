import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSliceStore } from "../store/useSliceStore";
import { useWebSocketStream } from "../hooks/useWebSocketStream";
import { StatusBadge } from "../components/common/Badge";
import {
  Tv,
  X,
  Pause,
  Play,
  RotateCcw,
  HelpCircle,
  Terminal,
  ShieldCheck,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export const PresenterPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    latestPayload,
    violationHistory,
    throughputHistory,
    eventFeed,
    publicConfig,
  } = useSliceStore();
  const { sendSpike, sendPause, sendReset } = useWebSocketStream();

  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [activeSpikeAnim, setActiveSpikeAnim] = useState<string | null>(null);

  const spikeFactors = publicConfig?.spike_factor || { embb: 2.5, urllc: 3.0, murllc: 2.0 };
  const spikeDuration = 25;
  const isPaused = latestPayload?.paused ?? false;

  const triggerSpikeAction = (slice: "embb" | "urllc" | "murllc") => {
    const factor = spikeFactors[slice] || 2.5;
    setActiveSpikeAnim(slice);
    sendSpike(slice, factor, spikeDuration);
    setTimeout(() => setActiveSpikeAnim(null), 1200);
  };

  // FT-58: Keyboard shortcuts handler (1, 2, 3, Space, R, P, Esc, ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.key === "1") {
        e.preventDefault();
        triggerSpikeAction("embb");
      } else if (e.key === "2") {
        e.preventDefault();
        triggerSpikeAction("urllc");
      } else if (e.key === "3") {
        e.preventDefault();
        triggerSpikeAction("murllc");
      } else if (e.code === "Space") {
        e.preventDefault();
        sendPause();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        sendReset();
      } else if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        navigate("/");
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelpModal((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, sendPause, sendReset, spikeFactors]);

  const pols = latestPayload?.policies;
  const staticPol = pols?.static;
  const heurPol = pols?.heuristic;
  const agentPol = pols?.agent;

  const getStatus = (p: any) => {
    if (!p) return "NO_TRAFFIC";
    if (p.sla_ok === false) return "BREACH";
    if (p.sla?.urllc?.status === "breach" || p.sla?.murllc?.status === "breach") return "BREACH";
    if (p.sla?.urllc?.status === "amber" || p.sla?.murllc?.status === "amber") return "AT_RISK";
    return "OK";
  };

  const staticStatus = getStatus(staticPol);
  const heurStatus = getStatus(heurPol);
  const agentStatus = getStatus(agentPol);

  const staticVR = ((staticPol?.violation_rate ?? 0) * 100);
  const heurVR = ((heurPol?.violation_rate ?? 0) * 100);
  const agentVR = ((agentPol?.violation_rate ?? 0) * 100);

  const staticEmbb = (((staticPol?.sla?.embb?.value ?? 0.95)) * 100);
  const heurEmbb = (((heurPol?.sla?.embb?.value ?? 0.98)) * 100);
  const agentEmbb = (((agentPol?.sla?.embb?.value ?? 0.99)) * 100);

  const shieldRate = ((agentPol?.shield?.intervention_rate_20 ?? (latestPayload?.audit?.shield_rate_20 ?? 0)) * 100);
  const slaUrllcLimit = (publicConfig?.sla?.urllc?.max_violation_rate ?? 0.005) * 100;

  // Chart data formatting
  const formattedViolationData = React.useMemo(() => {
    return violationHistory.map((pt) => ({
      step: pt.step,
      Static: Number(((pt.static || 0) * 100).toFixed(2)),
      Heuristic: Number(((pt.heuristic || 0) * 100).toFixed(2)),
      Agent: Number(((pt.agent || 0) * 100).toFixed(2)),
    }));
  }, [violationHistory]);

  const formattedThroughputData = React.useMemo(() => {
    return throughputHistory.map((pt) => ({
      step: pt.step,
      Static: Number((pt.static || 0).toFixed(1)),
      Heuristic: Number((pt.heuristic || 0).toFixed(1)),
      Agent: Number((pt.agent || 0).toFixed(1)),
    }));
  }, [throughputHistory]);

  const maxViolation = React.useMemo(() => {
    let m = 0;
    for (const d of formattedViolationData) {
      if (d.Static > m) m = d.Static;
      if (d.Heuristic > m) m = d.Heuristic;
      if (d.Agent > m) m = d.Agent;
    }
    return Math.max(slaUrllcLimit * 2, m * 1.2, 1.2);
  }, [formattedViolationData, slaUrllcLimit]);

  const latestEvent = eventFeed && eventFeed.length > 0 ? eventFeed[eventFeed.length - 1] : "Autonomous NOC running in nominal steady state.";

  return (
    <div className="flex-1 flex flex-col justify-between min-h-[calc(100vh-1rem)] p-4 sm:p-6 bg-bg-base select-none gap-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-950/80 border border-purple-800/80 text-purple-400">
            <Tv size={26} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight">
              5G Autonomous NOC — Presenter Console
            </h1>
            <p className="text-xs text-text-muted font-mono">
              High-Contrast Large-Format Auditorium Projection (2-Metre Visibility)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Step Pill */}
          <div className="px-3.5 py-1.5 rounded-xl bg-bg-card border border-border-subtle text-right">
            <span className="text-[10px] text-text-muted uppercase block font-mono">Step</span>
            <span className="text-xl font-mono font-bold text-emerald-400">
              #{latestPayload?.step ?? 0}
            </span>
          </div>

          {/* Help Overlay Button (FT-58) */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-text-primary border border-slate-700 transition-colors"
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle size={15} className="text-cyan-400" />
            <span className="hidden sm:inline">Shortcuts (?)</span>
          </button>

          {/* Exit Button */}
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-text-muted hover:text-text-primary border border-slate-700 transition-colors"
            title="Exit Presenter Mode (Esc or P)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Large Scoreboard Tiles (FT-57 Typography >= 24px - 48px) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Static Tile */}
        <div className="p-5 rounded-2xl bg-bg-card border border-rose-950/80 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
            <span className="text-sm font-bold text-policy-static tracking-tight uppercase">Static Baseline</span>
            <StatusBadge status={staticStatus} size="md" />
          </div>
          <div className="my-3">
            <span className="text-[11px] text-text-muted uppercase font-mono block">URLLC Violation Rate</span>
            <span className={`text-4xl sm:text-5xl font-mono font-black ${staticVR > 0.5 ? "text-rose-400" : "text-text-primary"}`}>
              {staticVR.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
            <span className="text-text-muted">eMBB Served:</span>
            <span className="font-mono font-bold text-cyan-400">{staticEmbb.toFixed(1)}%</span>
          </div>
        </div>

        {/* Heuristic Tile */}
        <div className="p-5 rounded-2xl bg-bg-card border border-slate-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
            <span className="text-sm font-bold text-policy-heuristic tracking-tight uppercase">Heuristic Proportional</span>
            <StatusBadge status={heurStatus} size="md" />
          </div>
          <div className="my-3">
            <span className="text-[11px] text-text-muted uppercase font-mono block">URLLC Violation Rate</span>
            <span className={`text-4xl sm:text-5xl font-mono font-black ${heurVR > 0.5 ? "text-amber-400" : "text-text-primary"}`}>
              {heurVR.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
            <span className="text-text-muted">eMBB Served:</span>
            <span className="font-mono font-bold text-cyan-400">{heurEmbb.toFixed(1)}%</span>
          </div>
        </div>

        {/* Agent Tile */}
        <div className="p-5 rounded-2xl bg-bg-card border border-emerald-950 flex flex-col justify-between shadow-lg shadow-emerald-950/20">
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
            <span className="text-sm font-bold text-policy-agent tracking-tight uppercase flex items-center gap-1.5">
              <ShieldCheck size={16} /> RL Agent + Safety Shield
            </span>
            <StatusBadge status={agentStatus} size="md" />
          </div>
          <div className="my-3">
            <span className="text-[11px] text-emerald-400/80 uppercase font-mono block">URLLC Violation Rate</span>
            <span className="text-4xl sm:text-5xl font-mono font-black text-emerald-400">
              {agentVR.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
            <span className="text-text-muted">eMBB: <strong className="font-mono text-cyan-400">{agentEmbb.toFixed(1)}%</strong></span>
            <span className="text-text-muted">Shield Rate: <strong className="font-mono text-emerald-400">{shieldRate.toFixed(1)}%</strong></span>
          </div>
        </div>
      </div>

      {/* Side-by-Side Presenter Hero Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Violation Rate Chart */}
        <div className="p-3.5 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-text-primary uppercase tracking-tight">
              URLLC Violation Rate Overlay (% of Packets Dropped)
            </span>
            <span className="text-[10px] font-mono text-rose-400 bg-rose-950/60 border border-rose-800 px-2 py-0.5 rounded">
              SLA Limit: {slaUrllcLimit.toFixed(2)}%
            </span>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedViolationData} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
                <XAxis dataKey="step" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} domain={[0, maxViolation]} unit="%" width={40} />
                <Tooltip contentStyle={{ backgroundColor: "#121A2B", borderColor: "#1F2A44", fontSize: "11px" }} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: "4px", fontSize: "10px" }} />
                <ReferenceLine y={slaUrllcLimit} stroke="#F59E0B" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="Static" stroke="#F87171" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Heuristic" stroke="#CBD5E1" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Agent" stroke="#34D399" strokeWidth={3} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Throughput Chart */}
        <div className="p-3.5 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-text-primary uppercase tracking-tight">
              eMBB Throughput Overlay (Packets Served / Step)
            </span>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800 px-2 py-0.5 rounded">
              High-Bandwidth Utilization
            </span>
          </div>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedThroughputData} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
                <XAxis dataKey="step" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} width={40} />
                <Tooltip contentStyle={{ backgroundColor: "#121A2B", borderColor: "#1F2A44", fontSize: "11px" }} />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: "4px", fontSize: "10px" }} />
                <Line type="monotone" dataKey="Static" stroke="#F87171" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Heuristic" stroke="#CBD5E1" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Agent" stroke="#34D399" strokeWidth={3} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* One-Line Live Event Ticker */}
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-bg-card border border-border-subtle text-xs font-mono">
        <Terminal size={15} className="text-cyan-400 shrink-0" />
        <span className="text-text-muted shrink-0">LATEST EVENT:</span>
        <span className="text-text-primary truncate">{latestEvent}</span>
      </div>

      {/* Large Presenter Spike Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-bg-card border border-border-subtle">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-text-muted uppercase font-mono mr-1">Inject Surge:</span>
          <button
            onClick={() => triggerSpikeAction("embb")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
              activeSpikeAnim === "embb"
                ? "bg-cyan-500 text-black border-cyan-400 scale-95"
                : "bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border-cyan-800"
            }`}
          >
            [1] eMBB Surge (2.5x)
          </button>
          <button
            onClick={() => triggerSpikeAction("urllc")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
              activeSpikeAnim === "urllc"
                ? "bg-amber-500 text-black border-amber-400 scale-95"
                : "bg-amber-950/70 hover:bg-amber-900 text-amber-300 border-amber-800"
            }`}
          >
            [2] URLLC Burst (3.0x)
          </button>
          <button
            onClick={() => triggerSpikeAction("murllc")}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
              activeSpikeAnim === "murllc"
                ? "bg-purple-500 text-black border-purple-400 scale-95"
                : "bg-purple-950/70 hover:bg-purple-900 text-purple-300 border-purple-800"
            }`}
          >
            [3] mURLLC Storm (2.0x)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => sendPause()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-text-primary border border-slate-700 transition-colors"
          >
            {isPaused ? <Play size={14} className="text-emerald-400" /> : <Pause size={14} />}
            <span>[Space] {isPaused ? "Resume" : "Pause"}</span>
          </button>
          <button
            onClick={() => sendReset()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors"
          >
            <RotateCcw size={14} />
            <span>[R] Reset</span>
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Help Modal Overlay (FT-58) */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-bg-card border border-border shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <HelpCircle size={20} className="text-cyan-400" />
                <h3 className="text-base font-bold text-text-primary">Presenter Keyboard Shortcuts (FT-58)</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-lg bg-bg-base border border-border-subtle">
                <span className="text-text-muted">Inject eMBB Surge (2.5x)</span>
                <kbd className="px-2 py-1 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-bold">1</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-bg-base border border-border-subtle">
                <span className="text-text-muted">Inject URLLC Burst (3.0x)</span>
                <kbd className="px-2 py-1 rounded bg-slate-800 text-amber-300 border border-slate-700 font-bold">2</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-bg-base border border-border-subtle">
                <span className="text-text-muted">Inject mURLLC Storm (2.0x)</span>
                <kbd className="px-2 py-1 rounded bg-slate-800 text-purple-300 border border-slate-700 font-bold">3</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-bg-base border border-border-subtle">
                <span className="text-text-muted">Pause / Resume Simulation</span>
                <kbd className="px-2 py-1 rounded bg-slate-800 text-text-primary border border-slate-700 font-bold">Space</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-bg-base border border-border-subtle">
                <span className="text-text-muted">Reset Simulation Environment</span>
                <kbd className="px-2 py-1 rounded bg-slate-800 text-rose-300 border border-slate-700 font-bold">R</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-bg-base border border-border-subtle">
                <span className="text-text-muted">Exit Presenter Mode</span>
                <kbd className="px-2 py-1 rounded bg-slate-800 text-emerald-300 border border-slate-700 font-bold">P or Esc</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-bg-base border border-border-subtle">
                <span className="text-text-muted">Toggle This Help Overlay</span>
                <kbd className="px-2 py-1 rounded bg-slate-800 text-text-primary border border-slate-700 font-bold">?</kbd>
              </div>
            </div>

            <div className="pt-2 border-t border-border-subtle text-right">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition-colors"
              >
                Close Help
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PresenterPage;
