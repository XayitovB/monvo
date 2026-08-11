import { useState, useEffect, useCallback } from 'react'
import { Users, Store, CreditCard, Repeat, Coins, RefreshCw, AlertCircle, Activity, UserCheck } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, LineChart, Line, Legend, CartesianGrid,
} from 'recharts'
import { api } from '../api'
import './Dashboard.css'

const COLORS = ['#2F6B3F', '#5FAE6F', '#3F9C5C', '#1F4D2C', '#84CC16']

function useTheme() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.getAttribute('data-theme') || 'dark'
  )
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'dark')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}

function buildGrowthUrl(period, dateFrom, dateTo, singleDate) {
  if (period === '7d') return '/admin/growth?days=7'
  if (period === '30d') return '/admin/growth?days=30'
  if (period === 'custom' && dateFrom && dateTo)
    return `/admin/growth?date_from=${dateFrom}&date_to=${dateTo}`
  if (period === 'single' && singleDate)
    return `/admin/growth?single_date=${singleDate}`
  return null
}

function ChartEmpty({ text = 'Ma\'lumot yo\'q' }) {
  return <div className="db-chart-empty">{text}</div>
}

export default function Dashboard() {
  const theme = useTheme()
  const isLight = theme === 'light'

  const tickColor = isLight ? '#64748B' : '#94A3B8'
  const gridColor = isLight ? 'rgba(11,16,32,0.06)' : 'rgba(255,255,255,0.05)'
  const tooltipStyle = {
    contentStyle: {
      background: isLight ? '#FFFFFF' : '#121829',
      border: isLight ? '1px solid rgba(11,16,32,0.1)' : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10,
      fontSize: 12,
      boxShadow: isLight ? '0 6px 20px -8px rgba(11,16,32,0.15)' : 'none',
      color: isLight ? '#0B1020' : '#FFFFFF',
    },
    labelStyle: { color: isLight ? '#475569' : '#94A3B8' },
    itemStyle: { color: isLight ? '#0B1020' : '#FFFFFF' },
  }
  const axisTick = { fill: tickColor, fontSize: 11 }
  const areaStroke = isLight ? '#2F6B3F' : '#5FAE6F'

  const [stats, setStats] = useState(null)
  const [chart, setChart] = useState(null)
  const [statsErr, setStatsErr] = useState(null)
  const [chartErr, setChartErr] = useState(null)
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState('7d')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [singleDate, setSingleDate] = useState('')
  const [growth, setGrowth] = useState(null)
  const [growthErr, setGrowthErr] = useState(null)
  const [growthLoading, setGrowthLoading] = useState(false)

  const loadCore = useCallback(async () => {
    setLoading(true)
    setStatsErr(null); setChartErr(null)
    const [sRes, cRes] = await Promise.allSettled([
      api.get('/admin/stats'),
      api.get('/admin/chart-data'),
    ])
    if (sRes.status === 'fulfilled') setStats(sRes.value)
    else setStatsErr(sRes.reason?.message || 'Stats yuklanmadi')
    if (cRes.status === 'fulfilled') setChart(cRes.value)
    else setChartErr(cRes.reason?.message || 'Chart yuklanmadi')
    setLoading(false)
  }, [])

  useEffect(() => { loadCore() }, [loadCore])

  useEffect(() => {
    const url = buildGrowthUrl(period, dateFrom, dateTo, singleDate)
    if (!url) return
    setGrowthLoading(true)
    setGrowthErr(null)
    api.get(url)
      .then(setGrowth)
      .catch(e => setGrowthErr(e?.message || 'Xatolik'))
      .finally(() => setGrowthLoading(false))
  }, [period, dateFrom, dateTo, singleDate])

  if (loading) return (
    <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>
  )

  const statCards = [
    { label: 'Bizneslar',            value: stats?.total_merchants ?? 0,                    color: '#2F6B3F', icon: <Store size={20} />, hint: stats?.total_merchants === 0 ? 'Hali biznes yo‘q' : null },
    { label: 'Mijozlar',             value: stats?.total_users ?? 0,                        color: '#5FAE6F', icon: <Users size={20} />, hint: null },
    { label: 'Faol (24 soat)',       value: stats?.active_24h ?? 0,                         color: '#16A34A', icon: <Activity size={20} />, hint: 'Ilova/webapp ochgan' },
    { label: 'Faol (7 kun)',         value: stats?.active_7d ?? 0,                          color: '#0EA5E9', icon: <UserCheck size={20} />, hint: 'So‘nggi 7 kun' },
    { label: 'Faol (30 kun)',        value: stats?.active_30d ?? 0,                         color: '#6366F1', icon: <UserCheck size={20} />, hint: 'So‘nggi 30 kun' },
    { label: 'Chiqarilgan kartalar', value: stats?.total_cards ?? 0,                        color: '#3F9C5C', icon: <CreditCard size={20} />, hint: null },
    { label: 'Tranzaksiyalar',       value: stats?.total_transactions ?? 0,                 color: '#84CC16', icon: <Repeat size={20} />, hint: null },
    { label: "Berilgan so'm",       value: (stats?.points_issued ?? 0).toLocaleString('ru-RU'),  color: '#2F6B3F', icon: <Coins size={20} />, hint: null },
  ]

  const areaData = chart?.daily_transactions ?? []
  const topMerchants = chart?.top_merchants ?? []
  const growthData = growth?.data ?? []

  const hasTxData = areaData.some(d => (d.total || 0) > 0)
  const hasMerchants = topMerchants.some(m => (m.cards || 0) > 0)
  const hasGrowth = growthData.some(g => (g.new_users || 0) + (g.new_merchants || 0) > 0)

  const PERIODS = [
    { key: '7d',     label: '7 kun' },
    { key: '30d',    label: '30 kun' },
    { key: 'custom', label: 'Davr' },
    { key: 'single', label: 'Bitta kun' },
  ]

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Dashboard</div>
          <div className="a-page-sub">Monvo platforma statistikasi</div>
        </div>
        <button className="db-reload-btn" onClick={loadCore} title="Qayta yuklash">
          <RefreshCw size={16} />
          <span>Yangilash</span>
        </button>
      </div>

      {(statsErr || chartErr) && (
        <div className="db-error">
          <AlertCircle size={18} />
          <div>
            {statsErr && <div>Stats: {statsErr}</div>}
            {chartErr && <div>Chart: {chartErr}</div>}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="a-stats-grid">
        {statCards.map((c, i) => (
          <div key={i} className="a-stat-card db-kpi" style={{ borderTop: `2px solid ${c.color}` }}>
            <div className="db-kpi-row">
              <div className="a-stat-label">{c.label}</div>
              <span className="db-kpi-icon" style={{ color: c.color }}>{c.icon}</span>
            </div>
            <div className="a-stat-value">{c.value}</div>
            {c.hint && <div className="db-kpi-hint">{c.hint}</div>}
          </div>
        ))}
      </div>

      {/* Transactions + Top merchants */}
      <div className="db-charts">
        <div className="a-card db-chart-card">
          <div className="db-chart-title">
            Kunlik tranzaksiyalar
            <span className="db-chart-unit">oxirgi 7 kun · dona</span>
          </div>
          {hasTxData ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={areaData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={areaStroke} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={areaStroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridColor} vertical={false} />
                <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="total" stroke={areaStroke} strokeWidth={2} fill="url(#grad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <ChartEmpty text="Hali tranzaksiyalar yo‘q"/>}
        </div>

        <div className="a-card db-chart-card">
          <div className="db-chart-title">
            Top bizneslar
            <span className="db-chart-unit">kartalar soni bo‘yicha</span>
          </div>
          {!hasMerchants ? (
            <ChartEmpty text="Hali aktiv biznes yo‘q"/>
          ) : topMerchants.filter(m => (m.cards || 0) > 0).length < 2 ? (
            // 1 ta biznes uchun bar chart o‘rniga oddiy ro‘yxat — visual noise emas
            <div className="db-merchant-list">
              {topMerchants.filter(m => (m.cards || 0) > 0).map((m, i) => (
                <div key={i} className="db-merchant-item">
                  <span className="db-merchant-rank" style={{ background: COLORS[i % COLORS.length] }}>
                    {i + 1}
                  </span>
                  <span className="db-merchant-name">{m.merchant}</span>
                  <span className="db-merchant-count">{m.cards} ta karta</span>
                </div>
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topMerchants} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridColor} vertical={false} />
                <XAxis dataKey="merchant" tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: gridColor }} />
                <Bar dataKey="cards" radius={[6, 6, 0, 0]}>
                  {topMerchants.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Growth section */}
      <div className="a-card db-growth-card">
        <div className="db-growth-header">
          <div>
            <div className="db-chart-title">O'sish dinamikasi</div>
            <div className="db-growth-sub">Yangi foydalanuvchilar va merchantlar</div>
          </div>
          <div className="db-period-filter">
            {PERIODS.map(p => (
              <button
                key={p.key}
                className={`db-period-btn${period === p.key ? ' active' : ''}`}
                onClick={() => setPeriod(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="db-date-inputs">
            <div className="db-date-group">
              <label>Boshlanish</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <span className="db-date-sep">—</span>
            <div className="db-date-group">
              <label>Tugash</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
        )}

        {period === 'single' && (
          <div className="db-date-inputs">
            <div className="db-date-group">
              <label>Sana</label>
              <input type="date" value={singleDate} onChange={e => setSingleDate(e.target.value)} />
            </div>
          </div>
        )}

        {growth && (
          <div className="db-growth-totals">
            <div className="db-growth-total">
              <span className="db-total-dot" style={{ background: '#5FAE6F' }} />
              <span className="db-total-label">Yangi foydalanuvchilar:</span>
              <span className="db-total-val">{growth.total_new_users}</span>
            </div>
            <div className="db-growth-total">
              <span className="db-total-dot" style={{ background: '#F59E0B' }} />
              <span className="db-total-label">Yangi merchantlar:</span>
              <span className="db-total-val">{growth.total_new_merchants}</span>
            </div>
          </div>
        )}

        {growthErr && (
          <div className="db-error">
            <AlertCircle size={18} />
            <div>Growth: {growthErr}</div>
          </div>
        )}

        {growthLoading ? (
          <div className="db-growth-loading"><div className="a-spinner" /></div>
        ) : hasGrowth ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={growthData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line
                type="monotone"
                dataKey="new_users"
                name="Yangi foydalanuvchilar"
                stroke="#5FAE6F"
                strokeWidth={2}
                dot={{ r: 3, fill: '#5FAE6F' }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="new_merchants"
                name="Yangi merchantlar"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ r: 3, fill: '#F59E0B' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : <ChartEmpty text="Tanlangan davrda ma'lumot yo'q" />}
      </div>
    </div>
  )
}
