import React, { useEffect, useState } from "react";
import { BarChart3, RefreshCw, AlertOctagon } from "lucide-react";
import { ResultsHeadlineCard } from "../components/results/ResultsHeadlineCard";
import { ScenarioGroupedBarChart } from "../components/results/ScenarioGroupedBarChart";
import { AblationStudyTable } from "../components/results/AblationStudyTable";

export const ResultsPage: React.FC = () => {
  const [data, setData] = useState<{
    sla_table: Array<Record<string, any>>;
    ablation: Array<Record<string, any>>;
    headline: any;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = () => {
    setLoading(true);
    setError(null);
    fetch("/api/results")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load benchmark evaluation matrices");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchResults();
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full max-w-[1920px] mx-auto pb-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-bg-card border border-border-subtle shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="text-emerald-400" size={20} />
            <h1 className="text-lg font-bold text-text-primary tracking-tight">
              Benchmarking Results & Model Ablation Evaluation
            </h1>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Empirical validation across 20 held-out Monte Carlo simulation seeds with 95% bootstrap confidence intervals.
          </p>
        </div>
        <button
          onClick={fetchResults}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-text-primary border border-slate-700 transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-emerald-400" : ""} />
          <span>Refresh Results</span>
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="p-12 rounded-xl bg-bg-card border border-border-subtle text-center">
          <RefreshCw size={24} className="animate-spin text-emerald-400 mx-auto mb-2" />
          <p className="text-xs text-text-muted">Loading benchmark matrices from results/*.csv...</p>
        </div>
      )}

      {/* Error State with Retry Button (FT-59) */}
      {!loading && error && (
        <div className="p-8 rounded-xl bg-bg-card border border-rose-900/60 text-center">
          <AlertOctagon size={28} className="text-rose-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-text-primary">Unable to Read Benchmark Results</h3>
          <p className="text-xs text-text-muted max-w-md mx-auto my-2 font-mono">{error}</p>
          <button
            onClick={fetchResults}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition-colors shadow-sm"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          {/* 1. Headline Card (FT-51, FT-55) */}
          <ResultsHeadlineCard headline={data.headline} />

          {/* 2. Grouped Scenario Chart (FT-52, FT-54) */}
          <ScenarioGroupedBarChart slaRows={data.sla_table} />

          {/* 3. Ablation Study Table & Footnote (FT-53, FT-56) */}
          <AblationStudyTable ablationRows={data.ablation} />
        </>
      )}
    </div>
  );
};

export default ResultsPage;
