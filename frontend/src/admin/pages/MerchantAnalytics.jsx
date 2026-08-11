import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, TrendingUp, TrendingDown, Download, BarChart3 } from 'lucide-react'
import './LoyaltyBuilder.css'

function mf(path) {
  const token = localStorage.getItem('merchant_token')
  return fetch(path, { headers: { 'Authorization': `Bearer ${token}` } }).then(async (r) => {
    if (r.status === 401) { localStorage.removeItem('merchant_token'); window.location.href = '/merchant/login'; return }
    if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
    return r.json()
  })
}

function downloadReport() {
  const token = localStorage.getItem('merchant_token')
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const month = `${d.getFullYear()}-${mm}`
  fetch(`/merchants/me/reports/monthly?month=${month}`, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${month}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
}

const DAYS = ['Du','Se','Ch','Pa','Ju','Sh','Ya']

export default function MerchantAnalytics() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [overview, setOverview] = useState(null)
  const [heatmap, setHeatmap] = useState(null)
  const [cohort, setCohort] = useState(null)
  const [rfm, setRfm] = useState(null)
  const [roi, setRoi] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) { navigate('/merchant/login'); return }
    document.body.classList.add('admin-body')
    loadAll()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function loadAll() {
    try {
      const [o, h, c, r, ro] = await Promise.all([
        mf('/merchants/me/analytics/overview?days=30'),
        mf('/merchants/me/analytics/heatmap?days=30&metric=count'),
        mf('/merchants/me/analytics/cohort?weeks=8'),
        mf('/merchants/me/analytics/rfm?days=180'),
        mf('/merchants/me/analytics/rule-roi?days=30'),
      ])
      setOverview(o); setHeatmap(h); setCohort(c); setRfm(r); setRoi(ro)
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  if (loading) return <div className="lb-loading"><div className="a-spinner" /></div>

  const maxVal = heatmap ? Math.max(1, ...heatmap.matrix.flat()) : 1

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}>
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div>
          <div className="lb-title">Analytics</div>
          <div className="lb-sub">Sizning biznes ko'rsatkichlaringiz</div>
        </div>
        <button className="a-btn a-btn-secondary" onClick={downloadReport}>
          <Download size={14} /> CSV hisobot
        </button>
      </header>

      <div className="lb-container">
        {err && <div className="lb-error">{err}</div>}

        <div className="ma-tabs">
          {['overview','heatmap','cohort','rfm','roi'].map(t => (
            <button key={t} className={`ma-tab ${tab===t?'on':''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {tab === 'overview' && overview && (
          <div className="ma-grid">
            <KpiCard label="Tranzaksiyalar" value={overview.transactions.current} change={overview.transactions.change_pct} />
            <KpiCard label="Savdo (so'm)" value={overview.revenue.current.toLocaleString()} change={overview.revenue.change_pct} />
            <KpiCard label="Yangi kartalar" value={overview.new_cards} />
            <KpiCard label="Faol mijozlar" value={overview.active_customers} />
          </div>
        )}

        {tab === 'heatmap' && heatmap && (
          <div className="ma-card">
            <div className="ma-card-title">Aktivlik heatmap (30 kun)</div>
            <div className="ma-heatmap">
              <div className="ma-hm-hours">
                <div />
                {heatmap.hours.map(h => <div key={h} className="ma-hm-hour">{h}</div>)}
              </div>
              {heatmap.matrix.map((row, d) => (
                <div key={d} className="ma-hm-row">
                  <div className="ma-hm-day">{DAYS[d]}</div>
                  {row.map((v, h) => (
                    <div key={h} className="ma-hm-cell"
                         title={`${DAYS[d]} ${h}:00 — ${v}`}
                         style={{ background: `rgba(47,107,63,${v / maxVal})` }} />
                  ))}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--a-muted)' }}>
              Peak: <b>{heatmap.peak.day} {heatmap.peak.hour}:00</b> ({heatmap.peak.value})
            </div>
          </div>
        )}

        {tab === 'cohort' && cohort && (
          <div className="ma-card">
            <div className="ma-card-title">Haftalik cohort retention</div>
            <div className="ma-cohort">
              <div className="ma-co-row ma-co-head">
                <div>Cohort</div>
                <div>Hajm</div>
                {Array.from({ length: cohort.weeks }).map((_, i) => <div key={i}>W{i}</div>)}
              </div>
              {cohort.cohorts.map((c, i) => (
                <div key={i} className="ma-co-row">
                  <div>{c.cohort}</div>
                  <div>{c.size}</div>
                  {c.values.map((v, j) => (
                    <div key={j} className="ma-co-cell"
                         style={{ background: v !== null ? `rgba(16, 185, 129, ${v/100})` : 'transparent' }}>
                      {v !== null ? `${v}%` : ''}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'rfm' && rfm && (
          <>
            <div className="ma-grid">
              {Object.entries(rfm.segments).map(([seg, cnt]) => (
                <div key={seg} className="ma-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>{cnt}</div>
                  <div style={{ fontSize: 12, color: 'var(--a-muted)' }}>{seg}</div>
                </div>
              ))}
            </div>
            <div className="ma-card">
              <div className="ma-card-title">Top mijozlar</div>
              <table className="ma-table">
                <thead><tr><th>Ism</th><th>Tel</th><th>R</th><th>F</th><th>M</th><th>Segment</th></tr></thead>
                <tbody>
                  {rfm.users.slice(0, 50).map(u => (
                    <tr key={u.card_id}>
                      <td>{u.holder_name || '—'}</td>
                      <td>{u.holder_phone || '—'}</td>
                      <td>{u.r}</td><td>{u.f}</td><td>{u.m}</td>
                      <td><span className="crm-tag">{u.segment}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'roi' && roi && (
          <>
            <div className="ma-grid">
              <KpiCard label="Jami tx" value={roi.totals.transactions} />
              <KpiCard label="Jami savdo" value={roi.totals.revenue.toLocaleString()} />
              <KpiCard label="Ball berildi" value={roi.totals.points_issued} />
              <KpiCard label="Maxsus sovg'a" value={roi.special_rewards_triggered} />
              <KpiCard label="Tug'ilgan kun (🎂)" value={roi.birthday_bonuses_triggered} />
            </div>
            <div className="ma-card">
              <div className="ma-card-title">Qoidalar samaradorligi</div>
              <table className="ma-table">
                <thead><tr><th>Qoida</th><th>Tur</th><th>Holat</th><th>Ishga tushgan</th></tr></thead>
                <tbody>
                  {roi.rules.map(r => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.rule_type}</td>
                      <td>{r.is_active ? '✓' : '✗'}</td>
                      <td>{r.estimated_triggered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, change }) {
  return (
    <div className="ma-card">
      <div className="ma-kpi-value">{value}</div>
      <div className="ma-kpi-label">{label}</div>
      {change !== undefined && change !== null && (
        <div className={`ma-kpi-change ${change >= 0 ? 'up' : 'down'}`}>
          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {change.toFixed(1)}%
        </div>
      )}
    </div>
  )
}
