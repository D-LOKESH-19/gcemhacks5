import React from "react";
import { Link } from "react-router-dom";
import { Compass, Home } from "lucide-react";

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[400px]">
      <div className="p-4 bg-slate-800/60 border border-slate-700 text-cyan-400 rounded-full mb-4">
        <Compass size={40} />
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-text-primary mb-2">404 - View Not Found</h1>
      <p className="text-sm text-text-muted max-w-md mb-6">
        The requested routing path does not exist in the 5G Autonomous NOC suite.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg transition-colors shadow-sm"
      >
        <Home size={16} />
        <span>Return to Live Demo</span>
      </Link>
    </div>
  );
};
