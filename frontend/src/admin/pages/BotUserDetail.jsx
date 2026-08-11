import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Phone, CreditCard, ExternalLink } from 'lucide-react'
import { api } from '../api'

function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('uz', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Field({ label, value, mono }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--a-border)' }}>
      <div style={{ fontSize: 12, color: 'var(--a-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, fontFamily: mono ? 'ui-monospace, Menlo, monospace' : 'inherit', fontSize: mono ? 13 : 15 }}>
        {value || '—'}
      </div>
    </div>
  )
}

export default function BotUserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [u, setU] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    let on = true
    setLoading(true); setErr('')
    api.get(`/admin/bot-users/${id}`)
      .then(d => { if (on) setU(d) })
      .catch(e => { if (on) setErr(e.message) })
      .finally(() => { if (on) setLoading(false) })
    return () => { on = false }
  }, [id])

  const name = u ? [u.first_name, u.last_name].filter(Boolean).join(' ') || '—' : ''
  const merchant = u?.bot === 'merchant'

  return (
    <div>
      <button onClick={() => navigate(-1)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--a-muted)', cursor: 'pointer', marginBottom: 12, fontSize: 14 }}>
        <ArrowLeft size={16} /> Orqaga
      </button>

      {loading ? (
        <div className="ma-card" style={{ padding: 24, color: 'var(--a-muted)' }}>Yuklanmoqda...</div>
      ) : err ? (
        <div className="al-error">{err}</div>
      ) : u ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: merchant ? 'rgba(47,107,63,.12)' : 'rgba(99,102,241,.12)',
              color: merchant ? '#2F6B3F' : '#4F46E5',
            }}>
              <Bot size={26} />
            </div>
            <div>
              <div className="a-page-title" style={{ marginBottom: 2 }}>{name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--a-muted)' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                  background: merchant ? 'rgba(47,107,63,.12)' : 'rgba(99,102,241,.12)',
                  color: merchant ? '#2F6B3F' : '#4F46E5',
                }}>{merchant ? 'Business bot' : 'User bot'}</span>
                {u.username && <span style={{ color: 'var(--a-green, #3F9C5C)' }}>@{u.username}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Telegram profil */}
            <div className="ma-card" style={{ padding: '4px 18px 14px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 4px' }}>Telegram profil</h3>
              <Field label="Telegram ID" value={u.telegram_id} mono />
              <Field label="Username" value={u.username ? '@' + u.username : '—'} />
              <Field label="Til" value={u.language_code} />
              <Field label="Xabarlar soni" value={u.message_count} />
              <Field label="Birinchi ko'rilgan" value={fmtDate(u.first_seen)} />
              <Field label="Oxirgi ko'rilgan" value={fmtDate(u.last_seen)} />
            </div>

            {/* Bog'langan hisob */}
            <div className="ma-card" style={{ padding: '4px 18px 14px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 4px' }}>Bog'langan hisob</h3>
              {u.account ? (
                <>
                  <Field label="Telefon" value={u.account.phone} mono />
                  <Field label="Ism" value={u.account.name} />
                  <Field label="Role" value={u.account.role} />
                  <Field label="Holat" value={u.account.is_active ? 'Faol' : 'Bloklangan'} />
                  <Field label="Ro'yxatdan o'tgan" value={fmtDate(u.account.created_at)} />
                  {u.stats && (
                    <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CreditCard size={15} style={{ opacity: .6 }} />
                        <b>{u.stats.cards}</b> karta
                      </div>
                      <div><b>{(u.stats.points || 0).toLocaleString()}</b> ball</div>
                    </div>
                  )}
                  {u.account.role === 'user' && (
                    <button onClick={() => navigate(`/panel/users/${u.account.id}`)}
                      style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--a-border)', background: 'var(--a-bg)', cursor: 'pointer', fontSize: 13 }}>
                      <ExternalLink size={14} /> To'liq hisobni ochish
                    </button>
                  )}
                </>
              ) : (
                <div style={{ padding: '14px 0', color: 'var(--a-muted)', fontSize: 13 }}>
                  <Phone size={15} style={{ verticalAlign: 'middle', marginRight: 6, opacity: .5 }} />
                  Hali telefon orqali ro'yxatdan o'tmagan (faqat botni ochgan).
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
