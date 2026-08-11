import { QrCode, Coins, Gift, Trophy, Scan, Bell, Smartphone, BarChart3 } from 'lucide-react'
import { useLang } from '../LangContext'
import './Features.css'

const icons = [
  <QrCode size={22} />,    <Coins size={22} />,   <Gift size={22} />,       <Trophy size={22} />,
  <Scan size={22} />,      <Bell size={22} />,    <Smartphone size={22} />, <BarChart3 size={22} />,
]

export default function Features() {
  const { t } = useLang()
  const f = t.features

  return (
    <section className="section features-section" id="features">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">{f.label}</div>
          <h2 className="section-title">
            {f.title1}<br />
            <span className="gradient-text">{f.title2}</span>
          </h2>
          <p className="section-subtitle">{f.subtitle}</p>
        </div>

        <div className="features-grid">
          {f.items.map((item, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{icons[i]}</div>
              <h3 className="feature-title">{item.title}</h3>
              <p className="feature-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
