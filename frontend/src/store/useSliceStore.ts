import { create } from 'zustand';
import {
  TelemetryPayload,
  Capabilities,
  PublicConfig,
  ConnectionStatus,
  ChartSeriesPoint,
  DecisionRecord,
} from '../types/api';

const MAX_RING_BUFFER = 300;
const MAX_FEED_ITEMS = 200;

export interface SpikeMarker {
  step: number;
  slice: string;
  factor: number;
  duration: number;
}

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

interface SliceState {
  // Connection & Core Telemetry
  connectionStatus: ConnectionStatus;
  latestPayload: TelemetryPayload | null;
  capabilities: Capabilities | null;
  publicConfig: PublicConfig | null;

  // Ring buffers for Recharts (strictly capped at 300 points)
  violationHistory: ChartSeriesPoint[];
  throughputHistory: ChartSeriesPoint[];
  agentSharesHistory: Array<{
    step: number;
    embb_prb: number;
    urllc_prb: number;
    murllc_prb: number;
    embb_vcpu: number;
    urllc_vcpu: number;
    murllc_vcpu: number;
  }>;
  trafficArrivalsHistory: Array<{
    step: number;
    embb: number;
    urllc: number;
    murllc: number;
    total: number;
  }>;
  shieldInterventionHistory: Array<{
    step: number;
    rate_20: number;
  }>;

  // Event feed & Decision audit table
  eventFeed: string[];
  decisionHistory: DecisionRecord[];
  spikeMarkers: SpikeMarker[];

  // App & presenter UI states
  isPresenterMode: boolean;
  toasts: ToastMessage[];

  // Actions
  setConnectionStatus: (status: ConnectionStatus) => void;
  setCapabilities: (caps: Capabilities) => void;
  setPublicConfig: (cfg: PublicConfig) => void;
  processTelemetry: (data: TelemetryPayload) => void;
  addSpikeMarker: (marker: SpikeMarker) => void;
  togglePresenterMode: () => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  resetTelemetryBuffers: () => void;
}

let toastSeq = 0;

export const useSliceStore = create<SliceState>((set) => ({
  connectionStatus: 'connecting' as ConnectionStatus,
  latestPayload: null,
  capabilities: null,
  publicConfig: null,

  violationHistory: [],
  throughputHistory: [],
  agentSharesHistory: [],
  trafficArrivalsHistory: [],
  shieldInterventionHistory: [],

  eventFeed: [],
  decisionHistory: [],
  spikeMarkers: [],

  isPresenterMode: false,
  toasts: [],

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setCapabilities: (caps) => set({ capabilities: caps }),
  setPublicConfig: (cfg) => set({ publicConfig: cfg }),

  togglePresenterMode: () => set((state) => ({ isPresenterMode: !state.isPresenterMode })),

  addToast: (toast) => {
    toastSeq = (toastSeq + 1) % 1000000;
    const id = `toast-${Date.now()}-${toastSeq}`;
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { ...toast, id }],
    }));
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  addSpikeMarker: (marker) =>
    set((state) => ({
      spikeMarkers: [...state.spikeMarkers.slice(-10), marker],
    })),

  resetTelemetryBuffers: () =>
    set({
      violationHistory: [],
      throughputHistory: [],
      agentSharesHistory: [],
      trafficArrivalsHistory: [],
      shieldInterventionHistory: [],
      decisionHistory: [],
      eventFeed: ['Simulation reset. Traffic baseline active.'],
      spikeMarkers: [],
    }),

  processTelemetry: (data: TelemetryPayload) =>
    set((state) => {
      const step = data.step;
      const pols = data.policies;
      const slaLimits = data.sla_limits;

      // 1. Violation point
      const vPoint: ChartSeriesPoint = {
        step,
        static: pols.static ? pols.static.violation_rate : 0,
        heuristic: pols.heuristic ? pols.heuristic.violation_rate : 0,
        agent: pols.agent ? pols.agent.violation_rate : 0,
        slaLimit: slaLimits && slaLimits.urllc ? slaLimits.urllc.max_violation_rate : 0.005,
      };

      // 2. Throughput / Served ratio point
      const tPoint: ChartSeriesPoint = {
        step,
        static: pols.static ? pols.static.throughput.embb : 0,
        heuristic: pols.heuristic ? pols.heuristic.throughput.embb : 0,
        agent: pols.agent ? pols.agent.throughput.embb : 0,
      };

      // 3. Agent PRB/vCPU shares
      const agentShares = pols.agent ? pols.agent.shares : null;
      const sharePoint = {
        step,
        embb_prb: agentShares ? agentShares.prb.embb : 0.6,
        urllc_prb: agentShares ? agentShares.prb.urllc : 0.25,
        murllc_prb: agentShares ? agentShares.prb.murllc : 0.15,
        embb_vcpu: agentShares ? agentShares.vcpu.embb : 0.5,
        urllc_vcpu: agentShares ? agentShares.vcpu.urllc : 0.25,
        murllc_vcpu: agentShares ? agentShares.vcpu.murllc : 0.25,
      };

      // 4. Traffic arrivals point
      const arrivals = data.audit ? data.audit.arrivals : (pols.agent.arrivals || { embb: 0, urllc: 0, murllc: 0 });
      const trafficPoint = {
        step,
        embb: arrivals.embb || 0,
        urllc: arrivals.urllc || 0,
        murllc: arrivals.murllc || 0,
        total: (arrivals.embb || 0) + (arrivals.urllc || 0) + (arrivals.murllc || 0),
      };

      // 5. Shield intervention rate point
      const shieldData = pols.agent && pols.agent.shield ? pols.agent.shield : null;
      const interventionRate = shieldData
        ? shieldData.intervention_rate_20
        : (data.audit ? data.audit.shield_rate_20 : 0);
      const shieldPoint = {
        step,
        rate_20: interventionRate,
      };

      // Append ring buffers with strict 300-point bounds
      const nextViol = [...state.violationHistory, vPoint];
      if (nextViol.length > MAX_RING_BUFFER) nextViol.shift();

      const nextThru = [...state.throughputHistory, tPoint];
      if (nextThru.length > MAX_RING_BUFFER) nextThru.shift();

      const nextShares = [...state.agentSharesHistory, sharePoint];
      if (nextShares.length > MAX_RING_BUFFER) nextShares.shift();

      const nextTraffic = [...state.trafficArrivalsHistory, trafficPoint];
      if (nextTraffic.length > MAX_RING_BUFFER) nextTraffic.shift();

      const nextShield = [...state.shieldInterventionHistory, shieldPoint];
      if (nextShield.length > MAX_RING_BUFFER) nextShield.shift();

      // Process event feed (max 200 items, collapsing consecutive duplicates)
      let nextFeed = state.eventFeed;
      if (data.event_logs && data.event_logs.length > 0) {
        const newLogs = data.event_logs.filter((log) => !state.eventFeed.includes(log));
        if (newLogs.length > 0) {
          nextFeed = [...state.eventFeed, ...newLogs];
          if (nextFeed.length > MAX_FEED_ITEMS) {
            nextFeed = nextFeed.slice(nextFeed.length - MAX_FEED_ITEMS);
          }
        }
      }

      // Process decision history
      let nextDecisions = state.decisionHistory;
      if (data.audit && data.audit.latest_decision) {
        const d = data.audit.latest_decision;
        if (!state.decisionHistory.some((item) => item.step === d.step)) {
          nextDecisions = [...state.decisionHistory, d];
          if (nextDecisions.length > 50) nextDecisions.shift();
        }
      }

      return {
        latestPayload: data,
        violationHistory: nextViol,
        throughputHistory: nextThru,
        agentSharesHistory: nextShares,
        trafficArrivalsHistory: nextTraffic,
        shieldInterventionHistory: nextShield,
        eventFeed: nextFeed,
        decisionHistory: nextDecisions,
      };
    }),
}));
