import { useEffect, useRef, useState } from 'react'
import {
  Plus, Save, RefreshCw, Trash2, Eye, EyeOff, Star,
  ArrowUp, ArrowDown, Upload, X, User as UserIcon,
} from 'lucide-react'
import { api } from '../api'

const MAX_FILE_BYTES = 450 * 1024

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('FileReader xatosi'))
    r.readAsDataURL(file)
  })
}

function emptyForm() {
  return {
    quote_uz: '', quote_ru: '',
    author_name: '',
    author_role_uz: '', author_role_ru: '',
    avatar_url: '',
    rating: 5,
    sort_order: 0,
    is_active: true,
    is_featured: false,
  }
}

function StarPicker({ value, onChange, readOnly = false }) {
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" disabled={readOnly}
          onClick={() => !readOnly && onChange(i)}
          style={{
            background: 'none', border: 'none', padding: 2,
            cursor: readOnly ? 'default' : 'pointer',
            color: i <= value ? '#facc15' : '#cbd5e1',
          }}
        ><Star size={16} fill={i <= value ? '#facc15' : 'none'} /></button>
      ))}
    </div>
  )
}

export default function LandingReviews() {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(emptyForm())
  const [err, setErr]         = useState('')
  const fileRef = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.get('/admin/landing-reviews')
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      setErr(e.message || 'Yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const startNew = () => { setForm(emptyForm()); setEditing('new'); setErr('') }
  const startEdit = (row) => {
    setForm({
      quote_uz: row.quote_uz, quote_ru: row.quote_ru || '',
      author_name: row.author_name,
      author_role_uz: row.author_role_uz || '', author_role_ru: row.author_role_ru || '',
      avatar_url: row.avatar_url || '',
      rating: row.rating, sort_order: row.sort_order,
      is_active: row.is_active, is_featured: row.is_featured,
    })
    setEditing(row.id); setErr('')
  }
  const cancel = () => { setEditing(null); setForm(emptyForm()); setErr('') }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!/^image\//.test(f.type)) { setErr('Faqat rasm fayllari'); return }
    if (f.size > MAX_FILE_BYTES) {
      setErr(`Fayl ${Math.round(f.size / 1024)} KB — limit ${Math.round(MAX_FILE_BYTES / 1024)} KB`); return
    }
    try {
      const dataUrl = await readFileAsDataUrl(f)
      setForm(s => ({ ...s, avatar_url: dataUrl }))
      setErr('')
    } catch (ex) { setErr(ex.message || 'Faylni o\'qib bo\'lmadi') }
  }

  const save = async () => {
    if (!form.quote_uz.trim() || !form.author_name.trim()) {
      setErr("O'zbek tilidagi sharh va muallif ismi majburiy"); return
    }
    setBusy(true); setErr('')
    try {
      const body = {
        quote_uz: form.quote_uz.trim(),
        quote_ru: form.quote_ru.trim(),
        author_name: form.author_name.trim(),
        author_role_uz: form.author_role_uz.trim(),
        author_role_ru: form.author_role_ru.trim(),
        avatar_url: form.avatar_url,
        rating: Number(form.rating) || 5,
        sort_order: Number(form.sort_order) || 0,
        is_active: !!form.is_active,
        is_featured: !!form.is_featured,
      }
      if (editing === 'new') await api.post('/admin/landing-reviews', body)
      else await api.patch(`/admin/landing-reviews/${editing}`, body)
      cancel()
      await load()
    } catch (e) {
      setErr(e.message || 'Saqlab bo\'lmadi')
    } finally { setBusy(false) }
  }

  const remove = async (id) => {
    if (!confirm('Sharhni o\'chirishni tasdiqlaysizmi?')) return
    setBusy(true)
    try { await api.delete(`/admin/landing-reviews/${id}`); await load() }
    finally { setBusy(false) }
  }

  const toggleActive = async (row) => {
    setBusy(true)
    try { await api.patch(`/admin/landing-reviews/${row.id}`, { is_active: !row.is_active }); await load() }
    finally { setBusy(false) }
  }

  const move = async (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= items.length) return
    const order = items.map(r => r.id)
    const [moved] = order.splice(idx, 1)
    order.splice(target, 0, moved)
    setBusy(true)
    try { await api.post('/admin/landing-reviews/reorder', { order }); await load() }
    finally { setBusy(false) }
  }

  if (loading) return <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>

  return (
    <div>
      <div className="a-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="a-page-title">Landing sharhlar</div>
          <div className="a-page-sub">Mijozlardan kelgan sharhlarni boshqarish (uz/ru)</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={startNew}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Yangi sharh
        </button>
      </div>

      {err && <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 13 }}>{err}</div>}

      {/* Editor */}
      {editing && (
        <div className="a-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{editing === 'new' ? 'Yangi sharh' : `Sharh #${editing}`}</div>
            <button className="a-btn" onClick={cancel} style={{ padding: '6px 10px' }}><X size={14} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24 }}>
            {/* Avatar */}
            <div>
              <div style={{
                width: 160, height: 160, borderRadius: 999,
                background: 'var(--a-surface-alt, rgba(0,0,0,0.04))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', border: '1px solid var(--a-line, rgba(0,0,0,0.08))',
              }}>
                {form.avatar_url
                  ? <img src={form.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <UserIcon size={48} color="#94a3b8" />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
              <button className="a-btn" onClick={() => fileRef.current?.click()}
                style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Upload size={14} /> Avatar yuklash
              </button>
              <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 6, textAlign: 'center' }}>
                Ixtiyoriy · ≤ 450 KB
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Author + rating */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 100px', gap: 12 }}>
                <div>
                  <label className="a-label">Muallif ismi</label>
                  <input className="a-input" value={form.author_name}
                    onChange={e => setForm(s => ({ ...s, author_name: e.target.value }))}
                    placeholder="Madina Yusupova" maxLength={120} />
                </div>
                <div>
                  <label className="a-label">Reyting</label>
                  <div style={{ paddingTop: 10 }}>
                    <StarPicker value={form.rating} onChange={v => setForm(s => ({ ...s, rating: v }))} />
                  </div>
                </div>
                <div>
                  <label className="a-label">Tartib</label>
                  <input className="a-input" type="number" value={form.sort_order}
                    onChange={e => setForm(s => ({ ...s, sort_order: e.target.value }))} />
                </div>
              </div>

              {/* Roles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="a-label">Lavozim (UZ)</label>
                  <input className="a-input" value={form.author_role_uz}
                    onChange={e => setForm(s => ({ ...s, author_role_uz: e.target.value }))}
                    placeholder="Egasi, Beauty Bar Tashkent" maxLength={160} />
                </div>
                <div>
                  <label className="a-label">Lavozim (RU)</label>
                  <input className="a-input" value={form.author_role_ru}
                    onChange={e => setForm(s => ({ ...s, author_role_ru: e.target.value }))}
                    placeholder="Владелец, Beauty Bar Tashkent" maxLength={160} />
                </div>
              </div>

              {/* Quotes */}
              <div>
                <label className="a-label">Sharh (UZ) *</label>
                <textarea className="a-input" value={form.quote_uz}
                  onChange={e => setForm(s => ({ ...s, quote_uz: e.target.value }))}
                  rows={3} maxLength={2000}
                  placeholder="Qog'oz kartalardan voz kechdik — pushaymon bo'lmadik..."
                  style={{ resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div>
                <label className="a-label">Sharh (RU)</label>
                <textarea className="a-input" value={form.quote_ru}
                  onChange={e => setForm(s => ({ ...s, quote_ru: e.target.value }))}
                  rows={3} maxLength={2000}
                  placeholder="Отказались от бумажных карт — и не пожалели..."
                  style={{ resize: 'vertical', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 4 }}>
                  Bo'sh qoldirsangiz, RU foydalanuvchilarga UZ versiyasi ko'rsatiladi.
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setForm(s => ({ ...s, is_active: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  <span>Aktiv</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_featured}
                    onChange={e => setForm(s => ({ ...s, is_featured: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: 'pointer' }} />
                  <span>Tanlangan (yuqorida ko'rsatish)</span>
                </label>
              </div>

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
        {items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--a-muted)' }}>
            Sharhlar yo'q. Yuqoridagi «Yangi sharh» tugmasini bosing.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((row, idx) => (
              <div key={row.id} style={{
                padding: 18, borderTop: idx === 0 ? 'none' : '1px solid var(--a-line, rgba(0,0,0,0.06))',
                display: 'grid', gridTemplateColumns: '60px 80px 1fr 200px', gap: 16, alignItems: 'center',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button className="a-btn" onClick={() => move(idx, -1)} disabled={idx === 0 || busy}
                    style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }}><ArrowUp size={14} /></button>
                  <button className="a-btn" onClick={() => move(idx, 1)} disabled={idx === items.length - 1 || busy}
                    style={{ padding: 4, opacity: idx === items.length - 1 ? 0.3 : 1 }}><ArrowDown size={14} /></button>
                </div>

                <div style={{
                  width: 60, height: 60, borderRadius: 999, background: 'var(--a-surface-alt, rgba(0,0,0,0.05))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {row.avatar_url
                    ? <img src={row.avatar_url} alt={row.author_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <UserIcon size={24} color="#94a3b8" />}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{row.author_name}</span>
                    <StarPicker value={row.rating} onChange={() => {}} readOnly />
                    {row.is_featured && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'rgba(250,204,21,0.2)', color: '#854d0e', fontWeight: 600 }}>★ TANLANGAN</span>}
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                      background: row.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.2)',
                      color: row.is_active ? '#15803d' : '#475569',
                    }}>{row.is_active ? 'AKTIV' : 'YASHIRIN'}</span>
                  </div>
                  {row.author_role_uz && <div style={{ fontSize: 12, color: 'var(--a-muted)', marginBottom: 6 }}>{row.author_role_uz}</div>}
                  <div style={{ fontSize: 13, color: 'var(--a-ink, inherit)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    «{row.quote_uz}»
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button className="a-btn" onClick={() => toggleActive(row)} title={row.is_active ? 'Yashirish' : "Ko'rsatish"} style={{ padding: '6px 8px' }}>
                    {row.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button className="a-btn" onClick={() => startEdit(row)} style={{ padding: '6px 12px' }}>Tahrirlash</button>
                  <button className="a-btn" onClick={() => remove(row.id)} title="O'chirish" style={{ padding: '6px 8px', color: '#ef4444' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
