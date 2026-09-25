import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
  reportError?: (error: unknown, errorInfo: ErrorInfo) => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public override state: AppErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    this.props.reportError?.(error, errorInfo);
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="fatal-error" aria-labelledby="fatal-error-title">
          <div className="surface fatal-error__panel">
            <p className="eyebrow">Onyx College Portal</p>
            <h1 id="fatal-error-title">The application could not be displayed</h1>
            <p>
              Please reload the page. If the problem continues, contact the school administrator.
            </p>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
