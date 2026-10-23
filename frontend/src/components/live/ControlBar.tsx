import React, { useState } from "react";
import { Zap, Pause, Play, RotateCcw } from "lucide-react";
import { useSliceStore } from "../../store/useSliceStore";
import { useWebSocketStream } from "../../hooks/useWebSocketStream";

interface ControlBarProps {
  isNominal: boolean;
}

export const ControlBar: React.FC<ControlBarProps> = ({ isNominal }) => {
  const { latestPayload, publicConfig } = useSliceStore();
  const { sendSpike, sendPause, sendReset } = useWebSocketStream();
  const [activeSpikeSlice, setActiveSpikeSlice] = useState<string | null>(null);

  const spikeFactors = publicConfig?.spike_factor || {
    embb: 2.5,
    urllc: 3.0,
    murllc: 2.0,
  };
  const spikeDuration = 25;

  const isPaused = latestPayload?.paused ?? false;
  const currentScenario = latestPayload?.scenario || "nominal";

  const handleSpike = (slice: "embb" | "urllc" | "murllc") => {
    const factor = spikeFactors[slice] || 2.5;
    setActiveSpikeSlice(slice);
    sendSpike(slice, factor, spikeDuration);
    setTimeout(() => setActiveSpikeSlice(null), 1200);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-bg-card border border-border-subtle shadow-sm">
      {/* Spike Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-text-muted mr-1 flex items-center gap-1">
          <Zap size={14} className="text-amber-400" />
          Inject Spike:
        </span>

        {/* eMBB Surge Button */}
        <button
          onClick={() => handleSpike("embb")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            activeSpikeSlice === "embb"
              ? "bg-cyan-500 text-black border-cyan-400 shadow-md scale-95"
              : isNominal
              ? "bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border-cyan-800/80 animate-pulse hover:animate-none"
              : "bg-cyan-950/50 hover:bg-cyan-900/70 text-cyan-300 border-cyan-800/70"
          }`}
          title={`Inject eMBB Surge (${spikeFactors.embb}x for ${spikeDuration} steps)`}
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span>eMBB Surge ({spikeFactors.embb}x)</span>
        </button>

        {/* URLLC Burst Button */}
        <button
          onClick={() => handleSpike("urllc")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            activeSpikeSlice === "urllc"
              ? "bg-amber-500 text-black border-amber-400 shadow-md scale-95"
              : isNominal
              ? "bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 border-amber-800/80 animate-pulse hover:animate-none"
              : "bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 border-amber-800/70"
          }`}
          title={`Inject URLLC Burst (${spikeFactors.urllc}x for ${spikeDuration} steps)`}
        >
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          <span>URLLC Burst ({spikeFactors.urllc}x)</span>
        </button>

        {/* mURLLC Storm Button */}
        <button
          onClick={() => handleSpike("murllc")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            activeSpikeSlice === "murllc"
              ? "bg-purple-500 text-black border-purple-400 shadow-md scale-95"
              : isNominal
              ? "bg-purple-950/70 hover:bg-purple-900/80 text-purple-300 border-purple-800/80 animate-pulse hover:animate-none"
              : "bg-purple-950/50 hover:bg-purple-900/70 text-purple-300 border-purple-800/70"
          }`}
          title={`Inject mURLLC Storm (${spikeFactors.murllc}x for ${spikeDuration} steps)`}
        >
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          <span>mURLLC Storm ({spikeFactors.murllc}x)</span>
        </button>
      </div>

      {/* Simulator State & Controls */}
      <div className="flex items-center gap-2">
        {/* Scenario Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-base border border-border-subtle text-xs">
          <span className="text-text-muted">Active:</span>
          <span className="text-emerald-400 font-medium capitalize">
            {currentScenario.replace(/_/g, " ")}
          </span>
        </div>

        {/* Pause / Resume */}
        <button
          onClick={() => sendPause()}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            isPaused
              ? "bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border-emerald-800"
              : "bg-slate-800/80 hover:bg-slate-700 text-text-primary border-slate-700"
          }`}
          title={isPaused ? "Resume simulation" : "Pause simulation"}
        >
          {isPaused ? <Play size={13} className="text-emerald-400" /> : <Pause size={13} />}
          <span>{isPaused ? "Resume" : "Pause"}</span>
        </button>

        {/* Reset */}
        <button
          onClick={() => sendReset()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/70 transition-colors"
          title="Reset simulation environments and metrics"
        >
          <RotateCcw size={13} />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};
