import React, { useEffect, useState } from "react";
import { TrendingUp, RefreshCw, AlertOctagon } from "lucide-react";
import { TrainingMetricsCards } from "../components/training/TrainingMetricsCards";
import { TrainingCurves } from "../components/training/TrainingCurves";
import { TrainingLogResponse } from "../types/api";

export const TrainingPage: React.FC = () => {
  const [data, setData] = useState<TrainingLogResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrainingData = () => {
    setLoading(true);
    setError(null);
    fetch("/api/training/log")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: TrainingLogResponse) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load training telemetry");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTrainingData();
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full max-w-[1920px] mx-auto pb-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="text-cyan-400" size={20} />
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Constrained RL Training & Dual Multiplier Dynamics
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            50,000-timestep Lagrangian PPO training telemetry parsed directly from runs/log.csv.
          </p>
        </div>
        <button
          onClick={fetchTrainingData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-text-primary border border-slate-700 transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-cyan-400" : ""} />
          <span>Refresh Log</span>
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="p-12 rounded-xl bg-bg-card border border-border-subtle text-center">
          <RefreshCw size={24} className="animate-spin text-cyan-400 mx-auto mb-2" />
          <p className="text-xs text-text-muted">Loading downsampled training records from runs/log.csv...</p>
        </div>
      )}

      {/* Error State with Retry Button (FT-59) */}
      {!loading && error && (
        <div className="p-8 rounded-xl bg-bg-card border border-rose-900/60 text-center">
          <AlertOctagon size={28} className="text-rose-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-text-primary">Unable to Read Training Log</h3>
          <p className="text-xs text-text-muted max-w-md mx-auto my-2 font-mono">{error}</p>
          <button
            onClick={fetchTrainingData}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition-colors shadow-sm"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          <TrainingMetricsCards metadata={data.metadata} totalRecords={data.total_records} />
          <TrainingCurves log={data.log} />
        </>
      )}
    </div>
  );
};

export default TrainingPage;
