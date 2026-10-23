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
    <div className="flex-1 flex flex-col justify-between min-h-[calc(100vh-1rem)] p-4 sm:p-6 select-none gap-4">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-sky-200/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600 shadow-sm">
            <Tv size={26} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              5G Autonomous NOC — Presenter Console
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              High-Contrast Large-Format Auditorium Projection (2-Metre Visibility)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Step Pill */}
          <div className="px-4 py-1.5 rounded-2xl bg-white/95 border border-slate-200/90 shadow-sm text-right">
            <span className="text-[10px] text-slate-500 uppercase block font-mono">Step</span>
            <span className="text-xl font-mono font-bold text-sky-700">
              #{latestPayload?.step ?? 0}
            </span>
          </div>

          {/* Help Overlay Button (FT-58) */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-xs text-slate-700 border border-slate-200 transition-colors shadow-sm"
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle size={15} className="text-sky-600" />
            <span className="hidden sm:inline">Shortcuts (?)</span>
          </button>

          {/* Exit Button */}
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200 transition-colors shadow-sm"
            title="Exit Presenter Mode (Esc or P)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Large Scoreboard Tiles (FT-57 Typography >= 24px - 48px) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Static Tile */}
        <div className="p-5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 flex flex-col justify-between shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-sm font-bold text-policy-static tracking-tight uppercase">Static Baseline</span>
            <StatusBadge status={staticStatus} size="md" />
          </div>
          <div className="my-3">
            <span className="text-[11px] text-slate-500 uppercase font-mono block">URLLC Violation Rate</span>
            <span className={`text-4xl sm:text-5xl font-mono font-black ${staticVR > 0.5 ? "text-rose-600" : "text-slate-900"}`}>
              {staticVR.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">eMBB Served:</span>
            <span className="font-mono font-bold text-sky-600">{staticEmbb.toFixed(1)}%</span>
          </div>
        </div>

        {/* Heuristic Tile */}
        <div className="p-5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 flex flex-col justify-between shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)]">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-sm font-bold text-policy-heuristic tracking-tight uppercase">Heuristic Proportional</span>
            <StatusBadge status={heurStatus} size="md" />
          </div>
          <div className="my-3">
            <span className="text-[11px] text-slate-500 uppercase font-mono block">URLLC Violation Rate</span>
            <span className={`text-4xl sm:text-5xl font-mono font-black ${heurVR > 0.5 ? "text-amber-600" : "text-slate-900"}`}>
              {heurVR.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500">eMBB Served:</span>
            <span className="font-mono font-bold text-sky-600">{heurEmbb.toFixed(1)}%</span>
          </div>
        </div>

        {/* Agent Tile (Signature Sky-Blue Highlighted Border) */}
        <div className="p-5 rounded-2xl bg-white/95 backdrop-blur-md border-2 border-sky-400 flex flex-col justify-between shadow-[0_12px_28px_-4px_rgba(2,132,199,0.18)]">
          <div className="flex items-center justify-between pb-2 border-b border-sky-100">
            <span className="text-sm font-bold text-slate-900 tracking-tight uppercase flex items-center gap-1.5">
              <ShieldCheck size={16} className="text-sky-600" /> RL Agent + Safety Shield
            </span>
            <StatusBadge status={agentStatus} size="md" />
          </div>
          <div className="my-3">
            <span className="text-[11px] text-emerald-600 uppercase font-mono block">URLLC Violation Rate</span>
            <span className="text-4xl sm:text-5xl font-mono font-black text-emerald-600">
              {agentVR.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-sky-100 text-xs">
            <span className="text-slate-500">eMBB: <strong className="font-mono text-sky-600">{agentEmbb.toFixed(1)}%</strong></span>
            <span className="text-slate-500">Shield Rate: <strong className="font-mono text-emerald-600">{shieldRate.toFixed(1)}%</strong></span>
          </div>
        </div>
      </div>

      {/* Side-by-Side Presenter Hero Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Violation Rate Chart */}
        <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)] flex flex-col">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-tight">
              URLLC Violation Rate Overlay (% of Packets Dropped)
            </span>
            <span className="text-xs font-mono font-bold text-[#dc2626] bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
              SLA Limit: {slaUrllcLimit.toFixed(1)}%
            </span>
          </div>
          <div className="h-[200px] w-full rounded-xl bg-slate-50/70 p-1 border border-slate-100">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedViolationData} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="step" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} domain={[0, maxViolation]} unit="%" width={40} />
                <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#0F172A", fontSize: "11px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
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
        <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)] flex flex-col">
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-tight">
              eMBB Throughput Overlay (Packets Served / Step)
            </span>
            <span className="text-xs font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full">
              High-Bandwidth Utilization
            </span>
          </div>
          <div className="h-[200px] w-full rounded-xl bg-slate-50/70 p-1 border border-slate-100">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={formattedThroughputData} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="step" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} width={40} />
                <Tooltip contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#0F172A", fontSize: "11px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
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
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-sm text-xs font-mono">
        <Terminal size={15} className="text-sky-600 shrink-0" />
        <span className="text-slate-500 shrink-0">LATEST EVENT:</span>
        <span className="text-slate-900 truncate">{latestEvent}</span>
      </div>

      {/* Large Presenter Spike Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-500 uppercase font-mono mr-1">Inject Surge:</span>
          <button
            onClick={() => triggerSpikeAction("embb")}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
              activeSpikeAnim === "embb"
                ? "bg-amber-500 text-white border-amber-500 shadow-md scale-95"
                : "bg-amber-50/70 hover:bg-amber-100 text-amber-800 border-amber-300"
            }`}
          >
            [1] eMBB Surge (2.5x)
          </button>
          <button
            onClick={() => triggerSpikeAction("urllc")}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
              activeSpikeAnim === "urllc"
                ? "bg-amber-500 text-white border-amber-500 shadow-md scale-95"
                : "bg-amber-50/70 hover:bg-amber-100 text-amber-800 border-amber-300"
            }`}
          >
            [2] URLLC Burst (3.0x)
          </button>
          <button
            onClick={() => triggerSpikeAction("murllc")}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-all ${
              activeSpikeAnim === "murllc"
                ? "bg-purple-500 text-white border-purple-500 shadow-md scale-95"
                : "bg-purple-50/70 hover:bg-purple-100 text-purple-800 border-purple-300"
            }`}
          >
            [3] mURLLC Storm (2.0x)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => sendPause()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors shadow-sm"
          >
            {isPaused ? <Play size={14} className="text-emerald-600 fill-emerald-600" /> : <Pause size={14} />}
            <span>[Space] {isPaused ? "Resume" : "Pause"}</span>
          </button>
          <button
            onClick={() => sendReset()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 transition-colors shadow-sm"
          >
            <RotateCcw size={14} />
            <span>[R] Reset</span>
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Help Modal Overlay (FT-58) */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <HelpCircle size={20} className="text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">Presenter Keyboard Shortcuts (FT-58)</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Inject eMBB Surge (2.5x)</span>
                <kbd className="px-2.5 py-1 rounded-md bg-white text-sky-700 border border-slate-200 shadow-sm font-bold">1</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Inject URLLC Burst (3.0x)</span>
                <kbd className="px-2.5 py-1 rounded-md bg-white text-amber-700 border border-slate-200 shadow-sm font-bold">2</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Inject mURLLC Storm (2.0x)</span>
                <kbd className="px-2.5 py-1 rounded-md bg-white text-purple-700 border border-slate-200 shadow-sm font-bold">3</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Pause / Resume Simulation</span>
                <kbd className="px-2.5 py-1 rounded-md bg-white text-slate-800 border border-slate-200 shadow-sm font-bold">Space</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Reset Simulation Environment</span>
                <kbd className="px-2.5 py-1 rounded-md bg-white text-rose-700 border border-slate-200 shadow-sm font-bold">R</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Exit Presenter Mode</span>
                <kbd className="px-2.5 py-1 rounded-md bg-white text-emerald-700 border border-slate-200 shadow-sm font-bold">P or Esc</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-600">Toggle This Help Overlay</span>
                <kbd className="px-2.5 py-1 rounded-md bg-white text-slate-800 border border-slate-200 shadow-sm font-bold">?</kbd>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 text-right">
              <button
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm"
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
