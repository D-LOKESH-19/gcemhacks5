/**
 * TypeScript API and Telemetry Stream definitions.
 * Derived from real payloads captured in stream_sample.json and config.yaml.
 */

export type SliceType = 'embb' | 'urllc' | 'murllc';
export type PolicyType = 'static' | 'heuristic' | 'agent' | 'enhanced';
export type SlaStatusType = 'ok' | 'amber' | 'breach' | 'none';
export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export interface SlaLimits {
  window_steps: number;
  embb: { min_served_ratio: number };
  urllc: { max_violation_rate: number; max_window_violation: number };
  murllc: { max_violation_rate: number; max_window_violation: number };
  feasible_load_fraction?: number;
  amber_fraction?: number;
}

export interface BotCounts {
  embb: number;
  urllc: number;
  murllc: number;
}

export interface LocationBotMatrix {
  campus: BotCounts;
  factory: BotCounts;
  smart_city: BotCounts;
  [location: string]: BotCounts;
}

export interface SlaSliceDetail {
  status: SlaStatusType;
  value: number;
  limit: number;
  metric: string;
}

export interface PolicySlaWindow {
  embb: SlaSliceDetail;
  urllc: SlaSliceDetail;
  murllc: SlaSliceDetail;
}

export interface PolicyShares {
  prb: { embb: number; urllc: number; murllc: number };
  vcpu: { embb: number; urllc: number; murllc: number };
}

export interface ShieldTelemetry {
  active: boolean;
  changed: boolean;
  delta_pct: number;
  intervention_rate_20: number;
}

export interface PolicyTelemetry {
  throughput: { embb: number; urllc: number; murllc: number };
  violations: { embb: number; urllc: number; murllc: number };
  violation_rate: number;
  shares: PolicyShares;
  queue: { embb: number; urllc: number; murllc: number };
  arrivals?: { embb: number; urllc: number; murllc: number };
  lambda?: number;
  shield_active?: boolean;
  shield?: ShieldTelemetry;
  sla: PolicySlaWindow;
  est_delay_ms?: { embb: number; urllc: number; murllc: number };
  bots_by_location?: LocationBotMatrix;
  feasible?: boolean;
  sla_ok?: boolean;
  allocation?: AllocationBlock;
}

export type BottleneckType = 'none' | 'radio' | 'compute' | 'both' | 'idle';
export type TransferReasonCode = 'surge' | 'idle_harvest' | 'floor_restore' | 'rebalance';

export interface ResourcePoolAllocation {
  raw: [number, number, number];
  final: [number, number, number];
  prev: [number, number, number];
  counts: [number, number, number];
  capacity: [number, number, number];
  util: [number, number, number];
  floor: [number, number, number];
}

export interface ResourceTransfer {
  resource: 'prb' | 'cpu';
  from: SliceType;
  to: SliceType;
  amount: number;
  reason_code: TransferReasonCode;
  donor_util: number;
  receiver_util: number;
}

export interface AllocationBlock {
  prb: ResourcePoolAllocation;
  cpu: ResourcePoolAllocation;
  effective_capacity: [number, number, number];
  bottleneck: [BottleneckType, BottleneckType, BottleneckType];
  shield: {
    changed: boolean;
    delta_pct: [number, number, number];
  };
  transfers: ResourceTransfer[];
  lending?: LendingBlock;
}

/* ---------- Predictive lending (LENDING_SPEC section 8); every value comes from the backend ---------- */
export type LoanEventKind = 'opened' | 'enlarged' | 'returned' | 'recalled' | 'expired';
export type Triple = [number, number, number];

export interface LoanRecord {
  id: number;
  resource: 'prb' | 'cpu';
  donor: SliceType;
  borrower: SliceType;
  amount: number;
  amount_units: number;
  opened_step: number;
  ttl: number;
  reason_code: string;
  risk_at_open: number;
}

export interface LoanEvent {
  kind: LoanEventKind;
  step: number;
  loan_id: number;
  resource: 'prb' | 'cpu';
  donor: SliceType;
  borrower: SliceType;
  amount: number;
  amount_units: number;
  reason: string;
}

export interface LedgerEntry extends LoanEvent {
  seen_step: number;   // stream step at which the event arrived
}

export interface LendingBlock {
  mode: 'predictive' | 'reactive' | 'off' | string;
  available?: boolean;
  thresholds?: { high: number; low: number; recall: number };
  risk?: Triple;
  risk_after?: Triple;
  forecast?: Triple;
  margin?: Triple;
  headroom?: Triple;
  warming_up?: boolean;
  loans_active?: LoanRecord[];
  loans_events?: LoanEvent[];
  messages?: string[];
  overload_notes?: string[];
  lent?: { prb: Triple; cpu: Triple };
  overload?: boolean;
  unfunded?: { prb: Triple; cpu: Triple };
  pipeline?: {
    raw: { prb: Triple; cpu: Triple } | null;
    post_lender: { prb: Triple; cpu: Triple } | null;
    final: { prb: Triple; cpu: Triple } | null;
  };
}

export interface LendingResultRow {
  scenario: string;
  regime: 'feasible' | 'overload';
  baseline: string;
  comparator: string;
  metric: string;
  baseline_mean: number;
  comparator_mean: number;
  improvement: number;
  ci_lo: number;
  ci_hi: number;
  n_seeds: number;
  n_nonzero: number;
  verdict: string;
}

export interface LendingHeadlineRow {
  metric: string;
  baseline: string;
  enhanced: number;
  baseline_value: number;
  improvement: number;
  ci_lo: number;
  ci_hi: number;
  verdict: string;
}

export interface LendingResultsResponse {
  available: boolean;
  message?: string;
  seeds?: { validation_seeds: number[]; evaluation_seeds: number[] };
  tuning?: { chosen: Record<string, number>; defaults: Record<string, number> };
  regime?: Record<string, 'feasible' | 'overload'>;
  headline?: { feasible_scenarios: string[]; overload_scenarios: string[]; n_seeds: number };
  headline_rows?: LendingHeadlineRow[];
  paired?: LendingResultRow[];
  loans?: Array<Record<string, string | number>>;
  predictor?: { overall: Record<string, number>; by_slice: Array<Record<string, string | number>> };
  reliability?: Array<{ slice: string; bin_lo: number; bin_hi: number; n: number; mean_predicted: number | null; observed_freq: number | null }>;
}

export interface DecisionRecord {
  step: number;
  shield_active: boolean;
  raw_prb: { embb: number; urllc: number; murllc: number };
  shielded_prb: { embb: number; urllc: number; murllc: number };
  arrivals: { embb: number; urllc: number; murllc: number };
  inference_ms: number;
  sla_ok: boolean;
  reason: string;
}

export interface AuditBlock {
  live_engine: string;
  inference_ms: number;
  seed: number;
  step_idx: number;
  raw_prb: { embb: number; urllc: number; murllc: number };
  shielded_prb: { embb: number; urllc: number; murllc: number };
  shield_active: boolean;
  shield_changed?: boolean;
  shield_delta_pct?: number;
  shield_rate_20: number;
  total_arrivals: number;
  total_capacity: number;
  load_pct: number;
  arrivals: { embb: number; urllc: number; murllc: number };
  latest_decision?: DecisionRecord;
}

export interface ScoreboardPolicyStat {
  cum_violations: number;
  cum_violation_rate: number;
  mean_embb_ratio: number;
}

export interface TelemetryPayload {
  step: number;
  scenario: string;
  paused: boolean;
  feasible: boolean;
  sla_limits: SlaLimits;
  cost_limit: number;
  bots: BotCounts;
  bots_by_location: LocationBotMatrix;
  audit: AuditBlock;
  est_delay_ms: {
    static: { embb: number; urllc: number; murllc: number };
    heuristic: { embb: number; urllc: number; murllc: number };
    agent: { embb: number; urllc: number; murllc: number };
    enhanced?: { embb: number; urllc: number; murllc: number };
  };
  policies: {
    static: PolicyTelemetry;
    heuristic: PolicyTelemetry;
    agent: PolicyTelemetry;
    enhanced?: PolicyTelemetry;
  };
  scoreboard: {
    static: ScoreboardPolicyStat;
    heuristic: ScoreboardPolicyStat;
    agent: ScoreboardPolicyStat;
    enhanced?: ScoreboardPolicyStat;
  };
  bot_packets?: Record<string, number>;
  event_logs?: string[];
}

export interface Capabilities {
  bots: boolean;
  sla: boolean;
  locations: boolean;
  training_log: boolean;
  results: boolean;
  delay: boolean;
  allocation?: boolean;
  lending?: boolean;
}

export interface PublicConfig {
  slices: SliceType[];
  sla: SlaLimits;
  cmdp: {
    limits: { embb_shortfall: number; urllc: number; murllc: number };
    lambda_init: number;
    lambda_max: number;
    lagrange_lr: number;
    dual_mode: string;
  };
  spike_factor: {
    embb: number;
    urllc: number;
    murllc: number;
  };
  bots: {
    default_count: BotCounts;
    max_count: BotCounts;
    per_bot_mean?: BotCounts;
  };
  locations: Record<string, { label: string; default_slice: SliceType }>;
  delay_model: {
    base_ms: { embb: number; urllc: number; murllc: number };
    rho_cap: number;
    overload_ms: number;
  };
  shield_floor: { urllc: number; murllc: number };
  cost_limit: number;
  prb_total: number;
  vcpu_total: number;
}

export interface TrainingLogEntry {
  episode: number;
  reward: number;
  cost_urllc: number;
  cost_murllc: number;
  cost_embb: number;
  lambda_urllc: number;
  lambda_murllc: number;
  lambda_embb: number;
  feasible_fraction: number;
}

export interface TrainingLogResponse {
  log: TrainingLogEntry[];
  metadata: {
    seed: number;
    timesteps: number;
    file_date: string;
    selected_checkpoint: string;
    final_reward?: number;
    final_lambdas?: { urllc: number; murllc: number; embb: number };
    final_costs?: { urllc: number; murllc: number; embb: number };
    final_feasible_fraction?: number;
  };
  total_records?: number;
}

export interface ResultsHeadline {
  static_violations_cut_pct: number;
  mean_embb_ratio: number;
  total_scenarios: number;
  summary_text: string;
}

export interface ResultsResponse {
  sla_table: Array<Record<string, string | number>>;
  ablation: Array<Record<string, string | number>>;
  evaluation_table: Array<Record<string, string | number>>;
  headline: ResultsHeadline;
}

export interface ChartSeriesPoint {
  step: number;
  static: number;
  heuristic: number;
  agent: number;
  enhanced?: number;
  slaLimit?: number;
}
