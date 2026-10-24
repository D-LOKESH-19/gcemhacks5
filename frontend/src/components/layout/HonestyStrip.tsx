import React from "react";
import { ShieldCheck, Info } from "lucide-react";

export const HonestyStrip: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-border-subtle bg-bg-base/90 py-2.5 px-4 text-xs text-text-muted select-none">
      <div className="max-w-[1920px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Info size={13} className="text-cyan-400 shrink-0" />
          <span>
            <strong className="text-text-primary font-medium">Model Note:</strong> Slice-level simulator, not a radio-level model. Delay values are queuing-theory model estimates.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
          <span>
            Under overload, <strong className="text-emerald-400 font-medium">URLLC & mURLLC protected first</strong>. Constraint multipliers (λ) represent final trained weights.
          </span>
        </div>
      </div>
    </footer>
  );
};
