import React from "react";
import { NavLink, Link } from "react-router-dom";
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
  Info,
  Siren,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useSliceStore } from "../../store/useSliceStore";

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, onToggle }) => {
  const { capabilities } = useSliceStore();

  const navGroups = [
    {
      title: "Operations",
      items: [
        { to: "/", label: "Live Demo", icon: Activity, badge: "10 Hz" },
        ...(capabilities?.allocation !== false
          ? [{ to: "/allocation", label: "Allocation", icon: Boxes, badge: "PRB/CPU" }]
          : []),
        ...(capabilities?.bots !== false
          ? [{ to: "/traffic", label: "Traffic & Bots", icon: Sliders }]
          : []),
      ],
    },
    {
      title: "Intelligence & Safety",
      items: [
        { to: "/agent", label: "Agent Insights", icon: Cpu },
        ...(capabilities?.sla !== false
          ? [{ to: "/sla", label: "SLA Matrix", icon: ShieldCheck }]
          : []),
        ...(capabilities?.monitor
          ? [{ to: "/monitor", label: "Monitor", icon: Siren, badge: "Audit" }]
          : []),
      ],
    },
    {
      title: "Analytics & System",
      items: [
        ...(capabilities?.training_log !== false
          ? [{ to: "/training", label: "Training", icon: TrendingUp }]
          : []),
        ...(capabilities?.results !== false
          ? [{ to: "/results", label: "Results", icon: BarChart3 }]
          : []),
        { to: "/about", label: "Story & Arch", icon: Info },
      ],
    },
  ];

  return (
    <aside
      className={`shrink-0 z-30 transition-all duration-300 ease-in-out bg-white border-r border-sky-200/80 shadow-[2px_0_12px_rgba(2,132,199,0.04)] flex flex-col justify-between select-none ${
        isCollapsed ? "w-[72px]" : "w-[248px]"
      }`}
    >
      {/* Top Branding Section */}
      <div>
        <div className="h-16 px-4 flex items-center justify-between border-b border-sky-100">
          <Link to="/" className="flex items-center gap-2.5 overflow-hidden group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-600 to-sky-700 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform shrink-0">
              5G
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0 transition-opacity duration-200">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight text-slate-900 truncate">
                    Slice<span className="text-sky-600">OS</span>
                  </span>
                  <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                    NOC
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono leading-none truncate">
                  Autonomous Slicing
                </p>
              </div>
            )}
          </Link>

          {/* Inline Toggle Button (when expanded) */}
          {!isCollapsed && (
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
              title="Collapse Sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {/* Navigation List grouped by Category */}
        <div className="py-4 px-3 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)]">
          {navGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1.5">
              {!isCollapsed ? (
                <div className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {group.title}
                </div>
              ) : (
                <div className="h-2" />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? "bg-sky-50 text-sky-700 font-bold shadow-sm border border-sky-200/90"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                      } ${isCollapsed ? "justify-center px-0" : ""}`
                    }
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon
                      size={18}
                      className="shrink-0 transition-transform group-hover:scale-110"
                    />

                    {!isCollapsed && (
                      <div className="flex-1 flex items-center justify-between min-w-0">
                        <span className="truncate">{item.label}</span>
                        {item.badge && (
                          <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-white border border-sky-200/60 text-sky-600 shadow-2xs">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tooltip in collapsed mode */}
                    {isCollapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap">
                        {item.label}
                        {item.badge && (
                          <span className="ml-1.5 text-[9px] text-sky-300">
                            ({item.badge})
                          </span>
                        )}
                      </div>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Footer Section */}
      <div className="p-3 border-t border-sky-100 bg-slate-50/50 flex flex-col gap-2">
        {/* Presenter Mode Link */}
        <NavLink
          to="/present"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100/80 border border-purple-200 transition-colors shadow-2xs ${
            isCollapsed ? "justify-center px-0" : ""
          }`}
          title="Presenter Mode (Press P)"
        >
          <Tv size={16} className="shrink-0 text-purple-600" />
          {!isCollapsed && <span className="truncate">Auditorium (P)</span>}
        </NavLink>

        {/* Classic View Link */}
        <a
          href="/legacy"
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100/80 border border-sky-200 transition-colors shadow-2xs ${
            isCollapsed ? "justify-center px-0" : ""
          }`}
          title="Switch to Classic NOC View"
        >
          <ExternalLink size={15} className="shrink-0 text-sky-600" />
          {!isCollapsed && <span className="truncate">Classic NOC</span>}
        </a>

        {/* Collapsed Expand Trigger (when collapsed) */}
        {isCollapsed && (
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors"
            title="Expand Sidebar"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </aside>
  );
};
