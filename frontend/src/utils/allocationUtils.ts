/**
 * Utility functions and selectors for Resource Allocation page (Phase R1).
 * Supports cell flash diffing, transfer ledger burst merging, and scrub buffering.
 */

import { ResourceTransfer, SliceType, TelemetryPayload } from '../types/api';

export interface UnitDiff {
  slice: SliceType;
  delta: number;
  donor: boolean;
  receiver: boolean;
}

export interface MergedTransfer extends ResourceTransfer {
  count: number;
}

const SLICE_ORDER: SliceType[] = ['embb', 'urllc', 'murllc'];

/**
 * Computes integer diff between previous and current unit counts.
 * Returns array of diffs per slice for triggering visual animations and flashes.
 */
export function computeCountDiffs(
  prevCounts: [number, number, number],
  currCounts: [number, number, number]
): UnitDiff[] {
  return SLICE_ORDER.map((slice, i) => {
    const delta = currCounts[i] - prevCounts[i];
    return {
      slice,
      delta,
      donor: delta < 0,
      receiver: delta > 0,
    };
  });
}

/**
 * Merges repeated burst transfers into a single item with a count multiplier ('xN').
 */
export function mergeBurstTransfers(transfers: ResourceTransfer[]): MergedTransfer[] {
  if (!transfers || transfers.length === 0) {
    return [];
  }

  const merged: MergedTransfer[] = [];

  for (const t of transfers) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.resource === t.resource &&
      last.from === t.from &&
      last.to === t.to &&
      last.amount === t.amount &&
      last.reason_code === t.reason_code
    ) {
      last.count += 1;
    } else {
      merged.push({ ...t, count: 1 });
    }
  }

  return merged;
}

/**
 * Extracts replay scrubber frames from telemetry ring buffer.
 * Capped to maxSteps (default 60).
 */
export function extractScrubBuffer(
  history: TelemetryPayload[],
  maxSteps: number = 60
): TelemetryPayload[] {
  if (!history || history.length === 0) {
    return [];
  }
  return history.slice(-maxSteps);
}
