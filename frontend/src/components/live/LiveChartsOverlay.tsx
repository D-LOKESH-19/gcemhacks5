import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { useSliceStore } from "../../store/useSliceStore";

export const LiveChartsOverlay: React.FC = () => {
  const { violationHistory, throughputHistory, spikeMarkers, publicConfig } = useSliceStore();

  const slaUrllcLimit = (publicConfig?.sla?.urllc?.max_violation_rate ?? 0.005) * 100; // in %

  // Format data for chart display (convert ratios to percentage)
  const formattedViolationData = useMemo(() => {
    return violationHistory.map((pt) => ({
      step: pt.step,
      Static: Number(((pt.static || 0) * 100).toFixed(2)),
      Heuristic: Number(((pt.heuristic || 0) * 100).toFixed(2)),
      Agent: Number(((pt.agent || 0) * 100).toFixed(2)),
    }));
  }, [violationHistory]);

  const formattedThroughputData = useMemo(() => {
    return throughputHistory.map((pt) => ({
      step: pt.step,
      Static: Number((pt.static || 0).toFixed(1)),
      Heuristic: Number((pt.heuristic || 0).toFixed(1)),
      Agent: Number((pt.agent || 0).toFixed(1)),
    }));
  }, [throughputHistory]);

  // Compute dynamic Y-axis upper bound conforming to FT-19:
  // max(2 x SLA limit, 1.2 x highest value)
  const maxViolationValue = useMemo(() => {
    let maxVal = 0;
    for (const d of formattedViolationData) {
      if (d.Static > maxVal) maxVal = d.Static;
      if (d.Heuristic > maxVal) maxVal = d.Heuristic;
      if (d.Agent > maxVal) maxVal = d.Agent;
    }
    return Math.max(slaUrllcLimit * 2, maxVal * 1.2, 1.2);
  }, [formattedViolationData, slaUrllcLimit]);

  const maxThroughputValue = useMemo(() => {
    let maxVal = 0;
    for (const d of formattedThroughputData) {
      if (d.Static > maxVal) maxVal = d.Static;
      if (d.Heuristic > maxVal) maxVal = d.Heuristic;
      if (d.Agent > maxVal) maxVal = d.Agent;
    }
    return Math.max(100, maxVal * 1.15);
  }, [formattedThroughputData]);

  // Get recent active spikes for band markers
  const activeBands = useMemo(() => {
    const currentStep = violationHistory.length > 0 ? violationHistory[violationHistory.length - 1].step : 0;
    return spikeMarkers
      .filter((m) => currentStep >= m.step && currentStep <= m.step + m.duration + 50)
      .map((m) => ({
        x1: m.step,
        x2: m.step + m.duration,
        label: `${m.slice.toUpperCase()} Spike (${m.factor}x)`,
      }));
  }, [spikeMarkers, violationHistory]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Chart A: Real-Time Violation Rate Overlay */}
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-tight">
              Chart A: URLLC Violation Rate Overlay
            </h2>
            <p className="text-[11px] text-text-muted">
              Threshold breach comparison under dynamic traffic surges.
            </p>
          </div>
          <span className="text-[11px] font-mono text-rose-400 bg-rose-950/60 border border-rose-800/80 px-2 py-0.5 rounded">
            SLA Ceiling: {slaUrllcLimit.toFixed(2)}%
          </span>
        </div>

        <div className="h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={formattedViolationData}
              margin={{ top: 10, right: 15, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
              <XAxis
                dataKey="step"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#1F2A44" }}
                domain={["auto", "auto"]}
              />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#1F2A44" }}
                domain={[0, maxViolationValue]}
                unit="%"
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#121A2B",
                  borderColor: "#1F2A44",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#E5E7EB",
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

              {/* SLA Threshold Ceiling Line */}
              <ReferenceLine
                y={slaUrllcLimit}
                stroke="#F59E0B"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `SLA Limit (${slaUrllcLimit.toFixed(1)}%)`,
                  fill: "#F59E0B",
                  fontSize: 10,
                  position: "insideTopLeft",
                }}
              />

              {/* Shaded Spike Bands */}
              {activeBands.map((band, idx) => (
                <ReferenceArea
                  key={`vband-${idx}`}
                  x1={band.x1}
                  x2={band.x2}
                  fill="#F59E0B"
                  fillOpacity={0.12}
                  stroke="#F59E0B"
                  strokeOpacity={0.3}
                  label={{
                    value: band.label,
                    fill: "#F59E0B",
                    fontSize: 9,
                    position: "insideTopRight",
                  }}
                />
              ))}

              {/* Three Policy Comparison Lines */}
              <Line
                type="monotone"
                dataKey="Static"
                stroke="#F87171"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="Heuristic"
                stroke="#CBD5E1"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="Agent"
                stroke="#34D399"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart B: Real-Time Throughput / Served Overlay */}
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xs font-bold text-text-primary uppercase tracking-tight">
              Chart B: eMBB Throughput Overlay
            </h2>
            <p className="text-[11px] text-text-muted">
              Served bit-demand across policies under coupled resource sharing.
            </p>
          </div>
          <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded">
            Unit: pkts/step
          </span>
        </div>

        <div className="h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={formattedThroughputData}
              margin={{ top: 10, right: 15, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
              <XAxis
                dataKey="step"
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#1F2A44" }}
                domain={["auto", "auto"]}
              />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#1F2A44" }}
                domain={[0, maxThroughputValue]}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#121A2B",
                  borderColor: "#1F2A44",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#E5E7EB",
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

              {/* Shaded Spike Bands */}
              {activeBands.map((band, idx) => (
                <ReferenceArea
                  key={`tband-${idx}`}
                  x1={band.x1}
                  x2={band.x2}
                  fill="#22D3EE"
                  fillOpacity={0.12}
                  stroke="#22D3EE"
                  strokeOpacity={0.3}
                />
              ))}

              {/* Three Policy Comparison Lines */}
              <Line
                type="monotone"
                dataKey="Static"
                stroke="#F87171"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="Heuristic"
                stroke="#CBD5E1"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="Agent"
                stroke="#34D399"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
