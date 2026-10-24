import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SliceType } from '../../types/api';
import { useSliceStore } from '../../store/useSliceStore';
import { SLICE_META, SLICES } from './lendingUtils';

/** Forecast versus capacity for one slice, packets per step, from the backend's recent history. */
export const ForecastMini: React.FC<{ slice: SliceType }> = ({ slice }) => {
  const history = useSliceStore((s) => s.lendingHistory);
  const idx = SLICES.indexOf(slice);
  const meta = SLICE_META[slice];
  const data = useMemo(
    () =>
      history.map((h) => ({
        step: h.step,
        Forecast: Number(h.forecast[idx].toFixed(1)),
        'Forecast + margin': Number(h.need[idx].toFixed(1)),
        Capacity: Number(h.capacity[idx].toFixed(1)),
      })),
    [history, idx]
  );

  return (
    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/80" data-testid={`forecast-${slice}`}>
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
          {meta.name} forecast vs capacity
        </span>
        <span className="text-[9px] text-slate-500 font-mono">packets / step</span>
      </div>
      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="step" stroke="#64748B" fontSize={9} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} />
            <YAxis stroke="#64748B" fontSize={9} tickLine={false} axisLine={{ stroke: '#CBD5E1' }} width={38} />
            <Tooltip
              contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', fontSize: '11px', color: '#0F172A' }}
              labelFormatter={(l) => `Step #${l}`}
            />
            <Line type="monotone" dataKey="Capacity" stroke="#334155" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Forecast + margin" stroke={meta.color} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="Forecast" stroke={meta.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 px-1 text-[9px] text-slate-600">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-slate-700" /> capacity</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5" style={{ backgroundColor: meta.color }} /> forecast</span>
        <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: meta.color }} /> forecast + margin</span>
      </div>
    </div>
  );
};
