import { useState, useEffect } from 'react'
import { Clock, Bell, Play, Save, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../api'

export default function ScheduledPush() {
  const [cfg, setCfg]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [running, setRunning] = useState(false)
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    api.get('/admin/scheduled-push').then(d => { setCfg(d); setLoading(false) })
  }, [])

  async function save() {
    setSaving(true)
    const updated = await api.patch('/admin/scheduled-push', {
      enabled:       cfg.enabled,
      hour:          Number(cfg.hour),
      minute:        Number(cfg.minute),
      threshold_pct: Number(cfg.threshold_pct),
    })
    setCfg(updated)
    setSaving(false)
    setMsg('Sozlamalar saqlandi ✓')
    setTimeout(() => setMsg(''), 3000)
  }

  async function runNow() {
    setRunning(true)
    await api.post('/admin/scheduled-push/run-now', {})
    setRunning(false)
    setMsg('Push xabarlar fonda yuborilmoqda...')
    setTimeout(() => setMsg(''), 4000)
  }

  if (loading) return <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Rejalashtirilgan Push</div>
          <div className="a-page-sub">Byudjet eslatmalarini avtomatik yuborish</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Settings card */}
        <div className="a-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} style={{ color: 'var(--a-primary-light)' }} />
            Jadval sozlamalari
          </div>

          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '12px 16px', background: 'var(--a-card2)', borderRadius: 10 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Avtomatik eslatmalar</div>
              <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 2 }}>Har kuni belgilangan vaqtda yuboriladi</div>
            </div>
            <button
              onClick={() => setCfg(p => ({ ...p, enabled: !p.enabled }))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.enabled ? 'var(--a-primary-light)' : 'var(--a-muted)' }}
            >
              {cfg.enabled ? <ToggleRight size={36} /> : <ToggleLeft size={36} />}
            </button>
          </div>

          {/* Time picker */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--a-muted)', display: 'block', marginBottom: 6 }}>Yuborish vaqti (UTC)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number" min={0} max={23}
                  value={cfg.hour}
                  onChange={e => setCfg(p => ({ ...p, hour: e.target.value }))}
                  className="a-input"
                  placeholder="Soat (0-23)"
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number" min={0} max={59}
                  value={cfg.minute}
                  onChange={e => setCfg(p => ({ ...p, minute: e.target.value }))}
                  className="a-input"
                  placeholder="Daqiqa (0-59)"
                />
              </div>
            </div>
          </div>

          {/* Threshold */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: 'var(--a-muted)', display: 'block', marginBottom: 6 }}>
              Eslatma chegarasi: <strong style={{ color: 'var(--a-primary-light)' }}>{cfg.threshold_pct}%</strong>
            </label>
            <input
              type="range" min={50} max={100} step={5}
              value={cfg.threshold_pct}
              onChange={e => setCfg(p => ({ ...p, threshold_pct: Number(e.target.value) }))}
              style={{ width: '100%', accentColor: 'var(--a-primary-light)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--a-muted)', marginTop: 4 }}>
              <span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="a-btn a-btn-primary" style={{ flex: 1 }} onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>

          {msg && <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(47,107,63,0.1)', borderRadius: 8, fontSize: 13, color: 'var(--a-primary-light)', textAlign: 'center' }}>{msg}</div>}
        </div>

        {/* Status card */}
        <div className="a-card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={16} style={{ color: '#5FAE6F' }} />
            Holat va boshqaruv
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--a-card2)', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--a-muted)' }}>Holat</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: cfg.enabled ? '#5FAE6F' : '#ef4444' }}>
                {cfg.enabled ? '● Faol' : '○ O\'chirilgan'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--a-card2)', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--a-muted)' }}>Vaqt (UTC)</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--a-text)' }}>
                {String(cfg.hour).padStart(2,'0')}:{String(cfg.minute).padStart(2,'0')}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--a-card2)', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--a-muted)' }}>Chegara</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--a-text)' }}>{cfg.threshold_pct}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--a-card2)', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--a-muted)' }}>Oxirgi yuborish</span>
              <span style={{ fontSize: 12, color: 'var(--a-text)' }}>
                {cfg.last_run ? new Date(cfg.last_run).toLocaleString('uz-UZ') : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--a-card2)', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--a-muted)' }}>Oxirgi yuborilganlar</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#5FAE6F' }}>{cfg.last_sent ?? 0} ta</span>
            </div>
          </div>

          <button
            className="a-btn a-btn-primary"
            style={{ width: '100%', background: '#5FAE6F', border: 'none' }}
            onClick={runNow}
            disabled={running}
          >
            <Play size={14} /> {running ? 'Yuborilmoqda...' : 'Hozir yuborish'}
          </button>

          <div style={{ marginTop: 16, padding: 12, background: 'rgba(47,107,63,0.06)', borderRadius: 8, fontSize: 12, color: 'var(--a-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--a-text)' }}>Qanday ishlaydi?</strong><br />
            Har kuni belgilangan vaqtda tizim byudjetning {cfg.threshold_pct}% va undan ko'prog'ini sarflagan
            foydalanuvchilarga FCM push xabar yuboradi. Faqat o'sha oy uchun byudjet belgilagan va
            FCM tokeni mavjud foydalanuvchilarga yuboriladi.
          </div>
        </div>
      </div>
    </div>
  )
}
