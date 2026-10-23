import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";

interface NominalBannerProps {
  visible: boolean;
}

export const NominalBanner: React.FC<NominalBannerProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-cyan-200 text-xs shadow-sm animate-in fade-in duration-300">
      <div className="flex items-center gap-2.5">
        <div className="p-1 rounded-md bg-cyan-900/60 text-cyan-300">
          <Sparkles size={15} />
        </div>
        <span>
          <strong className="text-cyan-100 font-semibold">Nominal Load:</strong> All policies currently meet SLAs under baseline arrivals.
          Press a spike button above to trigger real-time traffic surges and observe policy differentiation.
        </span>
      </div>
      <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-cyan-400 font-medium">
        Try eMBB Surge or mURLLC Storm <ArrowRight size={12} />
      </span>
    </div>
  );
};
