import React, { useState } from "react";
import { Sliders, Zap, CheckCircle2, Flame, Wind, Activity } from "lucide-react";
import { useWebSocketStream } from "../../hooks/useWebSocketStream";
import { useSliceStore } from "../../store/useSliceStore";

export const TrafficPresets: React.FC = () => {
  const { sendBots, sendSpike } = useWebSocketStream();
  const { addToast } = useSliceStore();
  const [activePreset, setActivePreset] = useState<string>("steady");

  const presets = [
    {
      id: "steady",
      name: "Steady Baseline",
      icon: Activity,
      desc: "Nominal traffic arrivals (40 eMBB, 30 URLLC, 100 mURLLC bots)",
      action: async () => {
        await sendBots(40, "embb", "set");
        await sendBots(30, "urllc", "set");
        await sendBots(100, "murllc", "set");
      },
    },
    {
      id: "embb_surge",
      name: "eMBB High-Def Surge",
      icon: Flame,
      desc: "Massive 4K/8K video streaming surge (160 eMBB bots, 2.5x spike)",
      action: async () => {
        await sendBots(160, "embb", "set");
        await sendSpike("embb", 2.5, 30);
      },
    },
    {
      id: "urllc_burst",
      name: "URLLC Autonomous Burst",
      icon: Zap,
      desc: "V2X vehicular swarm & emergency control (100 URLLC bots, 3.0x burst)",
      action: async () => {
        await sendBots(100, "urllc", "set");
        await sendSpike("urllc", 3.0, 30);
      },
    },
    {
      id: "murllc_storm",
      name: "mURLLC Sensor Storm",
      icon: Wind,
      desc: "Smart city grid outage telemetry flood (600 mURLLC bots, 2.0x storm)",
      action: async () => {
        await sendBots(600, "murllc", "set");
        await sendSpike("murllc", 2.0, 30);
      },
    },
    {
      id: "mixed",
      name: "Stress Mixed Load",
      icon: Sliders,
      desc: "Simultaneous congestion across all 3 slices (near capacity)",
      action: async () => {
        await sendBots(140, "embb", "set");
        await sendBots(90, "urllc", "set");
        await sendBots(450, "murllc", "set");
        await sendSpike("embb", 2.0, 25);
      },
    },
  ];

  const handleSelectPreset = async (preset: typeof presets[0]) => {
    setActivePreset(preset.id);
    try {
      await preset.action();
      addToast({
        type: "success",
        title: "Preset Applied",
        message: `Activated '${preset.name}' traffic profile across simulator slices.`,
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Sliders size={16} className="text-cyan-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            Traffic Generator Presets
          </h2>
        </div>
        <span className="text-[11px] text-text-muted">Single-click standard test scenarios (FT-31)</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {presets.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                isActive
                  ? "bg-slate-800/95 border-cyan-500 shadow-md ring-1 ring-cyan-500/50"
                  : "bg-bg-base/70 border-border-subtle hover:bg-slate-800/60 hover:border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Icon size={16} className={isActive ? "text-cyan-400" : "text-text-muted"} />
                  {isActive && <CheckCircle2 size={13} className="text-cyan-400" />}
                </div>
                <p className="text-xs font-bold text-text-primary">{preset.name}</p>
                <p className="text-[10px] text-text-muted mt-1 leading-snug">{preset.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
