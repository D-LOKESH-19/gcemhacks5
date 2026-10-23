import React from "react";
import { Info, ShieldCheck, Cpu, Layers, GitBranch } from "lucide-react";

export const StoryPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto py-4">
      {/* Intro */}
      <div className="p-6 rounded-2xl bg-bg-card border border-border-subtle">
        <div className="flex items-center gap-2 mb-2">
          <Info className="text-cyan-400" size={24} />
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            5G Autonomous Network Slicing: Architecture & Model
          </h1>
        </div>
        <p className="text-sm text-text-muted leading-relaxed">
          In 5G and Next-G Open RAN systems, slicing must jointly allocate Radio (Physical Resource Blocks - PRBs)
          and Compute (vCPU cores at the edge DU/CU). Bottlenecking either domain degrades QoS due to strong
          radio-compute coupling: <code className="text-cyan-300 font-mono text-xs">C_eff = min(C_radio, C_compute)</code>.
        </p>
      </div>

      {/* 3 Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-5 rounded-xl bg-bg-card border border-border-subtle">
          <div className="p-2.5 rounded-lg bg-cyan-950/80 border border-cyan-800/80 text-cyan-400 w-fit mb-3">
            <Layers size={20} />
          </div>
          <h2 className="text-base font-bold text-text-primary mb-2">Joint Slicing Formulation</h2>
          <p className="text-xs text-text-muted leading-relaxed">
            Resources are partitioned across 3 slices: eMBB (high throughput), URLLC (low latency, high priority),
            and mURLLC (massive IoT ultra-reliable). Allocations are subject to simplex sum constraints:
            <span className="block font-mono text-[11px] text-cyan-300 mt-1">Σ s_prb ≤ 1.0, Σ s_vcpu ≤ 1.0</span>
          </p>
        </div>

        <div className="p-5 rounded-xl bg-bg-card border border-border-subtle">
          <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 w-fit mb-3">
            <Cpu size={20} />
          </div>
          <h2 className="text-base font-bold text-text-primary mb-2">Lagrangian Constrained PPO</h2>
          <p className="text-xs text-text-muted leading-relaxed">
            Reward optimizes eMBB throughput while dual multiplier variables (λ_urllc, λ_murllc) penalize
            SLA violation rates beyond contract thresholds, dynamically updating via subgradient ascent:
            <span className="block font-mono text-[11px] text-emerald-300 mt-1">λ_k ← max(0, λ_k + α (cost_k - d_k))</span>
          </p>
        </div>

        <div className="p-5 rounded-xl bg-bg-card border border-border-subtle">
          <div className="p-2.5 rounded-lg bg-purple-950/80 border border-purple-800/80 text-purple-400 w-fit mb-3">
            <ShieldCheck size={20} />
          </div>
          <h2 className="text-base font-bold text-text-primary mb-2">Safety Shield Interceptor</h2>
          <p className="text-xs text-text-muted leading-relaxed">
            An algorithmic supervisor sits between the neural network and the network infrastructure. If predicted
            load risks violating URLLC/mURLLC latency floors, the shield overrides shares before actuation.
          </p>
        </div>
      </div>

      {/* Honest Scope & Limitations */}
      <div className="p-6 rounded-2xl bg-bg-card border border-border-subtle">
        <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
          <GitBranch size={18} className="text-amber-400" />
          Simulation Scope & Scientific Honesty
        </h2>
        <ul className="space-y-2 text-xs text-text-muted list-disc pl-5 leading-relaxed">
          <li>
            <strong className="text-text-primary">Simulator Fidelity:</strong> Discrete-event slice-level queuing simulator,
            not a full physical 3GPP channel simulator.
          </li>
          <li>
            <strong className="text-text-primary">Delay Model:</strong> Delay values are computed from M/M/1 queuing-theory
            model estimates based on buffer state and effective coupled capacity.
          </li>
          <li>
            <strong className="text-text-primary">Overload Protection:</strong> Under severe traffic surges exceeding cell
            capacity (unfeasible load), the shield ensures URLLC and mURLLC are protected first, while eMBB throughput is throttled.
          </li>
        </ul>
      </div>
    </div>
  );
};
