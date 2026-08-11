import { useState, useEffect } from 'react'
import { Smartphone, Apple, MessageCircle, Save } from 'lucide-react'
import { api } from '../api'

export default function Links() {
  const [form, setForm]   = useState({ android_url: '', ios_url: '', telegram_url: '' })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/links').then(d => setForm(d)).finally(() => setLoading(false))
  }, [])

  async function save(e) {
    e.preventDefault()
    await api.patch('/admin/links', form)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const fields = [
    { key: 'android_url',  icon: <Smartphone size={18} />, label: 'Android (Google Play)', color: '#FFFFFF', placeholder: 'https://play.google.com/store/apps/details?id=...' },
    { key: 'ios_url',      icon: <Apple size={18} />,      label: 'iOS (App Store)',        color: '#94A3B8', placeholder: 'https://apps.apple.com/app/...' },
    { key: 'telegram_url', icon: <MessageCircle size={18} />, label: 'Telegram Bot',       color: '#5FAE6F', placeholder: 'https://t.me/MonvoBot' },
  ]

  if (loading) return <div className="a-loading"><div className="a-spinner" /></div>

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">App Linklar</div>
          <div className="a-page-sub">Landing page da ko'rinadigan yuklab olish linklari</div>
        </div>
      </div>

      <div className="a-card" style={{ maxWidth: 560, padding: 28 }}>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {fields.map(f => (
            <div key={f.key}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: f.color, marginBottom: 8 }}>
                {f.icon} {f.label}
              </label>
              <input
                className="a-input"
                type="url"
                placeholder={f.placeholder}
                value={form[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="submit" className="a-btn a-btn-primary">
              <Save size={14} /> Saqlash
            </button>
            {saved && <span style={{ fontSize: 13, color: 'var(--a-green)' }}>✓ Saqlandi</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
