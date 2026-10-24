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
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)]">
      {/* Spike Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* eMBB Surge Button */}
        <button
          onClick={() => handleSpike("embb")}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            activeSpikeSlice === "embb"
              ? "bg-amber-500 text-white border-amber-500 shadow-md scale-95"
              : isNominal
              ? "bg-amber-50/70 hover:bg-amber-100 text-amber-800 border-amber-300 animate-pulse hover:animate-none"
              : "bg-amber-50/50 hover:bg-amber-100 text-amber-800 border-amber-200"
          }`}
          title={`Inject eMBB Surge (${spikeFactors.embb}x for ${spikeDuration} steps)`}
        >
          <Zap size={13} className="text-amber-500 fill-amber-500" />
          <span>eMBB Surge <span className="opacity-80 font-mono text-[11px]">({spikeFactors.embb}x)</span></span>
        </button>

        {/* URLLC Burst Button */}
        <button
          onClick={() => handleSpike("urllc")}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            activeSpikeSlice === "urllc"
              ? "bg-amber-500 text-white border-amber-500 shadow-md scale-95"
              : isNominal
              ? "bg-amber-50/70 hover:bg-amber-100 text-amber-800 border-amber-300 animate-pulse hover:animate-none"
              : "bg-amber-50/50 hover:bg-amber-100 text-amber-800 border-amber-200"
          }`}
          title={`Inject URLLC Burst (${spikeFactors.urllc}x for ${spikeDuration} steps)`}
        >
          <Zap size={13} className="text-amber-500 fill-amber-500" />
          <span>URLLC Burst <span className="opacity-80 font-mono text-[11px]">({spikeFactors.urllc}x)</span></span>
        </button>

        {/* mURLLC Storm Button */}
        <button
          onClick={() => handleSpike("murllc")}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            activeSpikeSlice === "murllc"
              ? "bg-purple-500 text-white border-purple-500 shadow-md scale-95"
              : isNominal
              ? "bg-purple-50/70 hover:bg-purple-100 text-purple-800 border-purple-300 animate-pulse hover:animate-none"
              : "bg-purple-50/50 hover:bg-purple-100 text-purple-800 border-purple-200"
          }`}
          title={`Inject mURLLC Storm (${spikeFactors.murllc}x for ${spikeDuration} steps)`}
        >
          <Zap size={13} className="text-purple-500 fill-purple-500" />
          <span>mURLLC Storm <span className="opacity-80 font-mono text-[11px]">({spikeFactors.murllc}x)</span></span>
        </button>
      </div>

      {/* Simulator State & Controls */}
      <div className="flex items-center gap-2">
        {/* Scenario Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs">
          <span className="text-slate-500">Active:</span>
          <span className="text-sky-700 font-semibold capitalize">
            {currentScenario.replace(/_/g, " ")}
          </span>
        </div>

        {/* Pause / Resume */}
        <button
          onClick={() => sendPause()}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            isPaused
              ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300"
              : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm"
          }`}
          title={isPaused ? "Resume simulation" : "Pause simulation"}
        >
          {isPaused ? <Play size={13} className="text-emerald-600 fill-emerald-600" /> : <Pause size={13} />}
          <span>{isPaused ? "Resume" : "Pause"}</span>
        </button>

        {/* Reset */}
        <button
          onClick={() => sendReset()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-300 transition-colors shadow-sm"
          title="Reset simulation environments and metrics"
        >
          <RotateCcw size={13} />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};
