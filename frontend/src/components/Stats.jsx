import { useEffect, useRef, useState } from 'react'
import { useLang } from '../LangContext'
import './Stats.css'

function useCountUp(target, duration = 2000, started = false) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!started) return
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start = Math.min(start + step, target)
      setCount(Math.floor(start))
      if (start >= target) clearInterval(timer)
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration, started])
  return count
}

const stats = [
  { value: 520,    suffix: "+" },
  { value: 18400,  suffix: "+" },
  { value: 962000, suffix: "+" },
  { value: 4800,   suffix: "+" },
]

function StatItem({ value, suffix, label, started }) {
  const count = useCountUp(value, 1800, started)
  return (
    <div className="stat-item">
      <div className="stat-number">
        {count.toLocaleString()}<span className="stat-suffix">{suffix}</span>
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export default function Stats() {
  const [started, setStarted] = useState(false)
  const ref = useRef(null)
  const { t } = useLang()
  const s = t.stats

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStarted(true) },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="section stats-section" id="stats" ref={ref}>
      <div className="container">
        <div className="stats-header">
          <div>
            <div className="eyebrow">{s.label}</div>
            <h2 className="section-title">
              {s.title1}<br />
              <span className="gradient-text">{s.title2}</span>
            </h2>
          </div>
          <p className="section-subtitle stats-subtitle">{s.subtitle}</p>
        </div>

        <div className="stats-grid">
          {stats.map((st, i) => (
            <StatItem key={i} {...st} label={s.items[i]} started={started} />
          ))}
        </div>

        <div className="stats-marquee">
          <div className="marquee-track">
            {[...s.marquee, ...s.marquee].map((tag, i) => (
              <span key={i} className="marquee-tag">{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
