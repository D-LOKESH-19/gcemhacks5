import { LoanRecord, SliceType } from '../../types/api';

export const SLICES: SliceType[] = ['embb', 'urllc', 'murllc'];

export const SLICE_META: Record<SliceType, { name: string; color: string }> = {
  embb: { name: 'eMBB', color: '#22D3EE' },
  urllc: { name: 'URLLC', color: '#F59E0B' },
  murllc: { name: 'mURLLC', color: '#A78BFA' },
};

export const POLICY_ENHANCED_COLOR = '#F472B6';

export const RESOURCE_UNIT: Record<'prb' | 'cpu', string> = { prb: 'PRB', cpu: 'vCPU' };

export const HONESTY_RISK = 'Risk is a forecast from past traffic only.';
export const HONESTY_SIM = 'Slice-level simulator.';

/** Units of a loan shown as whole cells: round, but a loan of at least half a unit shows one cell. */
export function loanCells(amountUnits: number): number {
  if (amountUnits <= 0) return 0;
  return Math.max(Math.round(amountUnits), amountUnits >= 0.5 ? 1 : 0);
}

export interface OnLoanCell {
  donor: SliceType;
  loanId: number;
}

/**
 * Which cells of a contiguous slice-ordered resource grid are on loan. A borrower's loaned cells are the
 * last cells of its own block (one cell per whole unit borrowed); each carries the donor it came from.
 */
export function onLoanCells(
  loans: LoanRecord[] | undefined,
  counts: number[],
  resource: 'prb' | 'cpu'
): Map<number, OnLoanCell> {
  const map = new Map<number, OnLoanCell>();
  if (!loans) return map;
  SLICES.forEach((borrower, b) => {
    const start = counts.slice(0, b).reduce((a, c) => a + c, 0);
    let idx = start + counts[b] - 1;
    let left = counts[b];
    loans
      .filter((l) => l.resource === resource && l.borrower === borrower)
      .sort((x, y) => x.id - y.id)
      .forEach((l) => {
        for (let u = 0; u < loanCells(l.amount_units) && left > 0; u++, idx--, left--) {
          map.set(idx, { donor: l.donor, loanId: l.id });
        }
      });
  });
  return map;
}

export function fmtUnits(units: number, resource: 'prb' | 'cpu'): string {
  return `${units.toFixed(units < 10 ? 2 : 1)} ${RESOURCE_UNIT[resource]}`;
}
