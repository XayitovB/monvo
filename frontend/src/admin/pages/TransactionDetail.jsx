import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Coins, Gift } from 'lucide-react'
import { api } from '../api'
import './Table.css'

const TZ = 'Asia/Tashkent'
function sep(n) { return Math.round(Number(n ?? 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') }
function fmtDateTime(s) {
  return s ? new Date(s).toLocaleString('uz', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) : '—'
}

export default function TransactionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [t, setT] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setErr(null)
    api.get(`/admin/transactions/${id}`)
      .then(d => { if (alive) setT(d) })
      .catch(e => { if (alive) setErr(e?.message || 'Yuklab bo\'lmadi') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="a-spinner" /></div>
  if (err) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--a-red)' }}>{err}</div>
  if (!t) return null

  const earn = t.tx_type === 'earn'

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button className="a-btn a-btn-secondary" style={{ padding: '8px 12px' }}
          onClick={() => navigate('/panel/transactions')}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>Tranzaksiya #{t.id}</h1>
            <span className={`a-badge ${earn ? 'a-badge-green' : 'a-badge-blue'}`}>
              {earn ? 'Ball berildi' : 'Ishlatildi'}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--a-muted)', marginTop: 2 }}>
            {fmtDateTime(t.created_at)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: earn ? 'var(--a-green)' : 'var(--a-red)' }}>
            {t.points_delta > 0 ? '+' : ''}{sep(t.points_delta)} ball
          </div>
          {t.amount > 0 && <div style={{ fontSize: 13, color: 'var(--a-muted)' }}>{sep(t.amount)} so'm</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Kimga (recipient) */}
        <Card title="Kimga berildi" icon="bi-person">
          <Row label="Ism" value={t.recipient?.name || '—'} />
          <Row label="Telefon" value={t.recipient?.phone || '—'} />
          {t.recipient?.email && <Row label="Email" value={t.recipient.email} />}
          {t.recipient?.id && (
            <button className="a-btn a-btn-secondary" style={{ marginTop: 10, fontSize: 12 }}
              onClick={() => navigate(`/panel/users/${t.recipient.id}`)}>
              Foydalanuvchi profili →
            </button>
          )}
        </Card>

        {/* Biznes */}
        <Card title="Biznes" icon="bi-shop">
          <Row label="Nomi" value={t.merchant?.business_name || '—'} />
          <button className="a-btn a-btn-secondary" style={{ marginTop: 10, fontSize: 12 }}
            onClick={() => navigate(`/panel/merchants/${t.merchant?.id}`)}>
            Biznes sahifasi →
          </button>
        </Card>

        {/* Karta */}
        <Card title="Karta" icon="bi-credit-card">
          <Row label="UID" value={<code style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.card?.card_uid}</code>} />
          <Row label="Joriy ball" value={sep(t.card?.points)} />
          <Row label="Egasi" value={t.card?.holder_name || '—'} />
        </Card>

        {/* Tafsilotlar */}
        <Card title="Tafsilotlar" icon="bi-info-circle">
          <Row label="Tur" value={earn ? 'Ball berildi (earn)' : 'Ishlatildi (redeem)'} />
          {t.branch && <Row label="Filial" value={t.branch.name} />}
          {t.staff && <Row label="Xodim" value={t.staff.full_name || t.staff.username} />}
          {t.reward && <Row label="Mukofot" value={t.reward.title} />}
          {t.provider && <Row label="POS" value={`${t.provider}${t.external_ref ? ' · ' + t.external_ref : ''}`} />}
        </Card>
      </div>

      {/* Izoh (comment) */}
      {t.note && (
        <div className="a-card" style={{ padding: 20, marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="bi bi-chat-text" style={{ color: 'var(--a-primary)' }} /> Izoh
          </div>
          <div style={{ fontSize: 14 }}>{t.note}</div>
        </div>
      )}

      {/* Applied rules */}
      {Array.isArray(t.applied_rules) && t.applied_rules.length > 0 && (
        <div className="a-card" style={{ padding: 20, marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Qo'llangan qoidalar</div>
          <pre style={{ fontSize: 12, color: 'var(--a-muted)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {JSON.stringify(t.applied_rules, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function Card({ title, icon, children }) {
  return (
    <div className="a-card" style={{ padding: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className={`bi ${icon}`} style={{ color: 'var(--a-primary)' }} /> {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--a-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--a-muted)', width: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}
