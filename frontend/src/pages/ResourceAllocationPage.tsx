import React, { useState } from 'react';
import { useSliceStore } from '../store/useSliceStore';
import { FlowStrip } from '../components/allocation/FlowStrip';
import { ResourcePools } from '../components/allocation/ResourcePools';
import { DecisionPipeline } from '../components/allocation/DecisionPipeline';
import { CouplingPanel } from '../components/allocation/CouplingPanel';
import { TransferLedger } from '../components/allocation/TransferLedger';
import { AllocationLegend } from '../components/allocation/AllocationLegend';
import { PolicyType } from '../types/api';
import { ShieldAlert } from 'lucide-react';

export const ResourceAllocationPage: React.FC = () => {
  const { latestPayload, capabilities, publicConfig } = useSliceStore();
  const [activePolicy, setActivePolicy] = useState<PolicyType>('agent');

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

  const polData = latestPayload?.policies?.[activePolicy];
  const alloc = polData?.allocation;

  const prbTotal = publicConfig?.prb_total ?? 100;
  const vcpuTotal = publicConfig?.vcpu_total ?? 8;

  return (
    <div className="space-y-4">
      {/* Top Controls: Policy Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mr-1">
            Policy View:
          </span>
          <button
            onClick={() => setActivePolicy('agent')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activePolicy === 'agent'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            RL Agent (Dynamic)
          </button>
          <button
            onClick={() => setActivePolicy('heuristic')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activePolicy === 'heuristic'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Demand Heuristic
          </button>
          <button
            onClick={() => setActivePolicy('static')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activePolicy === 'static'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Static 60/25/15
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-600">
          <span className="text-slate-400">Step:</span>
          <span className="font-bold text-sky-700">{latestPayload?.step ?? 0}</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-400">Scenario:</span>
          <span className="font-semibold text-slate-800 capitalize">
            {latestPayload?.scenario?.replace(/_/g, ' ') ?? 'Nominal'}
          </span>
        </div>
      </div>

      {/* 5-Node Architectural Flow Strip */}
      <FlowStrip
        bottlenecks={alloc?.bottleneck}
        arrivals={latestPayload?.policies?.[activePolicy]?.arrivals}
        bots={latestPayload?.bots}
        prbTotal={prbTotal}
        vcpuTotal={vcpuTotal}
      />

      {/* Main Resource Pools Component */}
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
              : 'Static Partition'
          }
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
        step={latestPayload?.step ?? 0}
      />

      {/* Collapsible Architecture Legend */}
      <AllocationLegend />
    </div>
  );
};
