import React from "react";

interface SkeletonProps {
  className?: string;
  count?: number;
}

export const LoadingSkeleton: React.FC<SkeletonProps> = ({ className = "h-4 w-full", count = 1 }) => {
  return (
    <div className="space-y-2 w-full">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`bg-slate-200/70 rounded animate-pulse border border-slate-200 ${className}`}
        />
      ))}
    </div>
  );
};

export const CardSkeleton: React.FC<{ height?: string }> = ({ height = "h-48" }) => {
  return (
    <div className={`p-4 rounded-xl bg-bg-card border border-border-subtle animate-pulse flex flex-col justify-between ${height}`}>
      <div className="flex items-center justify-between">
        <div className="h-4 w-32 bg-slate-200 rounded" />
        <div className="h-5 w-16 bg-slate-200 rounded-full" />
      </div>
      <div className="space-y-2 my-auto">
        <div className="h-8 w-24 bg-slate-200 rounded" />
        <div className="h-3 w-40 bg-slate-200/60 rounded" />
      </div>
      <div className="h-2 w-full bg-slate-200/40 rounded" />
    </div>
  );
};

export const ChartSkeleton: React.FC<{ height?: string }> = ({ height = "h-64" }) => {
  return (
    <div className={`p-4 rounded-xl bg-bg-card border border-border-subtle animate-pulse flex flex-col ${height}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-48 bg-slate-200 rounded" />
        <div className="h-4 w-20 bg-slate-200 rounded" />
      </div>
      <div className="flex-1 w-full bg-slate-100/80 rounded border border-dashed border-slate-200 flex items-center justify-center">
        <div className="h-5 w-32 bg-slate-200/60 rounded" />
      </div>
    </div>
  );
};
