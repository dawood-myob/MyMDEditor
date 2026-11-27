import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Brand } from './Brand';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="app-center" role="alert">
        <div className="app-notice card">
          <Brand size={36} />
          <h1 className="app-notice__title">Something went wrong</h1>
          <p className="muted">
            MDHub hit an unexpected problem. Your documents are safe on the server. You can try again, or reload the page.
          </p>
          <details className="app-notice__details">
            <summary>Technical details</summary>
            <pre>{error.message || String(error)}</pre>
          </details>
          <div className="app-notice__actions">
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
            <a className="btn" href="/">
              Go to start
            </a>
          </div>
        </div>
      </div>
    );
  }
}
