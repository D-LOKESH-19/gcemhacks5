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
    <div className="rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col overflow-hidden">
      {/* Feed Header */}
      <div className="flex items-center justify-between p-3 border-b border-border-subtle bg-bg-base/40">
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-cyan-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight">Autonomous Decision & Explainability Feed</h2>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-text-muted border border-border-subtle">
            {filteredFeed.length} Events
          </span>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1">
          {(["all", "spikes", "bots", "shield", "sla"] as FilterType[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider transition-colors ${
                activeFilter === filter
                  ? "bg-slate-700 text-text-primary border border-slate-600"
                  : "text-text-muted hover:text-text-primary hover:bg-slate-800/60"
              }`}
            >
              {filter}
            </button>
          ))}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-text-muted hover:text-text-primary rounded ml-1 transition-colors"
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
                className="flex items-start justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-bg-base/70 border border-border-subtle hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {getCategoryIcon(item.category)}
                  <span className="text-[11px] text-text-primary truncate">{item.text}</span>
                </div>
                {item.count > 1 && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 text-[10px] font-bold shrink-0">
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
