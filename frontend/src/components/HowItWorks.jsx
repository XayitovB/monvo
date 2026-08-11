import { Store, Settings, CreditCard, Scan } from 'lucide-react'
import { useLang } from '../LangContext'
import './HowItWorks.css'

const icons = [<Store size={22} />, <Settings size={22} />, <CreditCard size={22} />, <Scan size={22} />]

export default function HowItWorks() {
  const { t } = useLang()
  const h = t.how

  return (
    <section className="section hiw-section" id="how">
      <div className="container">
        <div className="section-head">
          <div className="eyebrow">{h.label}</div>
          <h2 className="section-title">
            {h.title1}<br />
            <span className="gradient-text">{h.title2}</span>
          </h2>
          <p className="section-subtitle">{h.subtitle}</p>
        </div>

        <div className="hiw-steps">
          {h.steps.map((s, i) => (
            <div key={i} className="hiw-step">
              <div className="hiw-step-row">
                <span className="hiw-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="hiw-step-icon">{icons[i]}</span>
              </div>
              <h3 className="hiw-title">{s.title}</h3>
              <p className="hiw-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
