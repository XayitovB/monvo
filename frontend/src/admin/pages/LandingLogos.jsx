import { useEffect, useRef, useState } from 'react'
import {
  ImageIcon, Plus, Save, RefreshCw, Trash2, Eye, EyeOff,
  ArrowUp, ArrowDown, Upload, X,
} from 'lucide-react'
import { api } from '../api'

const MAX_FILE_BYTES = 450 * 1024  // ~450 KB raw → ~600 KB base64

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('FileReader xatosi'))
    r.readAsDataURL(file)
  })
}

function emptyForm() {
  return { name: '', image_url: '', href: '', category: 'partner', sort_order: 0, is_active: true, _fileName: null }
}

const CAT_LABEL = {
  partner: 'Sherikla biznes',
  pos: 'POS tizim',
}

export default function LandingLogos() {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState(false)
  const [editing, setEditing] = useState(null)  // id or 'new' or null
  const [form, setForm]     = useState(emptyForm())
  const [err, setErr]       = useState('')
  const [filter, setFilter] = useState('all')   // 'all' | 'partner' | 'pos'
  const fileRef = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/admin/landing-logos')
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setErr(e.message || 'Yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visibleItems = filter === 'all' ? items : items.filter(r => (r.category || 'partner') === filter)

  const startNew = () => {
    setForm({ ...emptyForm(), category: filter === 'all' ? 'partner' : filter })
    setEditing('new')
    setErr('')
  }

  const startEdit = (row) => {
    setForm({
      name: row.name,
      image_url: row.image_url,
      href: row.href || '',
      category: row.category || 'partner',
      sort_order: row.sort_order,
      is_active: row.is_active,
      _fileName: row.image_url?.startsWith('data:') ? 'Yuklangan fayl' : null,
    })
    setEditing(row.id)
    setErr('')
  }

  const cancel = () => {
    setEditing(null)
    setForm(emptyForm())
    setErr('')
  }

  const processFile = async (f) => {
    if (!f) return
    if (!/^image\//.test(f.type)) { setErr('Faqat rasm fayllari (PNG, SVG, JPG, WebP)'); return }
    if (f.size > MAX_FILE_BYTES) { setErr(`Fayl ${Math.round(f.size / 1024)} KB — limit ${Math.round(MAX_FILE_BYTES / 1024)} KB`); return }
    try {
      const dataUrl = await readFileAsDataUrl(f)
      setForm(s => ({ ...s, image_url: dataUrl, _fileName: f.name }))
      setErr('')
    } catch (ex) {
      setErr(ex.message || 'Faylni o\'qib bo\'lmadi')
    }
  }

  const onFile = (e) => processFile(e.target.files?.[0])

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    processFile(e.dataTransfer.files?.[0])
  }

  const [dragOver, setDragOver] = useState(false)

  const save = async () => {
    if (!form.name.trim() || !form.image_url) {
      setErr('Nom va rasm majburiy')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const body = {
        name: form.name.trim(),
        image_url: form.image_url,
        href: form.href.trim(),
        category: form.category || 'partner',
        sort_order: Number(form.sort_order) || 0,
        is_active: !!form.is_active,
        // _fileName is UI-only, never sent to API
      }
      if (editing === 'new') {
        await api.post('/admin/landing-logos', body)
      } else {
        await api.patch(`/admin/landing-logos/${editing}`, body)
      }
      cancel()
      await load()
    } catch (e) {
      setErr(e.message || 'Saqlab bo\'lmadi')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Logoni o\'chirishni tasdiqlaysizmi?')) return
    setBusy(true)
    try {
      await api.delete(`/admin/landing-logos/${id}`)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (row) => {
    setBusy(true)
    try {
      await api.patch(`/admin/landing-logos/${row.id}`, { is_active: !row.is_active })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const move = async (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= items.length) return
    const order = items.map(r => r.id)
    const [moved] = order.splice(idx, 1)
    order.splice(target, 0, moved)
    setBusy(true)
    try {
      await api.post('/admin/landing-logos/reorder', { order })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>

  return (
    <div>
      <div className="a-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="a-page-title">Landing logolar</div>
          <div className="a-page-sub">Sherikla biznes va integratsiya qilingan POS tizim logolarini boshqarish</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Filter */}
          <div style={{ display: 'inline-flex', background: 'var(--a-surface-alt, rgba(0,0,0,0.04))', padding: 3, borderRadius: 8 }}>
            {[
              { id: 'all', label: 'Hammasi' },
              { id: 'partner', label: 'Sheriklar' },
              { id: 'pos', label: 'POS' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setFilter(opt.id)}
                style={{
                  padding: '6px 14px', fontSize: 12.5, fontWeight: 600, letterSpacing: 0.2,
                  background: filter === opt.id ? '#fff' : 'transparent',
                  color: filter === opt.id ? '#111' : 'var(--a-muted)',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  boxShadow: filter === opt.id ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                }}
              >{opt.label}</button>
            ))}
          </div>
          <button className="a-btn a-btn-primary" onClick={startNew}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} /> Yangi logo
          </button>
        </div>
      </div>

      {err && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 13 }}>{err}</div>}

      {/* Editor */}
      {editing && (
        <div className="a-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{editing === 'new' ? 'Yangi logo' : `Logo #${editing}`}</div>
            <button className="a-btn" onClick={cancel} style={{ padding: '6px 10px' }}><X size={14} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 24 }}>
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                style={{
                  width: 190, height: 130, borderRadius: 12, cursor: 'pointer',
                  background: dragOver ? 'rgba(47,107,63,0.06)' : '#fff',
                  border: `2px dashed ${dragOver ? '#2f6b3f' : 'var(--a-line, rgba(0,0,0,0.12))'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 6, overflow: 'hidden',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {form.image_url
                  ? <img src={form.image_url} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <>
                      <Upload size={22} color="#94a3b8" />
                      <span style={{ fontSize: 11, color: 'var(--a-muted)', textAlign: 'center', lineHeight: 1.4 }}>
                        Bosing yoki<br/>fayl tashlang
                      </span>
                    </>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 6, textAlign: 'center' }}>
                PNG / SVG / JPG ≤ 450 KB
              </div>
              {form.image_url && (
                <button
                  className="a-btn"
                  onClick={() => { setForm(s => ({ ...s, image_url: '', _fileName: null })); if (fileRef.current) fileRef.current.value = '' }}
                  style={{ marginTop: 6, width: '100%', fontSize: 12, color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                >
                  <X size={12} /> Rasmni o'chirish
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="a-label">Biznes nomi</label>
                <input className="a-input" value={form.name}
                  onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                  placeholder="Coffee Lab" maxLength={100} />
              </div>

              <div>
                <label className="a-label">Rasm URL <span style={{ color: 'var(--a-muted)', fontWeight: 400 }}>(yoki yuqoriga fayl tashlang)</span></label>
                {form._fileName || form.image_url?.startsWith('data:') ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    background: 'rgba(47,107,63,0.08)', borderRadius: 8, border: '1px solid rgba(47,107,63,0.2)',
                  }}>
                    <ImageIcon size={14} color="#2f6b3f" />
                    <span style={{ fontSize: 13, color: '#2f6b3f', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {form._fileName || 'Fayl yuklangan'}
                    </span>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748b' }}
                      onClick={() => fileRef.current?.click()}><Upload size={13} /></button>
                  </div>
                ) : (
                  <input className="a-input" value={form.image_url}
                    onChange={e => setForm(s => ({ ...s, image_url: e.target.value, _fileName: null }))}
                    placeholder="https://example.com/logo.png" />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
                <div>
                  <label className="a-label">Havola (ixtiyoriy)</label>
                  <input className="a-input" value={form.href}
                    onChange={e => setForm(s => ({ ...s, href: e.target.value }))}
                    placeholder="https://coffeelab.uz" />
                </div>
                <div>
                  <label className="a-label">Kategoriya</label>
                  <select className="a-input" value={form.category}
                    onChange={e => setForm(s => ({ ...s, category: e.target.value }))}>
                    <option value="partner">Sherikla biznes</option>
                    <option value="pos">POS tizim</option>
                  </select>
                </div>
                <div>
                  <label className="a-label">Tartib</label>
                  <input className="a-input" type="number" value={form.sort_order}
                    onChange={e => setForm(s => ({ ...s, sort_order: e.target.value }))} />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(s => ({ ...s, is_active: e.target.checked }))}
                  style={{ width: 18, height: 18, cursor: 'pointer' }} />
                <span>Aktiv (saytda ko'rsatish)</span>
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button className="a-btn a-btn-primary" onClick={save} disabled={busy}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {busy ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                  Saqlash
                </button>
                <button className="a-btn" onClick={cancel}>Bekor qilish</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="a-card" style={{ padding: 0, overflow: 'hidden' }}>
        {visibleItems.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--a-muted)' }}>
            {filter === 'pos'
              ? "POS tizim logolari yo'q. «Yangi logo» tugmasini bosib qo'shing."
              : filter === 'partner'
                ? "Sherikla biznes logolari yo'q. «Yangi logo» tugmasini bosing."
                : "Logolar yo'q. Yuqoridagi «Yangi logo» tugmasini bosing."}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--a-surface-alt, rgba(0,0,0,0.02))', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase', letterSpacing: 0.5, width: 80 }}>Tartib</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase', letterSpacing: 0.5, width: 100 }}>Logo</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Nom</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase', letterSpacing: 0.5, width: 120 }}>Kategoriya</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Holat</th>
                <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase', letterSpacing: 0.5, width: 200, textAlign: 'right' }}>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((row, idx) => (
                <tr key={row.id} style={{ borderTop: '1px solid var(--a-line, rgba(0,0,0,0.06))' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="a-btn" onClick={() => move(idx, -1)} disabled={idx === 0 || busy}
                        style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }}><ArrowUp size={14} /></button>
                      <button className="a-btn" onClick={() => move(idx, 1)} disabled={idx === visibleItems.length - 1 || busy}
                        style={{ padding: 4, opacity: idx === visibleItems.length - 1 ? 0.3 : 1 }}><ArrowDown size={14} /></button>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ width: 80, height: 40, background: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}>
                      <img src={row.image_url} alt={row.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                    {row.href && <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>{row.href}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 999, fontWeight: 600,
                      background: (row.category === 'pos') ? 'rgba(124,58,237,0.15)' : 'rgba(47,107,63,0.15)',
                      color: (row.category === 'pos') ? '#6d28d9' : '#1f4d2c',
                    }}>
                      {CAT_LABEL[row.category || 'partner'] || 'Sherikla biznes'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      fontSize: 11, padding: '3px 8px', borderRadius: 999, fontWeight: 600,
                      background: row.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.2)',
                      color: row.is_active ? '#15803d' : '#475569',
                    }}>
                      {row.is_active ? 'AKTIV' : 'YASHIRIN'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="a-btn" onClick={() => toggleActive(row)} title={row.is_active ? 'Yashirish' : "Ko'rsatish"} style={{ padding: '6px 8px' }}>
                        {row.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button className="a-btn" onClick={() => startEdit(row)} style={{ padding: '6px 12px' }}>Tahrirlash</button>
                      <button className="a-btn" onClick={() => remove(row.id)} title="O'chirish" style={{ padding: '6px 8px', color: '#ef4444' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
