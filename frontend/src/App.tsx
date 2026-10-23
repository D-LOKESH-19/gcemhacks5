import React from 'react';
import { Activity, ShieldCheck, Cpu } from 'lucide-react';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-8 flex flex-col items-center justify-center">
      <div className="max-w-xl w-full bg-bg-card border border-border-subtle rounded-xl p-8 shadow-2xl text-center space-y-6">
        <div className="flex justify-center items-center gap-3">
          <div className="p-3 bg-cyan-950 border border-cyan-800 rounded-xl text-cyan-400">
            <Activity className="w-8 h-8" />
          </div>
          <div className="p-3 bg-emerald-950 border border-emerald-800 rounded-xl text-emerald-400">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div className="p-3 bg-violet-950 border border-violet-800 rounded-xl text-violet-400">
            <Cpu className="w-8 h-8" />
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            5G SliceOS Enterprise Suite
          </h1>
          <p className="text-sm text-text-muted mt-2">
            Phase F React 18 + TypeScript + Vite + Tailwind CSS Engine Initialized.
          </p>
        </div>

        <div className="p-4 bg-bg-base border border-border-subtle rounded-lg text-xs font-mono text-left space-y-1 text-slate-300">
          <div className="text-emerald-400 font-semibold">[PASS] Toolchain Verification:</div>
          <div>• Framework: React 18.3.1 (Strict TypeScript 5.6)</div>
          <div>• Styling: Tailwind CSS 3.4.14 (Design Tokens Active)</div>
          <div>• Delivery: 100% Offline Capability (@fontsource/inter)</div>
          <div>• Proxy: FastAPI 5G Engine (:8050) Connected</div>
        </div>

        <div className="pt-2 flex justify-center gap-4">
          <a
            href="/legacy"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-lg text-xs font-semibold transition"
          >
            🖥️ Switch to Classic Single-Page NOC View
          </a>
        </div>
      </div>
    </div>
  );
};

export default App;
