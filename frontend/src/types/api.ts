/**
 * TypeScript API and Telemetry Stream definitions.
 * Derived from real payloads captured in stream_sample.json and config.yaml.
 */

export type SliceType = 'embb' | 'urllc' | 'murllc';
export type PolicyType = 'static' | 'heuristic' | 'agent';
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
  };
  policies: {
    static: PolicyTelemetry;
    heuristic: PolicyTelemetry;
    agent: PolicyTelemetry;
  };
  scoreboard: {
    static: ScoreboardPolicyStat;
    heuristic: ScoreboardPolicyStat;
    agent: ScoreboardPolicyStat;
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
  slaLimit?: number;
}
