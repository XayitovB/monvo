import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search, Calendar, X } from 'lucide-react'
import { usePaginated } from '../hooks/usePaginated'
import './Table.css'

const TZ = 'Asia/Tashkent'

const PERIODS = [
  { label: 'Bugun',   days: 1 },
  { label: '7 kun',  days: 7 },
  { label: '30 kun', days: 30 },
  { label: '90 kun', days: 90 },
  { label: 'Hammasi', days: null },
]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoStr(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function fmtDateTime(s) {
  return s ? new Date(s).toLocaleString('uz', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) : '—'
}

function sep(n) {
  return Math.round(Number(n ?? 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export default function Transactions() {
  const navigate = useNavigate()
  const [type, setType]       = useState('')
  const [period, setPeriod]   = useState(null)   // days chip
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  const hasCustomRange = dateFrom || dateTo

  const extraParams = {}
  if (type) extraParams.tx_type = type
  if (hasCustomRange) {
    if (dateFrom) extraParams.date_from = dateFrom
    if (dateTo)   extraParams.date_to   = dateTo
  } else if (period) {
    extraParams.date_from = daysAgoStr(period)
    if (period === 1) extraParams.date_to = todayStr()
  }

  const { data, total, page, setPage, totalPages, loading, search, setSearch } =
    usePaginated('/admin/transactions', extraParams)

  function selectPeriod(days) {
    setPeriod(days)
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  function handleDateFrom(v) {
    setDateFrom(v)
    setPeriod(null)
    setPage(1)
  }

  function handleDateTo(v) {
    setDateTo(v)
    setPeriod(null)
    setPage(1)
  }

  function clearDates() {
    setDateFrom('')
    setDateTo('')
    setPeriod(null)
    setPage(1)
  }

  return (
    <div>
      {/* Title */}
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Tranzaksiyalar</div>
          <div className="a-page-sub">Jami: {total}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        marginBottom: 16, padding: '12px 16px',
        background: 'var(--a-card)', border: '1px solid var(--a-border)',
        borderRadius: 12,
      }}>
        {/* Search */}
        <div className="a-search-wrap" style={{ flex: '1 1 180px', minWidth: 160, maxWidth: 260 }}>
          <Search size={14} className="a-search-icon" />
          <input className="a-input a-search-input" placeholder="Qidirish..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        {/* Type filter */}
        <select className="a-input" value={type}
          onChange={e => { setType(e.target.value); setPage(1) }}
          style={{ minWidth: 150, flex: '0 0 auto' }}>
          <option value="">Barcha turlar</option>
          <option value="earn">Ball berildi</option>
          <option value="redeem">Ishlatildi</option>
        </select>

        <div style={{ width: 1, height: 24, background: 'var(--a-border)', flexShrink: 0 }} />

        {/* Period chips */}
        <div style={{
          display: 'flex', gap: 3, flex: '0 0 auto',
          background: 'var(--a-bg)', border: '1px solid var(--a-border)',
          borderRadius: 10, padding: 3,
        }}>
          {PERIODS.map(p => (
            <button key={String(p.days)} onClick={() => selectPeriod(p.days)}
              style={{
                padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: !hasCustomRange && period === p.days ? 'var(--a-primary)' : 'transparent',
                color: !hasCustomRange && period === p.days ? '#fff' : 'var(--a-muted)',
                transition: 'all 0.15s',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--a-border)', flexShrink: 0 }} />

        {/* Custom date range */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
          background: hasCustomRange ? 'rgba(47,107,63,0.06)' : 'var(--a-bg)',
          border: `1px solid ${hasCustomRange ? 'var(--a-primary)' : 'var(--a-border)'}`,
          borderRadius: 10, padding: '5px 10px',
        }}>
          <Calendar size={13} style={{ color: hasCustomRange ? 'var(--a-primary)' : 'var(--a-muted)', flexShrink: 0 }} />
          <input type="date" value={dateFrom} onChange={e => handleDateFrom(e.target.value)}
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: 12, color: 'var(--a-text)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          />
          <span style={{ color: 'var(--a-muted)', fontSize: 12, userSelect: 'none' }}>—</span>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => handleDateTo(e.target.value)}
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: 12, color: 'var(--a-text)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          />
          {hasCustomRange && (
            <button onClick={clearDates} style={{
              border: 'none', background: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', padding: 2, color: 'var(--a-muted)',
            }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="a-table-wrap a-card">
        {loading ? (
          <div className="a-loading"><div className="a-spinner" /></div>
        ) : (
          <table className="a-table">
            <thead>
              <tr>
                <th>ID</th><th>Biznes</th><th>Kimga</th><th>Karta UID</th>
                <th>Turi</th><th>Ball</th><th>Summa</th><th>Vaqt</th>
              </tr>
            </thead>
            <tbody>
              {data.map(t => (
                <tr key={t.id} style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/panel/transactions/${t.id}`)}
                  title="Batafsil ko'rish">
                  <td className="td-dim">#{t.id}</td>
                  <td className="td-bold">{t.merchant}</td>
                  <td className="td-bold">{t.recipient || '—'}</td>
                  <td className="td-dim" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {t.card_uid?.slice(0, 12)}…
                  </td>
                  <td>
                    <span className={`a-badge ${t.tx_type === 'earn' ? 'a-badge-green' : 'a-badge-blue'}`}>
                      {t.tx_type === 'earn' ? 'Ball berildi' : 'Ishlatildi'}
                    </span>
                  </td>
                  <td className="td-bold" style={{ color: t.points_delta > 0 ? '#5FAE6F' : '#EF4444' }}>
                    {t.points_delta > 0 ? '+' : ''}{sep(t.points_delta)}
                  </td>
                  <td className="td-dim">{sep(t.amount || 0)} so'm</td>
                  <td className="td-dim">{fmtDateTime(t.created_at)}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={8} className="a-empty">Tranzaksiyalar topilmadi</td></tr>
              )}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="a-pagination">
            <button className="a-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span className="td-dim" style={{ fontSize: 13 }}>{page} / {totalPages}</span>
            <button className="a-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
