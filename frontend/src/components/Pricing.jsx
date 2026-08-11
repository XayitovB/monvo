import { useEffect, useState } from 'react'
import { Check, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { useLang } from '../LangContext'
import './Pricing.css'

function formatSum(n) {
  if (n == null) return '—'
  if (n === 0) return '0'
  return new Intl.NumberFormat('ru-RU').format(n)
}

function limitText(value, unlimitedLabel) {
  if (value == null || value === 0) return unlimitedLabel
  return value.toLocaleString('ru-RU')
}

export default function Pricing() {
  const { lang, t } = useLang()
  const p = t.pricing
  const isUz = lang === 'uz'

  const [tariffs, setTariffs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/tariffs')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(data => { if (!cancelled) setTariffs(Array.isArray(data) ? data : []) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [])

  return (
    <section className="section pricing-section" id="pricing">
      <div className="container">
        <div className="section-head pricing-head">
          <div className="eyebrow">{p.label}</div>
          <h2 className="section-title">
            {p.title1}<br />
            <span className="gradient-text">{p.title2}</span>
          </h2>
          <p className="section-subtitle">{p.subtitle}</p>
        </div>

        {tariffs === null && !error && (
          <div className="pricing-state">
            <Loader2 className="pricing-spin" size={22} />
          </div>
        )}

        {error && (
          <div className="pricing-state pricing-error">
            {p.error}
          </div>
        )}

        {tariffs && tariffs.length === 0 && !error && (
          <div className="pricing-state">{p.empty}</div>
        )}

        {tariffs && tariffs.length > 0 && (
          <div className={`pricing-grid pricing-cols-${Math.min(tariffs.length, 4)}`}>
            {tariffs.map(tf => {
              const title = isUz ? tf.title_uz : tf.title_ru
              const desc = isUz ? tf.description_uz : tf.description_ru
              const featureList = buildFeatureList(tf, p, isUz)
              return (
                <div key={tf.id} className={`pricing-card ${tf.is_recommended ? 'recommended' : ''}`}>
                  {tf.is_recommended && (
                    <div className="pricing-badge">
                      <Sparkles size={12} /> {p.recommended}
                    </div>
                  )}
                  <div className="pricing-card-head">
                    <h3 className="pricing-name">{title}</h3>
                    {desc && <p className="pricing-desc">{desc}</p>}
                  </div>

                  <div className="pricing-price">
                    {tf.monthly_price === 0 ? (
                      <span className="pricing-free">{p.free}</span>
                    ) : (
                      <>
                        <span className="pricing-amount">{formatSum(tf.monthly_price)}</span>
                        <span className="pricing-currency">{p.currency}</span>
                        <span className="pricing-period">/{p.month}</span>
                      </>
                    )}
                  </div>

                  <ul className="pricing-features">
                    {featureList.map((f, i) => (
                      <li key={i}>
                        <Check size={15} strokeWidth={2.4} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <a href="/auth" className={`btn pricing-cta ${tf.is_recommended ? 'btn-primary' : 'btn-outline'}`}>
                    {p.cta} <ArrowRight size={14} />
                  </a>
                </div>
              )
            })}
          </div>
        )}

        <p className="pricing-note">{p.note}</p>
      </div>
    </section>
  )
}

function buildFeatureList(tf, p, isUz) {
  const out = []
  const lim = tf.limits || {}
  const f = tf.features || {}

  out.push(`${limitText(lim.customers, p.unlimited)} ${p.customers}`)
  out.push(`${limitText(lim.branches, p.unlimited)} ${p.branches}`)
  out.push(`${limitText(lim.staff, p.unlimited)} ${p.staff}`)
  out.push(`${limitText(lim.rewards, p.unlimited)} ${p.rewards}`)
  if (lim.push_per_month != null && lim.push_per_month > 0) {
    out.push(`${lim.push_per_month.toLocaleString('ru-RU')} ${p.pushPerMonth}`)
  } else if (lim.push_per_month === 0 || lim.push_per_month == null) {
    out.push(`${p.unlimited} ${p.pushPerMonth}`)
  }

  if (f.tier) out.push(p.featTier)
  if (f.gamification) out.push(p.featGamification)
  if (f.games) out.push(p.featGames)
  if (f.birthday_bonus) out.push(p.featBirthday)
  if (f.segments_advanced) out.push(p.featSegments)
  if (f.card_design_custom) out.push(p.featCardDesign)
  if (f.scheduled_push) out.push(p.featScheduledPush)
  if (f.pos_integration) out.push(p.featPosIntegration)
  if (f.api_access) out.push(p.featApi)
  if (f.priority_support) out.push(p.featSupport)

  if (Array.isArray(tf.extra_features)) {
    for (const ex of tf.extra_features) {
      if (typeof ex === 'string' && ex.trim()) out.push(ex)
    }
  }
  return out
}
