import React, { useState, useEffect, useRef } from 'react';
import { useSliceStore } from '../store/useSliceStore';
import { FlowStrip } from '../components/allocation/FlowStrip';
import { ResourcePools } from '../components/allocation/ResourcePools';
import { DecisionPipeline } from '../components/allocation/DecisionPipeline';
import { CouplingPanel } from '../components/allocation/CouplingPanel';
import { TransferLedger } from '../components/allocation/TransferLedger';
import { AllocationLegend } from '../components/allocation/AllocationLegend';
import { ReplayScrubber } from '../components/allocation/ReplayScrubber';
import { LendingPanel } from '../components/lending/LendingPanel';
import { PolicyType, TelemetryPayload } from '../types/api';
import { ShieldAlert, SplitSquareVertical, Layers } from 'lucide-react';
import { extractScrubBuffer } from '../utils/allocationUtils';

export const ResourceAllocationPage: React.FC = () => {
  const { latestPayload, capabilities, publicConfig } = useSliceStore();
  const [activePolicy, setActivePolicy] = useState<PolicyType>('agent');
  const [isCompareMode, setIsCompareMode] = useState<boolean>(false);

  // Replay scrubbing state
  const [historyBuffer, setHistoryBuffer] = useState<TelemetryPayload[]>([]);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [replaySpeed, setReplaySpeed] = useState<number>(1.0);
  const playTimerRef = useRef<number | null>(null);

  // Accumulate last 60 frames into scrub history buffer
  useEffect(() => {
    if (latestPayload && !isReplaying) {
      setHistoryBuffer((prev) => {
        const updated = [...prev, latestPayload];
        return extractScrubBuffer(updated, 60);
      });
    }
  }, [latestPayload, isReplaying]);

  // Keep replayIndex pegged to the newest frame when live
  useEffect(() => {
    if (!isReplaying && historyBuffer.length > 0) {
      setReplayIndex(historyBuffer.length - 1);
    }
  }, [historyBuffer.length, isReplaying]);

  // Playback timer loop
  useEffect(() => {
    if (isReplaying) {
      const intervalMs = Math.round(500 / replaySpeed);
      playTimerRef.current = window.setInterval(() => {
        setReplayIndex((prev) => {
          if (prev >= historyBuffer.length - 1) {
            setIsReplaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [isReplaying, replaySpeed, historyBuffer.length]);

  if (capabilities?.allocation === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-white/95 rounded-2xl border border-sky-200">
        <ShieldAlert size={36} className="text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Resource Allocation Inactive</h2>
        <p className="text-xs text-slate-500 max-w-md mt-1">
          The allocation feature capability flag is currently disabled on the backend.
        </p>
      </div>
    );
  }

  // Choose between live frame and replayed historical frame
  const currentPayload = isReplaying
    ? historyBuffer[replayIndex] || latestPayload
    : latestPayload;

  const polData = currentPayload?.policies?.[activePolicy];
  const alloc = polData?.allocation;

  const prbTotal = publicConfig?.prb_total ?? 100;
  const vcpuTotal = publicConfig?.vcpu_total ?? 8;

  return (
    <div className="space-y-4">
      {/* Replay Status Alert Banner */}
      {isReplaying && (
        <div className="px-4 py-2.5 rounded-2xl bg-amber-500 text-white font-semibold text-xs flex items-center justify-between shadow-md animate-in slide-in-from-top-2">
          <span>Replaying step {currentPayload?.step ?? 0} (Historical Frame)</span>
          <button
            onClick={() => setIsReplaying(false)}
            className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold text-[11px] transition-colors"
          >
            Exit to Live
          </button>
        </div>
      )}

      {/* Top Controls: Policy Mode Tabs & Compare Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mr-1">
            Mode:
          </span>
          <button
            onClick={() => {
              setIsCompareMode(false);
              setActivePolicy('agent');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              !isCompareMode && activePolicy === 'agent'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            RL Agent (Dynamic)
          </button>
          <button
            onClick={() => {
              setIsCompareMode(false);
              setActivePolicy('heuristic');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              !isCompareMode && activePolicy === 'heuristic'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Demand Heuristic
          </button>
          <button
            onClick={() => {
              setIsCompareMode(false);
              setActivePolicy('static');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              !isCompareMode && activePolicy === 'static'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Static 60/25/15
          </button>

          {capabilities?.lending && (
            <button
              onClick={() => {
                setIsCompareMode(false);
                setActivePolicy('enhanced');
              }}
              data-testid="tab-enhanced"
              style={!isCompareMode && activePolicy === 'enhanced' ? { backgroundColor: '#F472B6', color: '#fff' } : undefined}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                !isCompareMode && activePolicy === 'enhanced'
                  ? 'shadow-sm'
                  : 'bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200'
              }`}
            >
              Enhanced (Lending)
            </button>
          )}

          <button
            onClick={() => setIsCompareMode(!isCompareMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ml-1 ${
              isCompareMode
                ? 'bg-purple-600 text-white shadow-sm'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
            }`}
            title="Side-by-side 3-policy comparison mode"
          >
            <SplitSquareVertical size={14} />
            <span>Compare Mode</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
          <span className="text-slate-400">Step:</span>
          <span className="font-bold text-sky-700">{currentPayload?.step ?? 0}</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-400">Scenario:</span>
          <span className="font-semibold text-slate-800 capitalize">
            {currentPayload?.scenario?.replace(/_/g, ' ') ?? 'Nominal'}
          </span>
        </div>
      </div>

      {/* 5-Node Architectural Flow Strip */}
      <FlowStrip
        bottlenecks={alloc?.bottleneck}
        arrivals={currentPayload?.policies?.[activePolicy]?.arrivals}
        bots={currentPayload?.bots}
        prbTotal={prbTotal}
        vcpuTotal={vcpuTotal}
      />

      {/* Predictive lending panel (Enhanced = Agent + Lender + Shield), always backend data */}
      {capabilities?.lending && (
        <LendingPanel
          lending={currentPayload?.policies?.enhanced?.allocation?.lending}
          step={currentPayload?.step ?? 0}
        />
      )}

      {/* Main Content Area: Compare Mode vs Single View */}
      {isCompareMode ? (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 text-purple-900 text-xs flex items-center gap-2 font-medium">
            <Layers size={15} className="text-purple-600 shrink-0" />
            <span>
              <strong>3-Policy Comparison:</strong> Showing Static (fixed blocks) vs Heuristic vs RL Agent on identical step #{currentPayload?.step ?? 0}.
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {(['static', 'heuristic', 'agent'] as PolicyType[]).map((pol) => {
              const pData = currentPayload?.policies?.[pol];
              const pAlloc = pData?.allocation;
              if (!pAlloc) return null;

              return (
                <div key={`compare-${pol}`} className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 block uppercase px-1">
                    {pol === 'static' ? 'Static 60/25/15' : pol === 'heuristic' ? 'Demand Heuristic' : 'RL Agent + Shield'}
                  </span>
                  <ResourcePools
                    prb={pAlloc.prb}
                    cpu={pAlloc.cpu}
                    prbTotal={prbTotal}
                    vcpuTotal={vcpuTotal}
                    policyName={pol.toUpperCase()}
                  />
                </div>
              );
            })}
            {currentPayload?.policies?.enhanced?.allocation && (
              <div key="compare-enhanced" className="space-y-2">
                <span className="text-xs font-bold block uppercase px-1" style={{ color: '#DB2777' }}>
                  Enhanced: Agent + Lender + Shield
                </span>
                <ResourcePools
                  prb={currentPayload.policies.enhanced.allocation.prb}
                  cpu={currentPayload.policies.enhanced.allocation.cpu}
                  prbTotal={prbTotal}
                  vcpuTotal={vcpuTotal}
                  policyName="ENHANCED"
                  lending={currentPayload.policies.enhanced.allocation.lending}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {alloc ? (
            <ResourcePools
              prb={alloc.prb}
              cpu={alloc.cpu}
              prbTotal={prbTotal}
              vcpuTotal={vcpuTotal}
              policyName={
                activePolicy === 'agent'
                  ? 'RL Agent + Safety Shield'
                  : activePolicy === 'heuristic'
                  ? 'Heuristic Slicer'
                  : activePolicy === 'enhanced'
                  ? 'Enhanced: Agent + Lender + Shield'
                  : 'Static Partition'
              }
              lending={activePolicy === 'enhanced' ? alloc.lending : undefined}
            />
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 rounded-2xl bg-white border border-sky-100">
              Waiting for live allocation telemetry stream...
            </div>
          )}

          {/* 2-Column Section: Decision Pipeline and Coupling Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {polData && (
              <DecisionPipeline
                policy={activePolicy}
                telemetry={polData}
                allocation={alloc}
                lending={activePolicy === 'enhanced' ? alloc?.lending : undefined}
              />
            )}
            <CouplingPanel
              allocation={alloc}
              demand={polData?.arrivals}
            />
          </div>

          {/* Transfer Ledger */}
          <TransferLedger
            currentTransfers={alloc?.transfers}
            step={currentPayload?.step ?? 0}
          />
        </>
      )}

      {/* Historical Replay Scrubber */}
      <ReplayScrubber
        history={historyBuffer}
        isReplaying={isReplaying}
        replayIndex={replayIndex}
        onSelectStep={(idx) => {
          setIsReplaying(true);
          setReplayIndex(idx);
        }}
        onTogglePlay={() => setIsReplaying(!isReplaying)}
        onReturnToLive={() => setIsReplaying(false)}
        onResetBuffer={() => {
          setHistoryBuffer([]);
          setIsReplaying(false);
        }}
        speed={replaySpeed}
        onToggleSpeed={() => setReplaySpeed(replaySpeed === 1.0 ? 0.5 : 1.0)}
      />

      {/* Collapsible Architecture Legend */}
      <AllocationLegend />
    </div>
  );
};
