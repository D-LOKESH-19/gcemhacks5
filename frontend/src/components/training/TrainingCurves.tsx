import React from "react";
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
} from "recharts";
import { TrainingLogEntry } from "../../types/api";
import { TrendingUp, ShieldAlert, Sliders } from "lucide-react";

interface TrainingCurvesProps {
  log: TrainingLogEntry[];
}

export const TrainingCurves: React.FC<TrainingCurvesProps> = ({ log }) => {
  // FT-50: Empty state if no log exists
  if (!log || log.length === 0) {
    return (
      <div className="p-12 rounded-xl bg-bg-card border border-border-subtle text-center my-6">
        <TrendingUp size={36} className="text-cyan-400 mx-auto mb-3" />
        <h3 className="text-base font-bold text-text-primary">No Training Log Found</h3>
        <p className="text-xs text-text-muted max-w-md mx-auto mt-1 font-mono">
          Run python train.py to create training data.
        </p>
      </div>
    );
  }

  const costUrllcLimit = 0.005;
  const costMurllcLimit = 0.01;
  const costEmbbLimit = 0.05;

  return (
    <div className="space-y-4">
      {/* 1. Episode Reward Curve */}
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
              PPO Policy Training Reward Convergence
            </h2>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
            Objective: Maximize eMBB Throughput
          </span>
        </div>

        <div className="h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={log} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="episode" stroke="#64748B" fontSize={11} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#0F172A", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                formatter={(val: any) => [Number(val).toFixed(4), "Reward"]}
                labelFormatter={(l) => `Episode #${l}`}
              />
              <Line type="monotone" dataKey="reward" stroke="#34D399" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Three Constraint Costs with Dashed Limit Lines (FT-50) */}
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle mb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-rose-400" />
            <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
              Constraint Costs with Contract Ceilings (Dashed Limits - FT-50)
            </h2>
          </div>
          <span className="text-[10px] font-mono text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
            Limits: URLLC &lt; 0.005, mURLLC &lt; 0.010
          </span>
        </div>

        <div className="h-[230px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={log} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="episode" stroke="#64748B" fontSize={11} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} domain={[0, 0.06]} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#0F172A", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                labelFormatter={(l) => `Episode #${l}`}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: "8px", fontSize: "11px" }} />

              {/* Dashed Threshold Lines */}
              <ReferenceLine y={costUrllcLimit} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: "URLLC Limit (0.005)", fill: "#F59E0B", fontSize: 9, position: "insideTopLeft" }} />
              <ReferenceLine y={costMurllcLimit} stroke="#A78BFA" strokeDasharray="4 4" label={{ value: "mURLLC Limit (0.010)", fill: "#A78BFA", fontSize: 9, position: "insideTopLeft" }} />
              <ReferenceLine y={costEmbbLimit} stroke="#22D3EE" strokeDasharray="4 4" label={{ value: "eMBB Shortfall Limit (0.050)", fill: "#22D3EE", fontSize: 9, position: "insideTopLeft" }} />

              <Line type="monotone" dataKey="cost_urllc" name="Cost URLLC" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="cost_murllc" name="Cost mURLLC" stroke="#A78BFA" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="cost_embb" name="Cost eMBB Shortfall" stroke="#22D3EE" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Three Lambdas History */}
      <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle mb-2">
          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-cyan-400" />
            <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
              Dual Lagrangian Multipliers Adaptation (λ History - FT-50)
            </h2>
          </div>
          <span className="text-[10px] font-mono text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded">
            Subgradient Ascent Updates
          </span>
        </div>

        <div className="h-[210px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={log} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="episode" stroke="#64748B" fontSize={11} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={{ stroke: "#CBD5E1" }} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", color: "#0F172A", borderRadius: "8px", fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                labelFormatter={(l) => `Episode #${l}`}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: "8px", fontSize: "11px" }} />
              <Line type="monotone" dataKey="lambda_urllc" name="λ URLLC" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="lambda_murllc" name="λ mURLLC" stroke="#A78BFA" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="lambda_embb" name="λ eMBB" stroke="#22D3EE" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
