import { useEffect, useState } from 'react'
import { RefreshCw, Check, X, Database, Server, Bell, Mail, MessageSquare, AlertTriangle } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'

const SERVICES = [
  { key: 'db', label: 'Database (PostgreSQL)', icon: Database },
  { key: 'redis', label: 'Redis Cache', icon: Server },
  { key: 'fcm', label: 'Firebase FCM', icon: Bell },
  { key: 'sms', label: 'SMS (Eskiz)', icon: MessageSquare },
]

export default function HealthStatus() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try { setData(await api.get('/admin/health/detailed')) } catch {}
    setLoading(false)
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Tizim Holati</div>
          <div className="a-page-sub">
            Barcha servislar real-time · <b style={{ color: data?.overall === 'ok' ? '#10b981' : '#f59e0b' }}>{data?.overall || '—'}</b>
          </div>
        </div>
        <button className="a-btn a-btn-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Yangilash
        </button>
      </div>

      {loading && !data ? <div className="a-loading"><div className="a-spinner" /></div> : (
        <div className="ma-grid">
          {SERVICES.map(s => {
            const info = data?.[s.key] || {}
            const ok = info.ok
            const Icon = s.icon
            return (
              <div key={s.key} className="ma-card" style={{ borderLeft: `3px solid ${ok ? '#10b981' : '#ef4444'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Icon size={22} style={{ color: ok ? '#10b981' : '#ef4444' }} />
                  {ok ? <Check size={20} color="#10b981" /> : <X size={20} color="#ef4444" />}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>
                  {info.latency_ms !== undefined && `${info.latency_ms}ms`}
                  {info.host && ` · ${info.host}`}
                  {info.provider && ` · ${info.provider}`}
                  {info.error && <span style={{ color: '#ef4444' }}>{info.error}</span>}
                  {ok && !info.latency_ms && !info.host && !info.provider && 'ishlayapti'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {data?.checked_at && (
        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--a-muted)', textAlign: 'center' }}>
          So'nggi tekshirish: {new Date(data.checked_at).toLocaleTimeString()} · avtomatik yangilanish har 30 sekund
        </div>
      )}
    </div>
  )
}
