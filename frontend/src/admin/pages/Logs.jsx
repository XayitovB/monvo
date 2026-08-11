import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Download, X } from 'lucide-react'
import { api } from '../api'
import './Table.css'

const PAGE_SIZE = 100

export default function Logs() {
  const [filters, setFilters] = useState({ user_id: '', action: '', date_from: '', date_to: '' })
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ logs: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)

  async function load() {
    setLoading(true)
    setErr(null)
    const params = new URLSearchParams({
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
    if (filters.user_id) params.append('user_id', filters.user_id)
    if (filters.action) params.append('action', filters.action)
    if (filters.date_from) params.append('date_from', filters.date_from)
    if (filters.date_to) params.append('date_to', filters.date_to)

    try {
      const res = await api.get(`/admin/logs/search?${params}`)
      setData(res || { logs: [], total: 0 })
    } catch (e) {
      setErr(e?.message || 'Yuklab bo\'lmadi')
    }
    setLoading(false)
  }

  // Re-run on page change AND on filter change — filter changes were silently ignored.
  useEffect(() => { load() }, [page, filters])

  function exportCsv() {
    const params = new URLSearchParams()
    if (filters.user_id) params.append('user_id', filters.user_id)
    if (filters.action) params.append('action', filters.action)
    if (filters.date_from) params.append('date_from', filters.date_from)
    if (filters.date_to) params.append('date_to', filters.date_to)
    api.download(`/admin/logs/export?${params}`, 'audit-logs.csv')
  }

  function applyFilters() {
    setPage(1)
    load()
  }

  function clearFilters() {
    setFilters({ user_id: '', action: '', date_from: '', date_to: '' })
    setPage(1)
    setTimeout(load, 50)
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Audit Loglar</div>
          <div className="a-page-sub">Tizim faoliyati: {data.total.toLocaleString()} ta yozuv</div>
        </div>
        <button className="a-btn a-btn-secondary" onClick={exportCsv}>
          <Download size={14} /> CSV yuklab olish
        </button>
      </div>

      <div className="a-card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
          <label style={{ fontSize: 11, color: 'var(--a-muted)' }}>User ID</label>
          <input type="number" value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
                 style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8, color: 'var(--a-text)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 160 }}>
          <label style={{ fontSize: 11, color: 'var(--a-muted)' }}>Amal (qidiruv)</label>
          <input type="text" value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                 placeholder="login, scan..."
                 style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8, color: 'var(--a-text)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--a-muted)' }}>Dan</label>
          <input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                 style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8, color: 'var(--a-text)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: 'var(--a-muted)' }}>Gacha</label>
          <input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}
                 style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8, color: 'var(--a-text)' }} />
        </div>
        <button className="a-btn a-btn-primary" onClick={applyFilters}><Search size={14} /> Qidirish</button>
        <button className="a-btn a-btn-secondary" onClick={clearFilters}><X size={14} /></button>
      </div>

      {err && <div className="al-error" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="a-table-wrap a-card">
        {loading ? (
          <div className="a-loading"><div className="a-spinner" /></div>
        ) : (
          <table className="a-table">
            <thead>
              <tr><th>ID</th><th>Foydalanuvchi</th><th>Harakat</th><th>Vaqt</th></tr>
            </thead>
            <tbody>
              {data.logs.map(l => (
                <tr key={l.id}>
                  <td className="td-dim">#{l.id}</td>
                  <td>{l.user_name || l.actor || (l.user_id ? `User #${l.user_id}` : 'Tizim')}<br /><span className="td-dim" style={{ fontSize: 11 }}>{l.user_email || ''}</span></td>
                  <td><span className="a-badge a-badge-blue">{l.action}</span></td>
                  <td className="td-dim">{new Date(l.timestamp).toLocaleString('uz')}</td>
                </tr>
              ))}
              {data.logs.length === 0 && <tr><td colSpan={4} className="a-empty">Loglar topilmadi</td></tr>}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="a-pagination">
            <button className="a-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
            <span className="td-dim" style={{ fontSize: 13 }}>{page} / {totalPages}</span>
            <button className="a-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
