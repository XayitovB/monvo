import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store, LogOut, Smartphone, Users, CreditCard, Award, TrendingUp,
  LayoutDashboard, UserCheck, BarChart3, Send, Building2, Clock, Crown,
  Sparkles, Repeat, User as UserIcon, MapPin, UserPlus, Plus, Trash2, Edit2, X,
  Gift, Settings2, Palette, Package, Camera, UsersRound, UserCog, Megaphone, Star,
  Copy, Download, Check,
} from 'lucide-react'
import QRCode from 'qrcode'
import './MerchantHome.css'

const SEGMENTS = [
  { value: '',          label: 'Hammasi',    icon: Users,    color: '#6B7280' },
  { value: 'returning', label: 'Qaytuvchi',  icon: Repeat,   color: '#0F766E' },
  { value: 'new',       label: 'Yangi',      icon: Sparkles, color: '#7C3AED' },
]

async function mFetch(path, token, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (res.status === 401) throw new Error('unauthorized')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
  return data
}

export default function MerchantHome() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const token = localStorage.getItem('merchant_token')

  useEffect(() => {
    document.body.classList.add('admin-body')
    if (!token) {
      navigate('/merchant/login')
      return
    }
    load()
    return () => document.body.classList.remove('admin-body')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [me, st] = await Promise.all([
        mFetch('/merchants/me', token),
        mFetch('/merchants/stats', token).catch(() => null),
      ])
      setProfile(me)
      setStats(st)
    } catch (e) {
      if (e.message === 'unauthorized') return logout()
      setError(e.message || 'Xatolik')
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('merchant_token')
    localStorage.removeItem('merchant_id')
    localStorage.removeItem('merchant_name')
    navigate('/merchant/login')
  }

  if (loading) {
    return (
      <div className="mh-loading">
        <div className="a-spinner" />
      </div>
    )
  }

  return (
    <div className="mh-root">
      <header className="mh-header">
        <div className="mh-brand">
          <div className="mh-logo"><Store size={20} /></div>
          <div>
            <div className="mh-title">{profile?.business_name || 'Biznes'}</div>
            <div className="mh-sub">{profile?.phone || profile?.email}</div>
          </div>
        </div>
        <button className="a-btn a-btn-secondary" onClick={logout}>
          <LogOut size={14} /> Chiqish
        </button>
      </header>

      <nav className="mh-tabs">
        <TabBtn active={tab === 'overview'}  onClick={() => setTab('overview')}  icon={LayoutDashboard} label="Umumiy" />
        <TabBtn active={tab === 'customers'} onClick={() => setTab('customers')} icon={UserCheck}       label="Mijozlar" />
        <TabBtn active={tab === 'analytics'} onClick={() => setTab('analytics')} icon={BarChart3}       label="Analitika" />
        <TabBtn active={tab === 'campaigns'} onClick={() => setTab('campaigns')} icon={Send}            label="Kampaniya" />
        <TabBtn active={tab === 'branches'}  onClick={() => setTab('branches')}  icon={MapPin}          label="Filiallar" />
        <TabBtn active={tab === 'staff'}     onClick={() => setTab('staff')}     icon={UserPlus}        label="Xodimlar" />
        <TabBtn active={tab === 'profile'}   onClick={() => setTab('profile')}   icon={Building2}       label="Biznes" />
      </nav>

      <div className="mh-container">
        {error && <div className="al-error" style={{ marginBottom: 16 }}>{error}</div>}

        {tab === 'overview'  && <OverviewTab stats={stats} merchantId={profile?.id} />}
        {tab === 'customers' && <CustomersTab token={token} />}
        {tab === 'analytics' && <AnalyticsTab token={token} />}
        {tab === 'campaigns' && <CampaignsTab token={token} />}
        {tab === 'branches'  && <BranchesTab token={token} />}
        {tab === 'staff'     && <StaffTab token={token} merchantId={profile?.id} />}
        {tab === 'profile'   && <ProfileTab profile={profile} token={token} onRefresh={load} />}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button className={`mh-tab ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={15} /> <span>{label}</span>
    </button>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────
function OverviewTab({ stats, merchantId }) {
  const navigate = useNavigate()
  return (
    <>
      {merchantId && <TelegramJoinCard merchantId={merchantId} />}

      <div className="mh-grid">
        <StatCard icon={<Users size={18} />} label="Jami kartalar"
          value={stats?.cards_total ?? '—'} sub={`${stats?.cards_active ?? 0} faol`} tint="#2F6B3F" />
        <StatCard icon={<CreditCard size={18} />} label="Berilgan so'm"
          value={stats?.points_issued ?? '—'} sub="cashback berildi" tint="#0F766E" />
        <StatCard icon={<Award size={18} />} label="Almashtirilgan"
          value={stats?.points_redeemed ?? '—'} sub="ball sarflandi" tint="#7C3AED" />
      </div>

      <div className="mh-section-title">Kundalik operatsiya</div>
      <div className="mh-constructor-grid">
        <ConstructorCard
          icon={<Camera size={22} />}
          title="QR Skaner"
          desc="Noutbuk/tablet kamerasidan karta skanerlash"
          gradient="linear-gradient(135deg, #5FAE6F, #2F6B3F)"
          onClick={() => navigate('/merchant/scanner')}
        />
        <ConstructorCard
          icon={<UsersRound size={22} />}
          title="Mijozlar CRM"
          desc="Har mijoz kartochkasi: tarix, tags, izoh"
          gradient="linear-gradient(135deg, #14B8A6, #0F766E)"
          onClick={() => navigate('/merchant/customers')}
        />
        <ConstructorCard
          icon={<BarChart3 size={22} />}
          title="Analytics"
          desc="Heatmap, cohort, RFM, qoida ROI"
          gradient="linear-gradient(135deg, #8B5CF6, #6366F1)"
          onClick={() => navigate('/merchant/analytics')}
        />
        <ConstructorCard
          icon={<Star size={22} />}
          title="Mijoz Izohlari"
          desc="Reytinglar, shikoyatlar, javob yozish"
          gradient="linear-gradient(135deg, #F59E0B, #D97706)"
          onClick={() => navigate('/merchant/reviews')}
        />
      </div>

      <div className="mh-section-title">Konstruktor</div>
      <div className="mh-constructor-grid">
        <ConstructorCard
          icon={<Gift size={22} />}
          title="Loyalty Qoidalar"
          desc="10 turdagi bonus qoida — aralash ishlaydi"
          gradient="linear-gradient(135deg, #3F9C5C, #2F6B3F)"
          onClick={() => navigate('/merchant/loyalty')}
        />
        <ConstructorCard
          icon={<Palette size={22} />}
          title="Karta Dizayn"
          desc="Rang, gradient, live preview"
          gradient="linear-gradient(135deg, #EF4444, #EC4899)"
          onClick={() => navigate('/merchant/card-design')}
        />
        <ConstructorCard
          icon={<Megaphone size={22} />}
          title="Kampaniyalar"
          desc="Muddatli aksiyalar va maxsus takliflar"
          gradient="linear-gradient(135deg, #EC4899, #BE185D)"
          onClick={() => navigate('/merchant/campaigns')}
        />
        <ConstructorCard
          icon={<Settings2 size={22} />}
          title="Xabarlar"
          desc="Push kampaniyalar, broadcast"
          gradient="linear-gradient(135deg, #5FAE6F, #1F4D2C)"
          onClick={() => navigate('/merchant/notifications')}
        />
      </div>

      <div className="mh-card mh-hint">
        <div className="mh-hint-icon"><Smartphone size={26} /></div>
        <div>
          <div className="mh-hint-title">To'liq boshqaruv — mobil ilovada</div>
          <div className="mh-hint-desc">
            Karta chiqarish, QR skanerlash va transactionlar —
            barchasi Monvo mobil ilovasida.
          </div>
          <div className="mh-hint-actions">
            <a className="a-btn a-btn-primary" href="/#download">Ilovani yuklash</a>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Telegram orqali loyaltyga qo'shilish QR ──────────────────────────────────
function TelegramJoinCard({ merchantId }) {
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/bot/j/${merchantId}`

  useEffect(() => {
    QRCode.toDataURL(link, { width: 480, margin: 1, color: { dark: '#15151A', light: '#FFFFFF' } })
      .then(setQr).catch(() => {})
  }, [link])

  function copy() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  function download() {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr; a.download = `monvo-telegram-qr-${merchantId}.png`; a.click()
  }

  return (
    <div className="mh-card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <div style={{ background: '#fff', padding: 12, borderRadius: 16, flexShrink: 0, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
        {qr
          ? <img src={qr} width={150} height={150} alt="Telegram QR" style={{ display: 'block' }} />
          : <div style={{ width: 150, height: 150 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16 }}>
          <Send size={18} color="#229ED9" /> Telegram orqali mijoz qo'shish
        </div>
        <div style={{ color: 'var(--a-muted)', fontSize: 13, margin: '6px 0 12px', lineHeight: 1.5 }}>
          Mijoz bu QR'ni skanerlasa — Telegram bot ochiladi va u <b>avtomatik sizning loyalty dasturingizga</b> qo'shiladi (karta ochiladi). QR'ni kassaga yoki stikerga qo'ying.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="a-btn a-btn-secondary" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Nusxalandi' : 'Havolani nusxalash'}
          </button>
          <button className="a-btn a-btn-secondary" onClick={download}>
            <Download size={14} /> QR yuklab olish
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Customers + segments ────────────────────────────────────────────────────
function CustomersTab({ token }) {
  const [segment, setSegment] = useState('')
  const [search, setSearch] = useState('')
  const [counts, setCounts] = useState(null)
  const [list, setList] = useState({ total: 0, items: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    mFetch('/merchants/customers/segments/counts', token)
      .then(setCounts).catch(() => {})
  }, [token])

  useEffect(() => {
    const ctrl = new AbortController()
    setBusy(true); setErr('')
    const params = new URLSearchParams({
      segment, search, limit: '50', offset: '0',
    })
    fetch(`/merchants/customers?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Xatolik')
        return r.json()
      })
      .then(setList)
      .catch(e => { if (e.name !== 'AbortError') setErr(e.message) })
      .finally(() => setBusy(false))
    return () => ctrl.abort()
  }, [token, segment, search])

  return (
    <>
      <div className="mh-seg-row">
        {SEGMENTS.map(s => {
          const Icon = s.icon
          const count =
            s.value === ''          ? counts?.total :
            s.value === 'vip'       ? counts?.vip :
            s.value === 'returning' ? counts?.returning :
            s.value === 'new'       ? counts?.new : 0
          return (
            <button
              key={s.value || 'all'}
              className={`mh-seg ${segment === s.value ? 'active' : ''}`}
              onClick={() => setSegment(s.value)}
              style={segment === s.value ? { borderColor: s.color, color: s.color } : undefined}
            >
              <Icon size={15} />
              <span>{s.label}</span>
              <span className="mh-seg-count">{count ?? '—'}</span>
            </button>
          )
        })}
      </div>

      <div className="mh-card" style={{ padding: 12 }}>
        <input
          className="a-input"
          placeholder="Ism yoki telefon bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {err && <div className="al-error">{err}</div>}

      <div className="mh-card" style={{ padding: 0, overflow: 'hidden' }}>
        {busy && <div className="mh-list-busy">Yuklanmoqda…</div>}
        {!busy && list.items.length === 0 && (
          <div className="mh-empty">
            <UserIcon size={26} />
            <div>Hozircha bu segmentda mijoz yo'q</div>
          </div>
        )}
        {!busy && list.items.map(c => <CustomerRow key={c.card_id} c={c} />)}
      </div>

      {list.total > list.items.length && (
        <div className="mh-foot-note">
          Ko'rsatilmoqda {list.items.length} / {list.total}
        </div>
      )}
    </>
  )
}

function CustomerRow({ c }) {
  return (
    <div className="mh-cust">
      <div className="mh-cust-ava">
        {(c.name || '?').slice(0, 1).toUpperCase()}
      </div>
      <div className="mh-cust-main">
        <div className="mh-cust-name">
          {c.name || 'Nomsiz'}
          {c.tags.map(t => <TagPill key={t} t={t} />)}
        </div>
        <div className="mh-cust-sub">
          {c.phone || '—'} · {c.tx_count_90d} tx / 90 kun
        </div>
      </div>
      <div className="mh-cust-points">
        <div className="mh-cust-points-v">{c.points}</div>
        <div className="mh-cust-points-l">so'm</div>
      </div>
    </div>
  )
}

function TagPill({ t }) {
  const map = {
    returning: { label: 'Qaytuvchi', color: '#0F766E' },
    new:       { label: 'Yangi',     color: '#7C3AED' },
  }
  const m = map[t] || { label: t, color: '#6B7280' }
  return (
    <span className="mh-tag" style={{ color: m.color, borderColor: m.color + '55', background: m.color + '14' }}>
      {m.label}
    </span>
  )
}

// ── Analytics ───────────────────────────────────────────────────────────────
function AnalyticsTab({ token }) {
  const [days, setDays] = useState(30)
  const [trend, setTrend] = useState(null)
  const [peak, setPeak] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    setErr('')
    Promise.all([
      mFetch(`/merchants/analytics/trend?days=${days}`, token),
      mFetch(`/merchants/analytics/peak-hours?days=${days}`, token),
    ]).then(([a, b]) => {
      setTrend(a); setPeak(b)
    }).catch(e => setErr(e.message))
  }, [days, token])

  return (
    <>
      <div className="mh-range">
        {[7, 30, 90].map(d => (
          <button
            key={d}
            className={`mh-range-btn ${days === d ? 'active' : ''}`}
            onClick={() => setDays(d)}
          >
            {d} kun
          </button>
        ))}
      </div>

      {err && <div className="al-error">{err}</div>}

      <div className="mh-card">
        <div className="mh-card-title">Kunlik tranzaksiya trendi</div>
        <TrendChart data={trend?.data || []} />
      </div>

      <div className="mh-card">
        <div className="mh-card-title"><Clock size={14} /> Eng band soatlar</div>
        <PeakChart data={peak?.data || []} />
      </div>

    </>
  )
}

function TrendChart({ data }) {
  if (!data.length) return <div className="mh-empty-inline">Ma'lumot yo'q</div>
  const max = Math.max(1, ...data.map(d => (d.earn_count + d.redeem_count)))
  return (
    <div className="mh-trend">
      {data.map(d => (
        <div key={d.date} className="mh-trend-col" title={`${d.date}: ${d.earn_count} earn, ${d.redeem_count} redeem`}>
          <div className="mh-trend-bar">
            <div className="mh-trend-redeem" style={{ height: `${(d.redeem_count / max) * 100}%` }} />
            <div className="mh-trend-earn"   style={{ height: `${(d.earn_count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function PeakChart({ data }) {
  if (!data.length) return <div className="mh-empty-inline">Ma'lumot yo'q</div>
  const max = Math.max(1, ...data.map(d => d.count))
  return (
    <div className="mh-peak">
      {data.map(d => (
        <div key={d.hour} className="mh-peak-col">
          <div className="mh-peak-bar" style={{ height: `${(d.count / max) * 100}%` }}
               title={`${d.hour}:00 — ${d.count}`} />
          <div className="mh-peak-hr">{d.hour}</div>
        </div>
      ))}
    </div>
  )
}

// ── Campaigns ───────────────────────────────────────────────────────────────
function CampaignsTab({ token }) {
  const [segment, setSegment] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  async function send() {
    if (!title.trim() || !body.trim()) { setErr('Sarlavha va matn kerak'); return }
    setBusy(true); setErr(''); setResult(null)
    try {
      const data = await mFetch('/merchants/campaigns/push', token, {
        method: 'POST',
        body: JSON.stringify({ title, body, segment }),
      })
      setResult(data)
      setTitle(''); setBody('')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mh-card">
        <div className="mh-card-title"><Send size={14} /> Push kampaniyasi</div>

        <label className="mh-label">Segment</label>
        <div className="mh-seg-row" style={{ marginBottom: 14 }}>
          {SEGMENTS.map(s => {
            const Icon = s.icon
            return (
              <button
                key={s.value || 'all'}
                className={`mh-seg ${segment === s.value ? 'active' : ''}`}
                onClick={() => setSegment(s.value)}
                style={segment === s.value ? { borderColor: s.color, color: s.color } : undefined}
              >
                <Icon size={14} /><span>{s.label}</span>
              </button>
            )
          })}
        </div>

        <label className="mh-label">Sarlavha</label>
        <input className="a-input" maxLength={100}
          placeholder="Masalan: Hafta oxiri chegirmasi"
          value={title} onChange={e => setTitle(e.target.value)} />

        <label className="mh-label" style={{ marginTop: 12 }}>Matn</label>
        <textarea className="a-input" rows={4} maxLength={300}
          placeholder="Push ichidagi xabar..."
          value={body} onChange={e => setBody(e.target.value)} />

        <button className="a-btn a-btn-primary" style={{ marginTop: 16 }}
                onClick={send} disabled={busy}>
          {busy ? 'Yuborilmoqda…' : 'Push yuborish'}
        </button>

        {err && <div className="al-error" style={{ marginTop: 12 }}>{err}</div>}
        {result && (
          <div className="mh-ok">
            ✓ Yuborildi: <b>{result.sent}</b> qurilma
            {result.failed > 0 && <> · xato: {result.failed}</>}
            {' '}(segment: {result.segment}, mijozlar: {result.targeted_users})
          </div>
        )}
      </div>
    </>
  )
}

// ── Branches ────────────────────────────────────────────────────────────────
function BranchesTab({ token }) {
  const [list, setList] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | branch object

  async function reload() {
    setBusy(true); setErr('')
    try {
      setList(await mFetch('/branches', token))
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  useEffect(() => { reload() }, [token])

  async function save(data) {
    try {
      if (editing === 'new') {
        await mFetch('/branches', token, {
          method: 'POST',
          body: JSON.stringify(data),
        })
      } else {
        await mFetch(`/branches/${editing.id}`, token, {
          method: 'PATCH',
          body: JSON.stringify(data),
        })
      }
      setEditing(null)
      reload()
    } catch (e) { throw e }
  }

  async function remove(b) {
    if (!confirm(`"${b.name}" filialini o'chirasizmi? Barcha xodimlar ham o'chadi.`)) return
    try {
      await mFetch(`/branches/${b.id}`, token, { method: 'DELETE' })
      reload()
    } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <div className="mh-toolbar">
        <div className="mh-toolbar-title">{list.length} filial</div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing('new')}>
          <Plus size={14} /> Yangi filial
        </button>
      </div>

      {err && <div className="al-error">{err}</div>}

      <div className="mh-card" style={{ padding: 0, overflow: 'hidden' }}>
        {busy && <div className="mh-list-busy">Yuklanmoqda…</div>}
        {!busy && list.length === 0 && (
          <div className="mh-empty">
            <MapPin size={26} />
            <div>Hali filial qo'shilmagan</div>
          </div>
        )}
        {!busy && list.map(b => (
          <div key={b.id} className="mh-branch">
            <div className="mh-branch-icon"><MapPin size={18} /></div>
            <div className="mh-branch-main">
              <div className="mh-branch-name">
                {b.name}
                {!b.is_active && <span className="mh-inactive-pill">Bloklangan</span>}
              </div>
              <div className="mh-branch-sub">
                {b.address || '—'} · {b.phone || 'tel yo\'q'} · {b.staff_count} xodim
              </div>
            </div>
            <button className="a-btn a-btn-icon" onClick={() => setEditing(b)} title="Tahrirlash">
              <Edit2 size={14} />
            </button>
            <button className="a-btn a-btn-icon a-btn-danger" onClick={() => remove(b)} title="O'chirish">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <BranchModal
          branch={editing === 'new' ? null : editing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function BranchModal({ branch, onSave, onClose }) {
  const [name, setName] = useState(branch?.name || '')
  const [address, setAddress] = useState(branch?.address || '')
  const [phone, setPhone] = useState(branch?.phone || '')
  const [isActive, setIsActive] = useState(branch ? branch.is_active : true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim()) { setErr('Filial nomi kerak'); return }
    setBusy(true); setErr('')
    try {
      const data = { name, address, phone }
      if (branch) data.is_active = isActive
      await onSave(data)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="mh-modal-bg" onClick={onClose}>
      <div className="mh-modal" onClick={e => e.stopPropagation()}>
        <div className="mh-modal-head">
          <div className="mh-modal-title">{branch ? 'Filialni tahrirlash' : 'Yangi filial'}</div>
          <button className="mh-modal-x" onClick={onClose}><X size={16} /></button>
        </div>

        <label className="mh-label">Filial nomi</label>
        <input className="a-input" value={name} onChange={e => setName(e.target.value)}
               placeholder="Masalan: Chilonzor filiali" />

        <label className="mh-label" style={{ marginTop: 12 }}>Manzil</label>
        <input className="a-input" value={address} onChange={e => setAddress(e.target.value)}
               placeholder="Toshkent, Chilonzor, 12-kvartal" />

        <label className="mh-label" style={{ marginTop: 12 }}>Telefon</label>
        <input className="a-input" value={phone} onChange={e => setPhone(e.target.value)}
               placeholder="+998 XX XXX XX XX" />

        {branch && (
          <label className="mh-check">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Faol
          </label>
        )}

        {err && <div className="al-error">{err}</div>}

        <div className="mh-modal-actions">
          <button className="a-btn a-btn-secondary" onClick={onClose}>Bekor</button>
          <button className="a-btn a-btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Staff ───────────────────────────────────────────────────────────────────
function StaffTab({ token, merchantId }) {
  const [list, setList] = useState([])
  const [branches, setBranches] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('')

  async function reload() {
    setBusy(true); setErr('')
    try {
      const [s, b] = await Promise.all([
        mFetch(`/branches/staff${filter ? `?branch_id=${filter}` : ''}`, token),
        mFetch('/branches', token),
      ])
      setList(s); setBranches(b)
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  useEffect(() => { reload() }, [token, filter])

  async function save(data, staff) {
    if (staff) {
      await mFetch(`/branches/staff/${staff.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
    } else {
      await mFetch('/branches/staff', token, {
        method: 'POST',
        body: JSON.stringify(data),
      })
    }
    setEditing(null)
    reload()
  }

  async function remove(s) {
    if (!confirm(`"${s.name}" xodimini o'chirasizmi?`)) return
    try {
      await mFetch(`/branches/staff/${s.id}`, token, { method: 'DELETE' })
      reload()
    } catch (e) { setErr(e.message) }
  }

  return (
    <>
      <div className="mh-toolbar">
        <div className="mh-toolbar-title">{list.length} xodim</div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing('new')}>
          <Plus size={14} /> Yangi xodim
        </button>
      </div>

      <div className="mh-card" style={{ padding: 12 }}>
        <select className="a-input" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Barcha filiallar</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {err && <div className="al-error">{err}</div>}

      <div className="mh-card" style={{ padding: 0, overflow: 'hidden' }}>
        {busy && <div className="mh-list-busy">Yuklanmoqda…</div>}
        {!busy && list.length === 0 && (
          <div className="mh-empty">
            <UserPlus size={26} />
            <div>Hali xodim qo'shilmagan</div>
          </div>
        )}
        {!busy && list.map(s => (
          <div key={s.id} className="mh-staff">
            <div className="mh-staff-ava">{(s.name || '?').slice(0, 1).toUpperCase()}</div>
            <div className="mh-staff-main">
              <div className="mh-staff-name">
                {s.name}
                <span className={`mh-role-pill mh-role-${s.staff_role}`}>
                  {s.staff_role === 'manager' ? 'Menejer' : 'Kassir'}
                </span>
                {!s.is_active && <span className="mh-inactive-pill">Bloklangan</span>}
              </div>
              <div className="mh-staff-sub">
                {s.phone} · {s.branch_name || 'filialsiz'}
              </div>
            </div>
            <button className="a-btn a-btn-icon" onClick={() => setEditing(s)} title="Tahrirlash">
              <Edit2 size={14} />
            </button>
            <button className="a-btn a-btn-icon a-btn-danger" onClick={() => remove(s)} title="O'chirish">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {list.length > 0 && merchantId && (
        <div className="mh-foot-note">
          Xodimlar POS login: <b>{merchantId}:&lt;telefon&gt;</b> (masalan {merchantId}:+998901234567)
        </div>
      )}

      {editing && (
        <StaffModal
          staff={editing === 'new' ? null : editing}
          branches={branches}
          onSave={(data) => save(data, editing === 'new' ? null : editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function StaffModal({ staff, branches, onSave, onClose }) {
  const [name, setName] = useState(staff?.name || '')
  const [phone, setPhone] = useState(staff?.phone || '')
  const [password, setPassword] = useState('')
  const [branchId, setBranchId] = useState(staff?.branch_id || '')
  const [staffRole, setStaffRole] = useState(staff?.staff_role || 'cashier')
  const [isActive, setIsActive] = useState(staff ? staff.is_active : true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim() || !phone.trim()) { setErr('Ism va telefon kerak'); return }
    if (!staff && !password) { setErr('Yangi xodim uchun parol kerak'); return }
    setBusy(true); setErr('')
    try {
      const data = { name, staff_role: staffRole, branch_id: branchId ? Number(branchId) : null }
      if (!staff) { data.phone = phone; data.password = password }
      else {
        data.is_active = isActive
        if (password) data.password = password
      }
      await onSave(data)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="mh-modal-bg" onClick={onClose}>
      <div className="mh-modal" onClick={e => e.stopPropagation()}>
        <div className="mh-modal-head">
          <div className="mh-modal-title">{staff ? 'Xodimni tahrirlash' : 'Yangi xodim'}</div>
          <button className="mh-modal-x" onClick={onClose}><X size={16} /></button>
        </div>

        <label className="mh-label">Ism</label>
        <input className="a-input" value={name} onChange={e => setName(e.target.value)}
               placeholder="Masalan: Azim Karimov" />

        <label className="mh-label" style={{ marginTop: 12 }}>Telefon</label>
        <input className="a-input" value={phone} onChange={e => setPhone(e.target.value)}
               placeholder="+998 XX XXX XX XX" disabled={!!staff} />

        <label className="mh-label" style={{ marginTop: 12 }}>
          {staff ? 'Yangi parol (bo\'sh qoldirsangiz — o\'zgarmaydi)' : 'Parol'}
        </label>
        <input className="a-input" type="password" value={password}
               onChange={e => setPassword(e.target.value)}
               placeholder="Kamida 4 belgi" />

        <label className="mh-label" style={{ marginTop: 12 }}>Lavozim</label>
        <select className="a-input" value={staffRole} onChange={e => setStaffRole(e.target.value)}>
          <option value="cashier">Kassir</option>
          <option value="manager">Menejer</option>
        </select>

        <label className="mh-label" style={{ marginTop: 12 }}>Filial</label>
        <select className="a-input" value={branchId} onChange={e => setBranchId(e.target.value)}>
          <option value="">Filialsiz</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        {staff && (
          <label className="mh-check">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Faol
          </label>
        )}

        {err && <div className="al-error">{err}</div>}

        <div className="mh-modal-actions">
          <button className="a-btn a-btn-secondary" onClick={onClose}>Bekor</button>
          <button className="a-btn a-btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Profile ─────────────────────────────────────────────────────────────────
function ProfileTab({ profile, token, onRefresh }) {
  const [logoPreview, setLogoPreview] = useState(profile?.logo_url || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result
      setLogoPreview(dataUrl)
      setSaving(true)
      setMsg('')
      try {
        await mFetch('/merchants/me', token, {
          method: 'PATCH',
          body: JSON.stringify({ logo_url: dataUrl }),
        })
        setMsg('Saqlandi ✓')
        onRefresh?.()
      } catch (err) {
        setMsg('Xatolik: ' + (err.message || ''))
      } finally {
        setSaving(false)
      }
    }
    reader.readAsDataURL(file)
  }

  async function removeLogo() {
    setSaving(true)
    setMsg('')
    try {
      await mFetch('/merchants/me', token, {
        method: 'PATCH',
        body: JSON.stringify({ logo_url: '' }),
      })
      setLogoPreview('')
      setMsg('O\'chirildi')
      onRefresh?.()
    } catch (err) {
      setMsg('Xatolik: ' + (err.message || ''))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mh-card">
      <div className="mh-card-title">Biznes ma'lumotlari</div>

      {/* Logo section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: '16px 0', borderBottom: '1px solid var(--a-line)' }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {logoPreview ? (
            <img
              src={logoPreview}
              alt="logo"
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--a-line)' }}
            />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--a-bg)', border: '2px dashed var(--a-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--a-ink-mute)' }}>
              <Store size={28} />
            </div>
          )}
          {saving && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="a-spinner" style={{ width: 20, height: 20 }} />
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Biznes logosi</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className="a-btn a-btn-secondary" style={{ cursor: 'pointer', fontSize: 13, padding: '6px 14px' }}>
              <Camera size={14} style={{ marginRight: 6 }} />
              {logoPreview ? 'Almashtirish' : 'Yuklash'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
            </label>
            {logoPreview && (
              <button className="a-btn" onClick={removeLogo} style={{ fontSize: 13, padding: '6px 14px', background: 'none', border: '1px solid var(--a-line)', color: 'var(--a-ink-mute)' }}>
                <Trash2 size={14} style={{ marginRight: 6 }} />
                O'chirish
              </button>
            )}
          </div>
          {msg && <div style={{ fontSize: 12, marginTop: 6, color: msg.startsWith('X') ? '#ef4444' : '#059669' }}>{msg}</div>}
        </div>
      </div>

      <div className="mh-info">
        <InfoRow label="Biznes nomi" value={profile?.business_name} />
        <InfoRow label="Tur" value={profile?.business_type || '—'} />
        <InfoRow label="Email" value={profile?.email} />
        <InfoRow label="Telefon" value={profile?.phone || '—'} />
        <InfoRow label="Holat" value={profile?.is_active ? 'Faol' : 'Bloklangan'} />
      </div>
    </div>
  )
}

function ConstructorCard({ icon, title, desc, gradient, onClick }) {
  return (
    <button className="mh-constructor" onClick={onClick} type="button">
      <div className="mh-constructor-icon" style={{ background: gradient }}>{icon}</div>
      <div className="mh-constructor-title">{title}</div>
      <div className="mh-constructor-desc">{desc}</div>
    </button>
  )
}

function StatCard({ icon, label, value, sub, tint }) {
  return (
    <div className="mh-stat" style={{ borderColor: tint + '40' }}>
      <div className="mh-stat-icon" style={{ background: tint + '22', color: tint }}>{icon}</div>
      <div className="mh-stat-value">{value}</div>
      <div className="mh-stat-label">{label}</div>
      <div className="mh-stat-sub">{sub}</div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="mh-info-row">
      <div className="mh-info-label">{label}</div>
      <div className="mh-info-value">{value}</div>
    </div>
  )
}
