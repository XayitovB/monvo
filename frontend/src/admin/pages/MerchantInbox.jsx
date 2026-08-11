import { useEffect, useMemo, useState } from 'react'
import { Send, Trash2, Megaphone, Users, Store, Search, Check } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'

const TONES = [
  { key: 'neutral', label: 'Oddiy',          color: '#64748B' },
  { key: 'brand',   label: 'Brend',          color: '#3F9C5C' },
  { key: 'good',    label: 'Ijobiy',         color: '#10B981' },
  { key: 'warn',    label: 'Ogohlantirish',  color: '#F59E0B' },
  { key: 'bad',     label: 'Muhim',          color: '#EF4444' },
]
const TONE_COLOR = Object.fromEntries(TONES.map(t => [t.key, t.color]))

const EMPTY = { title: '', body: '', tone: 'brand', icon: 'notifications' }

export default function MerchantInbox() {
  const [form, setForm]       = useState(EMPTY)
  const [scope, setScope]     = useState('all')      // all | one
  const [merchants, setMerchants] = useState([])
  const [pick, setPick]       = useState(null)       // tanlangan merchant {id, name}
  const [mq, setMq]           = useState('')         // merchant qidiruv
  const [list, setList]       = useState([])         // yuborilgan tarix
  const [err, setErr]         = useState('')
  const [ok, setOk]           = useState('')
  const [busy, setBusy]       = useState(false)

  async function loadHistory() {
    try { setList(await api.get('/admin/merchants/inbox') || []) }
    catch (e) { setErr(e.message) }
  }
  async function loadMerchants() {
    try {
      const res = await api.get('/admin/merchants?limit=1000')
      setMerchants(res.items ?? res ?? [])
    } catch { /* picker ixtiyoriy */ }
  }
  useEffect(() => { loadHistory(); loadMerchants() }, [])

  const filtered = useMemo(() => {
    const q = mq.trim().toLowerCase()
    if (!q) return merchants.slice(0, 8)
    return merchants
      .filter(m => (m.business_name || m.name || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [mq, merchants])

  async function send() {
    setErr(''); setOk('')
    if (!form.title.trim() || !form.body.trim()) return setErr('Sarlavha va matn shart')
    if (scope === 'one' && !pick) return setErr('Merchant tanlang')
    setBusy(true)
    try {
      await api.post('/admin/merchants/inbox', {
        title: form.title.trim(),
        body: form.body.trim(),
        tone: form.tone,
        icon: form.icon || 'notifications',
        merchant_id: scope === 'one' ? pick.id : null,
      })
      setOk(scope === 'one' ? `Yuborildi → ${pick.name}` : 'Barcha merchantlarga yuborildi')
      setForm(EMPTY); setPick(null); setMq(''); setScope('all')
      await loadHistory()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  async function del(id) {
    if (!confirm("Xabar o'chirilsin?")) return
    try { await api.delete(`/admin/merchants/inbox/${id}`); await loadHistory() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Merchant e'lonlar</div>
          <div className="a-page-sub">Merchantlarning bildirishnoma qutisiga xabar yuborish</div>
        </div>
      </div>

      {err && <div className="lb-error" style={{ marginBottom: 12 }}>{err}</div>}
      {ok && <div className="lb-error" style={{ marginBottom: 12, background: 'rgba(16,185,129,.12)', color: '#10B981', borderColor: 'transparent' }}>✓ {ok}</div>}

      {/* ── Compose ── */}
      <div className="lb-card" style={{ display: 'block', padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <ScopeBtn active={scope === 'all'} onClick={() => setScope('all')} icon={<Users size={14} />} label="Barcha merchantlar" />
          <ScopeBtn active={scope === 'one'} onClick={() => setScope('one')} icon={<Store size={14} />} label="Bitta merchant" />
        </div>

        {scope === 'one' && (
          <div style={{ marginBottom: 14 }}>
            {pick ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--m-brand-soft, #e8f3ec)', color: '#2f7a48', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                <Store size={14} /> {pick.name}
                <button onClick={() => setPick(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2f7a48', fontWeight: 700 }}>×</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: .5 }} />
                  <input
                    className="lb-input"
                    style={{ width: '100%', paddingLeft: 30 }}
                    placeholder="Merchant qidirish..."
                    value={mq}
                    onChange={e => setMq(e.target.value)}
                  />
                </div>
                {(mq || filtered.length > 0) && (
                  <div style={{ marginTop: 6, border: '1px solid var(--a-line, #e5e7eb)', borderRadius: 8, overflow: 'hidden' }}>
                    {filtered.length === 0 && <div style={{ padding: 10, fontSize: 13, opacity: .6 }}>Topilmadi</div>}
                    {filtered.map(m => (
                      <div key={m.id}
                        onClick={() => { setPick({ id: m.id, name: m.business_name || m.name || `#${m.id}` }); setMq('') }}
                        style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid var(--a-line, #f1f5f9)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--m-brand-soft, #f3faf5)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >{m.business_name || m.name || `#${m.id}`}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <label className="lb-field"><span>Sarlavha</span>
          <input value={form.title} maxLength={200} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Masalan: Yangilanish haqida" />
        </label>
        <label className="lb-field"><span>Matn</span>
          <textarea rows={4} value={form.body} maxLength={4000} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Xabar matni..." />
        </label>

        <div className="lb-field"><span>Rang / muhimlik</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {TONES.map(t => (
              <button key={t.key} onClick={() => setForm({ ...form, tone: t.key })}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                  border: `1.5px solid ${form.tone === t.key ? t.color : 'var(--a-line, #e5e7eb)'}`,
                  background: form.tone === t.key ? t.color + '18' : 'transparent',
                  color: form.tone === t.key ? t.color : 'var(--a-ink-soft, #475569)',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: t.color }} />
                {t.label}
                {form.tone === t.key && <Check size={12} />}
              </button>
            ))}
          </div>
        </div>

        <div className="lb-modal-actions" style={{ marginTop: 16 }}>
          <button className="a-btn a-btn-primary" onClick={send} disabled={busy}>
            <Send size={14} /> {busy ? 'Yuborilmoqda...' : 'Yuborish'}
          </button>
        </div>
      </div>

      {/* ── History ── */}
      <div className="a-page-sub" style={{ marginBottom: 10, fontWeight: 600 }}>Yuborilgan xabarlar</div>
      <div className="lb-list">
        {list.map(m => (
          <div key={m.id} className="lb-card" style={{ borderLeft: `3px solid ${TONE_COLOR[m.tone] || '#888'}` }}>
            <div className="lb-card-icon" style={{ background: (TONE_COLOR[m.tone] || '#888') + '22', color: TONE_COLOR[m.tone] || '#888' }}>
              <Megaphone size={20} />
            </div>
            <div className="lb-card-body">
              <div className="lb-card-title">{m.title}</div>
              <div className="lb-card-config">{m.body}</div>
              <div className="lb-card-type">
                {m.broadcast
                  ? <span style={{ color: '#3F9C5C', fontWeight: 600 }}>📣 Barcha merchantlar</span>
                  : <span>🏪 {m.merchant_name || `#${m.merchant_id}`}</span>}
                {' · '}{m.created_at ? new Date(m.created_at).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                {!m.broadcast && (m.is_read ? ' · ✓ o\'qildi' : ' · o\'qilmagan')}
              </div>
            </div>
            <div className="lb-card-actions">
              <button className="lb-icon-btn danger" onClick={() => del(m.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="lb-empty"><div className="lb-empty-title">Hali xabar yuborilmagan</div></div>}
      </div>
    </div>
  )
}

function ScopeBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9,
      border: `1.5px solid ${active ? '#3F9C5C' : 'var(--a-line, #e5e7eb)'}`,
      background: active ? 'rgba(63,156,92,.10)' : 'transparent',
      color: active ? '#2f7a48' : 'var(--a-ink-soft, #475569)',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
    }}>{icon}{label}</button>
  )
}
