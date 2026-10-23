import React from "react";
import { MapPin, Info } from "lucide-react";
import { useSliceStore } from "../../store/useSliceStore";

export const LocationsPlaceholder: React.FC = () => {
  const { capabilities } = useSliceStore();

  if (capabilities && capabilities.locations === false) {
    return null;
  }

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-dashed border-border-subtle flex flex-col gap-2">
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-purple-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            Spatial Deployment Zones (Phase 10 Extension)
          </h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 border border-purple-800/80 text-purple-300">
          Geographic Slicing
        </span>
      </div>

      <div className="p-4 rounded-lg bg-bg-base/60 border border-border-subtle flex items-start gap-3">
        <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs text-text-muted space-y-1">
          <p>
            <strong className="text-text-primary">Multi-Location Telemetry Ready:</strong> Real-time bot distribution matrices
            are tracked across <code className="text-cyan-300">Campus</code>, <code className="text-amber-300">Factory</code>, and <code className="text-purple-300">Smart City</code> micro-zones.
          </p>
          <p className="text-[11px]">
            Spatial 3D zone rendering and automated geo-routing are architected as an optional extension modularly attached to <code className="text-emerald-300">GET /bots</code>.
          </p>
        </div>
      </div>
    </div>
  );
};
