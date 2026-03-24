"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
            <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-lg dark:border-red-800 dark:bg-gray-800">
              <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                Something went wrong
              </h1>
              <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                {this.state.error?.message || "Unknown error"}
              </p>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                If you are using Brave, try disabling Shields for this site.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Reload
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
