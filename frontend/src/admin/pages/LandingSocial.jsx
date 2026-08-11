import { useEffect, useState } from 'react'
import { Plus, Save, RefreshCw, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, X } from 'lucide-react'
import { api } from '../api'

const PLATFORMS = [
  { id: 'telegram',  label: 'Telegram',  color: '#2AABEE', placeholder: 'https://t.me/Monvo_uz' },
  { id: 'instagram', label: 'Instagram', color: '#E1306C', placeholder: 'https://instagram.com/monvo' },
  { id: 'facebook',  label: 'Facebook',  color: '#1877F2', placeholder: 'https://facebook.com/monvo' },
  { id: 'youtube',   label: 'YouTube',   color: '#FF0000', placeholder: 'https://youtube.com/@monvo' },
  { id: 'x',         label: 'X (Twitter)', color: '#000', placeholder: 'https://x.com/monvo' },
  { id: 'tiktok',    label: 'TikTok',    color: '#010101', placeholder: 'https://tiktok.com/@monvo' },
  { id: 'linkedin',  label: 'LinkedIn',  color: '#0A66C2', placeholder: 'https://linkedin.com/company/monvo' },
]

const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map(p => [p.id, p]))

function emptyForm() {
  return { platform: 'telegram', url: '', is_active: true, sort_order: 0 }
}

export default function LandingSocial() {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(emptyForm())
  const [err, setErr]         = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/admin/landing-social-links')
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setErr(e.message || 'Yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const startNew = () => {
    setForm(emptyForm())
    setEditing('new')
    setErr('')
  }

  const startEdit = (row) => {
    setForm({ platform: row.platform, url: row.url, is_active: row.is_active, sort_order: row.sort_order })
    setEditing(row.id)
    setErr('')
  }

  const cancel = () => { setEditing(null); setForm(emptyForm()); setErr('') }

  const save = async () => {
    if (!form.url.trim()) { setErr('URL majburiy'); return }
    setBusy(true); setErr('')
    try {
      const body = { platform: form.platform, url: form.url.trim(), is_active: form.is_active, sort_order: Number(form.sort_order) || 0 }
      if (editing === 'new') await api.post('/admin/landing-social-links', body)
      else await api.patch(`/admin/landing-social-links/${editing}`, body)
      cancel()
      await load()
    } catch (e) {
      setErr(e.message || 'Saqlab bo\'lmadi')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('O\'chirishni tasdiqlaysizmi?')) return
    setBusy(true)
    try { await api.delete(`/admin/landing-social-links/${id}`); await load() }
    finally { setBusy(false) }
  }

  const toggleActive = async (row) => {
    setBusy(true)
    try { await api.patch(`/admin/landing-social-links/${row.id}`, { is_active: !row.is_active }); await load() }
    finally { setBusy(false) }
  }

  if (loading) return <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>

  return (
    <div>
      <div className="a-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="a-page-title">Ijtimoiy tarmoqlar</div>
          <div className="a-page-sub">Sayt footer'iga ko'rsatiladigan ijtimoiy tarmoq havolalari</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={startNew} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Yangi havola
        </button>
      </div>

      {err && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 13 }}>{err}</div>}

      {/* Editor */}
      {editing && (
        <div className="a-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{editing === 'new' ? 'Yangi havola' : 'Havolani tahrirlash'}</div>
            <button className="a-btn" onClick={cancel} style={{ padding: '6px 10px' }}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr 80px', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label className="a-label">Platforma</label>
              <select className="a-input" value={form.platform} onChange={e => setForm(s => ({ ...s, platform: e.target.value }))}>
                {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="a-label">URL</label>
              <input
                className="a-input"
                value={form.url}
                onChange={e => setForm(s => ({ ...s, url: e.target.value }))}
                placeholder={PLATFORM_MAP[form.platform]?.placeholder || 'https://...'}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="a-label">Tartib</label>
              <input className="a-input" type="number" value={form.sort_order}
                onChange={e => setForm(s => ({ ...s, sort_order: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 10 }}>
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(s => ({ ...s, is_active: e.target.checked }))}
                  style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 13 }}>Aktiv</span>
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="a-btn a-btn-primary" onClick={save} disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {busy ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
              Saqlash
            </button>
            <button className="a-btn" onClick={cancel}>Bekor qilish</button>
          </div>
        </div>
      )}

      {/* Lookup preview */}
      {items.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {items.filter(r => r.is_active).map(r => {
            const p = PLATFORM_MAP[r.platform] || {}
            return (
              <a key={r.id} href={r.url} target="_blank" rel="noreferrer"
                style={{
                  width: 36, height: 36, borderRadius: 8, background: p.color || '#666',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none',
                  title: p.label,
                }}>
                {(p.label || r.platform).slice(0, 2).toUpperCase()}
              </a>
            )
          })}
          <span style={{ fontSize: 12, color: 'var(--a-muted)', alignSelf: 'center' }}>— footer'da shunday ko'rinadi</span>
        </div>
      )}

      {/* List */}
      <div className="a-card" style={{ padding: 0, overflow: 'hidden' }}>
        {items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--a-muted)' }}>
            Havolalar yo'q. «Yangi havola» tugmasini bosing.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--a-surface-alt, rgba(0,0,0,0.02))', textAlign: 'left' }}>
                {['Platforma', 'URL', 'Holat', 'Amallar'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const p = PLATFORM_MAP[row.platform] || {}
                return (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--a-line, rgba(0,0,0,0.06))' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 7, background: p.color || '#888',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
                        }}>{(p.label || row.platform).slice(0, 2).toUpperCase()}</div>
                        <strong>{p.label || row.platform}</strong>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <a href={row.url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12.5, color: 'var(--a-muted)', textDecoration: 'none', fontFamily: 'monospace' }}>
                        {row.url.length > 50 ? row.url.slice(0, 50) + '…' : row.url}
                      </a>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 999, fontWeight: 600,
                        background: row.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.2)',
                        color: row.is_active ? '#15803d' : '#475569',
                      }}>{row.is_active ? 'AKTIV' : 'YASHIRIN'}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="a-btn" onClick={() => toggleActive(row)} title={row.is_active ? 'Yashirish' : "Ko'rsatish"} style={{ padding: '6px 8px' }}>
                          {row.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button className="a-btn" onClick={() => startEdit(row)} style={{ padding: '6px 12px' }}>Tahrirlash</button>
                        <button className="a-btn" onClick={() => remove(row.id)} style={{ padding: '6px 8px', color: '#ef4444' }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
