import React from "react";
import { Sliders, ShieldAlert } from "lucide-react";
import { useSliceStore } from "../store/useSliceStore";

export const TrafficBotsPage: React.FC = () => {
  const { capabilities } = useSliceStore();

  if (capabilities && !capabilities.bots) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-bg-card border border-border-subtle rounded-xl my-8">
        <ShieldAlert size={36} className="text-amber-400 mb-3" />
        <h2 className="text-lg font-bold text-text-primary mb-1">Bot Generator Not Available</h2>
        <p className="text-xs text-text-muted max-w-md">
          The synthetic UE bot simulation module is disabled in current backend configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle">
        <div className="flex items-center gap-2 mb-1">
          <Sliders className="text-cyan-400" size={20} />
          <h1 className="text-lg font-bold text-text-primary tracking-tight">Traffic Generation & Synthetic UEs</h1>
        </div>
        <p className="text-xs text-text-muted">
          Dynamic traffic arrivals injection, synthetic bot scale-up, and interactive antenna cell field.
        </p>
      </div>

      <div className="p-12 text-center bg-bg-card border border-border-subtle rounded-xl text-text-muted text-xs">
        Phase F4 Component: Traffic Presets, 5G gNodeB Device Canvas, and Ingress Controls.
      </div>
    </div>
  );
};
