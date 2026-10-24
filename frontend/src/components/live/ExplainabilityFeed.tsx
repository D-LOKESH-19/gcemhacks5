import React, { useState, useMemo } from "react";
import { useSliceStore } from "../../store/useSliceStore";
import { Terminal, ShieldAlert, Zap, Users, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";

type FilterType = "all" | "spikes" | "bots" | "shield" | "sla";

export const ExplainabilityFeed: React.FC = () => {
  const { eventFeed } = useSliceStore();
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [isExpanded, setIsExpanded] = useState(true);

  // Group and collapse consecutive identical lines into 'xN' (FT-23)
  const processedFeed = useMemo(() => {
    if (!eventFeed || eventFeed.length === 0) return [];

    const grouped: Array<{ id: string; text: string; count: number; category: FilterType }> = [];
    
    for (const log of eventFeed) {
      let category: FilterType = "all";
      const lower = log.toLowerCase();
      if (lower.includes("spike") || lower.includes("surge") || lower.includes("storm") || lower.includes("burst")) {
        category = "spikes";
      } else if (lower.includes("bot") || lower.includes("ue")) {
        category = "bots";
      } else if (lower.includes("shield") || lower.includes("override") || lower.includes("floor")) {
        category = "shield";
      } else if (lower.includes("sla") || lower.includes("breach") || lower.includes("violation")) {
        category = "sla";
      }

      const last = grouped[grouped.length - 1];
      if (last && last.text === log) {
        last.count += 1;
      } else {
        grouped.push({
          id: `${log}-${grouped.length}`,
          text: log,
          count: 1,
          category,
        });
      }
    }

    return grouped.reverse(); // latest first
  }, [eventFeed]);

  const filteredFeed = useMemo(() => {
    if (activeFilter === "all") return processedFeed;
    return processedFeed.filter((item) => item.category === activeFilter);
  }, [processedFeed, activeFilter]);

  const getCategoryIcon = (category: FilterType) => {
    switch (category) {
      case "spikes":
        return <Zap size={12} className="text-amber-400 shrink-0" />;
      case "bots":
        return <Users size={12} className="text-cyan-400 shrink-0" />;
      case "shield":
        return <ShieldCheck size={12} className="text-emerald-400 shrink-0" />;
      case "sla":
        return <ShieldAlert size={12} className="text-rose-400 shrink-0" />;
      default:
        return <Terminal size={12} className="text-slate-400 shrink-0" />;
    }
  };

  return (
    <div className="rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)] flex flex-col overflow-hidden">
      {/* Feed Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-sky-600" />
          <h2 className="text-xs font-bold text-slate-900 tracking-tight">Agent Decision Telemetry & Explainability Feed</h2>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Live Micro-Feed ({filteredFeed.length})
          </span>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1">
          {(["all", "spikes", "bots", "shield", "sla"] as FilterType[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors ${
                activeFilter === filter
                  ? "bg-sky-50 text-sky-800 border border-sky-300 font-semibold shadow-sm"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent"
              }`}
            >
              {filter}
            </button>
          ))}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-500 hover:text-slate-800 rounded-full ml-1 transition-colors"
            title={isExpanded ? "Collapse feed" : "Expand feed"}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Feed List Container */}
      {isExpanded && (
        <div className="p-2 space-y-1.5 max-h-[140px] overflow-y-auto font-mono text-xs select-text">
          {filteredFeed.length === 0 ? (
            <div className="p-4 text-center text-text-muted text-[11px]">
              No events recorded for filter: <span className="uppercase text-text-primary font-semibold">{activeFilter}</span>
            </div>
          ) : (
            filteredFeed.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-border-subtle hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getCategoryIcon(item.category)}
                  <span className="text-[11px] text-text-primary truncate">{item.text}</span>
                </div>
                {item.count > 1 && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-bold shrink-0">
                    x{item.count}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
