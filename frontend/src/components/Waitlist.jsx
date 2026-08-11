import { useState } from 'react'
import { Mail, ArrowRight, CheckCircle } from 'lucide-react'
import { useLang } from '../LangContext'
import './Waitlist.css'

const content = {
  uz: {
    label: "Early access",
    title1: "Biznesingiz uchun",
    title2: "early access ochish",
    subtitle: "Monvo early access dasturiga qo'shiling. Launch paytida birinchi 100 biznesga umrbod bepul Starter tariff beriladi.",
    placeholder: "Biznes emailingiz",
    btn: "Listga qo'shilish",
    success: "Ro'yxatga kiritildingiz! Tez orada aloqaga chiqamiz.",
    note: "Spam yuborilmaydi · Istalgan vaqt obunani bekor qilish mumkin",
    count: "150+ biznes allaqachon navbatda",
  },
  ru: {
    label: "Ранний доступ",
    title1: "Ранний доступ",
    title2: "для вашего бизнеса",
    subtitle: "Присоединяйтесь к программе early access Monvo. Первые 100 бизнесов получат пожизненный бесплатный Starter-тариф.",
    placeholder: "Email вашего бизнеса",
    btn: "Добавить в лист",
    success: "Вы в списке! Свяжемся с вами скоро.",
    note: "Никакого спама · Отписаться можно в любое время",
    count: "150+ бизнесов уже в очереди",
  },
}

export default function Waitlist() {
  const { lang } = useLang()
  const c = content[lang]
  const [email, setEmail]   = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | done | error

  async function submit(e) {
    e.preventDefault()
    setStatus('loading')
    try {
      const res = await fetch('/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error()
      setStatus('done')
      setEmail('')
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  return (
    <section className="section waitlist-section" id="waitlist">
      <div className="container">
        <div className="waitlist-card">
          <div className="waitlist-orb-1" />
          <div className="waitlist-orb-2" />
          <div className="waitlist-body">
            <div className="section-label" style={{ justifyContent: 'center' }}>
              <Mail size={13} /> {c.label}
            </div>
            <h2 className="section-title waitlist-title">
              {c.title1} <span className="gradient-text">{c.title2}</span>
            </h2>
            <p className="waitlist-subtitle">{c.subtitle}</p>

            {status === 'done' ? (
              <div className="waitlist-success">
                <CheckCircle size={22} />
                {c.success}
              </div>
            ) : (
              <form className="waitlist-form" onSubmit={submit}>
                <div className="waitlist-input-wrap">
                  <Mail size={16} className="waitlist-input-icon" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={c.placeholder}
                    className="waitlist-input"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? '...' : <>{c.btn} <ArrowRight size={16} /></>}
                </button>
              </form>
            )}

            {status === 'error' && (
              <div className="waitlist-error">{lang === 'ru' ? 'Произошла ошибка. Попробуйте ещё раз.' : "Xatolik yuz berdi. Qayta urinib ko'ring."}</div>
            )}

            <div className="waitlist-meta">
              <div className="waitlist-count">
                <div className="wc-dots">
                  {['#0B2545','#1E40AF','#1E3A5F'].map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </div>
                {c.count}
              </div>
              <span className="waitlist-note">{c.note}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
