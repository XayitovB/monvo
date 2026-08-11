import { ArrowRight, QrCode, Scan } from 'lucide-react'
import { useLang } from '../LangContext'
import './Hero.css'

// Deterministic QR-ish pattern (not a real QR, just visual)
const QR_GRID = Array.from({ length: 10 * 10 }, (_, i) => {
  const x = i % 10, y = Math.floor(i / 10)
  // Corner finder markers
  if ((x < 3 && y < 3) || (x > 6 && y < 3) || (x < 3 && y > 6)) {
    const inner = (x >= 1 && x <= (x < 3 ? 1 : 7)) && (y >= 1 && y <= (y < 3 ? 1 : 7))
    const border = x === 0 || y === 0 || (x < 3 ? x === 2 : x === 6) || (y < 3 ? y === 2 : y === 6)
    return border || inner ? 1 : 0
  }
  // Pseudo-random body
  return (x * 7 + y * 13 + x * y) % 3 === 0 ? 1 : 0
})

export default function Hero() {
  const { t } = useLang()
  const h = t.hero

  return (
    <section className="hero">
      <div className="container hero-inner">
        <div className="hero-content">
          <span className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            Monvo · B2B Loyalty
          </span>

          <h1 className="hero-title">
            {h.title1} <br />
            <span className="hero-title-accent">{h.title2}</span> {h.title3}
          </h1>

          <p className="hero-subtitle">{h.subtitle}</p>

          <div className="hero-actions">
            <a href="#download" className="btn btn-primary">
              {h.cta_primary} <ArrowRight size={16} />
            </a>
            <a href="#how" className="btn btn-outline">
              {h.cta_secondary}
            </a>
          </div>

          <div className="hero-meta">
            <div className="hero-meta-item">
              <div className="hero-meta-value">500+</div>
              <div className="hero-meta-label">{h.trust}</div>
            </div>
            <div className="hero-meta-sep" />
            <div className="hero-meta-item">
              <div className="hero-meta-value">18k+</div>
              <div className="hero-meta-label">cards issued</div>
            </div>
            <div className="hero-meta-sep" />
            <div className="hero-meta-item">
              <div className="hero-meta-value">&lt; 2s</div>
              <div className="hero-meta-label">QR scan</div>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="loyalty-card animate-float">
            <div className="lc-top">
              <div className="lc-brand">
                <div className="lc-brand-icon">K</div>
                <span>Monvo</span>
              </div>
              <span className="lc-tier">GOLD</span>
            </div>

            <div className="lc-middle">
              <div className="lc-qr">
                {QR_GRID.map((v, i) => (
                  <span key={i} className={v ? 'lc-qr-on' : ''} />
                ))}
              </div>
              <div className="lc-info">
                <div className="lc-label">Balance</div>
                <div className="lc-balance">
                  680
                  <span>{h.screen_points}</span>
                </div>
                <div className="lc-holder">AZIZ KARIMOV</div>
                <div className="lc-uid">•••• •••• 68A3</div>
              </div>
            </div>

            <div className="lc-bottom">
              <div className="lc-progress">
                <div className="lc-progress-head">
                  <span>Next tier · Platinum</span>
                  <span>680 / 1 000</span>
                </div>
                <div className="lc-progress-bar">
                  <div className="lc-progress-fill" style={{ width: '68%' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="hero-chip chip-scan">
            <Scan size={14} /> {h.scan_value}
          </div>
          <div className="hero-chip chip-qr">
            <QrCode size={14} /> {h.badge_qr}
          </div>
        </div>
      </div>
    </section>
  )
}
