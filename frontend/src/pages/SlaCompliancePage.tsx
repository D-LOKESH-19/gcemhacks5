import React from "react";
import { ShieldCheck } from "lucide-react";
import { SlaPromiseCard } from "../components/sla/SlaPromiseCard";
import { SlaGridMatrix } from "../components/sla/SlaGridMatrix";

export const SlaCompliancePage: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 w-full max-w-[1920px] mx-auto pb-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-400" size={20} />
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              SLA Contract Compliance Matrix
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Formal SLA thresholds, sliding window compliance monitoring, and overload priority isolation.
          </p>
        </div>
      </div>

      {/* 1. Formal SLA Promise & Overload Banner (FT-45, FT-47) */}
      <SlaPromiseCard />

      {/* 2. 3x3 SLA Grid Matrix & Window Compliance (FT-46, FT-48) */}
      <SlaGridMatrix />
    </div>
  );
};

export default SlaCompliancePage;
