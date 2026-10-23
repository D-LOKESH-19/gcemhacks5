import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, History } from 'lucide-react';
import { ResourceTransfer, SliceType } from '../../types/api';
import { mergeBurstTransfers, MergedTransfer } from '../../utils/allocationUtils';

interface TransferLedgerProps {
  currentTransfers?: ResourceTransfer[];
  step?: number;
}

interface StoredLedgerEntry extends MergedTransfer {
  step: number;
  id: string;
}

export const TransferLedger: React.FC<TransferLedgerProps> = ({
  currentTransfers = [],
  step = 0,
}) => {
  const [history, setHistory] = useState<StoredLedgerEntry[]>([]);
  const [resourceFilter, setResourceFilter] = useState<'all' | 'prb' | 'cpu'>('all');
  const [sliceFilter, setSliceFilter] = useState<'all' | SliceType>('all');
  const [isHovered, setIsHovered] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Append new transfers to the ledger (last 50 items)
  useEffect(() => {
    if (!currentTransfers || currentTransfers.length === 0) return;

    const merged = mergeBurstTransfers(currentTransfers);
    const newEntries: StoredLedgerEntry[] = merged.map((t, idx) => ({
      ...t,
      step,
      id: `${step}-${t.resource}-${t.from}-${t.to}-${idx}`,
    }));

    setHistory((prev) => {
      const combined = [...newEntries, ...prev];
      return combined.slice(0, 50);
    });
  }, [currentTransfers, step]);

  // Auto-scroll when not hovered
  useEffect(() => {
    if (!isHovered && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [history, isHovered]);

  const filteredHistory = history.filter((item) => {
    if (resourceFilter !== 'all' && item.resource !== resourceFilter) return false;
    if (sliceFilter !== 'all' && item.from !== sliceFilter && item.to !== sliceFilter) return false;
    return true;
  });

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] flex flex-col justify-between"
    >
      <div>
        <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 mb-3 gap-2">
          <div className="flex items-center gap-2">
            <History size={16} className="text-sky-600" />
            <span className="font-bold text-sm text-slate-900 tracking-tight">
              Transfer Ledger ({history.length} Events)
            </span>
            {isHovered && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                Paused on Hover
              </span>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 text-xs">
            <select
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value as any)}
              className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none"
            >
              <option value="all">All Resources</option>
              <option value="prb">PRB Only</option>
              <option value="cpu">vCPU Only</option>
            </select>

            <select
              value={sliceFilter}
              onChange={(e) => setSliceFilter(e.target.value as any)}
              className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none"
            >
              <option value="all">All Slices</option>
              <option value="embb">eMBB</option>
              <option value="urllc">URLLC</option>
              <option value="murllc">mURLLC</option>
            </select>
          </div>
        </div>

        {/* Scrollable Ledger List */}
        <div
          ref={scrollContainerRef}
          className="space-y-2 max-h-[300px] overflow-y-auto pr-1 select-none text-xs"
        >
          {filteredHistory.length > 0 ? (
            filteredHistory.map((item) => {
              const donorPct = Math.round(item.donor_util * 100);
              const recvPct = Math.round(item.receiver_util * 100);
              const reasonText = `${item.from.toUpperCase()} ${donorPct}% busy, ${item.to.toUpperCase()} ${recvPct}% busy`;

              return (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-sky-50/50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-slate-400">Step {item.step}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[10px] uppercase font-bold">
                      {item.resource}
                    </span>
                    <div className="flex items-center gap-1 font-bold text-slate-800">
                      <span className="uppercase">{item.from}</span>
                      <ArrowRight size={12} className="text-slate-400" />
                      <span className="uppercase text-sky-700">{item.to}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900">
                      +{item.amount} {item.resource.toUpperCase()}
                    </span>
                    {item.count > 1 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-800 font-mono font-bold text-[10px]">
                        x{item.count}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-mono hidden md:inline">
                      {reasonText}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.reason_code === 'surge'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : item.reason_code === 'floor_restore'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : item.reason_code === 'idle_harvest'
                          ? 'bg-sky-100 text-sky-800 border border-sky-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {item.reason_code.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400 italic">
              No reallocations: allocation is steady.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
