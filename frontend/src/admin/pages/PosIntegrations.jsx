import { useEffect, useState } from 'react'
import {
  Plug,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Copy,
  Key,
  Users,
} from 'lucide-react'
import { api } from '../api'

/**
 * Admin POS integratsiyalari sahifasi.
 *
 * Har bir provayder (Billz, iiko, ...) uchun master toggle.
 * Yoqilgani — merchant panelda "ulash" formasi paydo bo'ladi.
 * O'chirilgani — merchant tomonida "Tez orada" sifatida ko'rinadi.
 *
 * Ko'rsatkichlar: nechta merchant ulangan, oxirgi sync.
 */
export default function PosIntegrations() {
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState({})
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const list = await api.get('/admin/pos/providers')
      setProviders(Array.isArray(list) ? list : [])
    } catch (e) {
      setErr(e.message || 'Yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggle(slug, enabled) {
    setBusy(b => ({ ...b, [slug]: true }))
    try {
      await api.patch(`/admin/pos/providers/${slug}`, { enabled })
      setProviders(ps => ps.map(p => p.slug === slug ? { ...p, enabled } : p))
    } catch (e) {
      setErr(e.message || 'Saqlab bo\'lmadi')
    } finally {
      setBusy(b => ({ ...b, [slug]: false }))
    }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">POS tizimi</div>
          <div className="a-page-sub">
            Tashqi POS provayderlarini global yoqish/o'chirish — yoqilgan POS bizneslar tomonida ulash uchun ko'rinadi
          </div>
        </div>
      </div>

      {err && (
        <div style={{
          padding: 12, marginBottom: 14, borderRadius: 10,
          background: 'rgba(220,38,38,0.08)', color: '#DC2626',
          border: '1px solid rgba(220,38,38,0.25)', fontSize: 13,
        }}>{err}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {loading
          ? <div className="a-card" style={{ padding: 32 }}>Yuklanmoqda...</div>
          : providers.map(p => (
              <ProviderCard
                key={p.slug}
                provider={p}
                busy={!!busy[p.slug]}
                onToggle={enabled => toggle(p.slug, enabled)}
              />
            ))}
      </div>

      <UniversalApiCard />
    </div>
  )
}

// Real brand logos (in public/branding/pos/). Providers without an entry
// fall back to the emoji map below.
const POS_LOGO_FILES = {
  billz: '/branding/pos/billz.png',
  iiko: '/branding/pos/iiko.png',
}

function ProviderLogo({ slug, size = 52 }) {
  const file = POS_LOGO_FILES[slug]
  const emojiMap = {
    alipos: '🍱',
    yclients: '💇',
    rkeeper: '🍽️',
    onec: '1️⃣',
    poster: '☕',
    moysklad: '📦',
  }
  const emoji = emojiMap[slug] || '🔌'
  const wrapStyle = {
    width: size, height: size, borderRadius: 14,
    background: 'var(--a-card2)', border: '1px solid var(--a-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: Math.round(size * 0.5),
    overflow: 'hidden',
    flexShrink: 0,
  }
  if (file) {
    return (
      <div style={wrapStyle}>
        <img
          src={file}
          alt={slug}
          loading="lazy"
          style={{
            maxWidth: '78%',
            maxHeight: '78%',
            objectFit: 'contain',
          }}
        />
      </div>
    )
  }
  return <div style={wrapStyle}>{emoji}</div>
}

function ProviderCard({ provider, busy, onToggle }) {
  const featuresMap = {
    billz: [
      'Har sotuv real-time webhook orqali keladi',
      'Mijoz telefoni / karta UID bo\'yicha karta topiladi',
      'Cashback avtomatik beriladi — kassir hech nima qilmaydi',
      'Online + offline rejim qo\'llab-quvvatlanadi',
    ],
    iiko: [
      'iiko Cloud API (api-ru.iiko.services)',
      'Order webhook-larini Monvo endpointiga yuboradi',
      'Mijoz telefoni iiko mijozlar bazasida saqlanadi',
      'Bonus dasturlari iiko bonus modulini almashtiradi',
    ],
    yclients: [
      'Salon, barbershop va beauty bizneslari uchun',
      'Yozilish (booking) va to\'lov hodisalari sinxron keladi',
      'Mijoz telefoni YCLIENTS bazasida saqlanadi',
      'Loyallik va karta YCLIENTS karta o\'rnini bosadi',
    ],
    rkeeper: [
      'r_keeper 7 / RK Cloud REST API',
      'Sotuv chek tasdiqlangach hodisa keladi',
      'iiko\'ga muqobil — yirik restoran tarmoqlari uchun',
      'Online + offline rejim qo\'llab-quvvatlanadi',
    ],
    onec: [
      '1C: Roznitsa / UNF / UT — OData yoki HTTP-servis orqali',
      'Chek pollingi (har 30s) — webhook talab qilinmaydi',
      'Ulgurji va chakana — barcha format qo\'llab-quvvatlanadi',
      'Korzinka, Makro turidagi yirik tarmoqlar uchun',
    ],
    poster: [
      'joinposter.com cloud — kafe / bar uchun №1 osma',
      'Sotuv tasdiqlangach webhook keladi',
      'Mijoz telefoni Poster CRM\'da saqlanadi',
      'Iiko/r_keeper o\'rnini bosadi kichik segmentda',
    ],
    moysklad: [
      'Мой Склад JSON API 1.2',
      'Sotuv pollingi (1-5 min) — webhook ham mavjud',
      'Omborxona + chakana savdo uchun cloud yechim',
      'Kichik do\'kon va mini-market uchun ideal',
    ],
    alipos: [
      'ALIPOS order status webhook orqali keladi',
      'OAuth 2.0 (clientId + clientSecret per restoran) bilan auth',
      'Mijoz telefoni deliveryInfo.phoneNumber dan olinadi',
      'Ball faqat READY/TAKEN_BY_COURIER status\'da beriladi',
      'CANCELED → ball avtomatik qaytariladi (refund)',
    ],
  }
  const features = featuresMap[provider.slug] || []

  return (
    <div className="a-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <ProviderLogo slug={provider.slug} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{provider.name}</div>
            <StatusBadge enabled={provider.enabled} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--a-muted)' }}>{provider.tagline}</div>
        </div>
        <ToggleSwitch on={provider.enabled} busy={busy} onChange={onToggle} />
      </div>

      <div style={{
        display: 'flex', gap: 14, marginTop: 16, marginBottom: 14,
        padding: 12, background: 'var(--a-card2)', borderRadius: 10,
        border: '1px solid var(--a-border)',
      }}>
        <Stat icon={<Users size={14} />} label="Ulangan biznes" value={provider.connected_merchants} />
      </div>

      {features.length > 0 && (
        <ul style={{
          margin: 0, padding: 0, listStyle: 'none',
          fontSize: 12.5, color: 'var(--a-muted)', lineHeight: 1.7,
        }}>
          {features.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: 6 }}>
              <span style={{ color: 'var(--a-green)' }}>✓</span> {b}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <a href={provider.doc_url} target="_blank" rel="noopener noreferrer" className="a-btn a-btn-ghost">
          <ExternalLink size={14} /> Hujjatlar
        </a>
      </div>
    </div>
  )
}

function ToggleSwitch({ on, busy, onChange }) {
  return (
    <button
      onClick={() => !busy && onChange(!on)}
      disabled={busy}
      style={{
        width: 46, height: 26, borderRadius: 999, border: 'none',
        background: on ? 'var(--a-green)' : 'var(--a-border)',
        position: 'relative', cursor: busy ? 'wait' : 'pointer',
        flexShrink: 0, transition: 'background 0.2s',
      }}
      title={on ? 'Yoqilgan' : 'O\'chirilgan'}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: on ? 23 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transition: 'left 0.2s',
      }} />
    </button>
  )
}

function StatusBadge({ enabled }) {
  return enabled ? (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      background: 'rgba(22,163,74,0.12)', color: '#16A34A',
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
    }}>
      <CheckCircle2 size={11} /> YOQILGAN
    </span>
  ) : (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      background: 'rgba(107,114,128,0.14)', color: 'var(--a-muted)',
      fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
    }}>
      <AlertCircle size={11} /> O'CHIRILGAN
    </span>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ color: 'var(--a-muted)' }}>{icon}</div>
      <div>
        <div style={{
          fontSize: 18, fontWeight: 700, color: 'var(--a-text)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>{label}</div>
      </div>
    </div>
  )
}

function UniversalApiCard() {
  return (
    <div className="a-card" style={{ padding: 24, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12,
          background: 'rgba(47,107,63,0.12)', color: 'var(--a-green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Plug size={22} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Universal REST API</div>
          <div style={{ fontSize: 13, color: 'var(--a-muted)' }}>
            Boshqa POS tizimlari uchun (1C, SmartUp, custom)
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <EndpointBox method="POST" path="/pos/preview" desc="QR scan qilingach, cashback hisoblash" />
        <EndpointBox method="POST" path="/pos/commit"  desc="To'lov tasdiqlangach, ball berish" />
        <EndpointBox method="GET"  path="/pos/balance" desc="Mijoz bonus balansini olish" />
      </div>

      <div style={{
        padding: 14, background: 'var(--a-card2)', borderRadius: 10,
        border: '1px dashed var(--a-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Key size={14} color="var(--a-muted)" />
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', letterSpacing: 0.4 }}>
            POS API KEY
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--a-text)' }}>
          Har biznes "Sozlamalar → POS API key" sahifasida o'z kalitini yaratadi.
          Kalit POS terminalga kiritiladi, har so'rovda <code>Authorization: Bearer ...</code> sifatida yuboriladi.
        </div>
      </div>
    </div>
  )
}

function EndpointBox({ method, path, desc }) {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    navigator.clipboard.writeText(`https://monvo.uz${path}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div style={{
      padding: 12, background: 'var(--a-card2)', borderRadius: 10,
      border: '1px solid var(--a-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: 'rgba(47,107,63,0.18)', color: 'var(--a-green)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>{method}</span>
        <code style={{ fontSize: 12, color: 'var(--a-text)' }}>{path}</code>
        <button
          onClick={onCopy}
          title="Nusxalash"
          style={{
            marginLeft: 'auto', background: 'transparent', border: 0,
            color: copied ? 'var(--a-green)' : 'var(--a-muted)', cursor: 'pointer',
          }}>
          <Copy size={12} />
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--a-muted)' }}>{desc}</div>
    </div>
  )
}
