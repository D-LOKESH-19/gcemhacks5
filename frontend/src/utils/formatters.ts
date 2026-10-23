/**
 * 5G Slicing Suite - Metric & Status Formatters
 * Strict adherence to FRONTEND_GUIDE.md:
 * - Proper number formatting with thousands separators (EF-4)
 * - Safe null/undefined fallback to "-" (EF-3)
 */

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(decimals)}%`;
}

export function formatRatio(value: number | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || isNaN(value)) {
    return "-";
  }
  return value.toFixed(decimals);
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || isNaN(ms)) {
    return "-";
  }
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)} µs`;
  }
  return `${ms.toFixed(2)} ms`;
}

export function formatPackets(count: number | null | undefined): string {
  if (count === null || count === undefined || isNaN(count)) {
    return "-";
  }
  return Math.round(count).toLocaleString();
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) {
    return "-";
  }
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return "-";
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
