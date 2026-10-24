import React, { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Landmark, RefreshCw } from 'lucide-react';
import { LendingResultRow, LendingResultsResponse } from '../../types/api';
import { HONESTY_RISK, HONESTY_SIM, POLICY_ENHANCED_COLOR } from '../lending/lendingUtils';

const SCEN: Record<string, string> = {
  steady: 'Steady', embb_surge: 'eMBB surge', urllc_burst: 'URLLC burst', murllc_storm: 'mURLLC storm',
  'bots_0.3x': 'Bots 0.3x', 'bots_1.0x': 'Bots 1.0x', 'bots_3.0x': 'Bots 3.0x', 'bots_5.0x': 'Bots 5.0x',
};
const METRIC: Record<string, string> = {
  viol_total: 'URLLC+mURLLC violated packets', onset_viol_total: 'Onset-window violated packets (first 3 steps of a burst)',
  embb_ratio: 'eMBB served ratio', util: 'Utilization', win_comp_um: 'URLLC/mURLLC window compliance',
};
const BASELINE: Record<string, string> = {
  agent_shield: 'original Agent + Shield', enhanced_reactive: 'Enhanced reactive', enhanced_no_return: 'Enhanced without returns',
  enhanced_radio_only: 'Enhanced radio-only', heuristic_shield: 'Heuristic + Shield', static: 'Static',
};
const SLICE_LINE: Record<string, string> = { all: '#0F172A', embb: '#22D3EE', urllc: '#F59E0B', murllc: '#A78BFA' };

const num = (x: number | null | undefined, d = 4) => (x === null || x === undefined || Number.isNaN(x) ? 'n/a' : x.toFixed(d));
const ci = (r: { improvement: number; ci_lo: number; ci_hi: number }, d = 4) => `${num(r.improvement, d)} [${num(r.ci_lo, d)}, ${num(r.ci_hi, d)}]`;

const Verdict: React.FC<{ v: string }> = ({ v }) => {
  const cls = v.startsWith('better (') ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
    : v.startsWith('worse (') ? 'bg-rose-50 text-rose-700 border-rose-300'
    : v.includes('negligible') ? 'bg-amber-50 text-amber-700 border-amber-300'
    : 'bg-slate-100 text-slate-700 border-slate-300';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>{v}</span>;
};

const Table: React.FC<{ head: string[]; children: React.ReactNode; testid?: string }> = ({ head, children, testid }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white" data-testid={testid}>
    <table className="w-full text-[11px]">
      <thead className="bg-slate-100 text-slate-600">
        <tr>{head.map((h) => <th key={h} className="text-left px-2 py-1.5 whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

export const LendingResultsSection: React.FC = () => {
  const [data, setData] = useState<LendingResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch('/api/lending/results')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((j) => { setData(j); setLoading(false); })
      .catch((e) => { setError(e.message || 'Failed to load lending results'); setLoading(false); });
  };
  useEffect(load, []);

  const paired = (data?.paired ?? []) as LendingResultRow[];
  const vsAgent = paired.filter((r) => r.baseline === 'agent_shield' && ['viol_total', 'onset_viol_total', 'embb_ratio', 'util'].includes(r.metric));
  const ablations = paired.filter((r) => ['enhanced_reactive', 'enhanced_no_return', 'enhanced_radio_only'].includes(r.baseline) && ['onset_viol_total', 'embb_ratio', 'util'].includes(r.metric));
  const hl = data?.headline_rows ?? [];
  const violRow = hl.find((r) => r.metric === 'viol_total' && r.baseline === 'agent_shield');

  const takeaway = useMemo(() => {
    if (!violRow) return '';
    if (violRow.ci_lo > 0) return `On the held-out seeds Enhanced avoided ${num(violRow.improvement)} URLLC+mURLLC violated packets per seed relative to the original Agent + Shield (95% interval ${num(violRow.ci_lo)} to ${num(violRow.ci_hi)}).`;
    if (violRow.ci_hi < 0) return `On the held-out seeds Enhanced had more violations than the original Agent + Shield (${num(violRow.improvement)} per seed, interval ${num(violRow.ci_lo)} to ${num(violRow.ci_hi)}).`;
    return `On the held-out seeds Enhanced did not reduce URLLC+mURLLC violations relative to the original Agent + Shield: ${num(violRow.enhanced)} versus ${num(violRow.baseline_value)} violated packets per seed (difference ${ci(violRow)}). The original agent is already close to zero violations here, so there is little left to avoid.`;
  }, [violRow]);

  const reliability = useMemo(() => {
    const rows = (data?.reliability ?? []).filter((r) => r.mean_predicted !== null && r.observed_freq !== null);
    const grid = Array.from({ length: 10 }, (_, b) => ({ bin: (b + 0.5) / 10, 'Perfect calibration': (b + 0.5) / 10 } as Record<string, number>));
    rows.forEach((r) => {
      const b = Math.min(9, Math.floor(((r.bin_lo + r.bin_hi) / 2) * 10));
      grid[b][`pred_${r.slice}`] = r.observed_freq as number;
    });
    return grid;
  }, [data]);

  return (
    <section className="p-4 rounded-xl bg-bg-card border-2 shadow-sm space-y-4" style={{ borderColor: POLICY_ENHANCED_COLOR }} data-testid="lending-results">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Landmark size={18} style={{ color: POLICY_ENHANCED_COLOR }} />
            <h2 className="text-base font-bold text-text-primary tracking-tight">Innovation: predictive lending</h2>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Every number below is read from the backend (results/lending_*.csv). Paired per seed, 95% bootstrap intervals. {HONESTY_RISK} {HONESTY_SIM}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-white">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && <p className="text-xs text-text-muted">Loading lending results...</p>}
      {!loading && error && <p className="text-xs text-rose-600 font-mono" data-testid="lending-results-error">Unable to load lending results: {error}</p>}
      {!loading && !error && data && !data.available && <p className="text-xs text-slate-600" data-testid="lending-results-missing">{data.message}</p>}

      {!loading && !error && data?.available && (
        <>
          <div className="p-3 rounded-xl bg-pink-50/60 border border-pink-200 text-xs text-slate-800" data-testid="lending-takeaway">
            <p className="font-semibold">{takeaway}</p>
            <p className="mt-1 text-slate-600">
              Evaluation seeds {data.seeds?.evaluation_seeds[0]} to {data.seeds?.evaluation_seeds[data.seeds.evaluation_seeds.length - 1]}; thresholds were tuned on separate
              validation seeds {data.seeds?.validation_seeds[0]} to {data.seeds?.validation_seeds[data.seeds.validation_seeds.length - 1]} (the grid was flat, so the defaults were kept).
              Headline numbers use feasible scenarios only; overload ({(data.headline?.overload_scenarios ?? []).map((s) => SCEN[s] ?? s).join(', ')}) is reported separately and claims only that URLLC and mURLLC are protected first.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold text-text-primary mb-1">Headline, feasible scenarios (improvement above 0 means Enhanced is better)</h3>
            <Table head={['Versus', 'Metric', 'Enhanced', 'Baseline', 'Improvement [95% CI]', 'Verdict']} testid="lending-headline-table">
              {hl.map((r) => (
                <tr key={`${r.baseline}-${r.metric}`} className="border-t border-slate-100">
                  <td className="px-2 py-1">{BASELINE[r.baseline] ?? r.baseline}</td>
                  <td className="px-2 py-1">{METRIC[r.metric] ?? r.metric}</td>
                  <td className="px-2 py-1 font-mono">{num(r.enhanced)}</td>
                  <td className="px-2 py-1 font-mono">{num(r.baseline_value)}</td>
                  <td className="px-2 py-1 font-mono whitespace-nowrap">{ci(r)}</td>
                  <td className="px-2 py-1"><Verdict v={r.verdict} /></td>
                </tr>
              ))}
            </Table>
          </div>

          <div>
            <h3 className="text-xs font-bold text-text-primary mb-1">Enhanced versus the original Agent + Shield, per scenario (paired over seeds)</h3>
            <Table head={['Scenario', 'Regime', 'Metric', 'Agent', 'Enhanced', 'Improvement [95% CI]', 'Seeds differing', 'Verdict']} testid="lending-paired-table">
              {vsAgent.map((r) => (
                <tr key={`${r.scenario}-${r.metric}`} className="border-t border-slate-100">
                  <td className="px-2 py-1">{SCEN[r.scenario] ?? r.scenario}</td>
                  <td className="px-2 py-1">{r.regime}</td>
                  <td className="px-2 py-1">{METRIC[r.metric] ?? r.metric}</td>
                  <td className="px-2 py-1 font-mono">{num(r.baseline_mean)}</td>
                  <td className="px-2 py-1 font-mono">{num(r.comparator_mean)}</td>
                  <td className="px-2 py-1 font-mono whitespace-nowrap">{ci(r)}</td>
                  <td className="px-2 py-1 font-mono">{r.n_nonzero}/{r.n_seeds}</td>
                  <td className="px-2 py-1"><Verdict v={r.verdict} /></td>
                </tr>
              ))}
            </Table>
          </div>

          <div>
            <h3 className="text-xs font-bold text-text-primary mb-1">Predictive versus reactive, and ablations (Enhanced minus variant; above 0 means predictive full version is better)</h3>
            <Table head={['Scenario', 'Variant', 'Metric', 'Difference [95% CI]', 'Verdict']} testid="lending-ablation-table">
              {ablations.filter((r) => r.n_nonzero > 0).map((r) => (
                <tr key={`${r.scenario}-${r.baseline}-${r.metric}`} className="border-t border-slate-100">
                  <td className="px-2 py-1">{SCEN[r.scenario] ?? r.scenario}</td>
                  <td className="px-2 py-1">{BASELINE[r.baseline]}</td>
                  <td className="px-2 py-1">{METRIC[r.metric]}</td>
                  <td className="px-2 py-1 font-mono whitespace-nowrap">{ci(r, 5)}</td>
                  <td className="px-2 py-1"><Verdict v={r.verdict} /></td>
                </tr>
              ))}
            </Table>
            <p className="text-[10px] text-slate-500 mt-1" data-testid="ablation-note">
              Rows with no difference on any seed are omitted here ({ablations.filter((r) => r.n_nonzero === 0).length} of {ablations.length} comparisons are identical on every seed); they are all in results/lending_paired.csv.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div data-testid="lending-calibration">
              <h3 className="text-xs font-bold text-text-primary mb-1">Predictor calibration on held-out seeds</h3>
              <div className="h-[260px] rounded-xl bg-white border border-slate-200 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={reliability} margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="bin" type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={10} label={{ value: 'predicted risk (bin)', position: 'insideBottom', offset: -8, fontSize: 10 }} />
                    <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} fontSize={10} width={40} />
                    <Tooltip formatter={(v: any) => `${(Number(v) * 100).toFixed(1)}%`} labelFormatter={(l) => `predicted ~${Math.round(Number(l) * 100)}%`} />
                    <Legend verticalAlign="top" wrapperStyle={{ fontSize: 10 }} />
                    <Line dataKey="Perfect calibration" stroke="#94A3B8" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    {(['all', 'embb', 'urllc', 'murllc'] as const).map((s) => (
                      <Line key={s} dataKey={`pred_${s}`} name={s === 'all' ? 'all slices' : s === 'embb' ? 'eMBB' : s === 'urllc' ? 'URLLC' : 'mURLLC'}
                        stroke={SLICE_LINE[s]} strokeWidth={s === 'all' ? 2.5 : 1.5} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Observed frequency of an SLA miss at the next step, per predicted-risk bin. Below the diagonal means the risk estimate is conservative.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-xs font-bold text-text-primary mb-1">Predictor quality</h3>
                <Table head={['Slice', 'Brier', 'Constant-rate Brier', 'AUC', 'ECE', 'Forecast MAE', 'Naive MAE']} testid="lending-predictor-table">
                  {[{ slice: 'all', ...data.predictor?.overall } as Record<string, any>, ...((data.predictor?.by_slice ?? []) as Array<Record<string, any>>)].map((r) => (
                    <tr key={String(r.slice)} className="border-t border-slate-100">
                      <td className="px-2 py-1 font-semibold">{String(r.slice)}</td>
                      <td className="px-2 py-1 font-mono">{num(r.brier, 5)}</td>
                      <td className="px-2 py-1 font-mono">{num(r.brier_constant, 5)}</td>
                      <td className="px-2 py-1 font-mono">{num(r.auc, 4)}</td>
                      <td className="px-2 py-1 font-mono">{num(r.ece, 4)}</td>
                      <td className="px-2 py-1 font-mono">{num(r.mae_forecast, 2)}</td>
                      <td className="px-2 py-1 font-mono">{num(r.mae_naive, 2)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
              <div>
                <h3 className="text-xs font-bold text-text-primary mb-1">Loan statistics (Enhanced, mean per episode)</h3>
                <Table head={['Scenario', 'Loans', 'Mean amount', 'Mean duration', 'Return lag', 'Recalls', 'Time in overload']} testid="lending-loans-table">
                  {(data.loans ?? []).filter((r) => r.policy === 'enhanced').map((r) => (
                    <tr key={String(r.scenario)} className="border-t border-slate-100">
                      <td className="px-2 py-1">{SCEN[String(r.scenario)] ?? String(r.scenario)}{r.regime === 'overload' ? ' [overload]' : ''}</td>
                      <td className="px-2 py-1 font-mono">{num(Number(r.loans_opened), 2)}</td>
                      <td className="px-2 py-1 font-mono">{num(Number(r.loans_mean_amount), 3)}</td>
                      <td className="px-2 py-1 font-mono">{num(Number(r.loans_mean_duration), 1)} steps</td>
                      <td className="px-2 py-1 font-mono">{num(Number(r.loans_mean_return_lag), 1)} steps</td>
                      <td className="px-2 py-1 font-mono">{num(Number(r.loans_recalls), 2)}</td>
                      <td className="px-2 py-1 font-mono">{(Number(r.overload_frac) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
};
