import React, { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { MonitorTimelinePoint } from '../../types/api';
import { CARD, POLICIES, POLICY_COLOR, POLICY_LABEL } from './monitorUtils';

/** Packets that missed their deadline per step, per policy (one axis, last 300 steps). */
export const ProblemTimeline: React.FC<{ timeline: MonitorTimelinePoint[] }> = ({ timeline }) => {
  const data = useMemo(
    () => timeline.map((p) => {
      const row: Record<string, number | string> = { tick: p.tick, label: `ep ${p.episode}, step ${p.step}` };
      POLICIES.forEach((k) => { if (p.missed[k] !== undefined) row[k] = Number(p.missed[k].toFixed(2)); });
      return row;
    }),
    [timeline],
  );
  const present = POLICIES.filter((k) => timeline.some((p) => p.missed[k] !== undefined));

  return (
    <div className={CARD} data-testid="monitor-timeline">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-slate-900">Deadline misses per step</h2>
        <span className="text-[10px] text-slate-500 font-mono">URLLC + mURLLC packets, last {timeline.length} steps</span>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="tick" fontSize={10} tickLine={false} stroke="#64748B" />
            <YAxis fontSize={10} tickLine={false} stroke="#64748B" width={36} allowDecimals={false} />
            <Tooltip
              labelFormatter={(_, payload) => (payload && payload[0] ? String(payload[0].payload.label) : '')}
              formatter={(v: any, name: any) => [`${v} packets`, POLICY_LABEL[name] ?? name]}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />
            <Legend formatter={(v) => POLICY_LABEL[v] ?? v} wrapperStyle={{ fontSize: 11 }} />
            {present.map((k) => (
              <Line key={k} dataKey={k} stroke={POLICY_COLOR[k]} strokeWidth={k === 'enhanced' ? 2 : 1.8}
                strokeDasharray={k === 'enhanced' ? '2 4' : undefined} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
