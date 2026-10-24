import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useSliceStore } from "../../store/useSliceStore";
import { BarChart2 } from "lucide-react";

export const TrafficArrivalsChart: React.FC = () => {
  const { trafficArrivalsHistory } = useSliceStore();

  const formattedData = useMemo(() => {
    return trafficArrivalsHistory.map((item) => ({
      step: item.step,
      eMBB: Math.round(item.embb),
      URLLC: Math.round(item.urllc),
      mURLLC: Math.round(item.murllc),
      Total: Math.round(item.total),
    }));
  }, [trafficArrivalsHistory]);

  const maxArrivals = useMemo(() => {
    let max = 0;
    for (const d of formattedData) {
      if (d.Total > max) max = d.Total;
    }
    return Math.max(100, Math.ceil(max * 1.15));
  }, [formattedData]);

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle mb-2">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-cyan-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            Traffic Arrivals History by Slice
          </h2>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded">
          Unit: Packets / Step
        </span>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="colorEmbb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#22D3EE" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorUrllc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorMurllc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#A78BFA" stopOpacity={0.0} />
              </linearGradient>
            </defs>
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
              domain={[0, maxArrivals]}
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
              formatter={(value: any) => [`${value} pkts`, ""]}
              labelFormatter={(label) => `Step #${label}`}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ paddingBottom: "8px", fontSize: "11px" }}
            />
            <Area
              type="monotone"
              dataKey="eMBB"
              stroke="#22D3EE"
              fillOpacity={1}
              fill="url(#colorEmbb)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="URLLC"
              stroke="#F59E0B"
              fillOpacity={1}
              fill="url(#colorUrllc)"
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="mURLLC"
              stroke="#A78BFA"
              fillOpacity={1}
              fill="url(#colorMurllc)"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px] text-text-muted font-mono">
        <span>Real-time queuing demand across 3 independent Poisson processes</span>
        <span>Window: Last 300 steps</span>
      </div>
    </div>
  );
};
