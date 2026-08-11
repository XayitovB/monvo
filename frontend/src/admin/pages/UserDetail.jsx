import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '../api'
import './Table.css'

const TABS = [
  { key: 'merchants',  label: 'Bizneslar',   icon: 'bi-shop' },
  { key: 'cards',      label: 'Kartalar',    icon: 'bi-credit-card' },
  { key: 'history',    label: 'Tarix',       icon: 'bi-arrow-left-right' },
  { key: 'devices',    label: 'Qurilmalar',  icon: 'bi-phone' },
  { key: 'activity',   label: 'Loglar',      icon: 'bi-list-ul' },
]

const ACTION_LABELS = {
  phone_auth: 'Telefon orqali kirish',
  google_auth: 'Google orqali kirish',
  login: 'Kirish',
  register: "Ro'yxatdan o'tish",
  logout: 'Chiqish',
}

const ROLE_COLORS = { user: '#64748b', merchant: '#2F6B3F', admin: '#d97706' }
const ROLE_LABELS = { user: 'User', merchant: 'Merchant', admin: 'Admin' }

const TZ = 'Asia/Tashkent'
function fmt(n) { return Number(n || 0).toLocaleString('uz') }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('uz', { timeZone: TZ }) : '—' }
function fmtDateTime(s) { return s ? new Date(s).toLocaleString('uz', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—' }
function fmtMoney(v) {
  const n = Number(v) || 0
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(0)
}

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('merchants')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [toggling, setToggling] = useState(false)
  const [showTx, setShowTx] = useState(false)

  async function load() {
    setLoading(true); setErr(null)
    try {
      const d = await api.get(`/admin/users/${id}`)
      setData(d)
    } catch (e) {
      setErr(e?.message || 'Yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  async function toggle() {
    setToggling(true)
    try {
      await api.patch(`/admin/users/${id}/toggle`, {})
      await load()
    } catch (e) { alert(e?.message) }
    finally { setToggling(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div className="a-spinner" />
    </div>
  )
  if (err) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--a-red)' }}>{err}</div>
  if (!data) return null

  const u = data.user
  const role = u?.role || 'user'

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button className="a-btn a-btn-secondary" style={{ padding: '8px 12px' }}
          onClick={() => navigate('/panel/users')}>
          <ArrowLeft size={16} />
        </button>

        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: (ROLE_COLORS[role] || '#64748b') + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800, color: ROLE_COLORS[role] || '#64748b',
        }}>
          {(u?.name || u?.phone || '?')[0]?.toUpperCase()}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>
              {u?.name && u.name !== u?.phone ? u.name : (u?.phone || '—')}
            </h1>
            <span style={{
              padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: (ROLE_COLORS[role] || '#64748b') + '22',
              color: ROLE_COLORS[role] || '#64748b',
              border: `1px solid ${(ROLE_COLORS[role] || '#64748b')}44`,
            }}>
              {ROLE_LABELS[role] || role}
            </span>
            <span style={{
              padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: u?.is_active ? 'rgba(63,156,92,0.15)' : 'rgba(239,68,68,0.12)',
              color: u?.is_active ? 'var(--a-green)' : 'var(--a-red)',
              border: `1px solid ${u?.is_active ? 'rgba(63,156,92,0.3)' : 'rgba(239,68,68,0.25)'}`,
            }}>
              {u?.is_active ? 'Faol' : 'Bloklangan'}
            </span>
            {u?.language && (
              <span style={{
                padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: u.language === 'ru' ? '#ef444422' : '#2f6b3f22',
                color: u.language === 'ru' ? '#ef4444' : '#2F6B3F',
              }}>
                {u.language === 'ru' ? '🇷🇺 RU' : '🇺🇿 UZ'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--a-muted)', marginTop: 2 }}>
            #{u?.id}
            {u?.phone && ` · ${u.phone}`}
            {u?.email && ` · ${u.email}`}
            {` · Qo'shilgan: ${fmtDate(u?.created_at)}`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="a-btn a-btn-primary"
            onClick={() => setShowTx(true)}
            disabled={!data.cards?.length}
            title={data.cards?.length ? '' : 'Avval karta kerak'}
          >
            <i className="bi bi-plus-lg" /> Tranzaksiya
          </button>
          <button
            className={`a-btn ${u?.is_active ? 'a-btn-danger' : 'a-btn-primary'}`}
            onClick={toggle} disabled={toggling}
          >
            <i className={`bi ${u?.is_active ? 'bi-person-slash' : 'bi-person-check'}`} />
            {toggling ? '...' : u?.is_active ? 'Bloklash' : 'Faollashtirish'}
          </button>
        </div>
      </div>

      {showTx && (
        <AddTxModal
          userId={id}
          cards={data.cards || []}
          onClose={() => setShowTx(false)}
          onSaved={() => { setShowTx(false); load() }}
        />
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { icon: 'bi-shop',          label: 'Bizneslar',  value: fmt(data.totals?.merchants_count), color: '#2F6B3F' },
          { icon: 'bi-credit-card',   label: 'Kartalar',   value: fmt(data.totals?.cards_count),     color: '#8b5cf6' },
          { icon: 'bi-coin',          label: 'Ballar',     value: fmt(data.totals?.points_balance),  color: '#f59e0b' },
          { icon: 'bi-bag',           label: "Xaridlar",   value: `${fmtMoney(data.totals?.total_spend)} so'm`, color: '#3b82f6' },
        ].map(k => (
          <div key={k.label} className="a-card" style={{ padding: '14px 16px' }}>
            <i className={`bi ${k.icon}`} style={{ fontSize: 18, color: k.color }} />
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* User info row */}
      <div className="a-card" style={{ padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { icon: 'bi-telephone', label: 'Telefon',        value: u?.phone || '—' },
          { icon: 'bi-calendar3', label: "Ro'yxatdan",     value: fmtDateTime(u?.created_at) },
          { icon: 'bi-clock',     label: "So'nggi kirish", value: fmtDateTime(u?.last_login_at) },
          u?.birth_date && { icon: 'bi-gift', label: "Tug'ilgan", value: fmtDate(u?.birth_date) },
        ].filter(Boolean).map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <i className={`bi ${f.icon}`} style={{ color: 'var(--a-muted)', fontSize: 13 }} />
            <span style={{ color: 'var(--a-muted)' }}>{f.label}:</span>
            <span style={{ fontWeight: 600 }}>{f.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--a-border)', marginBottom: 20 }}>
        {TABS.map(t => {
          const count = t.key === 'merchants' ? data.merchants?.length
            : t.key === 'cards' ? data.cards?.length
            : t.key === 'history' ? data.history?.length
            : t.key === 'activity' ? data.activity?.length
            : data.devices?.length
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 16px', border: 'none', background: 'transparent',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              color: tab === t.key ? 'var(--a-primary)' : 'var(--a-muted)',
              borderBottom: tab === t.key ? '2px solid var(--a-primary)' : '2px solid transparent',
              marginBottom: -1, transition: 'color 0.15s',
            }}>
              <i className={`bi ${t.icon}`} style={{ fontSize: 13 }} />
              {t.label}
              <span style={{
                background: 'var(--a-card2)', borderRadius: 20,
                padding: '1px 7px', fontSize: 11, color: 'var(--a-muted)',
              }}>{count ?? 0}</span>
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'merchants'  && <MerchantsTab items={data.merchants} navigate={navigate} />}
      {tab === 'cards'      && <CardsTab items={data.cards} />}
      {tab === 'history'    && <HistoryTab items={data.history} />}
      {tab === 'devices'    && <DevicesTab items={data.devices} />}
      {tab === 'activity'   && <ActivityTab items={data.activity} />}
    </div>
  )
}

/* ── Tranzaksiya qo'shish modal ── */
function AddTxModal({ userId, cards, onClose, onSaved }) {
  const [cardUid, setCardUid] = useState(cards[0]?.card_uid || '')
  const [txType, setTxType] = useState('earn')
  const [points, setPoints] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    const p = parseInt(points, 10)
    if (!cardUid) { setErr('Karta tanlang'); return }
    if (!p || p <= 0) { setErr("Ball musbat bo'lishi kerak"); return }
    setSaving(true); setErr('')
    try {
      await api.post(`/admin/users/${userId}/transactions`, {
        card_uid: cardUid,
        tx_type: txType,
        points: p,
        amount: amount ? Number(amount) : 0,
        note: note.trim(),
      })
      onSaved()
    } catch (e) {
      setErr(e?.message || 'Xato')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--a-card)', borderRadius: 14, padding: 24, width: 440,
        maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Tranzaksiya qo'shish</div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span style={{ color: 'var(--a-muted)' }}>Karta (biznes)</span>
          <select className="a-input" value={cardUid} onChange={e => setCardUid(e.target.value)}>
            {cards.map(c => (
              <option key={c.card_uid} value={c.card_uid}>
                {(c.merchant?.business_name || '—')} · {c.points} ball
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span style={{ color: 'var(--a-muted)' }}>Tur</span>
          <select className="a-input" value={txType} onChange={e => setTxType(e.target.value)}>
            <option value="earn">Yig'ish (+ball)</option>
            <option value="redeem">Sarflash (−ball)</option>
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--a-muted)' }}>Ball</span>
            <input className="a-input" type="number" min="1" value={points}
              onChange={e => setPoints(e.target.value)} placeholder="0" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ color: 'var(--a-muted)' }}>Summa (ixtiyoriy)</span>
            <input className="a-input" type="number" min="0" value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="0 so'm" />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span style={{ color: 'var(--a-muted)' }}>Izoh (comment)</span>
          <textarea className="a-input" rows={2} value={note}
            onChange={e => setNote(e.target.value)} maxLength={300}
            placeholder="Masalan: aksiya bonusi, qo'lda tuzatish..." />
        </label>

        {err && <div style={{ color: 'var(--a-red)', fontSize: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="a-btn a-btn-secondary" style={{ flex: 1 }} onClick={onClose}>Bekor</button>
          <button className="a-btn a-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={save}>
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Merchants ── */
function MerchantsTab({ items, navigate }) {
  if (!items?.length) return <Empty text="Hech qanday biznes yo'q" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(m => (
        <div key={m.merchant_id} className="a-card" style={{
          padding: 16, display: 'flex', gap: 14, alignItems: 'center',
          cursor: 'pointer', transition: 'border-color 0.15s',
        }}
          onClick={() => navigate(`/panel/merchants/${m.merchant_id}`)}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'var(--a-primary-soft, rgba(47,107,63,0.14))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Admin temasiga mos rang — merchant brand_color qorong'i bo'lsa
                dark temada ikonka ko'rinmay qolardi. */}
            <i className="bi bi-shop" style={{ fontSize: 18, color: 'var(--a-primary, #3F9C5C)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{m.merchant_name}</div>
            <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 2 }}>
              {m.tx_count} tranzaksiya
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, color: '#10b981' }}>+{fmt(m.points_earned)}</div>
              <div style={{ fontSize: 10, color: 'var(--a-muted)' }}>olingan</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800, color: '#ef4444' }}>-{fmt(m.points_redeemed)}</div>
              <div style={{ fontSize: 10, color: 'var(--a-muted)' }}>sarflangan</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 800 }}>{fmt(m.total_spend)}</div>
              <div style={{ fontSize: 10, color: 'var(--a-muted)' }}>so'm</div>
            </div>
          </div>
          <i className="bi bi-chevron-right" style={{ color: 'var(--a-muted)', fontSize: 13 }} />
        </div>
      ))}
    </div>
  )
}

/* ── Cards ── */
function CardsTab({ items }) {
  if (!items?.length) return <Empty text="Karta yo'q" />
  return (
    <div className="a-table-wrap a-card">
      <table className="a-table">
        <thead>
          <tr><th>UID</th><th>Biznes</th><th>Ballar</th><th>Holat</th><th>Yaratilgan</th></tr>
        </thead>
        <tbody>
          {items.map(c => (
            <tr key={c.card_uid}>
              <td><code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--a-muted)' }}>{c.card_uid}</code></td>
              <td className="td-bold">{c.merchant?.business_name || '—'}</td>
              <td style={{ fontWeight: 700, color: 'var(--a-green)' }}>{fmt(c.points)}</td>
              <td>
                {c.is_active
                  ? <CheckCircle size={14} style={{ color: 'var(--a-green)' }} />
                  : <XCircle size={14} style={{ color: 'var(--a-red)' }} />}
              </td>
              <td className="td-dim">{fmtDate(c.issued_at || c.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── History ── */
function HistoryTab({ items }) {
  const [sort, setSort] = useState('desc')
  if (!items?.length) return <Empty text="Tarix yo'q" />
  const sorted = [...items].sort((a, b) => {
    const da = new Date(a.created_at), db = new Date(b.created_at)
    return sort === 'desc' ? db - da : da - db
  })
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--a-muted)' }}>{sorted.length} ta yozuv</span>
        <button className="a-btn a-btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}
          onClick={() => setSort(s => s === 'desc' ? 'asc' : 'desc')}>
          {sort === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {sort === 'desc' ? 'Yangi avval' : 'Eski avval'}
        </button>
      </div>
      <div className="a-table-wrap a-card">
        <table className="a-table">
          <thead>
            <tr><th>Tur</th><th>Biznes</th><th>Ballar</th><th>Mukofot</th><th>Vaqt</th></tr>
          </thead>
          <tbody>
            {sorted.map(t => {
              const earn = t.tx_type === 'earn'
              return (
                <tr key={t.id}>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: earn ? 'rgba(63,156,92,0.12)' : 'rgba(239,68,68,0.1)',
                      color: earn ? 'var(--a-green)' : 'var(--a-red)',
                    }}>
                      <i className={`bi ${earn ? 'bi-coin' : 'bi-gift'}`} style={{ marginRight: 4, fontSize: 11 }} />
                      {earn ? "Yig'ish" : 'Sarflash'}
                    </span>
                  </td>
                  <td className="td-bold">{t.merchant_name || '—'}</td>
                  <td style={{ fontWeight: 800, color: earn ? 'var(--a-green)' : 'var(--a-red)' }}>
                    {earn ? '+' : ''}{fmt(t.points_delta)}
                  </td>
                  <td className="td-dim">{t.reward_title || '—'}</td>
                  <td className="td-dim">{fmtDateTime(t.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Devices ── */
function DevicesTab({ items }) {
  if (!items?.length) return <Empty text="Qurilma yo'q" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(d => (
        <div key={d.id} className="a-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, background: 'var(--a-card2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <i className={`bi ${d.platform === 'android' ? 'bi-android2' : d.platform === 'ios' ? 'bi-apple' : d.platform === 'telegram' ? 'bi-telegram' : 'bi-phone'}`}
              style={{ fontSize: 20, color: d.platform === 'telegram' ? '#229ED9' : 'var(--a-muted)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              {d.device_model || (d.platform || 'Unknown').toUpperCase()}
              <span style={{
                padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: d.source === 'telegram' ? 'rgba(34,158,217,.12)' : 'var(--a-card2)',
                color: d.source === 'telegram' ? '#229ED9' : 'var(--a-muted)',
              }}>{d.source === 'login' ? 'Kirish' : d.source === 'telegram' ? 'Telegram' : 'Push'}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 2 }}>
              {d.source === 'telegram'
                ? [d.os_version, d.app_version].filter(Boolean).join(' · ') || 'Telegram bot'
                : [(d.platform || '').toUpperCase(), d.os_version, d.app_version && `v${d.app_version}`].filter(Boolean).join(' · ') || '—'}
            </div>
            {d.token_preview && (
              <div style={{ fontSize: 11, color: 'var(--a-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                {d.token_preview}
              </div>
            )}
            {d.updated_at && (
              <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 2 }}>
                So'nggi faollik: {fmtDateTime(d.updated_at)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Loglar (audit / activity) ── */
function ActivityTab({ items }) {
  if (!items?.length) return <Empty text="Loglar yo'q" />
  return (
    <div className="a-table-wrap a-card">
      <table className="a-table">
        <thead>
          <tr><th>Amal</th><th>Vaqt</th><th>IP</th><th>Qurilma</th><th>Ilova</th></tr>
        </thead>
        <tbody>
          {items.map((a, i) => {
            const device = [a.device_model, a.platform && a.platform.toUpperCase(), a.os_version]
              .filter(Boolean).join(' · ')
            return (
              <tr key={i}>
                <td className="td-bold">{ACTION_LABELS[a.action] || a.action}</td>
                <td className="td-dim">{fmtDateTime(a.timestamp)}</td>
                <td className="td-dim" style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.ip || '—'}</td>
                <td className="td-dim">{device || '—'}</td>
                <td className="td-dim">{a.app_version ? `v${a.app_version}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TierBadge({ tier }) {
  const map = {
    bronze:   { color: '#cd7f32', bg: 'rgba(205,127,50,0.12)' },
    silver:   { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    gold:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    platinum: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  }
  const t = map[tier?.toLowerCase?.()] || { color: 'var(--a-muted)', bg: 'var(--a-card2)' }
  if (!tier) return '—'
  return (
    <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: t.bg, color: t.color }}>
      {tier}
    </span>
  )
}

function Empty({ text }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: 'var(--a-muted)', fontSize: 13 }}>
      <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
      {text}
    </div>
  )
}
