// ErrorBoundary — catches render errors so a single broken screen doesn't
// white-screen the whole mini-app. Shows a minimal recover-by-reload fallback.
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Best-effort: surface to console; could POST to /crash-report later.
    console.error('Monvo mini-app render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center',
        fontFamily: "'Inter', -apple-system, sans-serif", background: '#FAFAF7', color: '#15151A',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Nimadir noto‘g‘ri ketdi</div>
        <div style={{ fontSize: 13, color: '#6E6E78', marginTop: 8, maxWidth: 280 }}>
          Ilovani qayta yuklang. Muammo davom etsa, biroz keyinroq urinib ko‘ring.
        </div>
        <button onClick={() => window.location.reload()} style={{
          marginTop: 22, padding: '12px 22px', borderRadius: 14, border: 'none',
          background: '#2F6B3F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}>Qayta yuklash</button>
      </div>
    )
  }
}
