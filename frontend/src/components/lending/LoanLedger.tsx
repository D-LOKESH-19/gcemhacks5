import React, { useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { LedgerEntry, LoanEventKind, SliceType } from '../../types/api';
import { useSliceStore } from '../../store/useSliceStore';
import { SLICE_META, SLICES, fmtUnits } from './lendingUtils';

const KINDS: LoanEventKind[] = ['opened', 'enlarged', 'returned', 'recalled', 'expired'];
const KIND_STYLE: Record<LoanEventKind, string> = {
  opened: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  enlarged: 'bg-sky-50 text-sky-700 border-sky-300',
  returned: 'bg-slate-100 text-slate-700 border-slate-300',
  recalled: 'bg-rose-50 text-rose-700 border-rose-300',
  expired: 'bg-amber-50 text-amber-700 border-amber-300',
};

/** Loan ledger built only from streamed loan events (capped at 200 entries in the store). */
export const LoanLedger: React.FC = () => {
  const ledger = useSliceStore((s) => s.lendingLedger) as LedgerEntry[];
  const [kind, setKind] = useState<LoanEventKind | 'all'>('all');
  const [slice, setSlice] = useState<SliceType | 'all'>('all');

  const rows = useMemo(
    () =>
      [...ledger]
        .reverse()
        .filter((e) => (kind === 'all' || e.kind === kind) && (slice === 'all' || e.donor === slice || e.borrower === slice)),
    [ledger, kind, slice]
  );

  return (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80" data-testid="loan-ledger">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <ScrollText size={14} className="text-slate-600" /> Loan ledger
          <span className="font-mono text-[10px] text-slate-500 font-normal" data-testid="ledger-count">
            {rows.length} shown / {ledger.length} kept (max 200)
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {(['all', ...KINDS] as const).map((k) => (
            <button
              key={k}
              data-testid={`ledger-filter-${k}`}
              onClick={() => setKind(k)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${kind === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'}`}
            >
              {k}
            </button>
          ))}
          <select
            value={slice}
            onChange={(e) => setSlice(e.target.value as SliceType | 'all')}
            data-testid="ledger-filter-slice"
            className="px-1.5 py-0.5 rounded-lg text-[10px] border border-slate-300 bg-white text-slate-700"
            aria-label="Filter ledger by slice"
          >
            <option value="all">all slices</option>
            {SLICES.map((s) => (
              <option key={s} value={s}>{SLICE_META[s].name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-[11px] text-slate-500">No loan events yet. Entries appear when the lender opens, enlarges, returns, recalls or expires a loan.</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left px-2 py-1">Step</th>
                <th className="text-left px-2 py-1">Event</th>
                <th className="text-left px-2 py-1">Resource</th>
                <th className="text-left px-2 py-1">Donor → borrower</th>
                <th className="text-right px-2 py-1">Amount</th>
                <th className="text-left px-2 py-1">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={`${e.loan_id}-${e.step}-${e.kind}-${e.resource}-${i}`} className="border-t border-slate-100" data-testid="ledger-row" data-kind={e.kind}>
                  <td className="px-2 py-1 font-mono">{e.step}</td>
                  <td className="px-2 py-1"><span className={`px-1.5 py-0.5 rounded-full border font-semibold ${KIND_STYLE[e.kind]}`}>{e.kind}</span></td>
                  <td className="px-2 py-1">{e.resource === 'prb' ? 'PRB' : 'vCPU'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{SLICE_META[e.donor].name} → {SLICE_META[e.borrower].name}</td>
                  <td className="px-2 py-1 text-right font-mono">{fmtUnits(e.amount_units, e.resource)}</td>
                  <td className="px-2 py-1 text-slate-600">{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
