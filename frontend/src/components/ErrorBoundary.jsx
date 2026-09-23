import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--red)' }}>
          <AlertTriangle size={48} color="var(--red)" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ margin: '0 0 0.5rem', color: 'var(--red)' }}>Something went wrong.</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
            {this.state.error?.message || 'An unexpected error occurred in this step.'}
          </p>
          <button className="btn" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
