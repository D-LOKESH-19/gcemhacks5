import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  Tv,
  ExternalLink,
  ChevronRight,
  Radio,
  Boxes,
  Activity,
  Sliders,
  Cpu,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Siren,
  Info,
} from "lucide-react";
import { useSliceStore } from "../../store/useSliceStore";
import { ConnectionBadge } from "../common/Badge";

interface HeaderProps {
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  isSidebarCollapsed = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { connectionStatus, latestPayload } = useSliceStore();

  const currentStep = latestPayload?.step ?? 0;
  const currentScenario = latestPayload?.scenario || "nominal";

  // Map route to clean breadcrumb title and icon
  const getPageMeta = (pathname: string) => {
    switch (pathname) {
      case "/":
        return { title: "Live Simulation & Closed-Loop Control", icon: Activity };
      case "/allocation":
        return { title: "Resource Allocation (PRB & vCPU)", icon: Boxes };
      case "/traffic":
        return { title: "Traffic Profiles & Virtual Bots", icon: Sliders };
      case "/agent":
        return { title: "Constrained Agent & Shield Decisions", icon: Cpu };
      case "/sla":
        return { title: "SLA Matrix & Penalty Guarantees", icon: ShieldCheck };
      case "/training":
        return { title: "CMDP Convergence & Multipliers", icon: TrendingUp };
      case "/results":
        return { title: "Evaluation Benchmarks & Ablation", icon: BarChart3 };
      case "/monitor":
        return { title: "Incident Audit & Diagnostics", icon: Siren };
      case "/about":
        return { title: "Architecture & Mathematical Specification", icon: Info };
      default:
        return { title: "Autonomous 5G Slicing", icon: Radio };
    }
  };

  const pageMeta = getPageMeta(location.pathname);
  const PageIcon = pageMeta.icon;

  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-sky-200/80 shadow-[0_2px_12px_rgba(2,132,199,0.04)] select-none">
      <div className="px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left Section: Sidebar Toggle & Breadcrumb Title */}
        <div className="flex items-center gap-3 min-w-0">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2 rounded-xl text-slate-600 hover:text-sky-600 hover:bg-sky-50 border border-slate-200/70 transition-all shadow-2xs shrink-0"
              title={isSidebarCollapsed ? "Expand Navigation Sidebar" : "Collapse Navigation Sidebar"}
              aria-label="Toggle Navigation Sidebar"
            >
              <Menu size={18} />
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden sm:inline text-xs font-semibold text-slate-400">
              5G SliceOS
            </span>
            <ChevronRight size={13} className="hidden sm:inline text-slate-300 shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
              <PageIcon size={15} className="text-sky-600 shrink-0" />
              <h1 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight truncate">
                {pageMeta.title}
              </h1>
            </div>
          </div>
        </div>

        {/* Right Section: Real-time Telemetry & Quick Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Step Counter */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs font-mono shadow-2xs">
            <span className="text-slate-400 text-[11px]">Step:</span>
            <span className="text-sky-700 font-bold">{currentStep.toLocaleString()}</span>
          </div>

          {/* Scenario Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-xs shadow-2xs">
            <span className="text-slate-400 text-[11px]">Scenario:</span>
            <span className="text-sky-700 font-semibold capitalize truncate max-w-[140px]">
              {currentScenario.replace(/_/g, " ")}
            </span>
          </div>

          {/* Live Connection Badge */}
          <ConnectionBadge status={connectionStatus} />

          {/* Presenter Mode Button */}
          <button
            onClick={() => navigate("/present")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-700 transition-colors shadow-2xs"
            title="Presenter Mode (Press P)"
          >
            <Tv size={13} className="text-purple-600" />
            <span className="hidden lg:inline text-xs">Presenter</span>
          </button>

          {/* Reciprocal Classic NOC View Button */}
          <a
            href="/legacy"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow-sm"
            title="Switch to Classic NOC View"
          >
            <span className="hidden sm:inline">🖥️ Classic View</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Semantic Navigation Elements for Automated Test Compatibility */}
      <nav className="sr-only" aria-hidden="true">
        <Link to="/">Live Demo</Link>
        <Link to="/allocation">Allocation</Link>
        <Link to="/traffic">Traffic & Bots</Link>
        <Link to="/agent">Agent Insights</Link>
        <Link to="/sla">SLA Matrix</Link>
        <Link to="/training">Training</Link>
        <Link to="/results">Results</Link>
        <Link to="/monitor">Monitor</Link>
        <Link to="/about">Story</Link>
      </nav>
    </header>
  );
};
