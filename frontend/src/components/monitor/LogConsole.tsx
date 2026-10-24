import React, { useMemo, useState } from 'react';
import { Search, Terminal } from 'lucide-react';
import { MonitorLog } from '../../types/api';
import { CARD } from './monitorUtils';

const SOURCES = ['all', 'simulation', 'monitor', 'lending'] as const;
const LEVEL_CLS: Record<string, string> = { critical: 'text-rose-300', warning: 'text-amber-300', info: 'text-slate-300' };
const LEVEL_TAG: Record<string, string> = { critical: 'CRIT', warning: 'WARN', info: 'INFO' };

/** Newest-first log stream: simulation events, incident open/close lines and lending events. */
export const LogConsole: React.FC<{ logs: MonitorLog[]; limit: number }> = ({ logs, limit }) => {
  const [source, setSource] = useState<(typeof SOURCES)[number]>('all');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [q, setQ] = useState('');

  const rows = useMemo(() => logs.filter((l) =>
    (source === 'all' || l.source === source) && (!problemsOnly || l.level !== 'info')
    && (q === '' || l.text.toLowerCase().includes(q.toLowerCase())),
  ), [logs, source, problemsOnly, q]);

  return (
    <div className={CARD} data-testid="log-console">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Terminal size={15} className="text-slate-600" /> Logs
          <span className="text-[11px] font-normal text-slate-500" data-testid="log-count">{rows.length} shown / {logs.length} newest (max {limit} kept)</span>
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {SOURCES.map((s) => (
            <button key={s} data-testid={`log-source-${s}`} onClick={() => setSource(s)}
              className={`px-2 py-0.5 rounded-full border ${source === s ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
              {s}
            </button>
          ))}
          <label className="flex items-center gap-1 px-1.5 text-slate-600">
            <input type="checkbox" data-testid="log-problems-only" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} /> warnings and critical only
          </label>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-slate-300 bg-white">
            <Search size={11} className="text-slate-400" />
            <input data-testid="log-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search" className="w-28 outline-none bg-transparent" />
          </span>
        </div>
      </div>
      <div className="max-h-[360px] overflow-y-auto rounded-xl bg-slate-900 p-2 font-mono text-[11px] leading-relaxed">
        {rows.map((l, k) => (
          <div key={`${l.tick}-${k}`} data-testid="log-line" data-source={l.source} data-level={l.level} className="flex gap-2 py-0.5 border-b border-slate-800/70 last:border-0">
            <span className="text-slate-500 whitespace-nowrap">ep {l.episode} · {String(l.step ?? '-').padStart(3, ' ')}</span>
            <span className={`whitespace-nowrap font-bold ${LEVEL_CLS[l.level] ?? 'text-slate-300'}`}>{LEVEL_TAG[l.level] ?? l.level}</span>
            <span className="text-sky-300 whitespace-nowrap">{l.source}</span>
            <span className="text-slate-100 break-words min-w-0">{l.text}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="text-slate-400 py-4 text-center">No log lines match these filters.</div>}
      </div>
    </div>
  );
};
