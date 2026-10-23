import React from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { 
  Activity, 
  Boxes,
  Sliders, 
  Cpu, 
  ShieldCheck, 
  TrendingUp, 
  BarChart3, 
  Tv, 
  ExternalLink,
  Info
} from "lucide-react";
import { useSliceStore } from "../../store/useSliceStore";
import { ConnectionBadge } from "../common/Badge";

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { connectionStatus, latestPayload, capabilities } = useSliceStore();

  const currentStep = latestPayload?.step ?? 0;
  const currentScenario = latestPayload?.scenario || "nominal";

  const navItems = [
    { to: "/", label: "Live Demo", icon: Activity },
    ...(capabilities?.allocation !== false ? [{ to: "/allocation", label: "Allocation", icon: Boxes }] : []),
    ...(capabilities?.bots !== false ? [{ to: "/traffic", label: "Traffic & Bots", icon: Sliders }] : []),
    { to: "/agent", label: "Agent Insights", icon: Cpu },
    ...(capabilities?.sla !== false ? [{ to: "/sla", label: "SLA Matrix", icon: ShieldCheck }] : []),
    ...(capabilities?.training_log !== false ? [{ to: "/training", label: "Training", icon: TrendingUp }] : []),
    ...(capabilities?.results !== false ? [{ to: "/results", label: "Results", icon: BarChart3 }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-sky-200/80 shadow-[0_4px_20px_rgba(2,132,199,0.06)] select-none">
      <div className="max-w-[1920px] mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
        {/* Brand / Title */}
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-sky-600 flex items-center justify-center text-white font-extrabold text-xs shadow-sm group-hover:bg-sky-500 transition-colors">
              5G
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-slate-900">
                  5G <span className="bg-gradient-to-r from-sky-700 via-sky-600 to-sky-500 bg-clip-text text-transparent">SliceOS</span>
                </span>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                  Suite
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight font-mono">Autonomous Orchestrator</p>
            </div>
          </Link>
        </div>

        {/* Primary Navigation Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-sky-50 text-sky-800 border border-sky-300 shadow-sm font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-sky-50/50 border border-transparent"
                  }`
                }
              >
                <Icon size={14} className="shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          <NavLink
            to="/about"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-sky-50 text-sky-800 border border-sky-300 shadow-sm font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-sky-50/50 border border-transparent"
              }`
            }
            title="System Architecture & Story"
          >
            <Info size={14} />
            <span>Story</span>
          </NavLink>
        </nav>

        {/* Right Status Group & Utility Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Step Counter */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-mono shadow-sm">
            <span className="text-slate-500">Step:</span>
            <span className="text-sky-700 font-bold">{currentStep.toLocaleString()}</span>
          </div>

          {/* Scenario Badge */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-xs shadow-sm">
            <span className="text-slate-500">Scenario:</span>
            <span className="text-sky-700 font-semibold capitalize">{currentScenario.replace(/_/g, " ")}</span>
          </div>

          {/* Live Connection Badge */}
          <ConnectionBadge status={connectionStatus} />

          {/* Presenter Mode Button */}
          <button
            onClick={() => navigate("/present")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 transition-colors shadow-sm"
            title="Presenter Mode (Press P)"
          >
            <Tv size={13} className="text-purple-600" />
            <span className="hidden lg:inline">Presenter</span>
          </button>

          {/* Reciprocal Classic NOC View Button (Preserving Legacy) */}
          <a
            href="/legacy"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-sm"
            title="Switch to Classic NOC View"
          >
            <span>🖥️ Classic View</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </header>
  );
};
