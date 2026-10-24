import React, { useState } from "react";
import { Users, Plus, Minus, Check, AlertTriangle, ShieldAlert } from "lucide-react";
import { useSliceStore } from "../../store/useSliceStore";
import { useWebSocketStream } from "../../hooks/useWebSocketStream";

export const BotsControlPanel: React.FC = () => {
  const { capabilities, latestPayload, publicConfig, addToast } = useSliceStore();
  const { sendBots } = useWebSocketStream();

  const [selectedSlice, setSelectedSlice] = useState<"embb" | "urllc" | "murllc">("urllc");
  const [inputValue, setInputValue] = useState<string>("20");
  const [validationError, setValidationError] = useState<string | null>(null);

  // If bots capability is disabled, show fallback note (FT-36)
  if (capabilities && capabilities.bots === false) {
    return (
      <div className="p-6 rounded-xl bg-bg-card border border-border-subtle text-center">
        <ShieldAlert size={28} className="text-amber-400 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-text-primary">Synthetic UE Generator Offline</h3>
        <p className="text-xs text-text-muted max-w-sm mx-auto mt-1">
          The autonomous bot generator feature is currently disabled in backend capabilities.
        </p>
      </div>
    );
  }

  const currentBots = latestPayload?.bots || { embb: 40, urllc: 30, murllc: 100 };
  const maxBots = publicConfig?.bots?.max_count || { embb: 200, urllc: 150, murllc: 1000 };

  const activeNow = currentBots[selectedSlice] || 0;
  const activeMax = maxBots[selectedSlice] || 200;
  const isMaxReached = activeNow >= activeMax;

  // Validation function enforcing FT-37
  const validateInput = (): number | null => {
    setValidationError(null);
    const trimmed = inputValue.trim();

    if (!trimmed || !/^\d+$/.test(trimmed)) {
      const err = "Input must be a positive whole integer (no decimals, negatives, or letters).";
      setValidationError(err);
      addToast({
        type: "error",
        title: "Invalid Bot Input",
        message: err,
      });
      return null;
    }

    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed) || parsed <= 0) {
      const err = "Bot count must be greater than zero.";
      setValidationError(err);
      addToast({
        type: "error",
        title: "Invalid Bot Count",
        message: err,
      });
      return null;
    }

    return parsed;
  };

  const handleAction = async (mode: "add" | "remove" | "set", directCount?: number) => {
    let count = directCount;
    if (count === undefined) {
      const validated = validateInput();
      if (validated === null) return;
      count = validated;
    }

    try {
      await sendBots(count, selectedSlice, mode);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-cyan-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            Synthetic UE Bot Controller
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-text-muted">Active Slice:</span>
          <span className="font-bold text-cyan-400 uppercase">{selectedSlice}</span>
          {isMaxReached && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/80">
              Max reached
            </span>
          )}
        </div>
      </div>

      {/* Counters Grid */}
      <div className="grid grid-cols-3 gap-2.5 text-center">
        {(["embb", "urllc", "murllc"] as const).map((s) => {
          const now = currentBots[s] || 0;
          const max = maxBots[s] || 100;
          const isSelected = selectedSlice === s;
          const isMax = now >= max;
          const colorClass =
            s === "embb" ? "text-slice-embb" : s === "urllc" ? "text-slice-urllc" : "text-slice-murllc";

          return (
            <button
              key={s}
              onClick={() => setSelectedSlice(s)}
              className={`p-2.5 rounded-lg border text-left transition-all ${
                isSelected
                  ? "bg-slate-800/95 border-cyan-500 shadow-sm ring-1 ring-cyan-500/50"
                  : "bg-bg-base/60 border-border-subtle hover:bg-slate-800/50 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-bold uppercase ${colorClass}`}>{s}</span>
                {isMax && <span className="text-[9px] font-bold text-amber-400">MAX</span>}
              </div>
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-base font-bold text-text-primary">{now}</span>
                <span className="text-[10px] text-text-muted">/ {max}</span>
              </div>
              <div className="w-full h-1 bg-bg-base rounded-full mt-1.5 overflow-hidden">
                <div
                  style={{ width: `${Math.min(100, (now / max) * 100)}%` }}
                  className={`h-full ${
                    s === "embb" ? "bg-cyan-400" : s === "urllc" ? "bg-amber-400" : "bg-purple-400"
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Input & Action Row */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Slice Dropdown */}
        <div className="flex flex-col">
          <label className="text-[10px] text-text-muted font-mono mb-1">Target Slice</label>
          <select
            value={selectedSlice}
            onChange={(e) => setSelectedSlice(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-bg-base border border-border-subtle text-xs text-text-primary font-medium focus:outline-none focus:border-cyan-500"
          >
            <option value="embb">eMBB (Video / Broadband)</option>
            <option value="urllc">URLLC (Critical Swarm)</option>
            <option value="murllc">mURLLC (Massive Telemetry)</option>
          </select>
        </div>

        {/* Count Input */}
        <div className="flex flex-col">
          <label className="text-[10px] text-text-muted font-mono mb-1">Bot Count</label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setValidationError(null);
            }}
            placeholder="Count"
            className="w-24 px-2.5 py-1.5 rounded-lg bg-bg-base border border-border-subtle text-xs font-mono text-text-primary focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-end gap-1.5 mt-auto">
          <button
            onClick={() => handleAction("add")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 transition-colors"
            title="Add bots to slice"
          >
            <Plus size={13} />
            <span>Add</span>
          </button>
          <button
            onClick={() => handleAction("remove")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800 transition-colors"
            title="Remove bots from slice"
          >
            <Minus size={13} />
            <span>Remove</span>
          </button>
          <button
            onClick={() => handleAction("set")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 transition-colors"
            title="Set exact bot count"
          >
            <Check size={13} />
            <span>Set</span>
          </button>
        </div>

        {/* Quick Increment Buttons */}
        <div className="flex items-end gap-1 ml-auto mt-auto">
          <span className="text-[10px] text-text-muted font-mono self-center mr-1">Quick Add:</span>
          {[10, 50, 100].map((inc) => (
            <button
              key={inc}
              onClick={() => handleAction("add", inc)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-slate-800/80 hover:bg-slate-700 text-text-primary border border-slate-700 transition-colors"
            >
              +{inc}
            </button>
          ))}
        </div>
      </div>

      {/* Validation Error Message */}
      {validationError && (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs">
          <AlertTriangle size={13} className="shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
};
