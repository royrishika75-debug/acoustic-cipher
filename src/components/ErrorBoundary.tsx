import React, { ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          id="error-boundary-fallback"
          className="p-5 bg-[#0b1017] border border-red-500/60 rounded-lg text-white font-mono flex flex-col gap-4 shadow-lg"
        >
          <div className="flex items-center gap-2.5 text-red-400 border-b border-red-500/30 pb-3">
            <AlertOctagon className="w-5 h-5 shrink-0" />
            <span className="font-bold text-sm tracking-wider uppercase">
              {this.props.fallbackTitle || 'RECEIVER ERROR'}
            </span>
          </div>

          <div className="text-xs text-red-200 bg-red-950/40 p-3 rounded border border-red-900/60 break-words font-mono">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              id="btn-error-retry"
              type="button"
              onClick={this.handleRetry}
              className="py-2 px-4 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center gap-2 cursor-pointer transition shadow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              RETRY MICROPHONE
            </button>
            <span className="text-[11px] text-slate-400">
              Check console logs for stack trace.
            </span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
