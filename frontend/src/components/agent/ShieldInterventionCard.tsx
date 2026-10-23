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
    <div className="p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_10px_25px_-5px_rgba(2,132,199,0.06)] flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-sky-600" />
          <h2 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
            Safety Shield Supervisor Telemetry
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
              isShieldActive
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            {isShieldActive ? "SHIELD ENGAGED" : "PASS-THROUGH"}
          </span>
          {isChanged && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
              ACTION ALTERED (&gt;3%)
            </span>
          )}
        </div>
      </div>

      {/* Mandatory Plain-Text Shield Statement (FT-40) */}
      <div className="p-3.5 rounded-xl bg-sky-50/60 border border-sky-200/80 flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-full bg-sky-100 text-sky-700">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-900">
              {`The shield changed the agent's decision in ${interventionRate20.toFixed(1)} percent of the last ${windowSteps} steps.`}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Continuous sliding window audit of safety overrides across live simulation frames.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[10px] text-slate-500 uppercase block font-medium">Intervention Rate</span>
          <span className="text-xl font-mono font-bold text-sky-700">
            {interventionRate20.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Mini Trend Chart */}
      <div className="h-[140px] w-full mb-2 rounded-xl bg-slate-50/70 p-1 border border-slate-100">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formattedHistory} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="step" stroke="#64748B" fontSize={10} tickLine={false} />
            <YAxis stroke="#64748B" fontSize={10} tickLine={false} domain={[0, 100]} unit="%" width={35} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#FFFFFF",
                borderColor: "#CBD5E1",
                borderRadius: "8px",
                fontSize: "11px",
                color: "#0F172A",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
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
