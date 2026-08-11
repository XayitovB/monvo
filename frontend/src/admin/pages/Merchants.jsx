import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Trash2, Power, Plus, X, Check, UserPlus, Receipt, CalendarPlus, KeyRound, Copy } from 'lucide-react'
import { usePaginated } from '../hooks/usePaginated'
import { api } from '../api'
import './Table.css'
import './Merchants.css'

const BUSINESS_TYPES = [
  { value: 'restaurant',   label: 'Restoran',      icon: 'bi-shop' },
  { value: 'cafe',         label: 'Kafe',          icon: 'bi-cup-hot' },
  { value: 'coffee',       label: 'Qahvaxona',     icon: 'bi-cup-hot' },
  { value: 'fastfood',     label: 'Fast food',     icon: 'bi-cup-straw' },
  { value: 'bakery',       label: 'Nonvoyxona',    icon: 'bi-egg-fried' },
  { value: 'retail',       label: "Do'kon",        icon: 'bi-bag' },
  { value: 'grocery',      label: 'Oziq-ovqat',    icon: 'bi-cart3' },
  { value: 'clothing',     label: 'Kiyim-kechak',  icon: 'bi-bag-heart' },
  { value: 'beauty',       label: "Go'zallik",     icon: 'bi-scissors' },
  { value: 'barbershop',   label: 'Sartaroshxona', icon: 'bi-person-bounding-box' },
  { value: 'fitness',      label: 'Fitnes',        icon: 'bi-bicycle' },
  { value: 'pharmacy',     label: 'Dorixona',      icon: 'bi-plus-circle' },
  { value: 'medical',      label: 'Tibbiyot',      icon: 'bi-heart-pulse' },
  { value: 'electronics',  label: 'Elektronika',   icon: 'bi-phone' },
  { value: 'service',      label: 'Xizmat',        icon: 'bi-tools' },
  { value: 'auto',         label: 'Avto xizmat',   icon: 'bi-car-front' },
  { value: 'gas_station',  label: 'Avtozapravka',  icon: 'bi-fuel-pump' },
  { value: 'hotel',        label: 'Mehmonxona',    icon: 'bi-house-door' },
  { value: 'entertainment',label: "Ko'ngilochar",  icon: 'bi-controller' },
  { value: 'education',    label: "Ta'lim markazi",icon: 'bi-mortarboard' },
  { value: 'flowers',      label: 'Gullar',        icon: 'bi-flower1' },
  { value: 'jewelry',      label: 'Zargarlik',     icon: 'bi-gem' },
  { value: 'other',        label: 'Boshqa',        icon: 'bi-building' },
]

const TYPE_MAP = Object.fromEntries(BUSINESS_TYPES.map(t => [t.value, t]))

const SUB_STATUS_CONFIG = {
  active:    { label: 'Faol',        cls: 'a-badge-green'  },
  trial:     { label: 'Trial',       cls: 'a-badge-blue'   },
  expired:   { label: 'Tugagan',     cls: 'a-badge-orange' },
  paused:    { label: "To'xtatilgan", cls: 'a-badge-yellow' },
  cancelled: { label: 'Bekor',       cls: 'a-badge-gray'   },
  no_sub:    { label: 'Obunasiz',    cls: 'a-badge-gray'   },
  blocked:   { label: 'Bloklangan',  cls: 'a-badge-red'    },
}

function SubStatusBadge({ m }) {
  const key = m.sub_status || (m.is_active ? 'active' : 'blocked')
  const cfg = SUB_STATUS_CONFIG[key] || SUB_STATUS_CONFIG.active
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
      <span className={`a-badge ${cfg.cls}`}>{cfg.label}</span>
      {m.sub_expires_at && key !== 'blocked' && (
        <span style={{ fontSize: 10, color: 'var(--a-dim)' }}>
          {new Date(m.sub_expires_at).toLocaleDateString('uz')}
        </span>
      )}
      {typeof m.sub_days_remaining === 'number' && key !== 'blocked' && key !== 'no_sub' && (
        <span style={{
          fontSize: 10, fontWeight: 600,
          color: m.sub_days_remaining <= 0 ? 'var(--a-red, #DC2626)'
            : m.sub_days_remaining <= 7 ? 'var(--a-yellow, #D97706)'
            : 'var(--a-green, #16A34A)',
        }}>
          {m.sub_days_remaining <= 0
            ? 'Muddati tugagan'
            : `${m.sub_days_remaining} kun qoldi`}
        </span>
      )}
    </div>
  )
}

function TypeBadge({ type }) {
  const t = TYPE_MAP[type] || TYPE_MAP.other
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700,
      background: 'rgba(47,107,63,0.12)',
      color: 'var(--a-primary, #2F6B3F)',
      border: '1px solid rgba(47,107,63,0.2)',
    }}>
      <i className={`bi ${t.icon}`} style={{ fontSize: 12 }} />
      {t.label}
    </span>
  )
}

export default function Merchants() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [billingId, setBillingId] = useState(null)
  const [credentialsId, setCredentialsId] = useState(null)

  const { data, total, page, setPage, totalPages, loading, reload } =
    usePaginated('/admin/merchants', { search, business_type: typeFilter })

  async function toggle(id) {
    await api.patch(`/admin/merchants/${id}/toggle`)
    reload()
  }
  async function del(id) {
    if (!confirm("Biznesni o'chirmoqchimisiz? Uning kartalari ham o'chadi.")) return
    await api.delete(`/admin/merchants/${id}`)
    reload()
  }

  async function exportCsv() {
    try {
      await api.download('/admin/merchants/export', `merchants-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (e) {
      alert(e.message || 'Export xatosi')
    }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Bizneslar</div>
          <div className="a-page-sub">Jami: {total}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="a-input"
            placeholder="Biznes nomi yoki telefon..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <select
            className="a-input"
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
            style={{ minWidth: 150, cursor: 'pointer' }}
          >
            <option value="">Barcha turlar</option>
            {BUSINESS_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button className="a-btn a-btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Qo'shish
          </button>
          <button className="a-btn a-btn-secondary" onClick={exportCsv}>
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <div className="a-table-wrap a-card">
        {loading ? (
          <div className="a-loading"><div className="a-spinner" /></div>
        ) : (
          <table className="a-table">
            <thead>
              <tr>
                <th>ID</th><th>Biznes nomi</th><th>Tur</th><th>Login</th><th>Telefon</th>
                <th>Holat</th><th>Qo'shilgan</th><th></th>
              </tr>
            </thead>
            <tbody>
              {data.map(m => (
                <tr key={m.id} style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/panel/merchants/${m.id}`)}>
                  <td className="td-dim">#{m.id}</td>
                  <td className="td-bold">{m.business_name}</td>
                  <td><TypeBadge type={m.business_type} /></td>
                  <td className="td-dim" style={{ fontSize: 12 }}>
                    {m.login ? (
                      <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 }}>{m.login}</code>
                    ) : (
                      <span style={{ fontStyle: 'italic', color: 'var(--a-dim)' }}>belgilanmagan</span>
                    )}
                  </td>
                  <td className="td-dim" style={{ fontSize: 12 }}>
                    {m.phone ? (
                      <div>
                        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{m.phone}</div>
                        {m.director_name && (
                          <div style={{ fontSize: 10.5, color: 'var(--a-dim)', marginTop: 1 }}>
                            {m.director_name}
                          </div>
                        )}
                      </div>
                    ) : '—'}
                  </td>
                  <td><SubStatusBadge m={m} /></td>
                  <td className="td-dim">{m.created_at ? new Date(m.created_at).toLocaleDateString('uz') : ''}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                      <button className="a-btn a-btn-secondary td-icon-btn"
                              onClick={() => setCredentialsId(m.id)} title="Login va parol">
                        <KeyRound size={14} />
                      </button>
                      <button className="a-btn a-btn-secondary td-icon-btn"
                              onClick={() => setBillingId(m.id)} title="To'lov tarixi / access">
                        <Receipt size={14} />
                      </button>
                      <button className="a-btn a-btn-secondary td-icon-btn" onClick={() => toggle(m.id)}>
                        <Power size={14} />
                      </button>
                      <button className="a-btn a-btn-danger td-icon-btn" onClick={() => del(m.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={8} className="a-empty">Bizneslar topilmadi</td></tr>}
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

      {showCreate && (
        <CreateMerchantModal
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); reload() }}
        />
      )}

      {billingId !== null && (
        <MerchantBillingModal
          merchantId={billingId}
          onClose={() => setBillingId(null)}
          onChanged={() => reload()}
        />
      )}

      {credentialsId !== null && (
        <MerchantCredentialsModal
          merchantId={credentialsId}
          onClose={() => setCredentialsId(null)}
          onSaved={() => reload()}
        />
      )}
    </div>
  )
}

function MerchantCredentialsModal({ merchantId, onClose, onSaved }) {
  const [current, setCurrent] = useState(null)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get(`/admin/merchants/${merchantId}/credentials`)
      .then(d => { setCurrent(d); setLogin(d.login || '') })
      .catch(e => setErr(e?.message || "Yuklab bo'lmadi"))
  }, [merchantId])

  async function save(e) {
    e.preventDefault()
    setErr(null); setMsg(null)
    const newLogin = login.trim().toLowerCase()
    const newPwd = password.trim()
    if (!newLogin && !newPwd) return setErr('Login yoki parol kiriting')
    if (newLogin && newLogin.length < 3) return setErr("Login kamida 3 belgi")
    if (newLogin && /\s/.test(newLogin)) return setErr("Loginda bo'sh joy bo'lmasligi kerak")
    if (newPwd && newPwd.length < 6) return setErr("Parol kamida 6 belgi")

    const body = {}
    if (newLogin && newLogin !== (current?.login || '')) body.login = newLogin
    if (newPwd) body.password = newPwd
    if (Object.keys(body).length === 0) return setErr("O'zgarish yo'q")

    setSaving(true)
    try {
      const res = await api.patch(`/admin/merchants/${merchantId}/credentials`, body)
      setCurrent({ ...current, login: res.login, has_real_login: !!res.login })
      setPassword('')
      setMsg('Saqlandi')
      onSaved?.()
    } catch (e) {
      setErr(e?.message || 'Saqlanmadi')
    } finally {
      setSaving(false)
    }
  }

  function copyLogin() {
    if (!current?.login) return
    navigator.clipboard.writeText(current.login).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  }
  const box = {
    background: 'var(--a-card)', borderRadius: 16,
    width: 'min(480px, 94vw)', overflow: 'hidden',
    border: '1px solid var(--a-border)',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', padding: 16, borderBottom: '1px solid var(--a-border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Login va parol</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="a-btn a-btn-secondary td-icon-btn"><X size={14} /></button>
        </div>

        <form onSubmit={save}>
          <div className="a-modal-body" style={{ padding: 16 }}>
            <div style={{
              padding: 10, background: 'var(--a-card2)', borderRadius: 10,
              border: '1px solid var(--a-border)', marginBottom: 14, fontSize: 12,
            }}>
              <div style={{ color: 'var(--a-muted)', marginBottom: 4 }}>Joriy login:</div>
              {current === null ? (
                <span style={{ color: 'var(--a-muted)' }}>Yuklanmoqda...</span>
              ) : current.login ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, fontWeight: 600 }}>
                    {current.login}
                  </code>
                  <button type="button" onClick={copyLogin}
                    className="a-btn a-btn-secondary td-icon-btn"
                    style={{ padding: 4 }} title="Nusxa olish">
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              ) : (
                <span style={{ fontStyle: 'italic', color: 'var(--a-dim)' }}>
                  Hali login belgilanmagan
                </span>
              )}
            </div>

            <label className="a-field">
              <span>Yangi login {current?.login ? '(o\'zgartirish ixtiyoriy)' : '*'}</span>
              <div style={{ position: 'relative' }}>
                <input
                  className="a-input"
                  type={showLogin ? 'text' : 'password'}
                  value={login}
                  onChange={e => setLogin(e.target.value)}
                  placeholder="cafenur"
                  autoComplete="off"
                  spellCheck="false"
                  style={{ paddingRight: 64 }}
                />
                <button
                  type="button"
                  onClick={() => setShowLogin(s => !s)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', color: 'var(--a-muted)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
                  }}
                >
                  {showLogin ? "Yashirish" : "Ko'rsatish"}
                </button>
              </div>
            </label>

            <label className="a-field">
              <span>Yangi parol (kamida 6 belgi)</span>
              <div style={{ position: 'relative' }}>
                <input
                  className="a-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="O'zgartirmoqchi bo'lsangiz, yangi parol"
                  autoComplete="new-password"
                  style={{ paddingRight: 64 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', color: 'var(--a-muted)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
                  }}
                >
                  {showPassword ? "Yashirish" : "Ko'rsatish"}
                </button>
              </div>
            </label>

            <div className="a-modal-hint">
              Parol bazada hash qilinib saqlanadi — eski parolni qaytarib bo'lmaydi, faqat yangisini belgilash mumkin.
            </div>

            {err && <div className="a-modal-err">{err}</div>}
            {msg && (
              <div style={{
                padding: 10, marginTop: 8, borderRadius: 8, fontSize: 13,
                background: 'rgba(63,156,92,0.12)', color: 'var(--a-green)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Check size={14} /> {msg}
              </div>
            )}
          </div>

          <div className="a-modal-footer">
            <button type="button" className="a-btn a-btn-secondary" onClick={onClose}>Yopish</button>
            <button type="submit" className="a-btn a-btn-primary" disabled={saving}>
              {saving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MerchantBillingModal({ merchantId, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [extending, setExtending] = useState(false)
  const [days, setDays] = useState(30)
  const [planId, setPlanId] = useState('')
  const [markPaid, setMarkPaid] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [plans, setPlans] = useState([])

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [billing, allTariffs] = await Promise.all([
        api.get(`/admin/billing/merchants/${merchantId}`),
        api.get('/admin/tariffs').catch(() => []),
      ])
      setData(billing)
      setPlans(allTariffs || [])
    } catch (e) {
      setErr(e?.message || 'Yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [merchantId])

  async function extend() {
    if (!days || days < 1) return setErr('Kun soni noto\'g\'ri')
    setExtending(true); setErr(null)
    try {
      const body = { days: Number(days), mark_paid: markPaid, note }
      if (planId) body.tariff_id = Number(planId)
      if (amount) body.amount = Number(amount)
      await api.post(`/admin/billing/merchants/${merchantId}/extend`, body)
      await load()
      onChanged?.()
    } catch (e) {
      setErr(e?.message || 'Kengaytirib bo\'lmadi')
    } finally {
      setExtending(false)
    }
  }

  async function markInvoicePaid(id) {
    try {
      await api.patch(`/admin/billing/invoices/${id}`, { status: 'paid' })
      await load()
    } catch (e) {
      setErr(e?.message || 'Xato')
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
  }
  const box = {
    background: 'var(--a-card)', borderRadius: 16,
    width: 'min(780px, 94vw)', maxHeight: '90vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', border: '1px solid var(--a-border)',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', padding: 16, borderBottom: '1px solid var(--a-border)' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {data?.merchant?.business_name || 'Merchant'} — To'lov
            </div>
            {data?.subscription && (
              <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 2 }}>
                Holat: <b>{{
                  active: 'Faol', trial: 'Sinov', paused: "To'xtatilgan",
                  cancelled: 'Bekor', expired: 'Tugagan',
                }[data.subscription.status] || data.subscription.status}</b>
                {data.subscription.expires_at && (
                  <> · Tugaydi: <b>{new Date(data.subscription.expires_at).toLocaleDateString('uz')}</b></>
                )}
                {data.subscription.days_left !== null && (
                  <> · <b style={{color: data.subscription.days_left > 7 ? '#10b981' : '#ef4444'}}>
                    {data.subscription.days_left} kun qoldi
                  </b></>
                )}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="a-btn a-btn-secondary td-icon-btn"><X size={14} /></button>
        </div>

        {err && <div className="al-error" style={{ margin: 16 }}>{err}</div>}

        <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          {/* Manual extend */}
          <div style={{ padding: 14, background: 'var(--a-scaffold)', borderRadius: 12, border: '1px solid var(--a-border)', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 10 }}>
              <CalendarPlus size={16} /> Access kengaytirish
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--a-muted)' }}>
                Qancha kun
                <input type="number" className="a-input" min="1" max="3650"
                       value={days} onChange={e => setDays(e.target.value)} style={{ marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--a-muted)' }}>
                Tarif (ixtiyoriy)
                <select className="a-input" value={planId} onChange={e => setPlanId(e.target.value)}
                        style={{ marginTop: 4 }}>
                  <option value="">— o'zgarmasin —</option>
                  {plans.map(p => <option key={p.id} value={p.id}>{p.title_uz || p.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, color: 'var(--a-muted)' }}>
                Summa (ixtiyoriy)
                <input type="number" className="a-input" min="0"
                       value={amount} onChange={e => setAmount(e.target.value)}
                       placeholder="150000" style={{ marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12, color: 'var(--a-muted)', display: 'flex', flexDirection: 'column' }}>
                Izoh (ixtiyoriy)
                <input className="a-input" value={note} onChange={e => setNote(e.target.value)}
                       placeholder="Naqd to'lov, telegram orqali"
                       style={{ marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={markPaid} onChange={e => setMarkPaid(e.target.checked)} />
                To'langan deb belgilash (invoice yaratiladi)
              </label>
              <div style={{ flex: 1 }} />
              <button className="a-btn a-btn-primary" disabled={extending || !days} onClick={extend}>
                {extending ? 'Saqlanmoqda...' : `+${days} kun qo'shish`}
              </button>
            </div>
          </div>

          {/* Totals */}
          {data?.totals && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <Stat label="To'langan" value={`${Number(data.totals.paid).toLocaleString('uz')} UZS`} color="#10b981" />
              <Stat label="Kutilyapti" value={`${Number(data.totals.pending).toLocaleString('uz')} UZS`} color="#f59e0b" />
              <Stat label="Hisoblar" value={data.totals.invoice_count} color="#3F9C5C" />
            </div>
          )}

          {/* Invoice history */}
          <div style={{ fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Receipt size={16} /> To'lov tarixi
          </div>
          {loading ? (
            <div className="a-loading"><div className="a-spinner" /></div>
          ) : (data?.invoices?.length || 0) === 0 ? (
            <div style={{ color: 'var(--a-muted)', padding: 20, textAlign: 'center' }}>Hisob yo'q</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.invoices.map(inv => {
                const paid = inv.status === 'paid'
                return (
                  <div key={inv.id} style={{
                    padding: 12, background: 'var(--a-scaffold)', borderRadius: 10,
                    border: '1px solid var(--a-border)', display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ fontSize: 18 }}>{paid ? <i className="bi bi-check-circle-fill" style={{color:'#22c55e',fontSize:16}}/> : <i className="bi bi-hourglass-split" style={{color:'#eab308',fontSize:16}}/>}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>
                        {Number(inv.amount).toLocaleString('uz')} {inv.currency}
                        {inv.plan_name && <span style={{ fontWeight: 400, color: 'var(--a-muted)', fontSize: 12 }}> · {inv.plan_name}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>
                        {inv.invoice_number || `#${inv.id}`}
                        {inv.period_start && inv.period_end && (
                          <> · {new Date(inv.period_start).toLocaleDateString('uz')} — {new Date(inv.period_end).toLocaleDateString('uz')}</>
                        )}
                      </div>
                      {inv.note && <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>{inv.note}</div>}
                    </div>
                    <span className={`a-badge ${paid ? 'a-badge-green' : 'a-badge-red'}`}>
                      {paid ? "To'langan" : "Kutilmoqda"}
                    </span>
                    {!paid && (
                      <button className="a-btn a-btn-secondary" onClick={() => markInvoicePaid(inv.id)}>
                        To'landi
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 12, background: 'var(--a-scaffold)', borderRadius: 10, border: '1px solid var(--a-border)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginBottom: 6 }} />
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>{label}</div>
    </div>
  )
}

function CreateMerchantModal({ onClose, onDone }) {
  const [step, setStep] = useState(1)
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('other')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [merchant, setMerchant] = useState(null)
  const [err, setErr] = useState(null)
  const [saving, setSaving] = useState(false)
  // Tarif tanlovi
  const [tariffs, setTariffs] = useState([])
  const [tariffId, setTariffId] = useState('')   // '' = default (Free)
  const [tariffDays, setTariffDays] = useState('')

  useEffect(() => {
    let cancelled = false
    api.get('/admin/tariffs')
      .then(list => {
        if (cancelled) return
        const arr = Array.isArray(list) ? list : (list?.items || [])
        setTariffs(arr.filter(t => t.is_active !== false))
      })
      .catch(() => { if (!cancelled) setTariffs([]) })
    return () => { cancelled = true }
  }, [])

  async function createMerchant(e) {
    e.preventDefault()
    setErr(null)
    const name = businessName.trim()
    const loginVal = login.trim().toLowerCase()
    const pwd = password.trim()
    if (name.length < 2) return setErr('Biznes nomi juda qisqa')
    if (loginVal.length < 3) return setErr("Login kamida 3 belgi bo'lishi kerak")
    if (/\s/.test(loginVal)) return setErr("Loginda bo'sh joy bo'lmasligi kerak")
    if (pwd.length < 6) return setErr("Parol kamida 6 belgi bo'lishi kerak")
    setSaving(true)
    try {
      const payload = {
        business_name: name,
        business_type: businessType,
        login: loginVal,
        password: pwd,
      }
      if (tariffId) payload.tariff_id = Number(tariffId)
      if (tariffDays) payload.tariff_days = Number(tariffDays)
      const created = await api.post('/admin/merchants', payload)
      setMerchant(created)
      setStep(2)
    } catch (e) {
      setErr(e?.message || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="a-modal-overlay" onClick={onClose}>
      <div className="a-modal a-card" onClick={e => e.stopPropagation()}>
        <div className="a-modal-header">
          <div className="a-modal-title">
            {step === 1 ? "Yangi biznes qo'shish" : `"${merchant?.business_name}" — direktor`}
          </div>
          <button type="button" className="a-modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {step === 1 ? (
          <form onSubmit={createMerchant}>
            <div className="a-modal-body">
              <label className="a-field">
                <span>Biznes nomi *</span>
                <input
                  className="a-input"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="Cafe Nur"
                  autoFocus
                />
              </label>
              <label className="a-field">
                <span>Biznes turi *</span>
                <select
                  className="a-input"
                  value={businessType}
                  onChange={e => setBusinessType(e.target.value)}
                >
                  {BUSINESS_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                  ))}
                </select>
              </label>
              <label className="a-field">
                <span>Login *</span>
                <div style={{ position: 'relative' }}>
                  <input
                    className="a-input"
                    type={showLogin ? 'text' : 'password'}
                    value={login}
                    onChange={e => setLogin(e.target.value)}
                    placeholder="cafenur"
                    autoComplete="off"
                    spellCheck="false"
                    style={{ paddingRight: 64 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLogin(s => !s)}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'transparent', border: 'none', color: 'var(--a-muted)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
                    }}
                  >
                    {showLogin ? "Yashirish" : "Ko'rsatish"}
                  </button>
                </div>
              </label>
              <label className="a-field">
                <span>Parol *</span>
                <div style={{ position: 'relative' }}>
                  <input
                    className="a-input"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Kamida 6 belgi"
                    autoComplete="new-password"
                    style={{ paddingRight: 64 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'transparent', border: 'none', color: 'var(--a-muted)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '4px 8px',
                    }}
                  >
                    {showPassword ? "Yashirish" : "Ko'rsatish"}
                  </button>
                </div>
              </label>
              <label className="a-field">
                <span>Tarif</span>
                <select
                  className="a-input"
                  value={tariffId}
                  onChange={e => setTariffId(e.target.value)}
                >
                  <option value="">— Free (default) —</option>
                  {tariffs.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title_uz || t.title_ru || t.name}
                      {t.monthly_price ? ` — ${Number(t.monthly_price).toLocaleString('ru-RU')} so'm/oy` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {tariffId && (
                <label className="a-field">
                  <span>Amal qilish muddati (kun)</span>
                  <input
                    className="a-input"
                    type="number"
                    min={1}
                    max={3650}
                    value={tariffDays}
                    onChange={e => setTariffDays(e.target.value)}
                    placeholder="masalan 30 — bo'sh = cheksiz"
                  />
                </label>
              )}
              <div className="a-modal-hint">
                Bu login va parol orqali biznes panel'ga kiradi. Keyingi qadamda telefon raqami orqali direktor biriktirsangiz bo'ladi (ixtiyoriy).
              </div>
              {err && <div className="a-modal-err">{err}</div>}
            </div>
            <div className="a-modal-footer">
              <button type="button" className="a-btn a-btn-secondary" onClick={onClose}>Bekor</button>
              <button type="submit" className="a-btn a-btn-primary" disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Yaratish'}
              </button>
            </div>
          </form>
        ) : (
          <AssignDirectorStep
            merchantId={merchant.id}
            onSkip={onDone}
            onAssigned={onDone}
          />
        )}
      </div>
    </div>
  )
}

function AssignDirectorStep({ merchantId, onSkip, onAssigned }) {
  const [phone, setPhone] = useState('')
  const [matches, setMatches] = useState([])
  const [picked, setPicked] = useState(null)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [assigned, setAssigned] = useState(null)

  async function onPhoneChange(e) {
    const v = e.target.value
    setPhone(v)
    setPicked(null)
    if (v.trim().length < 3) { setMatches([]); return }
    setSearching(true)
    try {
      const qs = new URLSearchParams({ search: v.trim(), limit: '5' }).toString()
      const res = await api.get(`/admin/users?${qs}`)
      const list = Array.isArray(res) ? res : (res?.data || [])
      setMatches(list)
    } catch {
      setMatches([])
    } finally {
      setSearching(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    const p = phone.trim()
    if (!picked && p.length < 4) return setErr('Telefon raqami kiriting yoki foydalanuvchini tanlang')
    setSaving(true)
    try {
      const body = picked
        ? { user_id: picked.id }
        : { phone: p }
      const res = await api.post(`/admin/merchants/${merchantId}/director`, body)
      setAssigned(res.director)
    } catch (e) {
      setErr(e?.message || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  if (assigned) {
    return (
      <>
        <div className="a-modal-body">
          <div className="a-modal-success">
            <Check size={18} />
            <div>
              <div className="a-modal-success-title">Direktor belgilandi</div>
              <div className="a-modal-success-sub">
                {assigned.name} — {assigned.phone}
              </div>
            </div>
          </div>
        </div>
        <div className="a-modal-footer">
          <button className="a-btn a-btn-primary" onClick={onAssigned}>Tayyor</button>
        </div>
      </>
    )
  }

  return (
    <form onSubmit={submit}>
      <div className="a-modal-body">
        <label className="a-field">
          <span>Direktor telefon raqami *</span>
          <input
            className="a-input"
            value={phone}
            onChange={onPhoneChange}
            placeholder="+998 90 123 45 67"
            autoFocus
          />
        </label>

        {searching && <div className="a-modal-hint">Qidirilmoqda...</div>}

        {matches.length > 0 && !picked && (
          <div className="a-match-list">
            <div className="a-match-list-label">Mavjud foydalanuvchilar:</div>
            {matches.map(u => (
              <button
                type="button"
                key={u.id}
                className="a-match-item"
                onClick={() => { setPicked(u); setPhone(u.phone || ''); setMatches([]) }}
              >
                <UserPlus size={14} />
                <div>
                  <div className="a-match-name">{u.name || 'Ismsiz'}</div>
                  <div className="a-match-phone">{u.phone || '—'}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="a-picked">
            <Check size={14} />
            <span>Tanlangan: <b>{picked.name}</b> — {picked.phone}</span>
            <button type="button" className="a-picked-clear" onClick={() => setPicked(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {!picked && phone.trim().length >= 4 && matches.length === 0 && !searching && (
          <div className="a-modal-hint">
            Bu raqam bo'yicha foydalanuvchi topilmadi — yangi direktor akkaunt yaratiladi.
          </div>
        )}

        {err && <div className="a-modal-err">{err}</div>}
      </div>

      <div className="a-modal-footer">
        <button type="button" className="a-btn a-btn-secondary" onClick={onSkip}>O'tkazib yuborish</button>
        <button type="submit" className="a-btn a-btn-primary" disabled={saving}>
          {saving ? 'Saqlanmoqda...' : 'Belgilash'}
        </button>
      </div>
    </form>
  )
}
