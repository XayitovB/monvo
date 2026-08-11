import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, QrCode, CreditCard } from 'lucide-react'
import './LoyaltyBuilder.css'

function mf(path, options = {}) {
  const token = localStorage.getItem('merchant_token')
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  }).then(async (r) => {
    if (r.status === 401) {
      localStorage.removeItem('merchant_token')
      window.location.href = '/merchant/login'
      return
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.detail || `HTTP ${r.status}`)
    }
    return r.json()
  })
}

const DEFAULT = {
  background_type: 'gradient',
  bg_color_1: '#2F6B3F',
  bg_color_2: '#5FAE6F',
  text_color: '#FFFFFF',
  accent_color: '#D4AF37',
  corner_radius: 16,
  show_logo: true,
  show_holder_name: true,
  show_holder_phone: false,
  show_tier_badge: true,
  show_points: true,
  show_qr: true,
  pattern: 'none',
  logo_position: 'top-left',
}

export default function CardDesigner() {
  const navigate = useNavigate()
  const [design, setDesign] = useState(DEFAULT)
  const [merchant, setMerchant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) {
      navigate('/merchant/login')
      return
    }
    document.body.classList.add('admin-body')
    load()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function load() {
    try {
      const [d, me] = await Promise.all([
        mf('/merchants/me/card-design'),
        mf('/merchants/me'),
      ])
      setDesign({ ...DEFAULT, ...(d || {}) })
      setMerchant(me)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function set(k, v) { setDesign({ ...design, [k]: v }) }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await mf('/merchants/me/card-design', { method: 'PUT', body: JSON.stringify(design) })
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function resetDefault() {
    if (confirm('Standart dizaynga qaytish?')) setDesign(DEFAULT)
  }

  if (loading) return <div className="lb-loading"><div className="a-spinner" /></div>

  const bg = design.background_type === 'solid'
    ? design.bg_color_1
    : `linear-gradient(135deg, ${design.bg_color_1}, ${design.bg_color_2})`

  let patternOverlay = 'none'
  if (design.pattern === 'dots') {
    patternOverlay = 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0) 0 0 / 12px 12px'
  } else if (design.pattern === 'waves') {
    patternOverlay = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 8px, transparent 8px 16px)'
  } else if (design.pattern === 'diagonal') {
    patternOverlay = 'repeating-linear-gradient(-45deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 12px)'
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}>
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div>
          <div className="lb-title">Karta Dizayner</div>
          <div className="lb-sub">Loyalty karta ko'rinishini o'zingiz yig'ing</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Saqlanyapti...' : 'Saqlash'}
        </button>
      </header>

      <div className="cd-container">
        {error && <div className="lb-error">{error}</div>}

        {/* PREVIEW */}
        <div className="cd-preview-wrap">
          <div
            className="cd-card"
            style={{
              background: bg,
              color: design.text_color,
              borderRadius: design.corner_radius,
            }}
          >
            <div className="cd-card-pattern" style={{ background: patternOverlay, borderRadius: design.corner_radius }} />
            <div className={`cd-card-logo cd-pos-${design.logo_position}`}>
              {design.show_logo && (
                <div className="cd-logo-box" style={{ color: design.accent_color, borderColor: design.accent_color }}>
                  <CreditCard size={22} />
                </div>
              )}
            </div>
            <div className="cd-card-mid">
              {design.show_tier_badge && (
                <div className="cd-tier" style={{ background: design.accent_color, color: '#2F6B3F' }}>
                  GOLD
                </div>
              )}
              {design.show_holder_name && (
                <div className="cd-holder">{merchant?.business_name || 'Biznes nomi'}</div>
              )}
              {design.show_holder_phone && (
                <div className="cd-phone" style={{ color: design.accent_color }}>+998 90 123 45 67</div>
              )}
            </div>
            <div className="cd-card-bottom">
              {design.show_points && (
                <div>
                  <div className="cd-points-label">Ballar</div>
                  <div className="cd-points-value" style={{ color: design.accent_color }}>2,450</div>
                </div>
              )}
              {design.show_qr && (
                <div className="cd-qr" style={{ background: '#fff', color: '#000' }}>
                  <QrCode size={40} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CONTROLS */}
        <div className="cd-controls">
          <div className="cd-section">
            <div className="cd-section-title">Fon</div>
            <div className="cd-row">
              <label className="cd-radio">
                <input type="radio" checked={design.background_type === 'solid'} onChange={() => set('background_type', 'solid')} />
                Bir rang
              </label>
              <label className="cd-radio">
                <input type="radio" checked={design.background_type === 'gradient'} onChange={() => set('background_type', 'gradient')} />
                Gradient
              </label>
            </div>
            <div className="cd-row">
              <label className="cd-col-field">
                <span>Asosiy rang</span>
                <input type="color" value={design.bg_color_1} onChange={(e) => set('bg_color_1', e.target.value)} />
              </label>
              {design.background_type === 'gradient' && (
                <label className="cd-col-field">
                  <span>Ikkinchi rang</span>
                  <input type="color" value={design.bg_color_2} onChange={(e) => set('bg_color_2', e.target.value)} />
                </label>
              )}
            </div>
            <div className="cd-row">
              <label className="cd-col-field">
                <span>Matn rangi</span>
                <input type="color" value={design.text_color} onChange={(e) => set('text_color', e.target.value)} />
              </label>
              <label className="cd-col-field">
                <span>Urg'u rang</span>
                <input type="color" value={design.accent_color} onChange={(e) => set('accent_color', e.target.value)} />
              </label>
            </div>
          </div>

          <div className="cd-section">
            <div className="cd-section-title">Shakl</div>
            <label className="cd-col-field">
              <span>Burchaklar radiusi: {design.corner_radius}px</span>
              <input type="range" min="0" max="36" value={design.corner_radius} onChange={(e) => set('corner_radius', Number(e.target.value))} />
            </label>
            <div className="cd-row">
              {['none', 'dots', 'waves', 'diagonal'].map((p) => (
                <button
                  key={p}
                  className={`cd-chip ${design.pattern === p ? 'on' : ''}`}
                  onClick={() => set('pattern', p)}
                  type="button"
                >{p}</button>
              ))}
            </div>
          </div>

          <div className="cd-section">
            <div className="cd-section-title">Elementlar</div>
            {[
              ['show_logo', 'Logo'],
              ['show_holder_name', 'Biznes nomi'],
              ['show_holder_phone', 'Telefon raqam'],
              ['show_tier_badge', 'Tier badge'],
              ['show_points', 'Ballar'],
              ['show_qr', 'QR kod'],
            ].map(([k, label]) => (
              <label key={k} className="cd-toggle">
                <input type="checkbox" checked={!!design[k]} onChange={(e) => set(k, e.target.checked)} />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="cd-section">
            <div className="cd-section-title">Logo joyi</div>
            <div className="cd-row">
              {['top-left', 'top-right', 'center'].map((p) => (
                <button key={p} className={`cd-chip ${design.logo_position === p ? 'on' : ''}`} onClick={() => set('logo_position', p)} type="button">
                  {p}
                </button>
              ))}
            </div>
          </div>

          <button className="a-btn a-btn-secondary" onClick={resetDefault}>
            Standart dizaynga qaytish
          </button>
        </div>
      </div>
    </div>
  )
}
