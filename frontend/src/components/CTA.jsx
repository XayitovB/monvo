import { ArrowRight, Smartphone, Globe } from 'lucide-react'
import { useLang } from '../LangContext'
import './CTA.css'

export default function CTA() {
  const { t } = useLang()
  const c = t.cta

  return (
    <section className="section cta-section" id="download">
      <div className="container">
        <div className="cta-card">
          <div className="cta-orb cta-orb-1" />
          <div className="cta-orb cta-orb-2" />
          <div className="cta-content">
            <div className="section-label" style={{ justifyContent: 'center' }}>
              <Smartphone size={13} /> {c.label}
            </div>
            <h2 className="section-title cta-title">
              {c.title1}<br />
              <span className="gradient-text">{c.title2}</span> {c.title3}
            </h2>
            <p className="cta-subtitle">{c.subtitle}</p>
            <div className="cta-buttons">
              <a href="#" className="btn btn-primary cta-btn-main">
                <Smartphone size={18} />
                {c.btn_app}
                <ArrowRight size={18} />
              </a>
              <a href="#" className="btn btn-outline">
                <Globe size={18} />
                {c.btn_web}
              </a>
            </div>
            <div className="cta-note">{c.note}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
