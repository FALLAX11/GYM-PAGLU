import React from 'react';
import { PrimaryButton } from './Primitives';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected rendering error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-dvh w-full flex flex-col items-center justify-center p-6 text-center safe-top-pad safe-bottom-pad"
          style={{ backgroundColor: 'var(--bg-canvas)' }}
        >
          <div className="max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#111318] p-6">
            <h1 className="font-display text-xl font-bold text-white">Something went wrong</h1>
            <p className="text-sm text-zinc-400">{this.state.errorMessage}</p>
            <PrimaryButton
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.href = '/';
              }}
            >
              Reload Application
            </PrimaryButton>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
