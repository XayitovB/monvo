import { useEffect, useState } from 'react'
import { Users, TrendingUp, Activity, RefreshCw } from 'lucide-react'
import { api } from '../api'

export default function Retention() {
  const [data, setData]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/retention').then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>

  const cards = [
    { label: 'Yangi foydalanuvchilar (30 kun)', value: data?.new_users_30d, icon: <Users size={20} />, color: '#2F6B3F' },
    { label: 'Qayta kelganlar (30 kun)',         value: data?.returning_30d, icon: <RefreshCw size={20} />, color: '#5FAE6F' },
    { label: 'Haftalik faol (WAU)',              value: data?.wau,           icon: <Activity size={20} />, color: '#5FAE6F' },
    { label: 'Oylik faol (MAU)',                 value: data?.mau,           icon: <TrendingUp size={20} />, color: '#1F4D2C' },
  ]

  const fmt = (v) => v != null ? `${Number(v).toFixed(1)}%` : '—'

  const metrics = [
    { label: 'Retention Rate',   value: fmt(data?.retention_rate),   desc: 'Qayta kelgan foydalanuvchilar foizi',  color: '#5FAE6F' },
    { label: 'Activation Rate',  value: fmt(data?.activation_rate),  desc: "Xarajat qo'shgan foydalanuvchilar foizi", color: '#5FAE6F' },
  ]

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Retention Metrics</div>
          <div className="a-page-sub">Foydalanuvchilarni saqlash ko'rsatkichlari</div>
        </div>
      </div>

      <div className="a-stats-grid" style={{ marginBottom: 20 }}>
        {cards.map((c, i) => (
          <div key={i} className="a-stat-card" style={{ borderTop: `2px solid ${c.color}` }}>
            <div style={{ color: c.color, marginBottom: 10 }}>{c.icon}</div>
            <div className="a-stat-value">{(c.value ?? 0).toLocaleString()}</div>
            <div className="a-stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {metrics.map((m, i) => (
          <div key={i} className="a-card" style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 900, background: `linear-gradient(135deg, ${m.color}, #2F6B3F)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8 }}>
              {m.value}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 13, color: 'var(--a-muted)' }}>{m.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
