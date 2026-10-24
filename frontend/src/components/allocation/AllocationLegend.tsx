import React, { useState } from 'react';
import { Lock, Info, ChevronDown, ChevronUp, Zap } from 'lucide-react';

export const AllocationLegend: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] overflow-hidden transition-all">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left text-xs font-semibold text-slate-800 hover:bg-sky-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info size={15} className="text-sky-600" />
          <span>How to Read This Page & System Architecture</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[11px]">
          <span>{isOpen ? 'Collapse' : 'Expand'}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {isOpen && (
        <div className="p-4 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="font-bold text-slate-800 block mb-1">Slice Identity Palette</span>
              <ul className="space-y-1 text-[11px]">
                <li className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slice-embb shrink-0" />
                  <span><strong>eMBB (#22D3EE):</strong> High-throughput broadband video/traffic</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slice-urllc shrink-0" />
                  <span><strong>URLLC (#F59E0B):</strong> Ultra-reliable low-latency emergency telemetry</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slice-murllc shrink-0" />
                  <span><strong>mURLLC (#A78BFA):</strong> Massive URLLC robotic factory fleet</span>
                </li>
              </ul>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="font-bold text-slate-800 block mb-1">Symbols & Visual Indicators</span>
              <ul className="space-y-1 text-[11px]">
                <li className="flex items-center gap-1.5">
                  <Lock size={12} className="text-amber-600 shrink-0" />
                  <span><strong>Lock Icon:</strong> Guaranteed SLA floor reserved by safety shield</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Zap size={12} className="text-sky-600 shrink-0" />
                  <span><strong>Cell Flash (600ms):</strong> Real-time dynamic resource reallocation</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 bg-slate-300 relative overflow-hidden rounded-sm shrink-0">
                    <div className="absolute bottom-0 w-full h-1/2 bg-sky-500" />
                  </div>
                  <span><strong>Inner Fill:</strong> Slice capacity utilization (demand / capacity)</span>
                </li>
              </ul>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="font-bold text-slate-800 block mb-1">Model & Honesty Notes</span>
              <p className="text-[11px] leading-relaxed text-slate-500">
                Slice-level illustration. Cells show shares of 100 PRBs and 8 vCPUs in whole units. 
                Our resource controller is conceptually similar to a RAN intelligent controller.
                Under overload, URLLC and mURLLC protected first.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
