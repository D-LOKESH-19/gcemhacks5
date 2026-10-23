import React, { useState, useEffect, useRef } from 'react';
import { Lock, Cpu, Radio } from 'lucide-react';
import { ResourcePoolAllocation, SliceType } from '../../types/api';

interface ResourcePoolsProps {
  prb: ResourcePoolAllocation;
  cpu: ResourcePoolAllocation;
  prbTotal?: number;
  vcpuTotal?: number;
  policyName?: string;
}

const SLICE_CONFIG: Record<SliceType, { name: string; color: string; border: string; bg: string }> = {
  embb: {
    name: 'eMBB',
    color: '#22D3EE',
    border: 'border-cyan-400',
    bg: 'bg-[#22D3EE]',
  },
  urllc: {
    name: 'URLLC',
    color: '#F59E0B',
    border: 'border-amber-400',
    bg: 'bg-[#F59E0B]',
  },
  murllc: {
    name: 'mURLLC',
    color: '#A78BFA',
    border: 'border-purple-400',
    bg: 'bg-[#A78BFA]',
  },
};

const SLICE_ORDER: SliceType[] = ['embb', 'urllc', 'murllc'];

export const ResourcePools: React.FC<ResourcePoolsProps> = ({
  prb,
  cpu,
  prbTotal = 100,
  vcpuTotal = 8,
  policyName = 'RL Agent',
}) => {
  const [hoveredSlice, setHoveredSlice] = useState<SliceType | null>(null);
  const [flashingIndices, setFlashingIndices] = useState<Set<number>>(new Set());
  const [floatingDeltas, setFloatingDeltas] = useState<{ prb: number[]; cpu: number[] }>({ prb: [0, 0, 0], cpu: [0, 0, 0] });
  const prevPrbCountsRef = useRef<number[]>(prb.counts);

  // Compute cell layout for PRBs (10x10)
  const prbColumns = Math.ceil(Math.sqrt(prbTotal));

  // Detect count shifts and trigger 600ms flashes & floating labels
  useEffect(() => {
    const prev = prevPrbCountsRef.current;
    const curr = prb.counts;
    const deltas = curr.map((c, i) => c - (prev[i] || 0));

    if (deltas.some((d) => d !== 0)) {
      setFloatingDeltas({ prb: deltas, cpu: [0, 0, 0] });
      
      // Determine indices of boundary changes to flash
      const changed = new Set<number>();
      let cursor = 0;
      curr.forEach((count, sIdx) => {
        const pCount = prev[sIdx] || 0;
        if (count !== pCount) {
          const start = Math.min(cursor, cursor + count);
          const end = cursor + count;
          for (let k = start; k < end; k++) {
            if (changed.size < 12) changed.add(k);
          }
        }
        cursor += count;
      });

      setFlashingIndices(changed);
      const timer = setTimeout(() => {
        setFlashingIndices(new Set());
      }, 600);

      const fadeTimer = setTimeout(() => {
        setFloatingDeltas({ prb: [0, 0, 0], cpu: [0, 0, 0] });
      }, 2000);

      prevPrbCountsRef.current = curr;
      return () => {
        clearTimeout(timer);
        clearTimeout(fadeTimer);
      };
    }
  }, [prb.counts]);

  // Build contiguous array of PRB cells
  const prbCells: Array<{ slice: SliceType; isFloor: boolean; util: number; index: number }> = [];
  let prbIndex = 0;
  SLICE_ORDER.forEach((slice, sIdx) => {
    const count = prb.counts[sIdx];
    const floorCells = Math.floor(prb.floor[sIdx] * prbTotal);
    const util = prb.util[sIdx];

    for (let i = 0; i < count; i++) {
      prbCells.push({
        slice,
        isFloor: i < floorCells && (slice === 'urllc' || slice === 'murllc'),
        util,
        index: prbIndex++,
      });
    }
  });

  // Build contiguous array of vCPU chips
  const cpuChips: Array<{ slice: SliceType; isFloor: boolean; util: number; index: number }> = [];
  let cpuIndex = 0;
  SLICE_ORDER.forEach((slice, sIdx) => {
    const count = cpu.counts[sIdx];
    const floorChips = Math.floor(cpu.floor[sIdx] * vcpuTotal);
    const util = cpu.util[sIdx];

    for (let i = 0; i < count; i++) {
      cpuChips.push({
        slice,
        isFloor: i < floorChips && (slice === 'urllc' || slice === 'murllc'),
        util,
        index: cpuIndex++,
      });
    }
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 1. PRB Grid (10x10) */}
      <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radio size={16} className="text-sky-600" />
              <span className="font-bold text-sm text-slate-900 tracking-tight">
                Radio Resource Pool ({prbTotal} PRBs)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-mono">
                {policyName}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">10x10 Grid</span>
          </div>

          {/* Grid layout */}
          <div
            className="grid gap-1.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 aspect-square max-w-[340px] mx-auto select-none"
            style={{ gridTemplateColumns: `repeat(${prbColumns}, minmax(0, 1fr))` }}
          >
            {prbCells.map((cell) => {
              const isFlashing = flashingIndices.has(cell.index);
              const fillPct = Math.min(100, Math.round(cell.util * 100));
              const isOverCap = cell.util > 1.0;
              const cfg = SLICE_CONFIG[cell.slice];

              return (
                <div
                  key={`prb-${cell.index}`}
                  onMouseEnter={() => setHoveredSlice(cell.slice)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className={`relative rounded-md overflow-hidden border transition-all duration-300 flex items-center justify-center ${
                    isFlashing ? 'ring-2 ring-white scale-105 z-10' : ''
                  }`}
                  style={{
                    backgroundColor: `${cfg.color}25`,
                    borderColor: cfg.color,
                  }}
                  title={`${cfg.name} PRB #${cell.index + 1} (Util: ${(cell.util * 100).toFixed(1)}%)`}
                >
                  {/* Utilization Inner Fill */}
                  <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-300"
                    style={{
                      height: `${fillPct}%`,
                      backgroundColor: cfg.color,
                      opacity: 0.85,
                    }}
                  />

                  {/* Floor Lock Icon */}
                  {cell.isFloor && (
                    <Lock size={10} className="relative z-10 text-white drop-shadow-sm" />
                  )}

                  {/* Over Capacity Indicator */}
                  {isOverCap && (
                    <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping z-10" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Slice Units Breakdown & Floating Deltas */}
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
            {SLICE_ORDER.map((s, idx) => {
              const count = prb.counts[idx];
              const delta = floatingDeltas.prb[idx];
              const cfg = SLICE_CONFIG[s];

              return (
                <div
                  key={`prb-breakdown-${s}`}
                  className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 text-center relative"
                >
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                    <span className="font-bold text-slate-800 text-[11px]">{cfg.name}</span>
                  </div>
                  <span className="text-sm font-mono font-bold text-slate-900">{count} PRB</span>
                  
                  {/* Floating Delta Badge */}
                  {delta !== 0 && (
                    <span
                      className={`absolute -top-2 right-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full shadow-sm animate-bounce ${
                        delta > 0 ? 'bg-sky-500 text-white' : 'bg-slate-700 text-white'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[10px] text-slate-400 mt-2 text-center">
          Displayed in whole units. The simulator uses continuous shares.
        </p>
      </div>

      {/* 2. vCPU Compute Pool (8 Cores) */}
      <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-purple-600" />
              <span className="font-bold text-sm text-slate-900 tracking-tight">
                Edge UPF Compute Pool ({vcpuTotal} vCPUs)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                {policyName}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">1x8 Row</span>
          </div>

          {/* Row of vCPU Chips */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200/80 select-none">
            {cpuChips.map((chip) => {
              const fillPct = Math.min(100, Math.round(chip.util * 100));
              const isOverCap = chip.util > 1.0;
              const cfg = SLICE_CONFIG[chip.slice];

              return (
                <div
                  key={`vcpu-${chip.index}`}
                  onMouseEnter={() => setHoveredSlice(chip.slice)}
                  onMouseLeave={() => setHoveredSlice(null)}
                  className="h-20 rounded-xl relative overflow-hidden border flex flex-col items-center justify-between p-1.5 transition-all"
                  style={{
                    backgroundColor: `${cfg.color}20`,
                    borderColor: cfg.color,
                  }}
                  title={`${cfg.name} Core #${chip.index + 1} (Util: ${(chip.util * 100).toFixed(1)}%)`}
                >
                  {/* Fill */}
                  <div
                    className="absolute bottom-0 left-0 right-0 transition-all duration-300"
                    style={{
                      height: `${fillPct}%`,
                      backgroundColor: cfg.color,
                      opacity: 0.85,
                    }}
                  />

                  <div className="relative z-10 flex items-center justify-between w-full">
                    <span className="text-[9px] font-mono font-bold text-slate-800">C{chip.index + 1}</span>
                    {chip.isFloor && <Lock size={10} className="text-slate-800" />}
                    {isOverCap && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" title="Over Capacity" />}
                  </div>

                  <span className="relative z-10 text-[10px] font-mono font-bold text-slate-900">
                    {fillPct}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Hover Inspector Card */}
          <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
            {hoveredSlice ? (
              <div>
                <span className="font-bold text-slate-800 uppercase block mb-1">
                  {SLICE_CONFIG[hoveredSlice].name} Pool Details
                </span>
                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Raw Share</span>
                    <span className="font-mono font-bold text-slate-800">
                      {(prb.raw[SLICE_ORDER.indexOf(hoveredSlice)] * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Final Share</span>
                    <span className="font-mono font-bold text-sky-600">
                      {(prb.final[SLICE_ORDER.indexOf(hoveredSlice)] * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">PRB Capacity</span>
                    <span className="font-mono font-bold text-slate-800">
                      {prb.capacity[SLICE_ORDER.indexOf(hoveredSlice)].toFixed(0)} pkts
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Utilization</span>
                    <span className="font-mono font-bold text-purple-600">
                      {(prb.util[SLICE_ORDER.indexOf(hoveredSlice)] * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-[11px] text-center">
                Hover any cell or core chip to inspect exact continuous shares and capacities.
              </p>
            )}
          </div>
        </div>

        {/* Floor Guarantee labels */}
        <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500">
          <span>URLLC Floor: 15% (1.2 cores / 15 PRB)</span>
          <span>mURLLC Floor: 15% (1.2 cores / 15 PRB)</span>
        </div>
      </div>
    </div>
  );
};
