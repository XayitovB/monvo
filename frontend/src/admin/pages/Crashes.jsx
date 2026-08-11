import { useEffect, useState } from 'react'
import { RefreshCw, X, CheckCircle, Trash2, Smartphone, AlertTriangle } from 'lucide-react'
import { api } from '../api'
import './Table.css'

function fmtTime(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('ru-RU') } catch { return iso }
}

export default function Crashes() {
  const [data, setData] = useState({ items: [], total: 0, unresolved: 0 })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [onlyUnresolved, setOnlyUnresolved] = useState(true)
  const [detail, setDetail] = useState(null) // to'liq crash obyekti

  async function load() {
    setLoading(true); setErr(null)
    try {
      const q = onlyUnresolved ? '?resolved=false' : ''
      const res = await api.get(`/admin/crashes${q}`)
      setData(res || { items: [], total: 0, unresolved: 0 })
    } catch (e) {
      setErr(e?.message || 'Yuklab bo\'lmadi')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [onlyUnresolved])

  async function openDetail(id) {
    try { setDetail(await api.get(`/admin/crashes/${id}`)) }
    catch (e) { setErr(e?.message || 'Ochib bo\'lmadi') }
  }

  async function toggleResolve(id) {
    try {
      await api.post(`/admin/crashes/${id}/resolve`)
      setDetail(null); load()
    } catch (e) { setErr(e?.message || 'Xato') }
  }

  async function remove(id) {
    if (!window.confirm('Crashni o\'chirasizmi?')) return
    try { await api.delete(`/admin/crashes/${id}`); setDetail(null); load() }
    catch (e) { setErr(e?.message || 'Xato') }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Crash hisobotlari</div>
          <div className="a-page-sub">
            Ochiq: <b style={{ color: data.unresolved ? 'var(--a-danger, #dc2626)' : 'inherit' }}>{data.unresolved}</b>
            {' · '}Jami guruh: {data.total}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="a-btn a-btn-secondary" onClick={() => setOnlyUnresolved(v => !v)}>
            {onlyUnresolved ? 'Hammasini ko\'rsatish' : 'Faqat ochiqlar'}
          </button>
          <button className="a-btn a-btn-secondary" onClick={load}>
            <RefreshCw size={14} /> Yangilash
          </button>
        </div>
      </div>

      {err && <div className="a-card" style={{ padding: 12, marginBottom: 12, color: 'var(--a-danger, #dc2626)' }}>{err}</div>}

      <div className="a-card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--a-muted)' }}>Yuklanmoqda…</div>}
        {!loading && data.items.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--a-muted)' }}>
            🎉 Crash yo'q
          </div>
        )}
        {!loading && data.items.map((c) => (
          <div
            key={c.id}
            onClick={() => openDetail(c.id)}
            style={{
              padding: '12px 16px', borderBottom: '1px solid var(--a-border)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              opacity: c.resolved ? 0.55 : 1,
            }}
          >
            <AlertTriangle size={16} style={{ color: c.resolved ? 'var(--a-muted)' : 'var(--a-danger, #dc2626)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--a-text)' }}>{c.error_type || 'Error'}</div>
              <div style={{ fontSize: 12, color: 'var(--a-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(c.message || '').split('\n')[0]}
              </div>
              <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                {c.platform} · {c.screen || '—'} · v{c.app_version || '?'}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: 'var(--a-bg)', border: '1px solid var(--a-border)', color: 'var(--a-text)',
              }}>×{c.occurrences}</span>
              <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 4 }}>{fmtTime(c.last_seen)}</div>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <div
          onClick={() => setDetail(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--a-card, #fff)', color: 'var(--a-text)', borderRadius: 14,
              width: 760, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
              border: '1px solid var(--a-border)', boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px', borderBottom: '1px solid var(--a-border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{detail.error_type || 'Error'}</div>
                <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 2 }}>
                  ×{detail.occurrences} marta · {fmtTime(detail.first_seen)} → {fmtTime(detail.last_seen)}
                </div>
              </div>
              <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--a-muted)' }}><X size={20} /></button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Kontekst */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                {[
                  ['Platforma', detail.platform],
                  ['Versiya', detail.app_version],
                  ['OS', detail.os_version],
                  ['Qurilma', detail.device_model],
                  ['Ekran', detail.screen],
                  ['Fatal', detail.fatal ? 'ha' : 'yo\'q'],
                ].map(([k, v]) => (
                  <span key={k} style={{ padding: '4px 10px', background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8 }}>
                    <span style={{ color: 'var(--a-muted)' }}>{k}:</span> <b>{v || '—'}</b>
                  </span>
                ))}
              </div>

              {/* Xabar (sabab) */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--a-muted)', marginBottom: 6 }}>SABAB</div>
                <pre style={{ margin: 0, padding: 12, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8, fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {detail.message || '—'}
                </pre>
              </div>

              {/* Stack-trace */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--a-muted)', marginBottom: 6 }}>STACK-TRACE</div>
                <pre style={{ margin: 0, padding: 12, background: '#0e1014', color: '#e2e8f0', borderRadius: 8, fontSize: 11.5, lineHeight: 1.5, overflowX: 'auto', maxHeight: 320 }}>
                  {detail.stack_trace || '—'}
                </pre>
              </div>

              {/* Breadcrumbs */}
              {detail.breadcrumbs?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--a-muted)', marginBottom: 6 }}>OXIRGI AMALLAR (breadcrumbs)</div>
                  <pre style={{ margin: 0, padding: 12, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {detail.breadcrumbs.join('\n')}
                  </pre>
                </div>
              )}

              {detail.affected_versions?.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--a-muted)' }}>
                  <Smartphone size={12} style={{ verticalAlign: 'middle' }} /> Versiyalar: {detail.affected_versions.join(', ')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--a-border)' }}>
              <button className="a-btn a-btn-secondary" onClick={() => remove(detail.id)}>
                <Trash2 size={14} /> O'chirish
              </button>
              <button className="a-btn a-btn-primary" onClick={() => toggleResolve(detail.id)}>
                <CheckCircle size={14} /> {detail.resolved ? 'Qayta ochish' : 'Hal qilindi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
