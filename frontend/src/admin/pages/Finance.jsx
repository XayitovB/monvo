import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Receipt, Clock, BarChart2, Building2 } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'

const PERIODS = [
  { label: '7 kun', value: 7 },
  { label: '30 kun', value: 30 },
  { label: '90 kun', value: 90 },
  { label: '1 yil', value: 365 },
]

function sep(n) {
  return Math.round(Number(n ?? 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
function fmt(n) {
  if (n == null) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + ' mln'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + ' K'
  return sep(n)
}
function fmtFull(n) { return sep(n) }

export default function Finance() {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(30)
  const [commission, setCommission] = useState(3.0)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [hovered, setHovered] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ days: String(days), commission_pct: String(commission) })
      setData(await api.get(`/admin/finance/overview?${params}`))
    } catch (e) {
      setError(e?.message || "Yuklab bo'lmadi")
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [days, commission])

  if (loading && !data) return <div className="a-loading"><div className="a-spinner" /></div>
  if (error) return <div className="al-error" style={{ margin: 20 }}>{error}</div>
  if (!data) return null

  const maxGmv = Math.max(1, ...(data.top_merchants || []).map(m => m.gmv))
  const maxBar = Math.max(1, ...(data.monthly_trend || []).map(m => m.gmv))

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--a-text)', letterSpacing: '-0.4px' }}>Moliya</div>
          <div style={{ fontSize: 13, color: 'var(--a-muted)', marginTop: 3 }}>
            Platforma daromadi, GMV va merchant hisobotlari
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Period chips */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 10, padding: 3 }}>
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                style={{
                  padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                  background: days === p.value ? 'var(--a-primary)' : 'transparent',
                  color: days === p.value ? '#fff' : 'var(--a-muted)',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Commission */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 10, padding: '6px 12px' }}>
            <span style={{ fontSize: 12, color: 'var(--a-muted)', whiteSpace: 'nowrap' }}>Komissiya stavkasi</span>
            <input
              type="number" step="0.5" min="0" max="100" value={commission}
              onChange={e => setCommission(Number(e.target.value))}
              style={{ width: 52, padding: '3px 6px', background: 'transparent', border: '1px solid var(--a-border)', borderRadius: 6, color: 'var(--a-text)', fontSize: 13, fontWeight: 700, textAlign: 'center' }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--a-text)' }}>%</span>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard
          icon={<DollarSign size={16} />}
          color="#22c55e"
          label="Savdo hajmi (GMV)"
          value={fmtFull(data.gmv.current)}
          unit="so'm"
          change={data.gmv.change_pct}
          hint={`Oldingi davrga nisbatan`}
        />
        <KpiCard
          icon={<TrendingUp size={16} />}
          color="#6366f1"
          label={`Taxminiy komissiya (GMV × ${commission}%)`}
          value={fmtFull(data.revenue.current)}
          unit="so'm"
          hint="Haqiqiy yig'ilgan to'lov emas — GMV asosida hisob"
        />
        <KpiCard
          icon={<Clock size={16} />}
          color="#f59e0b"
          label="Kutilayotgan to'lovlar"
          value={fmtFull(data.invoices.pending_total)}
          unit="so'm"
          warn={data.invoices.pending_total > 0}
        />
      </div>

      {/* Main content: merchants + chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Top merchants */}
        <div className="ma-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--a-text)' }}>
              <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: 6, opacity: 0.6 }} />
              Top merchantlar
            </div>
            <div style={{ fontSize: 11, color: 'var(--a-muted)', background: 'var(--a-bg)', padding: '3px 8px', borderRadius: 6 }}>
              GMV bo'yicha
            </div>
          </div>

          {(data.top_merchants || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--a-muted)', fontSize: 12 }}>
              Ma'lumot yo'q
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.top_merchants.map((m, i) => (
                <div key={m.merchant_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, color: i === 0 ? '#f59e0b' : 'var(--a-muted)',
                        minWidth: 18, textAlign: 'center',
                      }}>#{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--a-text)' }}>{m.business_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--a-muted)' }}>{m.tx_count} tx</span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--a-text)' }}>{fmt(m.gmv)} so'm</span>
                      <span style={{ fontSize: 11, color: '#6366f1' }}>+{fmt(m.commission)}</span>
                    </div>
                  </div>
                  <div style={{ height: 4, background: 'var(--a-border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${(m.gmv / maxGmv) * 100}%`,
                      background: i === 0 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #6366f1, #4f46e5)',
                      borderRadius: 2, transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly trend bar chart */}
        <div className="ma-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--a-text)' }}>
              <BarChart2 size={14} style={{ verticalAlign: 'middle', marginRight: 6, opacity: 0.6 }} />
              Oylik GMV trendi
            </div>
            <div style={{ fontSize: 11, color: 'var(--a-muted)', background: 'var(--a-bg)', padding: '3px 8px', borderRadius: 6 }}>
              So'nggi 12 oy
            </div>
          </div>

          {/* Chart */}
          <div style={{ position: 'relative', height: 160 }}>
            {/* Tooltip */}
            {hovered != null && (
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                background: 'var(--a-text)', color: 'var(--a-bg)', borderRadius: 7,
                padding: '5px 10px', fontSize: 12, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
              }}>
                {data.monthly_trend[hovered]?.month}: {fmtFull(data.monthly_trend[hovered]?.gmv)} so'm
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 130, paddingBottom: 0, marginTop: 24 }}>
              {(data.monthly_trend || []).map((m, i) => {
                const h = Math.max(3, (m.gmv / maxBar) * 120)
                const isMax = m.gmv === maxBar
                return (
                  <div
                    key={i}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'default' }}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <div
                      style={{
                        width: '100%', height: h,
                        background: hovered === i || isMax
                          ? 'linear-gradient(180deg, #22c55e, #16a34a)'
                          : 'linear-gradient(180deg, #86efac, #4ade80)',
                        borderRadius: '4px 4px 2px 2px',
                        transition: 'background 0.15s',
                      }}
                    />
                  </div>
                )
              })}
            </div>

            {/* Month labels */}
            <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
              {(data.monthly_trend || []).map((m, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1, textAlign: 'center', fontSize: 9.5,
                    color: hovered === i ? 'var(--a-primary)' : 'var(--a-muted)',
                    fontWeight: hovered === i ? 700 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden',
                  }}
                >
                  {m.month?.slice(0, 3) || ''}
                </div>
              ))}
            </div>
          </div>

          {/* Summary below chart */}
          {data.monthly_trend?.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--a-border)' }}>
              <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>
                Eng yuqori:{' '}
                <span style={{ color: 'var(--a-text)', fontWeight: 600 }}>
                  {fmt(maxBar)} so'm
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>
                O'rtacha:{' '}
                <span style={{ color: 'var(--a-text)', fontWeight: 600 }}>
                  {fmt(data.monthly_trend.reduce((s, m) => s + m.gmv, 0) / data.monthly_trend.length)} so'm
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon, color, label, value, unit, change, hint, warn }) {
  return (
    <div className="ma-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'inline-flex', padding: 7, borderRadius: 9, background: color + '18', color }}>
          {icon}
        </div>
        {change !== undefined && change !== null && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600,
            padding: '3px 7px', borderRadius: 6,
            background: change >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: change >= 0 ? '#16a34a' : '#dc2626',
          }}>
            {change >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
        {warn && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '3px 7px', borderRadius: 6 }}>
            ⚠ Kutilmoqda
          </div>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-1px', color: 'var(--a-text)', lineHeight: 1.1 }}>
            {value}
          </span>
          <span style={{ fontSize: 12, color: 'var(--a-muted)', fontWeight: 500 }}>{unit}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 2, opacity: 0.7 }}>{hint}</div>
        )}
      </div>
    </div>
  )
}
