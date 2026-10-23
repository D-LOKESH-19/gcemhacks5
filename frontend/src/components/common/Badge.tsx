import React from "react";
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  MinusCircle, 
  ShieldAlert, 
  Wifi, 
  RefreshCw, 
  WifiOff 
} from "lucide-react";
import { ConnectionStatus } from "../../types/api";

export type StatusType = "OK" | "AT_RISK" | "BREACH" | "NO_TRAFFIC" | "OVERLOAD";

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
  size?: "sm" | "md";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  className = "", 
  size = "md" 
}) => {
  const normStatus = status.toUpperCase().replace(/\s+/g, "_");

  let colorClasses = "bg-slate-800 text-slate-300 border-slate-700";
  let IconComponent = MinusCircle;
  let text = status;

  switch (normStatus) {
    case "OK":
      colorClasses = "bg-emerald-950/70 text-emerald-400 border-emerald-800/80";
      IconComponent = CheckCircle2;
      text = "OK";
      break;
    case "AT_RISK":
    case "RISK":
      colorClasses = "bg-amber-950/70 text-amber-400 border-amber-800/80";
      IconComponent = AlertTriangle;
      text = "AT RISK";
      break;
    case "BREACH":
    case "VIOLATION":
      colorClasses = "bg-rose-950/70 text-rose-400 border-rose-800/80";
      IconComponent = XCircle;
      text = "BREACH";
      break;
    case "OVERLOAD":
      colorClasses = "bg-purple-950/70 text-purple-400 border-purple-800/80";
      IconComponent = ShieldAlert;
      text = "OVERLOAD";
      break;
    case "NO_TRAFFIC":
    default:
      colorClasses = "bg-slate-800/80 text-slate-400 border-slate-700";
      IconComponent = MinusCircle;
      text = normStatus === "NO_TRAFFIC" ? "NO TRAFFIC" : status;
      break;
  }

  const sizeClasses = size === "sm" ? "text-xs px-2 py-0.5 gap-1" : "text-xs font-semibold px-2.5 py-1 gap-1.5";
  const iconSize = size === "sm" ? 12 : 14;

  return (
    <span 
      className={`inline-flex items-center rounded-md border font-medium tracking-wide ${colorClasses} ${sizeClasses} ${className}`}
    >
      <IconComponent size={iconSize} className="shrink-0" />
      <span>{text}</span>
    </span>
  );
};

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  className?: string;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({ 
  status, 
  className = "" 
}) => {
  if (status === "connected") {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 ${className}`}>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <Wifi size={13} className="shrink-0" />
        <span>Live</span>
      </span>
    );
  }

  if (status === "reconnecting") {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/60 text-amber-400 border border-amber-800/60 ${className}`}>
        <RefreshCw size={13} className="animate-spin shrink-0" />
        <span>Reconnecting...</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800/80 text-slate-400 border border-slate-700 ${className}`}>
      <WifiOff size={13} className="shrink-0" />
      <span>Offline</span>
    </span>
  );
};

interface SliceBadgeProps {
  slice: "embb" | "urllc" | "murllc" | string;
  className?: string;
}

export const SliceBadge: React.FC<SliceBadgeProps> = ({ slice, className = "" }) => {
  const norm = slice.toLowerCase();
  let color = "bg-slate-800 text-slate-300 border-slate-700";
  let label = slice.toUpperCase();

  if (norm === "embb") {
    color = "bg-cyan-950/60 text-cyan-400 border-cyan-800/60";
    label = "eMBB";
  } else if (norm === "urllc") {
    color = "bg-amber-950/60 text-amber-400 border-amber-800/60";
    label = "URLLC";
  } else if (norm === "murllc") {
    color = "bg-purple-950/60 text-purple-400 border-purple-800/60";
    label = "mURLLC";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${color} ${className}`}>
      {label}
    </span>
  );
};

interface PolicyBadgeProps {
  policy: "static" | "heuristic" | "agent" | string;
  className?: string;
}

export const PolicyBadge: React.FC<PolicyBadgeProps> = ({ policy, className = "" }) => {
  const norm = policy.toLowerCase();
  let color = "bg-slate-800 text-slate-300 border-slate-700";
  let label = policy;

  if (norm === "static") {
    color = "bg-rose-950/60 text-rose-400 border-rose-800/60";
    label = "Static Baseline";
  } else if (norm === "heuristic") {
    color = "bg-slate-800/90 text-slate-300 border-slate-600";
    label = "Heuristic";
  } else if (norm === "agent") {
    color = "bg-emerald-950/60 text-emerald-400 border-emerald-800/60";
    label = "RL Agent + Shield";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${color} ${className}`}>
      {label}
    </span>
  );
};
