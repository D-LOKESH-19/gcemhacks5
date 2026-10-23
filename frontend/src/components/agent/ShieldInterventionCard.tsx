import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useSliceStore } from "../../store/useSliceStore";
import { ShieldCheck, Info } from "lucide-react";

export const ShieldInterventionCard: React.FC = () => {
  const { latestPayload, shieldInterventionHistory } = useSliceStore();

  const agentShield = latestPayload?.policies?.agent?.shield;
  const interventionRate20 = (agentShield?.intervention_rate_20 ?? (latestPayload?.audit?.shield_rate_20 ?? 0)) * 100;
  const isChanged = agentShield?.changed ?? false;
  const isShieldActive = agentShield?.active ?? false;
  const windowSteps = 20;

  const formattedHistory = useMemo(() => {
    return shieldInterventionHistory.map((item) => ({
      step: item.step,
      Rate: Number((item.rate_20 * 100).toFixed(1)),
    }));
  }, [shieldInterventionHistory]);

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            Safety Shield Supervisor Telemetry
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
              isShieldActive
                ? "bg-emerald-950/80 text-emerald-300 border-emerald-800"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {isShieldActive ? "SHIELD ENGAGED" : "PASS-THROUGH"}
          </span>
          {isChanged && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
              ACTION ALTERED (&gt;3%)
            </span>
          )}
        </div>
      </div>

      {/* Mandatory Plain-Text Shield Statement (FT-40) */}
      <div className="p-3 rounded-lg bg-bg-base/80 border border-emerald-950 flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary">
              {`The shield changed the agent's decision in ${interventionRate20.toFixed(1)} percent of the last ${windowSteps} steps.`}
            </p>
            <p className="text-[11px] text-text-muted mt-0.5">
              Continuous sliding window audit of safety overrides across live simulation frames.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[10px] text-text-muted uppercase block">Intervention Rate</span>
          <span className="text-xl font-mono font-bold text-emerald-400">
            {interventionRate20.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Mini Trend Chart */}
      <div className="h-[140px] w-full mb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formattedHistory} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2A44" vertical={false} />
            <XAxis dataKey="step" stroke="#64748B" fontSize={10} tickLine={false} />
            <YAxis stroke="#64748B" fontSize={10} tickLine={false} domain={[0, 100]} unit="%" width={35} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#121A2B",
                borderColor: "#1F2A44",
                borderRadius: "8px",
                fontSize: "11px",
              }}
              formatter={(val: any) => [`${val}%`, "Intervention Rate"]}
              labelFormatter={(l) => `Step #${l}`}
            />
            <Line
              type="monotone"
              dataKey="Rate"
              stroke="#34D399"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Mandatory Honesty Notice (FT-44) */}
      <div className="pt-2 border-t border-border-subtle flex items-start gap-2 text-[10px] text-text-muted">
        <Info size={13} className="text-cyan-400 shrink-0 mt-0.5" />
        <span>
          <strong className="text-text-primary font-medium">Algorithmic Separation:</strong> The safety shield is a deterministic
          hard-constraint supervisor that overrides neural action logits when URLLC/mURLLC buffers threaten contract floors.
          It is <em>distinct</em> from the unconstrained learned policy.
        </span>
      </div>
    </div>
  );
};
