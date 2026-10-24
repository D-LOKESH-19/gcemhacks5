import { Component, ErrorInfo, ReactNode } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[360px] p-8 text-center bg-bg-card border border-border-subtle rounded-xl my-6">
          <div className="p-3 bg-rose-950/60 border border-rose-800/80 text-rose-400 rounded-full mb-4">
            <AlertOctagon size={32} />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            {this.props.fallbackTitle || "Page Render Error"}
          </h2>
          <p className="text-sm text-text-muted max-w-md mb-4">
            An unexpected error occurred in this view. The rest of the suite remains active.
          </p>
          {this.state.error && (
            <pre className="text-xs font-mono bg-bg-base/80 border border-border-subtle text-rose-300 p-3 rounded max-w-xl overflow-x-auto mb-6 text-left w-full">
              {this.state.error.message || String(this.state.error)}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg transition-colors shadow-sm"
          >
            <RotateCcw size={16} />
            <span>Retry Component</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
