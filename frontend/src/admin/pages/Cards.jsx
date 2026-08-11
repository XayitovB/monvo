import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { usePaginated } from '../hooks/usePaginated'
import { api } from '../api'
import './Table.css'

export default function Cards() {
  const { data, total, page, setPage, totalPages, loading } = usePaginated('/admin/cards')

  async function exportCsv() {
    try {
      await api.download('/admin/cards/export', `cards-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (e) {
      alert(e.message || 'Export xatosi')
    }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Kartalar</div>
          <div className="a-page-sub">Jami chiqarilgan: {total}</div>
        </div>
        <button className="a-btn a-btn-secondary" onClick={exportCsv}>
          <Download size={14} /> CSV
        </button>
      </div>

      <div className="a-table-wrap a-card">
        {loading ? (
          <div className="a-loading"><div className="a-spinner" /></div>
        ) : (
          <table className="a-table">
            <thead>
              <tr>
                <th>ID</th><th>Biznes</th><th>Egasining ismi</th>
                <th>Ball</th><th>Holat</th><th>Chiqarilgan</th>
              </tr>
            </thead>
            <tbody>
              {data.map(c => (
                <tr key={c.id}>
                  <td className="td-dim">#{c.id}</td>
                  <td className="td-bold">{c.merchant}</td>
                  <td>{c.holder_name || '—'}</td>
                  <td className="td-bold">{c.points}</td>
                  <td>
                    <span className={`a-badge ${c.is_active ? 'a-badge-green' : 'a-badge-red'}`}>
                      {c.is_active ? 'Faol' : 'Bloklangan'}
                    </span>
                  </td>
                  <td className="td-dim">{c.issued_at ? new Date(c.issued_at).toLocaleDateString('uz') : ''}</td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={6} className="a-empty">Kartalar topilmadi</td></tr>}
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
