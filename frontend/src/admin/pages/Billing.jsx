import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, Package, Users, FileText, Check } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'

const TABS = [
  { key: 'plans',         label: 'Tariflar' },
  { key: 'subscriptions', label: 'Obunalar' },
  { key: 'invoices',      label: 'Invoislar' },
  { key: 'payments',      label: "To'lovlar" },
]

export default function Billing() {
  const [tab, setTab] = useState('plans')
  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Billing</div>
          <div className="a-page-sub">Rejalar, obunalar, invoislar, to'lovlar</div>
        </div>
      </div>
      <div className="ma-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`ma-tab ${tab===t.key?'on':''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'plans' && <PlansTab />}
      {tab === 'subscriptions' && <SubsTab />}
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'payments' && <PaymentsTab />}
    </div>
  )
}

function PaymentsTab() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [state, setState] = useState('')
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [list, sum] = await Promise.all([
        api.get('/admin/billing/payments' + (state ? '?state=' + state : '')),
        api.get('/admin/billing/payments/summary').catch(() => null),
      ])
      setRows(list || [])
      setSummary(sum)
      setErr(null)
    } catch (e) { setErr(e?.message || 'Yuklab bo\'lmadi') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [state])

  const fmtSom = (n) => `${Number(n || 0).toLocaleString('uz')} so'm`
  const fmtDate = (s) => s ? new Date(s).toLocaleString('uz', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }) : '—'
  const stateColor = (st) => st === 2 ? 'var(--a-green)' : st < 0 ? 'var(--a-red)' : 'var(--a-yellow)'

  return (
    <>
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: "Jami to'langan", value: fmtSom(summary.total_paid) },
            { label: "To'lovlar soni", value: Number(summary.paid_count || 0).toLocaleString('uz') },
            { label: "To'lagan merchantlar", value: Number(summary.paying_merchants || 0).toLocaleString('uz') },
          ].map(c => (
            <div key={c.label} className="a-card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 2 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <select value={state} onChange={(e) => setState(e.target.value)}
          style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8 }}>
          <option value="">Barcha holatlar</option>
          <option value="2">To'langan</option>
          <option value="1">Kutilmoqda</option>
          <option value="-1">Bekor qilingan</option>
          <option value="-2">Qaytarilgan</option>
        </select>
      </div>

      {err && <div className="al-error" style={{ marginBottom: 10 }}>{err}</div>}

      <div className="ma-card">
        <table className="ma-table">
          <thead>
            <tr>
              <th>#</th><th>Merchant</th><th>Summa</th><th>Usul</th>
              <th>Holat</th><th>Invoice</th><th>To'langan vaqt</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--a-muted)' }}>Yuklanmoqda...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--a-muted)' }}>To'lovlar yo'q</td></tr>
            ) : rows.map(p => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.merchant_name}</td>
                <td style={{ fontWeight: 700 }}>{fmtSom(p.amount)}</td>
                <td>{p.method}</td>
                <td><span style={{ fontWeight: 700, color: stateColor(p.state) }}>{p.status}</span></td>
                <td style={{ color: 'var(--a-muted)' }}>{p.invoice_number || '—'}</td>
                <td style={{ color: 'var(--a-muted)' }}>{fmtDate(p.performed_at || p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// Tariff feature bayroqlari (UI yorliqlari)
const TARIFF_FEATURES = [
  ['has_tier', 'Darajalar (tier)'],
  ['has_gamification', 'Geymifikatsiya'],
  ['has_games', "O'yinlar"],
  ['has_birthday_bonus', "Tug'ilgan kun bonusi"],
  ['has_segments_advanced', 'Segmentlash'],
  ['has_card_design_custom', 'Karta dizayni'],
  ['has_scheduled_push', 'Rejali push'],
  ['has_api_access', 'API kirish'],
  ['has_priority_support', 'Prioritet support'],
  ['has_pos_integration', 'POS integratsiya'],
]

// Serialized tarif (limits/features ichma-ich) → TariffIn (yassi) shakliga
function tariffToFlat(t) {
  const lim = t.limits || {}, f = t.features || {}
  return {
    id: t.id,
    name: t.name || '',
    title_uz: t.title_uz || '',
    title_ru: t.title_ru || '',
    description_uz: t.description_uz || '',
    description_ru: t.description_ru || '',
    monthly_price: t.monthly_price || 0,
    duration_days: t.duration_days ?? null,
    is_active: t.is_active !== false,
    is_recommended: !!t.is_recommended,
    sort_order: t.sort_order || 0,
    max_customers: lim.customers ?? null,
    max_branches: lim.branches ?? null,
    max_staff: lim.staff ?? null,
    max_rewards: lim.rewards ?? null,
    max_push_per_month: lim.push_per_month ?? null,
    max_announcements: lim.announcements ?? null,
    has_tier: !!f.tier,
    has_gamification: !!f.gamification,
    has_games: !!f.games,
    has_birthday_bonus: !!f.birthday_bonus,
    has_segments_advanced: !!f.segments_advanced,
    has_card_design_custom: !!f.card_design_custom,
    has_api_access: !!f.api_access,
    has_priority_support: !!f.priority_support,
    has_scheduled_push: !!f.scheduled_push,
    has_pos_integration: !!f.pos_integration,
    extra_features: t.extra_features || [],
  }
}

const NEW_TARIFF = {
  name: '', title_uz: '', title_ru: '', description_uz: '', description_ru: '',
  monthly_price: 0, duration_days: null, is_active: true, is_recommended: false, sort_order: 100,
  max_customers: null, max_branches: null, max_staff: null,
  max_rewards: null, max_push_per_month: null, max_announcements: null,
  has_tier: false, has_gamification: false, has_games: false,
  has_birthday_bonus: false, has_segments_advanced: false, has_card_design_custom: false,
  has_api_access: false, has_priority_support: false, has_scheduled_push: false,
  has_pos_integration: false, extra_features: [],
}

const numOrNull = (v) => (v === '' || v == null ? null : Number(v))

function PlansTab() {
  const [plans, setPlans] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  async function load() {
    try { setPlans(await api.get('/admin/tariffs') || []) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    try {
      const body = { ...editing }
      if (editing.id) await api.patch(`/admin/tariffs/${editing.id}`, body)
      else await api.post('/admin/tariffs', body)
      setEditing(null); setErr(''); await load()
    } catch (e) { setErr(e.message) }
  }
  async function del(id) {
    if (!confirm("Tarif o'chirilsinmi?")) return
    try { await api.delete(`/admin/tariffs/${id}`); await load() }
    catch (e) { setErr(e.message) }
  }

  const lim = (v) => (v == null ? '∞' : Number(v).toLocaleString())

  return (
    <>
      {err && <div className="lb-error">{err}</div>}
      <div style={{ fontSize: 12.5, color: 'var(--a-muted)', marginBottom: 10 }}>
        Yagona tarif tizimi — merchant Billing ekrani, checkout va feature cheklovi shu ro'yxatdan o'qiydi.
      </div>
      <button className="a-btn a-btn-primary" onClick={() => setEditing({ ...NEW_TARIFF })}
        style={{ marginBottom: 14 }}><Plus size={14} /> Tarif qo'shish</button>

      <div className="lb-list">
        {plans.map(t => (
          <div key={t.id} className={`lb-card ${t.is_active ? '' : 'inactive'}`}>
            <div className="lb-card-icon"><Package size={20} /></div>
            <div className="lb-card-body">
              <div className="lb-card-title">
                {t.title_uz}
                <span style={{ fontSize: 11, color: 'var(--a-muted)', fontWeight: 400 }}> ({t.name})</span>
                {t.is_recommended && <span style={{ fontSize: 11, color: 'var(--a-green, #3F9C5C)', fontWeight: 600 }}> ★ tavsiya</span>}
              </div>
              <div className="lb-card-config">{t.description_uz || '—'}</div>
              <div className="lb-card-type">
                {t.duration_days
                  ? `${(t.monthly_price || 0) === 0 ? 'Bepul' : (t.monthly_price).toLocaleString() + " so'm"} · ${t.duration_days} kun`
                  : `${(t.monthly_price || 0).toLocaleString()} so'm/oy`} ·
                {' '}{lim(t.limits?.customers)} mijoz ·
                {' '}{lim(t.limits?.branches)} filial ·
                {' '}{lim(t.limits?.staff)} xodim
              </div>
            </div>
            <div className="lb-card-actions">
              <button className="lb-icon-btn" onClick={() => setEditing(tariffToFlat(t))}>✎</button>
              <button className="lb-icon-btn danger" onClick={() => del(t.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {plans.length === 0 && <div className="lb-empty"><div className="lb-empty-title">Tarif yo'q</div></div>}
      </div>

      {editing && (
        <div className="lb-modal-bg" onClick={() => setEditing(null)}>
          <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="lb-modal-title">{editing.id ? 'Tarif' : 'Yangi tarif'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label className="lb-field"><span>Nom (UZ)</span><input value={editing.title_uz} onChange={(e) => setEditing({ ...editing, title_uz: e.target.value })} /></label>
              <label className="lb-field"><span>Nom (RU)</span><input value={editing.title_ru} onChange={(e) => setEditing({ ...editing, title_ru: e.target.value })} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label className="lb-field"><span>Slug (masalan: pro)</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
              <label className="lb-field"><span>Oylik narx (so'm)</span><input type="number" value={editing.monthly_price} onChange={(e) => setEditing({ ...editing, monthly_price: Number(e.target.value) })} /></label>
              <label className="lb-field"><span>Davomiylik (kun) — bo'sh = oylik, demo = 14</span><input type="number" value={editing.duration_days ?? ''} placeholder="oylik" onChange={(e) => setEditing({ ...editing, duration_days: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            </div>
            <label className="lb-field"><span>Tavsif (UZ)</span><textarea rows={2} value={editing.description_uz || ''} onChange={(e) => setEditing({ ...editing, description_uz: e.target.value })} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <label className="lb-field"><span>Max mijoz (bo'sh=∞)</span><input type="number" value={editing.max_customers ?? ''} onChange={(e) => setEditing({ ...editing, max_customers: numOrNull(e.target.value) })} /></label>
              <label className="lb-field"><span>Max filial</span><input type="number" value={editing.max_branches ?? ''} onChange={(e) => setEditing({ ...editing, max_branches: numOrNull(e.target.value) })} /></label>
              <label className="lb-field"><span>Max xodim</span><input type="number" value={editing.max_staff ?? ''} onChange={(e) => setEditing({ ...editing, max_staff: numOrNull(e.target.value) })} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label className="lb-field"><span>Tartib (sort)</span><input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></label>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', paddingTop: 22 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={editing.is_recommended} onChange={(e) => setEditing({ ...editing, is_recommended: e.target.checked })} /> Tavsiya (★)
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Faol
                </label>
              </div>
            </div>
            <div className="lb-field"><span>Funksiyalar</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                {TARIFF_FEATURES.map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5 }}>
                    <input type="checkbox" checked={!!editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.checked })} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="lb-modal-actions">
              <button className="a-btn a-btn-secondary" onClick={() => setEditing(null)}>Bekor</button>
              <button className="a-btn a-btn-primary" onClick={save}><Save size={14} /> Saqlash</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SubsTab() {
  const [subs, setSubs] = useState([])
  const [err, setErr] = useState(null)
  async function load() {
    try {
      setSubs(await api.get('/admin/billing/subscriptions') || []); setErr(null)
    } catch (e) { setErr(e?.message || 'Yuklab bo\'lmadi') }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="ma-card">
      {err && <div className="al-error" style={{ marginBottom: 10 }}>{err}</div>}
      <table className="ma-table">
        <thead><tr><th>Merchant</th><th>Tarif</th><th>Status</th><th>Boshlandi</th><th>Tugaydi</th></tr></thead>
        <tbody>
          {subs.map(s => (
            <tr key={s.id}>
              <td>{s.merchant_name}</td>
              <td>{s.tariff_name || '—'}</td>
              <td><span className="crm-tag">{s.status}</span></td>
              <td>{s.started_at ? new Date(s.started_at).toLocaleDateString() : '—'}</td>
              <td>{s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InvoicesTab() {
  const [invs, setInvs] = useState([])
  const [status, setStatus] = useState('')
  const [err, setErr] = useState(null)

  async function load() {
    try {
      setInvs(await api.get('/admin/billing/invoices' + (status ? '?status='+status : '')) || [])
      setErr(null)
    } catch (e) { setErr(e?.message || 'Yuklab bo\'lmadi') }
  }
  useEffect(() => { load() }, [status])

  async function markPaid(id) {
    try {
      await api.patch(`/admin/billing/invoices/${id}`, { status: 'paid' })
      await load()
    } catch (e) { setErr(e?.message || 'O\'zgartirib bo\'lmadi') }
  }

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8 }}>
          <option value="">Barchasi</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
      </div>
      <div className="ma-card">
        <table className="ma-table">
          <thead><tr><th>#</th><th>Merchant</th><th>Summa</th><th>Status</th><th>Yaratilgan</th><th></th></tr></thead>
          <tbody>
            {invs.map(i => (
              <tr key={i.id}>
                <td>{i.invoice_number}</td>
                <td>{i.merchant_name}</td>
                <td>{i.amount.toLocaleString()} {i.currency}</td>
                <td><span className="crm-tag">{i.status}</span></td>
                <td>{new Date(i.created_at).toLocaleDateString()}</td>
                <td>
                  {i.status === 'pending' && (
                    <button className="lb-icon-btn on" onClick={() => markPaid(i.id)}><Check size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
