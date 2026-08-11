import { useState, useEffect } from 'react'
import { Eye, Users, TrendingUp, Calendar } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'
import { api } from '../api'

const DAYS_OPTIONS = [7, 14, 30, 90]

export default function Traffic() {
  const [data, setData]   = useState(null)
  const [days, setDays]   = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/traffic?days=${days}`)
      .then(setData)
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>

  const statCards = [
    { label: "Jami ko'rishlar",       value: data?.total_views,     icon: <Eye size={20} />,       color: '#2F6B3F' },
    { label: 'Unikal tashrif',        value: data?.unique_visitors, icon: <Users size={20} />,     color: '#5FAE6F' },
    { label: "Bugun",                 value: data?.today_views,     icon: <TrendingUp size={20} />,color: '#5FAE6F' },
  ]

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Sayt Trafigi</div>
          <div className="a-page-sub">Landing page tashrif buyuruvchilar statistikasi</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              className={`a-btn ${days === d ? 'a-btn-primary' : 'a-btn-secondary'}`}
              style={{ padding: '7px 14px' }}
              onClick={() => setDays(d)}
            >
              {d} kun
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {statCards.map((c, i) => (
          <div key={i} className="a-stat-card" style={{ borderTop: `2px solid ${c.color}` }}>
            <div style={{ color: c.color, marginBottom: 10 }}>{c.icon}</div>
            <div className="a-stat-value">{(c.value ?? 0).toLocaleString()}</div>
            <div className="a-stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Daily views chart */}
      <div className="a-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={16} style={{ color: 'var(--a-primary-light)' }} />
          Kunlik ko'rishlar
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data?.daily ?? []} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="tv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#2F6B3F" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2F6B3F" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="tu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#5FAE6F" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#5FAE6F" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: '#5FAE6F', fontSize: 11 }} tickLine={false} axisLine={false} interval={Math.ceil((data?.daily?.length || 1) / 7)} />
            <YAxis tick={{ fill: '#5FAE6F', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#121829', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: '#94A3B8' }}
            />
            <Area type="monotone" dataKey="views"  name="Ko'rishlar"  stroke="#2F6B3F" strokeWidth={2} fill="url(#tv)" dot={false} />
            <Area type="monotone" dataKey="unique" name="Unikal"      stroke="#5FAE6F" strokeWidth={2} fill="url(#tu)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Geo */}
      {data?.geo?.length > 0 && (
        <div className="a-card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 16 }}><><i className="bi bi-globe" style={{marginRight:6}}/>Mamlakatlar bo'yicha</></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.geo.map((g, i) => {
              const max = data.geo[0]?.count || 1
              const pct = Math.round(g.count / max * 100)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, fontSize: 13, fontWeight: 700, color: 'var(--a-text)' }}>{g.country}</div>
                  <div style={{ flex: 1, height: 6, background: 'var(--a-card2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--a-gradient)', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--a-text)', width: 40, textAlign: 'right' }}>{g.count}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Referrers */}
      <div className="a-card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, marginBottom: 16 }}>Top manbalar (Referrerlar)</div>
        {data?.referrers?.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.referrers.map((r, i) => {
              const max = data.referrers[0]?.count || 1
              const pct = Math.round(r.count / max * 100)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 180, fontSize: 13, color: 'var(--a-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {r.referrer}
                  </div>
                  <div style={{ flex: 1, height: 6, background: 'var(--a-card2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--a-gradient)', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--a-text)', width: 40, textAlign: 'right' }}>
                    {r.count}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="a-empty">Hali ma'lumot yo'q</div>
        )}
      </div>
    </div>
  )
}
