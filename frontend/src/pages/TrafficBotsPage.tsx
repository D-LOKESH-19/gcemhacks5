import React from "react";
import { Sliders } from "lucide-react";
import { TrafficPresets } from "../components/traffic/TrafficPresets";
import { BotsControlPanel } from "../components/traffic/BotsControlPanel";
import { DeviceCanvas } from "../components/traffic/DeviceCanvas";
import { TrafficArrivalsChart } from "../components/traffic/TrafficArrivalsChart";
import { LocationsPlaceholder } from "../components/traffic/LocationsPlaceholder";

export const TrafficBotsPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 w-full max-w-[1920px] mx-auto pb-6">
      {/* Page Title & Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="text-cyan-400" size={20} />
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Traffic Generation & Synthetic UEs
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Dynamic bot scaling, interactive 5G base station radiation field, and real-time packet ingress streams.
          </p>
        </div>
      </div>

      {/* 1. Traffic Presets Strip */}
      <TrafficPresets />

      {/* 2. Interactive Control & Simulation Canvas Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BotsControlPanel />
        <DeviceCanvas />
      </div>

      {/* 3. Traffic Arrivals Chart */}
      <TrafficArrivalsChart />

      {/* 4. Multi-Location Zone Placeholder (FT-74) */}
      <LocationsPlaceholder />
    </div>
  );
};

export default TrafficBotsPage;
