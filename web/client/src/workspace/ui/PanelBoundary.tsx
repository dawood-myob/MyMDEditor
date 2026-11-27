import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  name: string;
  children: ReactNode;
  /** changing this value clears a previous error (e.g. the current document id) */
  resetKey?: unknown;
}

interface State { error: Error | null }

/** Isolates a panel: a crash renders an inline message with a retry button instead of taking down the workspace. */
export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[mdhub] ${this.props.name} panel crashed`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="ws-empty" role="alert">
        <p className="ws-empty-title">The {this.props.name} panel hit a problem</p>
        <p className="muted">{this.state.error.message}</p>
        <button type="button" className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
