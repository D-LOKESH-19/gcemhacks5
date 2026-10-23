import React from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import { 
  Activity, 
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
    ...(capabilities?.bots !== false ? [{ to: "/traffic", label: "Traffic & Bots", icon: Sliders }] : []),
    { to: "/agent", label: "Agent Insights", icon: Cpu },
    ...(capabilities?.sla !== false ? [{ to: "/sla", label: "SLA Matrix", icon: ShieldCheck }] : []),
    ...(capabilities?.training_log !== false ? [{ to: "/training", label: "Training", icon: TrendingUp }] : []),
    ...(capabilities?.results !== false ? [{ to: "/results", label: "Results", icon: BarChart3 }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-bg-card/90 backdrop-blur-md border-b border-border-subtle select-none">
      <div className="max-w-[1920px] mx-auto px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
        {/* Brand / Title */}
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-600 group-hover:border-emerald-500 transition-colors shadow-sm">
              <Activity size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-text-primary">5G Slicing Suite</span>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-300">
                  Enterprise
                </span>
              </div>
              <p className="text-[10px] text-text-muted leading-tight font-mono">Autonomous NOC</p>
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
                      ? "bg-slate-100 text-text-primary border border-slate-300 shadow-sm font-semibold"
                      : "text-text-muted hover:text-text-primary hover:bg-slate-100/70 border border-transparent"
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
                  ? "bg-slate-100 text-text-primary border border-slate-300 shadow-sm font-semibold"
                  : "text-text-muted hover:text-text-primary hover:bg-slate-100/70 border border-transparent"
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
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-border-subtle text-xs font-mono shadow-sm">
            <span className="text-text-muted">Step:</span>
            <span className="text-emerald-600 font-bold">{currentStep.toLocaleString()}</span>
          </div>

          {/* Scenario Badge */}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-border-subtle text-xs shadow-sm">
            <span className="text-text-muted">Scenario:</span>
            <span className="text-sky-600 font-semibold capitalize">{currentScenario.replace(/_/g, " ")}</span>
          </div>

          {/* Live Connection Badge */}
          <ConnectionBadge status={connectionStatus} />

          {/* Presenter Mode Button */}
          <button
            onClick={() => navigate("/present")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs text-text-primary transition-colors shadow-sm"
            title="Presenter Mode (Press P)"
          >
            <Tv size={13} className="text-purple-600" />
            <span className="hidden lg:inline">Presenter</span>
          </button>

          {/* Reciprocal Classic NOC View Button (Preserving Legacy) */}
          <a
            href="/legacy"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 hover:bg-sky-100 border border-sky-300 text-sky-700 text-xs font-medium transition-colors shadow-sm"
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
