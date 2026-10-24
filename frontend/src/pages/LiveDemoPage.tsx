import React, { useMemo } from "react";
import { useSliceStore } from "../store/useSliceStore";
import { ControlBar } from "../components/live/ControlBar";
import { NominalBanner } from "../components/live/NominalBanner";
import { SlaScoreboard } from "../components/live/SlaScoreboard";
import { LiveChartsOverlay } from "../components/live/LiveChartsOverlay";
import { PolicyResourceCards } from "../components/live/PolicyResourceCards";
import { ExplainabilityFeed } from "../components/live/ExplainabilityFeed";

export const LiveDemoPage: React.FC = () => {
  const { latestPayload, spikeMarkers } = useSliceStore();

  // Nominal condition: all policies have 0 violations and no active spike
  const isNominal = useMemo(() => {
    if (!latestPayload || !latestPayload.policies) return true;
    const staticVR = latestPayload.policies.static?.violation_rate ?? 0;
    const heurVR = latestPayload.policies.heuristic?.violation_rate ?? 0;
    const agentVR = latestPayload.policies.agent?.violation_rate ?? 0;
    const currentStep = latestPayload.step ?? 0;
    
    // Check if any spike is currently active
    const hasActiveSpike = spikeMarkers.some(
      (m) => currentStep >= m.step && currentStep <= m.step + m.duration + 5
    );

    return staticVR === 0 && heurVR === 0 && agentVR === 0 && !hasActiveSpike;
  }, [latestPayload, spikeMarkers]);

  return (
    <div className="flex flex-col gap-3.5 w-full max-w-[1920px] mx-auto pb-4">
      {/* 1. Simulator Control Bar */}
      <ControlBar isNominal={isNominal} />

      {/* 2. Nominal Load Banner (FT-24) */}
      <NominalBanner visible={isNominal} />

      {/* 3. SLA Scoreboard Strip (FT-22) */}
      <SlaScoreboard />

      {/* 4. Side-by-Side Hero Charts (FT-18, FT-19, FT-20) */}
      <LiveChartsOverlay />

      {/* 5. Compact Policy Cards & Shield Telemetry (FT-23, FT-27) */}
      <PolicyResourceCards />

      {/* 6. Explainability & Decision Feed Drawer (FT-23, FT-26) */}
      <ExplainabilityFeed />
    </div>
  );
};

export default LiveDemoPage;
