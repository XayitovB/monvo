import { useState, useEffect, useMemo } from 'react'
import { Send, Users, Store, User, Globe } from 'lucide-react'
import { api } from '../api'

// "+998 90 123 45 67" — +998 prefiksi doimo turadi, qolgani formatlanadi.
function formatUzPhone(raw) {
  let d = (raw || '').replace(/\D/g, '')
  if (d.startsWith('998')) d = d.slice(3)
  d = d.slice(0, 9)
  let s = '+998'
  if (d.length > 0) s += ' ' + d.slice(0, 2)
  if (d.length > 2) s += ' ' + d.slice(2, 5)
  if (d.length > 5) s += ' ' + d.slice(5, 7)
  if (d.length > 7) s += ' ' + d.slice(7, 9)
  return s
}

export default function Push() {
  const [audience, setAudience] = useState('all')   // all | users | merchants | single
  const [role, setRole] = useState('user')           // user | merchant | admin
  const [tariffStatus, setTariffStatus] = useState('all') // all | paid | unpaid | expired
  const [tariffId, setTariffId] = useState('')      // '' or number
  const [userId, setUserId] = useState('')
  const [sug, setSug] = useState([])       // o'xshash foydalanuvchilar
  const [showSug, setShowSug] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('info')   // info | promo | bonus | reminder | warning
  const [imageUrl, setImageUrl] = useState('')
  const [route, setRoute] = useState('')             // '' | card | promotions | profile | url
  const [routeId, setRouteId] = useState('')

  const [tariffs, setTariffs] = useState([])
  const [logs, setLogs] = useState([])
  const [count, setCount] = useState(null)
  const [countLoading, setCountLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // bir xil faylni qayta tanlash mumkin bo'lsin
    if (!file) return
    setUploading(true)
    try {
      const r = await api.upload('/admin/upload-image', file)
      setImageUrl(r.url)
    } catch (err) {
      alert('Yuklashda xato: ' + (err.message || ''))
    } finally {
      setUploading(false)
    }
  }
  const [msg, setMsg] = useState('')

  // Load tariffs + logs
  useEffect(() => {
    api.get('/admin/tariffs').then(r => setTariffs(r.items ?? r ?? [])).catch(() => {})
    api.get('/admin/push/logs').then(r => setLogs(r.items ?? r ?? [])).catch(() => {})
  }, [])

  // "Yagona" — raqam yozilganda o'xshash foydalanuvchilarni qidirish (typeahead)
  useEffect(() => {
    if (audience !== 'single') { setSug([]); return }
    const digits = userId.replace(/\D/g, '').replace(/^998/, '')
    if (digits.length < 2) { setSug([]); return }
    const tmr = setTimeout(() => {
      api.get(`/admin/users?search=${encodeURIComponent(digits)}&role=user&limit=8`)
        .then(r => { setSug(Array.isArray(r) ? r : (r.items || [])); setShowSug(true) })
        .catch(() => setSug([]))
    }, 300)
    return () => clearTimeout(tmr)
  }, [userId, audience])

  // Build payload
  const payload = useMemo(() => {
    const p = {}
    if (audience === 'single') {
      const ph = userId.trim()
      if (ph) p.user_phone = ph
    } else if (audience === 'users') {
      p.audience = 'users'
      p.role = role
    } else if (audience === 'merchants') {
      p.audience = 'merchants'
      if (tariffStatus !== 'all') p.tariff_status = tariffStatus
      if (tariffId) p.tariff_id = parseInt(tariffId, 10)
    } else {
      p.audience = 'all'
    }
    return p
  }, [audience, role, tariffStatus, tariffId, userId])

  const [countSupported, setCountSupported] = useState(true)

  // Refresh recipient count when filters change (debounced)
  useEffect(() => {
    if (!countSupported) return
    let cancelled = false
    setCountLoading(true)
    const timer = setTimeout(async () => {
      try {
        const r = await api.post('/admin/push/audience-count', payload)
        if (!cancelled) setCount(r.user_count ?? 0)
      } catch (err) {
        if (cancelled) return
        const msg = String(err?.message || '').toLowerCase()
        if (msg.includes('404') || msg.includes('not found')) {
          setCountSupported(false)
        }
        setCount(null)
      } finally {
        if (!cancelled) setCountLoading(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [payload, countSupported])

  async function send(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      setMsg('✗ Sarlavha va matn shart')
      return
    }
    if (audience === 'single' && !payload.user_phone) {
      setMsg('✗ Telefon raqam kiriting')
      return
    }
    const ok = window.confirm(
      count != null
        ? `${count} ta foydalanuvchiga push yuborasizmi?`
        : 'Push xabarni yuborasizmi?'
    )
    if (!ok) return

    setSending(true)
    setMsg('')
    try {
      const res = await api.post('/admin/push/send', {
        title: title.trim(), body: body.trim(),
        category, image_url: imageUrl.trim(),
        route, route_id: routeId.trim(),
        ...payload,
      })
      setMsg(`✓ Yuborildi: ${res.sent ?? 0} qurilma · ${res.recipients ?? 0} kishi`)
      setTitle(''); setBody(''); setUserId(''); setImageUrl(''); setRoute(''); setRouteId('')
      api.get('/admin/push/logs').then(r => setLogs(r.items ?? r ?? []))
    } catch (err) {
      setMsg(`✗ Xato: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  const audienceOptions = [
    { value: 'all', icon: Globe, label: 'Hammaga' },
    { value: 'users', icon: Users, label: 'Mijozlar' },
    { value: 'merchants', icon: Store, label: 'Bizneslar' },
    { value: 'single', icon: User, label: 'Yagona' },
  ]

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Push Xabarlar</div>
          <div className="a-page-sub">Segmentatsiya bilan FCM xabar tarqatish</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div className="a-card" style={{ padding: 24 }}>
          <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Audience picker */}
            <div>
              <div style={labelSt}>Audiensiya</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {audienceOptions.map(o => {
                  const Icon = o.icon
                  const active = audience === o.value
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setAudience(o.value)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px', borderRadius: 10,
                        border: `1px solid ${active ? 'var(--a-green)' : 'var(--a-border)'}`,
                        background: active ? 'var(--a-green)' : 'var(--a-card2)',
                        color: active ? 'white' : 'var(--a-text)',
                        fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Icon size={15} /> {o.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Conditional filters */}
            {audience === 'users' && (
              <FilterCard label="Mijoz turi">
                <PillRow>
                  {[
                    { v: 'user', l: 'Oddiy mijoz' },
                    { v: 'merchant', l: 'Merchant' },
                    { v: 'admin', l: 'Admin' },
                  ].map(o => (
                    <Pill key={o.v} active={role === o.v} onClick={() => setRole(o.v)}>{o.l}</Pill>
                  ))}
                </PillRow>
              </FilterCard>
            )}

            {audience === 'merchants' && (
              <FilterCard label="To'lov holati">
                <PillRow>
                  <Pill active={tariffStatus === 'all'} onClick={() => setTariffStatus('all')}>Hammasi</Pill>
                  <Pill active={tariffStatus === 'paid'} tone="good" onClick={() => setTariffStatus('paid')}>To'lagan</Pill>
                  <Pill active={tariffStatus === 'unpaid'} tone="warn" onClick={() => setTariffStatus('unpaid')}>To'lamagan</Pill>
                  <Pill active={tariffStatus === 'expired'} tone="bad" onClick={() => setTariffStatus('expired')}>Muddati tugagan</Pill>
                </PillRow>
                <div style={{ marginTop: 14, ...labelSt, fontSize: 11 }}>Tarif rejasi</div>
                <PillRow>
                  <Pill active={tariffId === ''} onClick={() => setTariffId('')}>Hamma rejalar</Pill>
                  {tariffs.map(t => (
                    <Pill key={t.id} active={String(tariffId) === String(t.id)} onClick={() => setTariffId(String(t.id))}>{t.name}</Pill>
                  ))}
                </PillRow>
              </FilterCard>
            )}

            {audience === 'single' && (
              <div style={{ position: 'relative' }}>
                <div style={labelSt}>Telefon raqam</div>
                <input
                  className="a-input" type="tel"
                  value={userId || '+998 '}
                  onChange={e => setUserId(formatUzPhone(e.target.value))}
                  onFocus={() => { if (!userId) setUserId('+998 '); setShowSug(true) }}
                  onBlur={() => setTimeout(() => setShowSug(false), 150)}
                  placeholder="+998 90 123 45 67"
                />
                {showSug && sug.length > 0 && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 30,
                    marginTop: 4, background: 'var(--a-card, #fff)',
                    border: '1px solid var(--a-border)', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto',
                  }}>
                    {sug.map(u => (
                      <div
                        key={u.id}
                        onMouseDown={() => { setUserId(formatUzPhone(u.phone || '')); setShowSug(false) }}
                        style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--a-line, #f1f5f9)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--a-bg, #f8fafc)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.name || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--a-muted)' }}>{u.phone || ''}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>
                  Raqam yozing — o'xshash foydalanuvchilar chiqadi.
                </div>
              </div>
            )}

            {/* Recipient count */}
            {countSupported && <CountBanner count={count} loading={countLoading} />}

            {/* Message */}
            <div>
              <div style={labelSt}>Sarlavha</div>
              <input
                className="a-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                placeholder="Xabar sarlavhasi"
              />
            </div>
            <div>
              <div style={labelSt}>Matn</div>
              <textarea
                className="a-input"
                value={body}
                onChange={e => setBody(e.target.value)}
                required
                placeholder="Xabar matni"
                rows={4}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Kategoriya (ilovada ikonka + rang) */}
            <div>
              <div style={labelSt}>Kategoriya</div>
              <PillRow>
                {CATEGORIES.map(c => (
                  <Pill key={c.value} active={category === c.value} onClick={() => setCategory(c.value)}>
                    {c.emoji} {c.label}
                  </Pill>
                ))}
              </PillRow>
            </div>

            {/* Rasm (rich push) — URL yoki fayl yuklash */}
            <div>
              <div style={labelSt}>Rasm (ixtiyoriy)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="a-input" value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://... yoki rasm yuklang"
                  style={{ flex: 1 }}
                />
                <label className="a-btn a-btn-secondary" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {uploading ? 'Yuklanmoqda…' : '📤 Rasm yuklash'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              {imageUrl && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={imageUrl} alt="banner"
                    style={{ height: 56, borderRadius: 8, border: '1px solid var(--a-border)', objectFit: 'cover' }} />
                  <button type="button" className="a-btn" style={{ padding: '4px 10px' }}
                    onClick={() => setImageUrl('')}>Olib tashlash</button>
                </div>
              )}
            </div>

            {/* Bosilganda yo'naltirish */}
            <div>
              <div style={labelSt}>Bosilganda ochilsin</div>
              <select className="a-input" value={route} onChange={e => { setRoute(e.target.value); setRouteId('') }}>
                <option value="">Hech narsa (faqat xabar)</option>
                <option value="card">Karta</option>
                <option value="promotions">Aksiyalar</option>
                <option value="profile">Profil</option>
                <option value="url">Tashqi havola (URL)</option>
              </select>
              {(route === 'card' || route === 'url') && (
                <input
                  className="a-input" value={routeId}
                  onChange={e => setRouteId(e.target.value)}
                  placeholder={route === 'card' ? 'Karta ID' : 'https://...'}
                  style={{ marginTop: 8 }}
                />
              )}
            </div>

            {msg && <div style={{ fontSize: 13, color: msg.startsWith('✓') ? 'var(--a-green)' : 'var(--a-red)' }}>{msg}</div>}

            <button type="submit" className="a-btn a-btn-primary" disabled={sending} style={{ justifyContent: 'center' }}>
              {sending ? <><span className="a-spinner" /> Yuborilmoqda...</> : <><Send size={14} /> Yuborish</>}
            </button>
          </form>
        </div>

        <div className="a-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 16 }}>Yuborilgan xabarlar</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {logs.slice(0, 12).map((l, i) => (
              <div key={i} style={{ padding: '12px 14px', background: 'var(--a-card2)', borderRadius: 10, border: '1px solid var(--a-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{l.title}</div>
                  <span className="a-badge a-badge-green">{l.sent_count}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--a-muted)', margin: '4px 0 6px' }}>{l.body}</div>
                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--a-dim)', flexWrap: 'wrap' }}>
                  <span><i className="bi bi-geo-alt" style={{fontSize:13, marginRight:3}}/>{l.target}</span>
                  {l.recipients != null && <span>👤 {l.recipients} kishi</span>}
                  <span>📬 {l.sent_count} yetdi{l.failed_count ? ` · ${l.failed_count} xato` : ''}</span>
                  {l.recipients > 0 && (
                    <span style={{ color: 'var(--a-green)', fontWeight: 600 }}>
                      👁 {l.read_count ?? 0} o'qidi ({Math.round((l.read_count ?? 0) / l.recipients * 100)}%)
                    </span>
                  )}
                  <span><i className="bi bi-clock" style={{fontSize:13, marginRight:3}}/>{new Date(l.sent_at).toLocaleString('uz')}</span>
                </div>
              </div>
            ))}
            {logs.length === 0 && <div className="a-empty" style={{ padding: 30 }}>Hali xabar yuborilmagan</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

const CATEGORIES = [
  { value: 'info', emoji: 'ℹ️', label: 'Maʼlumot' },
  { value: 'promo', emoji: '🔥', label: 'Aksiya' },
  { value: 'bonus', emoji: '🎁', label: 'Bonus' },
  { value: 'reminder', emoji: '⏰', label: 'Eslatma' },
  { value: 'warning', emoji: '⚠️', label: 'Ogohlantirish' },
]

const labelSt = {
  display: 'block', fontSize: 12, color: 'var(--a-muted)', marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600,
}

function FilterCard({ label, children }) {
  return (
    <div style={{ padding: 14, background: 'var(--a-card2)', borderRadius: 12, border: '1px solid var(--a-border)' }}>
      <div style={{ ...labelSt, fontSize: 11, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

function PillRow({ children }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
}

function Pill({ active, tone = 'neutral', onClick, children }) {
  const colors = {
    neutral: 'var(--a-green)',
    good: '#16A34A',
    warn: '#D97706',
    bad: '#DC2626',
  }
  const c = colors[tone] || colors.neutral
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999,
        border: `1px solid ${active ? c : 'var(--a-border)'}`,
        background: active ? c : 'transparent',
        color: active ? 'white' : 'var(--a-text)',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function CountBanner({ count, loading }) {
  const color = count == null ? 'var(--a-muted)' : count === 0 ? '#DC2626' : 'var(--a-green)'
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 10,
      background: count === 0 ? 'rgba(220,38,38,0.08)' : 'rgba(47,107,63,0.08)',
      border: `1px solid ${color}33`,
      fontSize: 13, color: 'var(--a-text)',
    }}>
      {loading ? 'Hisoblanmoqda...' :
       count == null ? 'Olquvchi sonini hisoblashda xatolik' :
       <span><b style={{ color, fontFamily: 'JetBrains Mono, monospace' }}>{count}</b> ta foydalanuvchi qabul qiladi</span>
      }
    </div>
  )
}
