'use client';

import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 my-4 bg-destructive/20 border border-destructive rounded-lg text-destructive-foreground text-sm">
          <h2 className="font-bold font-sans mb-2">Component Rendering Error</h2>
          <p>This part of the application could not be displayed. Please try reloading the page or clearing your session.</p>
          {this.state.error && (
            <pre className="mt-2 text-xs bg-background/50 p-2 rounded-md whitespace-pre-wrap">
              <code>{this.state.error.toString()}</code>
            </pre>
          )}
        </div>
      );
    }

    return this.props.children || null;
  }
}

export default ErrorBoundary;