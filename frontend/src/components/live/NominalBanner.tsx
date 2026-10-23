import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";

interface NominalBannerProps {
  visible: boolean;
}

export const NominalBanner: React.FC<NominalBannerProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-sky-50/80 backdrop-blur-md border border-sky-200 text-sky-950 text-xs shadow-sm animate-in fade-in duration-300">
      <div className="flex items-center gap-2.5">
        <div className="p-1 rounded-full bg-sky-100 text-sky-700">
          <Sparkles size={15} />
        </div>
        <span>
          <strong className="text-sky-900 font-bold">Nominal Load:</strong> All policies currently meet SLAs under baseline arrivals.
          Press a spike button above to trigger real-time traffic surges and observe policy differentiation.
        </span>
      </div>
      <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-sky-700 font-semibold">
        Try eMBB Surge or mURLLC Storm <ArrowRight size={12} />
      </span>
    </div>
  );
};
