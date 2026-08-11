import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[Merchant] render error', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          padding: 32,
          background: '#fff',
          color: '#0F1115',
          fontFamily: 'ui-monospace, Menlo, monospace',
          whiteSpace: 'pre-wrap',
          fontSize: 13,
          lineHeight: 1.55,
        }}>
          <h1 style={{ fontFamily: 'system-ui', fontSize: 20, marginTop: 0 }}>
            Merchant panel: render error
          </h1>
          <p style={{ fontFamily: 'system-ui', color: '#6B7280' }}>
            Sahifani render qilishda xatolik. Xatoni copy qilib yuboring.
          </p>
          <pre style={{ background: '#F4F4F5', padding: 16, borderRadius: 8, overflow: 'auto' }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          {this.state.info?.componentStack && (
            <pre style={{ background: '#F4F4F5', padding: 16, borderRadius: 8, overflow: 'auto', marginTop: 12 }}>
              {this.state.info.componentStack}
            </pre>
          )}
          <button
            onClick={() => location.reload()}
            style={{
              marginTop: 16, padding: '10px 16px',
              background: '#2F6B3F', color: '#fff', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontFamily: 'system-ui',
            }}
          >Qayta yuklash</button>
        </div>
      );
    }
    return this.props.children;
  }
}
