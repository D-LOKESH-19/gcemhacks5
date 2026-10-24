import React, { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useSliceStore } from "../../store/useSliceStore";
import { Layers, HardDrive, Cpu, Eye } from "lucide-react";

export const SharesStackedChart: React.FC = () => {
  const { agentSharesHistory } = useSliceStore();
  const [resourceType, setResourceType] = useState<"prb" | "vcpu">("prb");
  const [showHeuristicOverlay, setShowHeuristicOverlay] = useState<boolean>(false);

  // Format data for stacked area chart (areas must sum to 100% - FT-39)
  const formattedData = useMemo(() => {
    return agentSharesHistory.map((item) => {
      const embb = resourceType === "prb" ? item.embb_prb : item.embb_vcpu;
      const urllc = resourceType === "prb" ? item.urllc_prb : item.urllc_vcpu;
      const murllc = resourceType === "prb" ? item.murllc_prb : item.murllc_vcpu;

      const sum = (embb || 0) + (urllc || 0) + (murllc || 0) || 1.0;
      const embbPct = Number(((embb / sum) * 100).toFixed(1));
      const urllcPct = Number(((urllc / sum) * 100).toFixed(1));
      const murllcPct = Number(Math.max(0, 100 - embbPct - urllcPct).toFixed(1));

      return {
        step: item.step,
        eMBB: embbPct,
        URLLC: urllcPct,
        mURLLC: murllcPct,
        // Heuristic proportional baseline reference (33% equal or demand-proportional)
        heuristicURLLC: 25.0,
      };
    });
  }, [agentSharesHistory, resourceType]);

  return (
    <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)] flex flex-col justify-between">
      {/* Chart Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-slate-100 mb-2">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-sky-600" />
          <div>
            <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
              RL Agent Dynamic Joint Shares (100% Stacked)
            </h2>
            <p className="text-[11px] text-slate-500">
              Continuous simplex resource redistribution across slices.
            </p>
          </div>
        </div>

        {/* Controls: PRB vs vCPU toggle & Heuristic overlay (FT-39, FT-43) */}
        <div className="flex items-center gap-2">
          {/* PRB vs vCPU Toggle */}
          <div className="flex items-center rounded-lg bg-slate-100 border border-slate-200 p-0.5">
            <button
              onClick={() => setResourceType("prb")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                resourceType === "prb"
                  ? "bg-white text-sky-700 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <HardDrive size={12} />
              <span>PRB Radio</span>
            </button>
            <button
              onClick={() => setResourceType("vcpu")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                resourceType === "vcpu"
                  ? "bg-white text-purple-700 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Cpu size={12} />
              <span>vCPU Compute</span>
            </button>
          </div>

          {/* Heuristic Overlay Toggle (FT-43) */}
          <button
            onClick={() => setShowHeuristicOverlay(!showHeuristicOverlay)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
              showHeuristicOverlay
                ? "bg-sky-50 text-sky-800 border-sky-300 font-semibold shadow-sm"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
            title="Toggle Heuristic URLLC allocation reference line"
          >
            <Eye size={12} />
            <span>Overlay Heuristic</span>
          </button>
        </div>
      </div>

      {/* Stacked Recharts Area */}
      <div className="h-[270px] w-full rounded-xl bg-slate-50/70 p-1 border border-slate-100">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="step"
              stroke="#64748B"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#CBD5E1" }}
            />
            <YAxis
              stroke="#64748B"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "#CBD5E1" }}
              domain={[0, 100]}
              unit="%"
              width={45}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#FFFFFF",
                borderColor: "#CBD5E1",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#0F172A",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              }}
              formatter={(value: any) => [`${value}%`, ""]}
              labelFormatter={(label) => `Step #${label}`}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ paddingBottom: "8px", fontSize: "11px" }}
            />

            {/* Stacked Areas in Slice Colours (FT-16, FT-39) */}
            <Area
              type="monotone"
              dataKey="eMBB"
              stackId="shares"
              stroke="#22D3EE"
              fill="#22D3EE"
              fillOpacity={0.65}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="URLLC"
              stackId="shares"
              stroke="#F59E0B"
              fill="#F59E0B"
              fillOpacity={0.75}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="mURLLC"
              stackId="shares"
              stroke="#A78BFA"
              fill="#A78BFA"
              fillOpacity={0.8}
              isAnimationActive={false}
            />

            {/* Optional Heuristic Baseline Overlay Line (FT-43) */}
            {showHeuristicOverlay && (
              <Line
                type="monotone"
                dataKey="heuristicURLLC"
                name="Heuristic URLLC Ref"
                stroke="#CBD5E1"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px] text-text-muted font-mono">
        <span>Resource Simplex: Σ(shares) = 100% strictly enforced across radio & compute</span>
        <span className="text-cyan-400 capitalize">Mode: {resourceType.toUpperCase()} allocation</span>
      </div>
    </div>
  );
};
