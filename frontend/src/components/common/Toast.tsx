import React, { useEffect } from "react";
import { useSliceStore } from "../../store/useSliceStore";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useSliceStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: {
    id: string;
    type: "info" | "success" | "warning" | "error";
    title: string;
    message: string;
  };
  onDismiss: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  let icon = <Info size={18} className="text-cyan-400 shrink-0" />;
  let border = "border-cyan-800/80 bg-bg-card/95";

  if (toast.type === "success") {
    icon = <CheckCircle size={18} className="text-emerald-400 shrink-0" />;
    border = "border-emerald-800/80 bg-bg-card/95";
  } else if (toast.type === "warning") {
    icon = <AlertTriangle size={18} className="text-amber-400 shrink-0" />;
    border = "border-amber-800/80 bg-bg-card/95";
  } else if (toast.type === "error") {
    icon = <AlertCircle size={18} className="text-rose-400 shrink-0" />;
    border = "border-rose-800/80 bg-bg-card/95";
  }

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-lg backdrop-blur-md transition-all animate-in slide-in-from-bottom-2 ${border}`}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary">{toast.title}</p>
        <p className="text-xs text-text-muted mt-0.5 break-words">{toast.message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary p-1 rounded transition-colors shrink-0"
        aria-label="Dismiss toast"
      >
        <X size={14} />
      </button>
    </div>
  );
};
