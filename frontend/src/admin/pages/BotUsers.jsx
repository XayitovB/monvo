import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../api'

function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('uz', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function BotBadge({ bot }) {
  const merchant = bot === 'merchant'
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
      background: merchant ? 'rgba(47,107,63,.12)' : 'rgba(99,102,241,.12)',
      color: merchant ? '#2F6B3F' : '#4F46E5',
    }}>
      {merchant ? 'Business' : 'User'}
    </span>
  )
}

export default function BotUsers() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [data, setData] = useState({ total: 0, items: [] })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  async function load() {
    setLoading(true); setErr('')
    try {
      // bot parametri yo'q → har ikki bot bitta ro'yxatda (single page)
      const qs = `?limit=1000${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`
      setData(await api.get(`/admin/bot-users${qs}`) || { total: 0, items: [] })
    } catch (e) { setErr(e.message); setData({ total: 0, items: [] }) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    const t = setTimeout(load, 350)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = data.items || []

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Bot foydalanuvchilari</div>
          <div className="a-page-sub">Har ikki Telegram bot bilan muloqotda bo'lganlar</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: .5 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ism, username, telefon yoki Telegram ID"
            style={{ width: '100%', padding: '8px 12px 8px 32px', background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8 }}
          />
        </div>
        <div style={{ fontSize: 13, color: 'var(--a-muted)' }}>Jami: {data.total}</div>
      </div>

      {err && <div className="al-error" style={{ marginBottom: 10 }}>{err}</div>}

      <div className="ma-card">
        <table className="ma-table">
          <thead>
            <tr>
              <th>Bot</th><th>Telegram ID</th><th>Ism</th><th>Username</th>
              <th>Telefon</th><th>Til</th><th>Xabarlar</th><th>Birinchi</th><th>Oxirgi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: 'var(--a-muted)' }}>Yuklanmoqda...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 20, color: 'var(--a-muted)' }}>Foydalanuvchi yo'q</td></tr>
            ) : items.map(u => (
              <tr key={u.id} onClick={() => navigate(`/panel/bot-users/${u.id}`)} style={{ cursor: 'pointer' }}>
                <td><BotBadge bot={u.bot} /></td>
                <td style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{u.telegram_id}</td>
                <td style={{ fontWeight: 600 }}>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                <td>{u.username ? <span style={{ color: 'var(--a-primary, #3F9C5C)' }}>@{u.username}</span> : <span style={{ color: 'var(--a-muted)' }}>—</span>}</td>
                <td style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{u.phone || <span style={{ color: 'var(--a-muted)' }}>—</span>}</td>
                <td><span className="crm-tag">{u.language_code}</span></td>
                <td style={{ fontWeight: 700 }}>{u.message_count}</td>
                <td style={{ color: 'var(--a-muted)', fontSize: 12 }}>{fmtDate(u.first_seen)}</td>
                <td style={{ color: 'var(--a-muted)', fontSize: 12 }}>{fmtDate(u.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
