import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Users, CreditCard, ArrowRightLeft, Building2,
  UserCheck, Power, Key, Receipt, Star, TrendingUp, Calendar,
  Phone, Mail, MapPin, Clock, CheckCircle, XCircle, Copy, Check, ChevronDown, ChevronUp, Camera, Plus, Trash2, Pencil,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import QRCode from 'qrcode'
import { api } from '../api'
import './Table.css'

const TABS = [
  { key: 'overview',      label: 'Umumiy',          icon: 'bi-speedometer2' },
  { key: 'customers',     label: 'Mijozlar',         icon: 'bi-people' },
  { key: 'transactions',  label: 'Tranzaksiyalar',   icon: 'bi-arrow-left-right' },
  { key: 'branches',      label: 'Filiallar',        icon: 'bi-geo-alt' },
  { key: 'settings',      label: 'Sozlamalar',       icon: 'bi-gear' },
]

const TYPE_ICON = {
  restaurant: 'bi-shop', cafe: 'bi-cup-hot', coffee: 'bi-cup-hot', fastfood: 'bi-cup-straw', bakery: 'bi-egg-fried',
  retail: 'bi-bag', grocery: 'bi-cart3', clothing: 'bi-bag-heart',
  beauty: 'bi-scissors', barbershop: 'bi-person-bounding-box', fitness: 'bi-bicycle',
  pharmacy: 'bi-plus-circle', medical: 'bi-heart-pulse', electronics: 'bi-phone',
  service: 'bi-tools', auto: 'bi-car-front', gas_station: 'bi-fuel-pump',
  hotel: 'bi-house-door', entertainment: 'bi-controller', education: 'bi-mortarboard',
  flowers: 'bi-flower1', jewelry: 'bi-gem', other: 'bi-building',
}
const TYPE_LABEL = {
  restaurant: 'Restoran', cafe: 'Kafe', coffee: 'Qahvaxona', fastfood: 'Fast food', bakery: 'Nonvoyxona',
  retail: "Do'kon", grocery: 'Oziq-ovqat', clothing: 'Kiyim-kechak',
  beauty: "Go'zallik", barbershop: 'Sartaroshxona', fitness: 'Fitnes',
  pharmacy: 'Dorixona', medical: 'Tibbiyot', electronics: 'Elektronika',
  service: 'Xizmat', auto: 'Avto xizmat', gas_station: 'Avtozapravka',
  hotel: 'Mehmonxona', entertainment: "Ko'ngilochar", education: "Ta'lim markazi",
  flowers: 'Gullar', jewelry: 'Zargarlik', other: 'Boshqa',
}

const TZ = 'Asia/Tashkent'
function fmt(n) { return Number(n || 0).toLocaleString('uz') }
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('uz', { timeZone: TZ }) : '—' }
function fmtDateMin(s) { return s ? new Date(s).toLocaleString('uz', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' }
function fmtDateTime(s) { return s ? new Date(s).toLocaleString('uz', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—' }

export default function MerchantDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState(null)
  const [billing, setBilling] = useState(null)
  const [customers, setCustomers] = useState(null)
  const [transactions, setTransactions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [toggling, setToggling] = useState(false)
  const [custSearch, setCustSearch] = useState('')
  const [txSort, setTxSort] = useState('desc')

  async function load() {
    setLoading(true); setErr(null)
    try {
      const [full, bill] = await Promise.all([
        api.get(`/admin/merchants/${id}/full`),
        api.get(`/admin/billing/merchants/${id}`).catch(() => null),
      ])
      setData(full)
      setBilling(bill)
    } catch (e) {
      setErr(e?.message || 'Yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  async function loadCustomers() {
    if (customers !== null) return
    try {
      const r = await api.get(`/admin/merchants/${id}/customers?limit=500`)
      setCustomers(Array.isArray(r) ? r : (r?.data || r?.items || []))
    } catch { setCustomers([]) }
  }

  async function loadTransactions() {
    if (transactions !== null) return
    try {
      const r = await api.get(`/admin/merchants/${id}/transactions?limit=200`)
      setTransactions(Array.isArray(r) ? r : (r?.data || r?.items || []))
    } catch { setTransactions([]) }
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    if (tab === 'customers') loadCustomers()
    if (tab === 'transactions') loadTransactions()
  }, [tab])

  async function toggle() {
    setToggling(true)
    try {
      await api.patch(`/admin/merchants/${id}/toggle`)
      await load()
    } catch (e) { alert(e?.message) }
    finally { setToggling(false) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
      <div className="a-spinner" />
    </div>
  )
  if (err) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--a-red)' }}>{err}</div>
  )
  if (!data) return null

  const m = data

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button className="a-btn a-btn-secondary" style={{ padding: '8px 12px' }}
          onClick={() => navigate('/panel/merchants')}>
          <ArrowLeft size={16} />
        </button>

        <LogoEditor
          merchantId={m.id}
          logoUrl={m.logo_url}
          name={m.business_name}
          brandColor={m.brand_color}
          reload={load}
        />

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{m.business_name}</h1>
            <span style={{
              padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: m.is_active ? 'rgba(63,156,92,0.15)' : 'rgba(239,68,68,0.12)',
              color: m.is_active ? 'var(--a-green)' : 'var(--a-red)',
              border: `1px solid ${m.is_active ? 'rgba(63,156,92,0.3)' : 'rgba(239,68,68,0.25)'}`,
            }}>
              {m.is_active ? 'Faol' : 'Bloklangan'}
            </span>
            {m.business_type && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: 'rgba(47,107,63,0.12)', color: 'var(--a-primary)',
                border: '1px solid rgba(47,107,63,0.2)',
              }}>
                <i className={`bi ${TYPE_ICON[m.business_type] || 'bi-building'}`} style={{ fontSize: 11 }} />
                {TYPE_LABEL[m.business_type] || m.business_type}
              </span>
            )}
            {m.loyalty_type && (() => {
              const lt = m.loyalty_type;
              const ltLabel = lt === 'cashback' ? '💰 Cashback' : lt === 'stamp' ? '🎫 Stamp' : lt === 'spend' ? '💳 Spend' : lt;
              const ltColor = lt === 'cashback' ? '#0ea5e9' : lt === 'stamp' ? '#8b5cf6' : '#f59e0b';
              return (
                <span style={{
                  padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  background: `${ltColor}18`, color: ltColor,
                  border: `1px solid ${ltColor}40`,
                }}>
                  {ltLabel}
                </span>
              );
            })()}
          </div>
          <div style={{ fontSize: 13, color: 'var(--a-muted)', marginTop: 2 }}>
            #{m.id} · Qo'shilgan: {fmtDateMin(m.created_at)}
            {m.last_activity_at && ` · So'nggi faollik: ${fmtDateMin(m.last_activity_at)}`}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { icon: 'bi-people', label: 'Mijozlar', value: fmt(m.stats?.customers), color: '#3b82f6' },
          { icon: 'bi-credit-card', label: 'Kartalar', value: fmt(m.stats?.cards), color: '#8b5cf6' },
          { icon: 'bi-arrow-left-right', label: 'Tranzaksiyalar', value: fmt(m.stats?.transactions), color: '#f59e0b' },
          { icon: 'bi-coin', label: 'Jami ballar', value: fmt(m.stats?.total_points), color: '#10b981' },
        ].map(k => (
          <div key={k.label} className="a-card" style={{ padding: '14px 16px' }}>
            <i className={`bi ${k.icon}`} style={{ fontSize: 18, color: k.color }} />
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--a-border)', marginBottom: 20 }}>
        {TABS.map(t => (
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
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab m={m} billing={billing} reload={load} />}
      {tab === 'customers' && <CustomersTab items={customers} search={custSearch} setSearch={setCustSearch} />}
      {tab === 'transactions' && <TransactionsTab items={transactions} sort={txSort} setSort={setTxSort} />}
      {tab === 'branches' && <BranchesTab branches={m.branches} staff={m.staff} merchantId={m.id} reload={load} />}
      {tab === 'settings' && <SettingsTab m={m} toggle={toggle} toggling={toggling} reload={load} />}
    </div>
  )
}

/* ── Logo uploader (header) ── */
function LogoEditor({ merchantId, logoUrl, name, brandColor, reload }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setErr('Rasm 5MB dan katta'); return }
    setBusy(true); setErr('')
    try {
      // Har qanday formatni (SVG ham) 512x512 PNG ga aylantiramiz —
      // Flutter rasm kodeki SVG ni qo'llamaydi, doim raster saqlaymiz.
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi"))
        reader.onload = () => {
          const img = new Image()
          img.onerror = () => reject(new Error('Rasm yaroqsiz'))
          img.onload = () => {
            const SIZE = 512
            const canvas = document.createElement('canvas')
            canvas.width = SIZE; canvas.height = SIZE
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, SIZE, SIZE)
            resolve(canvas.toDataURL('image/png'))
          }
          img.src = reader.result
        }
        reader.readAsDataURL(file)
      })
      await api.patch(`/admin/merchants/${merchantId}`, { logo_url: dataUrl })
      reload?.()
    } catch (e2) {
      setErr(e2?.message || 'Yuklab bo\'lmadi')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true); setErr('')
    try {
      await api.patch(`/admin/merchants/${merchantId}`, { logo_url: '' })
      reload?.()
    } catch (e2) {
      setErr(e2?.message || 'Xato')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
      <div
        onClick={() => !busy && inputRef.current?.click()}
        title="Logo yuklash / almashtirish"
        style={{
          width: 48, height: 48, borderRadius: 12, overflow: 'hidden', position: 'relative',
          border: '1px solid var(--a-border)', cursor: busy ? 'default' : 'pointer',
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%', background: brandColor || 'var(--a-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: '#fff',
          }}>
            {name?.[0]?.toUpperCase()}
          </div>
        )}
        <div style={{
          position: 'absolute', right: 0, bottom: 0, width: 18, height: 18, borderRadius: '50%',
          background: 'var(--a-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '2px solid var(--a-card2)',
        }}>
          <Camera size={9} color="#fff" />
        </div>
        {busy && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div className="a-spinner" style={{ width: 18, height: 18 }} />
          </div>
        )}
      </div>

      {logoUrl && !busy && (
        <button
          onClick={(e) => { e.stopPropagation(); remove() }}
          title="Logoni o'chirish"
          style={{
            position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%',
            border: 'none', background: 'var(--a-red)', color: '#fff', fontSize: 12, lineHeight: 1,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
        >×</button>
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />

      {err && (
        <div style={{
          position: 'absolute', top: '105%', left: 0, marginTop: 4, fontSize: 11,
          color: 'var(--a-red)', whiteSpace: 'nowrap', zIndex: 5,
        }}>{err}</div>
      )}
    </div>
  )
}

/* ── Leaflet karta (filial joylashuvi) ── */
const MAP_MARKER = { radius: 8, color: '#2f6b3f', weight: 2, fillColor: '#3f9c5c', fillOpacity: 0.9 }

function BranchMapPicker({ lat, lng, onPick }) {
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    const DEFAULT = [41.2995, 69.2401] // Toshkent
    const center = (lat != null && lng != null) ? [lat, lng] : DEFAULT
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView(center, lat != null ? 15 : 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)
    if (lat != null && lng != null) markerRef.current = L.circleMarker([lat, lng], MAP_MARKER).addTo(map)

    map.on('click', async (e) => {
      const la = e.latlng.lat, ln = e.latlng.lng
      if (markerRef.current) markerRef.current.setLatLng([la, ln])
      else markerRef.current = L.circleMarker([la, ln], MAP_MARKER).addTo(map)
      onPickRef.current(la, ln)
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}&accept-language=uz,ru,en`)
        const d = await r.json()
        if (d?.display_name) onPickRef.current(la, ln, d.display_name)
      } catch (_) {}
    })

    mapRef.current = map
    // Grid ichida ochilgani uchun o'lcham noto'g'ri hisoblanishi mumkin — qayta o'lchaymiz
    setTimeout(() => map.invalidateSize(), 150)

    return () => { map.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return
    if (markerRef.current) markerRef.current.setLatLng([lat, lng])
    else markerRef.current = L.circleMarker([lat, lng], MAP_MARKER).addTo(mapRef.current)
    mapRef.current.setView([lat, lng], 15)
  }, [lat, lng])

  return (
    <div style={{ gridColumn: '1 / -1', border: '1px solid var(--a-border)', borderRadius: 10, overflow: 'hidden' }}>
      <div ref={mapDivRef} style={{ width: '100%', height: 260, cursor: 'crosshair' }} />
      <div style={{ padding: '6px 10px', fontSize: 11.5, color: 'var(--a-muted)' }}>
        Kartani bosing — manzil avtomatik to'ldiriladi
      </div>
    </div>
  )
}

/* ── Overview ── */
function OverviewTab({ m, billing, reload }) {
  const { id } = useParams()
  const sub = billing?.subscription
  const plan = billing?.plan
  const daysLeft = sub?.days_left ?? null
  const expired = daysLeft !== null && daysLeft === 0

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ phone: m.phone || '', description: m.description || '' })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    setSaving(true)
    try {
      await api.patch(`/admin/merchants/${id}`, { phone: form.phone || null, description: form.description || null })
      setEditing(false)
      reload?.()
    } catch (e) {
      alert(e.message || 'Xato')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setForm({ phone: m.phone || '', description: m.description || '' })
    setEditing(false)
  }

  const [editingDir, setEditingDir] = useState(false)
  const [formDir, setFormDir] = useState({ name: m.director?.name || '', phone: m.director?.phone || '' })
  const [savingDir, setSavingDir] = useState(false)

  function setDir(k, v) { setFormDir(f => ({ ...f, [k]: v })) }

  async function saveDir() {
    setSavingDir(true)
    try {
      const uid = m.director?.id || m.director?.user_id
      await api.patch(`/admin/users/${uid}`, { name: formDir.name || null, phone: formDir.phone || null })
      setEditingDir(false)
      reload?.()
    } catch (e) {
      alert(e.message || 'Xato')
    } finally {
      setSavingDir(false)
    }
  }

  function cancelDir() {
    setFormDir({ name: m.director?.name || '', phone: m.director?.phone || '' })
    setEditingDir(false)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Merchant info */}
      <InfoCard
        title="Biznes ma'lumotlari"
        icon="bi-building"
        action={editing ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={cancel} className="a-btn a-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}>Bekor</button>
            <button onClick={save} disabled={saving} className="a-btn a-btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}>
              {saving ? '...' : 'Saqlash'}
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="a-btn a-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}>
            <i className="bi bi-pencil" style={{ marginRight: 4 }} />Tahrirlash
          </button>
        )}
      >
        {editing ? (
          <EditRow icon="bi-telephone" label="Telefon">
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className="a-input" style={{ width: '100%', fontSize: 13, padding: '4px 8px' }} placeholder="+998..." />
          </EditRow>
        ) : (
          <InfoRow icon="bi-telephone" label="Telefon" value={m.phone || '—'} />
        )}
        <InfoRow icon="bi-calendar3" label="Qo'shilgan" value={fmtDateMin(m.created_at)} />
        <InfoRow icon="bi-activity" label="So'nggi faollik" value={fmtDateTime(m.last_activity_at)} />
        {editing ? (
          <EditRow icon="bi-chat-text" label="Tavsif">
            <input value={form.description} onChange={e => set('description', e.target.value)}
              className="a-input" style={{ width: '100%', fontSize: 13, padding: '4px 8px' }} placeholder="Biznes tavsifi..." />
          </EditRow>
        ) : (
          m.description && <InfoRow icon="bi-chat-text" label="Tavsif" value={m.description} />
        )}
      </InfoCard>

      {/* Director */}
      <InfoCard
        title="Direktor"
        icon="bi-person-badge"
        action={m.director && (editingDir ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={cancelDir} className="a-btn a-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}>Bekor</button>
            <button onClick={saveDir} disabled={savingDir} className="a-btn a-btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}>
              {savingDir ? '...' : 'Saqlash'}
            </button>
          </div>
        ) : (
          <button onClick={() => setEditingDir(true)} className="a-btn a-btn-secondary" style={{ fontSize: 11, padding: '3px 10px' }}>
            <i className="bi bi-pencil" style={{ marginRight: 4 }} />Tahrirlash
          </button>
        ))}
      >
        {m.director ? (
          <>
            {editingDir ? (
              <EditRow icon="bi-person" label="Ism">
                <input value={formDir.name} onChange={e => setDir('name', e.target.value)}
                  className="a-input" style={{ width: '100%', fontSize: 13, padding: '4px 8px' }} placeholder="To'liq ism..." />
              </EditRow>
            ) : (
              <InfoRow icon="bi-person" label="Ism" value={m.director.name || '—'} />
            )}
            {editingDir ? (
              <EditRow icon="bi-telephone" label="Telefon">
                <input value={formDir.phone} onChange={e => setDir('phone', e.target.value)}
                  className="a-input" style={{ width: '100%', fontSize: 13, padding: '4px 8px' }} placeholder="+998..." />
              </EditRow>
            ) : (
              <InfoRow icon="bi-telephone" label="Telefon" value={m.director.phone || '—'} />
            )}
            <InfoRow icon="bi-clock" label="So'nggi kirish" value={fmtDateTime(m.director.last_login_at)} />
            <div style={{ padding: '8px 0' }}>
              <span style={{
                padding: '3px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: m.director.is_active ? 'rgba(63,156,92,0.15)' : 'rgba(239,68,68,0.12)',
                color: m.director.is_active ? 'var(--a-green)' : 'var(--a-red)',
              }}>
                {m.director.is_active ? 'Faol' : 'Bloklangan'}
              </span>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--a-muted)', fontSize: 13, padding: '12px 0' }}>Direktor biriktirilmagan</div>
        )}
      </InfoCard>

      {/* Tariff — billing subscription dan */}
      <InfoCard title="Tarif" icon="bi-receipt">
        {sub ? (
          <>
            {plan && <InfoRow icon="bi-tag" label="Tarif nomi" value={plan.title_uz || plan.title_ru || plan.name} />}
            {plan?.monthly_price && (
              <InfoRow icon="bi-cash" label="Narxi" value={`${fmt(plan.monthly_price)} so'm/oy`} />
            )}
            <InfoRow icon="bi-calendar-check" label="Boshlangan" value={fmtDate(sub.started_at)} />
            <InfoRow icon="bi-calendar-x" label="Tugaydi" value={fmtDate(sub.expires_at)} />
            <InfoRow icon="bi-toggle-on" label="Status" value={sub.status} />
            {daysLeft !== null && (
              <div style={{ padding: '10px 0' }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: expired ? 'rgba(239,68,68,0.12)' : daysLeft < 7 ? 'rgba(245,158,11,0.12)' : 'rgba(63,156,92,0.12)',
                  color: expired ? 'var(--a-red)' : daysLeft < 7 ? 'var(--a-yellow)' : 'var(--a-green)',
                }}>
                  {expired ? 'Muddati tugagan' : `${daysLeft} kun qoldi`}
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: 'var(--a-muted)', fontSize: 13, padding: '12px 0' }}>Tarif belgilanmagan (Free)</div>
        )}
      </InfoCard>

      {/* Quick stats */}
      <InfoCard title="Faollik" icon="bi-bar-chart">
        <InfoRow icon="bi-arrow-left-right" label="Jami tranzaksiyalar" value={fmt(m.stats?.transactions)} />
        <InfoRow icon="bi-credit-card-2-front" label="Faol kartalar" value={fmt(m.stats?.cards)} />
        <InfoRow icon="bi-people" label="Unikal mijozlar" value={fmt(m.stats?.customers)} />
        <InfoRow icon="bi-coin" label="Jami ballar (jamg'arilgan)" value={fmt(m.stats?.total_points)} />
        <InfoRow icon="bi-clock-history" label="So'nggi tranzaksiya" value={fmtDate(m.last_transaction_at)} />
      </InfoCard>
    </div>
  )
}

function InfoCard({ title, icon, action, children }) {
  return (
    <div className="a-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 700, fontSize: 14 }}>
        <i className={`bi ${icon}`} style={{ color: 'var(--a-primary)', fontSize: 15 }} />
        <span style={{ flex: 1 }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--a-border)' }}>
      <i className={`bi ${icon}`} style={{ fontSize: 13, color: 'var(--a-muted)', marginTop: 1, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--a-muted)', width: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function EditRow({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--a-border)' }}>
      <i className={`bi ${icon}`} style={{ fontSize: 13, color: 'var(--a-muted)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: 'var(--a-muted)', width: 140, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

/* ── Customers ── */
function CustomersTab({ items, search, setSearch }) {
  if (items === null) return <div className="a-loading"><div className="a-spinner" /></div>

  const filtered = search
    ? items.filter(c =>
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || '').includes(search)
      )
    : items

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          className="a-input"
          placeholder="Ism yoki telefon..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <span style={{ fontSize: 13, color: 'var(--a-muted)', alignSelf: 'center' }}>
          {filtered.length} ta mijoz
        </span>
      </div>
      <div className="a-table-wrap a-card">
        <table className="a-table">
          <thead>
            <tr>
              <th>ID</th><th>Ism</th><th>Telefon</th><th>Ballar</th>
              <th>Kartalar</th><th>Qo'shilgan</th><th>So'nggi faollik</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id || i}>
                <td className="td-dim">#{c.id}</td>
                <td className="td-bold">{c.name || '—'}</td>
                <td className="td-dim" style={{ fontFamily: 'monospace', fontSize: 12 }}>{c.phone || '—'}</td>
                <td style={{ fontWeight: 700, color: 'var(--a-green)' }}>{fmt(c.total_points)}</td>
                <td className="td-dim">{fmt(c.card_count)}</td>
                <td className="td-dim">{fmtDate(c.joined_at)}</td>
                <td className="td-dim">{fmtDate(c.last_seen)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="a-empty">Mijozlar topilmadi</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TierBadge({ tier }) {
  const map = {
    bronze:   { label: 'Bronze',   color: '#cd7f32', bg: 'rgba(205,127,50,0.12)' },
    silver:   { label: 'Silver',   color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    gold:     { label: 'Gold',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    platinum: { label: 'Platinum', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  }
  const t = map[tier?.toLowerCase?.()] || { label: tier, color: 'var(--a-muted)', bg: 'rgba(0,0,0,0.08)' }
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
      background: t.bg, color: t.color,
    }}>{t.label}</span>
  )
}

/* ── Transactions ── */
function TransactionsTab({ items, sort, setSort }) {
  if (items === null) return <div className="a-loading"><div className="a-spinner" /></div>

  const sorted = [...(items || [])].sort((a, b) => {
    const da = new Date(a.created_at), db = new Date(b.created_at)
    return sort === 'desc' ? db - da : da - db
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--a-muted)' }}>{sorted.length} ta tranzaksiya</span>
        <button className="a-btn a-btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}
          onClick={() => setSort(s => s === 'desc' ? 'asc' : 'desc')}>
          {sort === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          {sort === 'desc' ? 'Yangi avval' : 'Eski avval'}
        </button>
      </div>
      <div className="a-table-wrap a-card">
        <table className="a-table">
          <thead>
            <tr>
              <th>ID</th><th>Mijoz</th><th>Tur</th><th>Ballar</th>
              <th>Summa</th><th>Xodim</th><th>Filial</th><th>Vaqt</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx, i) => {
              const isEarn = tx.points > 0 || tx.type === 'earn'
              return (
                <tr key={tx.id || i}>
                  <td className="td-dim">#{tx.id}</td>
                  <td className="td-bold">{tx.user_name || tx.customer_name || '—'}</td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: isEarn ? 'rgba(63,156,92,0.12)' : 'rgba(239,68,68,0.1)',
                      color: isEarn ? 'var(--a-green)' : 'var(--a-red)',
                    }}>
                      {{ earn: 'Yig\'ish', redeem: 'Sarflash' }[tx.type] || (isEarn ? 'Yig\'ish' : 'Sarflash')}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, color: isEarn ? 'var(--a-green)' : 'var(--a-red)' }}>
                    {isEarn ? '+' : ''}{fmt(tx.points)}
                  </td>
                  <td className="td-dim">{tx.amount ? `${fmt(tx.amount)} so'm` : '—'}</td>
                  <td className="td-dim">{tx.staff_name || tx.cashier_name || '—'}</td>
                  <td className="td-dim">{tx.branch_name || '—'}</td>
                  <td className="td-dim">{fmtDateTime(tx.created_at)}</td>
                </tr>
              )
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="a-empty">Tranzaksiyalar yo'q</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Branches & Staff ── */
function BranchesTab({ branches = [], staff = [], merchantId, reload }) {
  const [bForm, setBForm] = useState(null)   // { id, name, address, phone, working_hours, is_active } | null
  const [bSaving, setBSaving] = useState(false)
  const [bErr, setBErr] = useState('')
  const [sForm, setSForm] = useState(null)   // { id, username, password, full_name, phone, role, branch_id, is_active } | null
  const [sSaving, setSSaving] = useState(false)
  const [sErr, setSErr] = useState('')
  const [bMap, setBMap] = useState(false)
  const [bGeo, setBGeo] = useState(false)

  function openBranchNew() {
    setBErr(''); setBMap(false)
    setBForm(bForm ? null : { id: null, name: '', address: '', phone: '', working_hours: '', is_active: true, lat: null, lng: null })
  }
  function openBranchEdit(b) {
    setBErr(''); setBMap(false)
    setBForm({
      id: b.id, name: b.name || '', address: b.address || '', phone: b.phone || '',
      working_hours: b.working_hours || '', is_active: b.is_active !== false,
      lat: b.lat != null ? Number(b.lat) : null, lng: b.lng != null ? Number(b.lng) : null,
    })
  }

  function geolocateBranch() {
    if (!navigator.geolocation) { setBErr("Geolokatsiya qo'llab-quvvatlanmaydi"); return }
    setBGeo(true); setBErr('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const la = pos.coords.latitude, ln = pos.coords.longitude
        setBForm(f => ({ ...f, lat: la, lng: ln })); setBMap(true)
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}&accept-language=uz,ru,en`)
          const d = await r.json()
          if (d?.display_name) setBForm(f => ({ ...f, address: f.address || d.display_name }))
        } catch (_) {}
        setBGeo(false)
      },
      (e) => { setBErr(e.message || 'Joylashuv aniqlanmadi'); setBGeo(false) },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  async function saveBranch() {
    if (!bForm?.name?.trim()) { setBErr('Filial nomi kiritilishi shart'); return }
    setBSaving(true); setBErr('')
    const payload = {
      name: bForm.name.trim(), address: bForm.address || '', phone: bForm.phone || '',
      working_hours: bForm.working_hours || '', is_active: bForm.is_active,
      lat: bForm.lat != null ? Number(bForm.lat) : null,
      lng: bForm.lng != null ? Number(bForm.lng) : null,
    }
    try {
      if (bForm.id) await api.patch(`/admin/merchants/${merchantId}/branches/${bForm.id}`, payload)
      else await api.post(`/admin/merchants/${merchantId}/branches`, payload)
      setBForm(null); setBMap(false); reload?.()
    } catch (e) { setBErr(e?.message || 'Xato') }
    finally { setBSaving(false) }
  }

  async function delBranch(id, name) {
    if (!window.confirm(`"${name}" filialini o'chirasizmi?`)) return
    try { await api.delete(`/admin/merchants/${merchantId}/branches/${id}`); reload?.() }
    catch (e) { alert(e?.message || 'Xato') }
  }

  function openStaffNew() {
    setSErr('')
    setSForm(sForm ? null : { id: null, username: '', password: '', full_name: '', phone: '', role: 'cashier', branch_id: '', is_active: true })
  }
  function openStaffEdit(s) {
    setSErr('')
    setSForm({
      id: s.id, username: s.username || '', password: '', full_name: s.full_name || '',
      phone: s.phone || '', role: s.role || 'cashier',
      branch_id: s.branch_id != null ? String(s.branch_id) : '', is_active: s.is_active !== false,
    })
  }

  async function saveStaff() {
    if (!sForm?.username || sForm.username.trim().length < 3) { setSErr('Username kamida 3 belgi'); return }
    if (!sForm.id && (!sForm.password || sForm.password.length < 6)) { setSErr('Parol kamida 6 belgi'); return }
    if (sForm.id && sForm.password && sForm.password.length < 6) { setSErr('Parol kamida 6 belgi'); return }
    setSSaving(true); setSErr('')
    const payload = {
      username: sForm.username.trim(), full_name: sForm.full_name || '', phone: sForm.phone || '',
      role: sForm.role || 'cashier', branch_id: sForm.branch_id ? Number(sForm.branch_id) : null,
      is_active: sForm.is_active,
    }
    if (sForm.password) payload.password = sForm.password
    try {
      if (sForm.id) await api.patch(`/admin/merchants/${merchantId}/staff/${sForm.id}`, payload)
      else await api.post(`/admin/merchants/${merchantId}/staff`, payload)
      setSForm(null); reload?.()
    } catch (e) { setSErr(e?.message || 'Xato') }
    finally { setSSaving(false) }
  }

  async function delStaff(id, username) {
    if (!window.confirm(`"${username}" xodimini o'chirasizmi?`)) return
    try { await api.delete(`/admin/merchants/${merchantId}/staff/${id}`); reload?.() }
    catch (e) { alert(e?.message || 'Xato') }
  }

  const formWrap = {
    background: 'var(--a-card2)', border: '1px solid var(--a-border)', borderRadius: 10,
    padding: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
  }
  const formTitle = { gridColumn: '1 / -1', fontWeight: 700, fontSize: 13, color: 'var(--a-primary)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filiallar */}
      <div className="a-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <i className="bi bi-geo-alt" style={{ color: 'var(--a-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Filiallar ({branches.length})</span>
          <button className="a-btn a-btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={openBranchNew}>
            <Plus size={14} style={{ marginRight: 4 }} />{bForm ? 'Bekor' : "Filial qo'shish"}
          </button>
        </div>

        {bForm && (
          <div style={formWrap}>
            <div style={formTitle}>{bForm.id ? 'Filialni tahrirlash' : 'Yangi filial'}</div>
            <input className="a-input" placeholder="Filial nomi *" value={bForm.name}
              onChange={e => setBForm({ ...bForm, name: e.target.value })} />
            <input className="a-input" placeholder="Telefon" value={bForm.phone}
              onChange={e => setBForm({ ...bForm, phone: e.target.value })} />
            <input className="a-input" placeholder="Manzil" value={bForm.address}
              onChange={e => setBForm({ ...bForm, address: e.target.value })} />
            <input className="a-input" placeholder="Ish vaqti (09:00-22:00)" value={bForm.working_hours}
              onChange={e => setBForm({ ...bForm, working_hours: e.target.value })} />
            <select className="a-input" value={bForm.is_active ? 'true' : 'false'}
              onChange={e => setBForm({ ...bForm, is_active: e.target.value === 'true' })}>
              <option value="true">Faol</option>
              <option value="false">Yopiq</option>
            </select>

            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="a-btn a-btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }}
                onClick={() => setBMap(v => !v)}>
                <MapPin size={14} style={{ marginRight: 4 }} />{bMap ? 'Kartani yashirish' : 'Kartadan tanlash'}
              </button>
              <button type="button" className="a-btn a-btn-secondary" style={{ fontSize: 12, padding: '6px 10px' }}
                disabled={bGeo} onClick={geolocateBranch}>
                {bGeo ? '...' : 'Mening joylashuvim'}
              </button>
              {bForm.lat != null && bForm.lng != null && (
                <span style={{ fontSize: 11, color: 'var(--a-muted)', fontFamily: 'monospace' }}>
                  {Number(bForm.lat).toFixed(5)}, {Number(bForm.lng).toFixed(5)}
                </span>
              )}
            </div>
            {bMap && (
              <BranchMapPicker lat={bForm.lat} lng={bForm.lng}
                onPick={(la, ln, addr) => setBForm(f => ({ ...f, lat: la, lng: ln, address: addr || f.address }))} />
            )}

            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="a-btn a-btn-primary" disabled={bSaving} onClick={saveBranch} style={{ fontSize: 13 }}>
                {bSaving ? '...' : 'Saqlash'}
              </button>
              {bErr && <span style={{ color: 'var(--a-red)', fontSize: 12 }}>{bErr}</span>}
            </div>
          </div>
        )}

        {branches.length === 0 ? (
          <div style={{ color: 'var(--a-muted)', fontSize: 13 }}>Filiallar yo'q</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {branches.map(b => (
              <div key={b.id} style={{
                padding: 14, background: 'var(--a-card2)', borderRadius: 10, border: '1px solid var(--a-border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                    {b.address && <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 2 }}>{b.address}</div>}
                    {b.phone && <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 2 }}>{b.phone}</div>}
                    {b.working_hours && <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 2 }}>{b.working_hours}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: b.is_active ? 'rgba(63,156,92,0.12)' : 'rgba(239,68,68,0.1)',
                      color: b.is_active ? 'var(--a-green)' : 'var(--a-red)',
                    }}>
                      {b.is_active ? 'Faol' : 'Yopiq'}
                    </span>
                    <button onClick={() => openBranchEdit(b)} title="Tahrirlash"
                      className="a-btn a-btn-secondary" style={{ padding: '4px 8px' }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => delBranch(b.id, b.name)} title="O'chirish"
                      className="a-btn a-btn-secondary" style={{ padding: '4px 8px' }}>
                      <Trash2 size={14} style={{ color: 'var(--a-red)' }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Xodimlar */}
      <div className="a-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <i className="bi bi-people" style={{ color: 'var(--a-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Xodimlar ({staff.length})</span>
          <button className="a-btn a-btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={openStaffNew}>
            <Plus size={14} style={{ marginRight: 4 }} />{sForm ? 'Bekor' : "Xodim qo'shish"}
          </button>
        </div>

        {sForm && (
          <div style={formWrap}>
            <div style={formTitle}>{sForm.id ? 'Xodimni tahrirlash' : 'Yangi xodim'}</div>
            <input className="a-input" placeholder="Username * (login)" value={sForm.username}
              onChange={e => setSForm({ ...sForm, username: e.target.value })} />
            <input className="a-input" placeholder={sForm.id ? "Yangi parol (bo'sh = o'zgarmaydi)" : 'Parol * (min 6)'}
              value={sForm.password} onChange={e => setSForm({ ...sForm, password: e.target.value })} />
            <input className="a-input" placeholder="To'liq ism" value={sForm.full_name}
              onChange={e => setSForm({ ...sForm, full_name: e.target.value })} />
            <input className="a-input" placeholder="Telefon" value={sForm.phone}
              onChange={e => setSForm({ ...sForm, phone: e.target.value })} />
            <select className="a-input" value={sForm.role}
              onChange={e => setSForm({ ...sForm, role: e.target.value })}>
              <option value="cashier">Kassir</option>
              <option value="manager">Menejer</option>
              <option value="admin">Admin</option>
            </select>
            <select className="a-input" value={sForm.branch_id}
              onChange={e => setSForm({ ...sForm, branch_id: e.target.value })}>
              <option value="">— Filial (ixtiyoriy) —</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className="a-input" value={sForm.is_active ? 'true' : 'false'}
              onChange={e => setSForm({ ...sForm, is_active: e.target.value === 'true' })}>
              <option value="true">Faol</option>
              <option value="false">Bloklangan</option>
            </select>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button className="a-btn a-btn-primary" disabled={sSaving} onClick={saveStaff} style={{ fontSize: 13 }}>
                {sSaving ? '...' : 'Saqlash'}
              </button>
              {sErr && <span style={{ color: 'var(--a-red)', fontSize: 12 }}>{sErr}</span>}
            </div>
          </div>
        )}

        {staff.length === 0 ? (
          <div style={{ color: 'var(--a-muted)', fontSize: 13 }}>Xodimlar yo'q</div>
        ) : (
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr><th>Username</th><th>Ism</th><th>Rol</th><th>Holat</th><th>So'nggi kirish</th><th></th></tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s.id}>
                    <td><code style={{ fontSize: 12, fontFamily: 'monospace' }}>{s.username}</code></td>
                    <td className="td-bold">{s.full_name || '—'}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: 'rgba(47,107,63,0.1)', color: 'var(--a-primary)',
                      }}>{s.role}</span>
                    </td>
                    <td>
                      {s.is_active
                        ? <CheckCircle size={14} style={{ color: 'var(--a-green)' }} />
                        : <XCircle size={14} style={{ color: 'var(--a-red)' }} />}
                    </td>
                    <td className="td-dim">{fmtDateTime(s.last_login_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openStaffEdit(s)} title="Tahrirlash"
                          className="a-btn a-btn-secondary" style={{ padding: '4px 8px' }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => delStaff(s.id, s.username)} title="O'chirish"
                          className="a-btn a-btn-secondary" style={{ padding: '4px 8px' }}>
                          <Trash2 size={14} style={{ color: 'var(--a-red)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Merchant QR (mijoz signup QR'i) ── */
function MerchantQrCard({ merchantId, merchantName }) {
  const smartUrl = merchantId ? `${window.location.origin}/j/${merchantId}` : ''
  const [png, setPng] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedImg, setCopiedImg] = useState(false)

  useEffect(() => {
    if (!smartUrl) { setPng(''); return }
    let alive = true
    QRCode.toDataURL(smartUrl, {
      errorCorrectionLevel: 'M', margin: 2, width: 512,
      color: { dark: '#0F1115', light: '#FFFFFF' },
    }).then(d => { if (alive) setPng(d) }).catch(() => {})
    return () => { alive = false }
  }, [smartUrl])

  function downloadBlob(blob, filename) {
    const u = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = u; a.download = filename
    document.body.appendChild(a); a.click()
    setTimeout(() => { URL.revokeObjectURL(u); a.remove() }, 0)
  }

  function downloadQr() {
    if (!png) return
    fetch(png).then(r => r.blob()).then(b => {
      const safe = (merchantName || 'merchant').replace(/\s+/g, '-').toLowerCase()
      downloadBlob(b, `monvo-qr-${safe}.png`)
    })
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(smartUrl); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1500) } catch {}
  }

  async function copyImg() {
    try {
      const blob = await (await fetch(png)).blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopiedImg(true); setTimeout(() => setCopiedImg(false), 1500)
    } catch {}
  }

  return (
    <div className="a-card" style={{ padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="bi bi-qr-code-scan" style={{ color: 'var(--a-primary)', fontSize: 16 }} />
        Mijoz QR plakatı
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--a-muted)', marginBottom: 18 }}>
        Mijoz bu QR'ni telefon kamerasi yoki Monvo ilovasi bilan skanerlasa — avtomatik a'zo bo'ladi.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'start' }}>
        {/* QR preview */}
        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--a-border)', background: '#fff', aspectRatio: '1 / 1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {png
            ? <img src={png} alt="QR" style={{ width: '86%', display: 'block' }} />
            : <div className="a-spinner" style={{ width: 24, height: 24 }} />}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <code style={{
            fontSize: 11.5, fontFamily: 'monospace', color: 'var(--a-muted)',
            wordBreak: 'break-all', background: 'var(--a-card2)', padding: '7px 10px',
            borderRadius: 7, display: 'block',
          }}>{smartUrl}</code>

          <button className="a-btn a-btn-primary" onClick={downloadQr} disabled={!png} style={{ gap: 6, justifyContent: 'center' }}>
            <i className="bi bi-qr-code" /> QR kodni yuklab olish (PNG)
          </button>
          <div style={{ height: 1, background: 'var(--a-border)', margin: '2px 0' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="a-btn a-btn-ghost" onClick={copyLink} style={{ flex: 1, gap: 6, justifyContent: 'center' }}>
              <i className={`bi ${copiedLink ? 'bi-check2' : 'bi-link-45deg'}`} />
              {copiedLink ? 'Nusxalandi!' : 'Havolani nusxalash'}
            </button>
            <button className="a-btn a-btn-ghost" onClick={copyImg} disabled={!png} style={{ flex: 1, gap: 6, justifyContent: 'center' }}>
              <i className={`bi ${copiedImg ? 'bi-check2' : 'bi-clipboard-image'}`} />
              {copiedImg ? 'Nusxalandi!' : 'QR nusxalash'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Settings ── */
function SettingsTab({ m, toggle, toggling, reload }) {
  const [name, setName] = useState(m.business_name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameErr, setNameErr] = useState('')
  const [nameOk, setNameOk] = useState(false)

  const dirty = name.trim() !== (m.business_name || '')

  async function saveName() {
    const n = name.trim()
    if (n.length < 2) { setNameErr('Biznes nomi juda qisqa'); return }
    setSavingName(true); setNameErr(''); setNameOk(false)
    try {
      await api.patch(`/admin/merchants/${m.id}`, { business_name: n })
      setNameOk(true)
      reload?.()
    } catch (e) {
      setNameErr(e?.message || 'Xato')
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 540 }}>
      {/* Biznes nomi */}
      <div className="a-card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="bi bi-pencil-square" style={{ color: 'var(--a-primary)' }} />
          Biznes nomi
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="a-input"
            value={name}
            maxLength={150}
            placeholder="Biznes nomi"
            onChange={e => { setName(e.target.value); setNameOk(false); setNameErr('') }}
            style={{ flex: 1 }}
          />
          <button
            className="a-btn a-btn-primary"
            disabled={savingName || !dirty || name.trim().length < 2}
            onClick={saveName}
            style={{ whiteSpace: 'nowrap' }}
          >
            {savingName ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
        {nameErr && <div style={{ color: 'var(--a-red)', fontSize: 12, marginTop: 8 }}>{nameErr}</div>}
        {nameOk && !dirty && <div style={{ color: 'var(--a-green)', fontSize: 12, marginTop: 8 }}>✓ Nom yangilandi</div>}
      </div>

      {/* QR kod */}
      <MerchantQrCard merchantId={m.id} merchantName={m.business_name} />

      <div className="a-card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="bi bi-toggle-on" style={{ color: 'var(--a-primary)' }} />
          Holat boshqaruvi
        </div>
        <div style={{ fontSize: 13, color: 'var(--a-muted)', marginBottom: 16 }}>
          Hozirgi holat:{' '}
          <span style={{ fontWeight: 700, color: m.is_active ? 'var(--a-green)' : 'var(--a-red)' }}>
            {m.is_active ? 'Faol' : 'Bloklangan'}
          </span>
        </div>
        <button
          className={`a-btn ${m.is_active ? 'a-btn-danger' : 'a-btn-primary'}`}
          onClick={toggle}
          disabled={toggling}
          style={{ gap: 8 }}
        >
          <Power size={14} />
          {toggling ? 'Saqlanmoqda...' : m.is_active ? 'Bloklash' : 'Faollashtirish'}
        </button>
      </div>

      <div className="a-card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="bi bi-info-circle" style={{ color: 'var(--a-primary)' }} />
          Qo'shimcha ma'lumot
        </div>
        <InfoRow icon="bi-hash" label="ID" value={`#${m.id}`} />
        <InfoRow icon="bi-calendar3" label="Yaratilgan" value={fmtDateTime(m.created_at)} />
        <InfoRow icon="bi-activity" label="So'nggi faollik" value={fmtDateTime(m.last_activity_at)} />
        <InfoRow icon="bi-arrow-left-right" label="So'nggi tranzaksiya" value={fmtDateTime(m.last_transaction_at)} />
      </div>
    </div>
  )
}
