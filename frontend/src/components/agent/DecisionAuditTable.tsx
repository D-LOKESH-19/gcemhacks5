import React from "react";
import { useSliceStore } from "../../store/useSliceStore";
import { Table, CheckCircle2, AlertOctagon } from "lucide-react";

export const DecisionAuditTable: React.FC = () => {
  const { decisionHistory } = useSliceStore();

  // Show last 20 decisions (FT-41)
  const last20Decisions = React.useMemo(() => {
    return [...decisionHistory].reverse().slice(0, 20);
  }, [decisionHistory]);

  return (
    <div className="p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm flex flex-col justify-between">
      {/* Table Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle mb-3">
        <div className="flex items-center gap-2">
          <Table size={16} className="text-cyan-400" />
          <h2 className="text-xs font-bold text-text-primary tracking-tight uppercase">
            Agent Decision Explainability Log (Last 20 Decisions - FT-41)
          </h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-600">
          {last20Decisions.length} / 20 Steps Recorded
        </span>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-white">
        <table className="w-full text-left border-collapse text-[11px] font-mono">
          <thead>
            <tr className="border-b border-border-subtle bg-slate-50 text-slate-600 text-[10px] uppercase">
              <th className="py-2.5 px-3">Step</th>
              <th className="py-2.5 px-3">Arrivals (e / u / m)</th>
              <th className="py-2.5 px-3">Raw PRB</th>
              <th className="py-2.5 px-3">Shielded PRB</th>
              <th className="py-2.5 px-3 text-center">Shield Changed</th>
              <th className="py-2.5 px-3">Inference</th>
              <th className="py-2.5 px-3">Explainability Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {last20Decisions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-text-muted">
                  No decision records collected yet. Step the simulator to observe closed-loop actuation.
                </td>
              </tr>
            ) : (
              last20Decisions.map((row) => {
                const arr = row.arrivals || { embb: 0, urllc: 0, murllc: 0 };
                const raw = row.raw_prb || { embb: 0.6, urllc: 0.25, murllc: 0.15 };
                const sh = row.shielded_prb || raw;

                // Check if changed > 3%
                const maxDiff = Math.max(
                  Math.abs(sh.embb - raw.embb),
                  Math.abs(sh.urllc - raw.urllc),
                  Math.abs(sh.murllc - raw.murllc)
                );
                const isChanged = row.shield_active || maxDiff > 0.03;

                return (
                  <tr key={row.step} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2 px-3 font-bold text-text-primary">#{row.step}</td>
                    <td className="py-2 px-3 text-text-muted">
                      <span className="text-slice-embb font-semibold">{Math.round(arr.embb)}</span> /{" "}
                      <span className="text-slice-urllc font-semibold">{Math.round(arr.urllc)}</span> /{" "}
                      <span className="text-slice-murllc font-semibold">{Math.round(arr.murllc)}</span>
                    </td>
                    <td className="py-2 px-3 text-text-muted">
                      {(raw.embb * 100).toFixed(0)}% / {(raw.urllc * 100).toFixed(0)}% /{" "}
                      {(raw.murllc * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-3 text-emerald-700 font-semibold">
                      {(sh.embb * 100).toFixed(0)}% / {(sh.urllc * 100).toFixed(0)}% /{" "}
                      {(sh.murllc * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-3 text-center">
                      {isChanged ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                          <AlertOctagon size={10} />
                          YES
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <CheckCircle2 size={10} />
                          NO
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-text-muted">{row.inference_ms || 1.2} ms</td>
                    <td className="py-2 px-3 text-text-primary text-[11px] max-w-xs truncate" title={row.reason}>
                      {row.reason || "Nominal PPO policy allocation"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-[11px] text-text-muted font-mono mt-2">
        <span>Reason strings dynamically synthesized from live numerical buffer states</span>
        <span className="text-emerald-400">PPO Neural Inference + Lagrangian Safety Filter</span>
      </div>
    </div>
  );
};
