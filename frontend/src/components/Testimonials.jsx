import { Star } from 'lucide-react'
import { useLang } from '../LangContext'
import './Testimonials.css'

const avatarColors = ['#0B2545','#1E40AF','#1E3A5F','#94A3B8','#0B2545','#1E40AF']

const testimonialsData = {
  uz: [
    { name: "Cafe Nur",   role: "Kafe, Toshkent",  text: "Monvo ishga tushgach, qaytib keluvchi mijozlar soni 2 oyda 40% ga oshdi. O'rnatish juda oson.", rating: 5 },
    { name: "Beauty Hub", role: "Salon, Samarqand", text: "QR kartalar orqali mijozlar reward yig'ishni o'yin kabi qabul qilishyapti. Haftalik aylanma o'sdi.", rating: 5 },
    { name: "Bravo Sport",role: "Do'kon, Buxoro",  text: "Ball qoidasini o'zimiz sozladik. Tez va moslashuvchan. Tiers tizimi juda yaxshi ishlaydi.", rating: 5 },
    { name: "Pro Barbershop", role: "Barbershop, Toshkent", text: "QR skanerlash 2 soniyada. Kassir ham, mijoz ham qulay deb topdi.", rating: 5 },
    { name: "Tea Point",  role: "Choyxona, Xiva",   text: "10 visitga bepul choy qoidasini o'rnatdik. Mijozlar yangi qoidani qidirib keldi.", rating: 5 },
    { name: "Fit Studio", role: "Fitnes, Namangan", text: "Platinum tier bergan 5 ta VIP mijoz haftalik abonementni uzaytirishda bir to'xtamadi.", rating: 5 },
  ],
  ru: [
    { name: "Cafe Nur",   role: "Кафе, Ташкент",   text: "После запуска Monvo количество повторных гостей выросло на 40% за 2 месяца. Настройка очень простая.", rating: 5 },
    { name: "Beauty Hub", role: "Салон, Самарканд", text: "Клиенты воспринимают сбор баллов как игру. Недельный оборот вырос.", rating: 5 },
    { name: "Bravo Sport",role: "Магазин, Бухара",  text: "Правила начисления настроили сами. Быстро и гибко. Система уровней отлично работает.", rating: 5 },
    { name: "Pro Barbershop", role: "Барбершоп, Ташкент", text: "Сканирование QR за 2 секунды. И кассир, и клиент довольны.", rating: 5 },
    { name: "Tea Point",  role: "Чайхана, Хива",    text: "Правило \"10 визитов — чай бесплатно\" заработало сразу. Клиенты стали возвращаться чаще.", rating: 5 },
    { name: "Fit Studio", role: "Фитнес, Наманган", text: "5 VIP-клиентов с уровнем Platinum продлевают абонементы без вопросов.", rating: 5 },
  ],
}

const sectionLabels = { uz: "Mijozlar", ru: "Клиенты" }
const sectionTitles = {
  uz: ["Biznes", "nima deydi"],
  ru: ["Что говорят", "бизнесы"],
}

export default function Testimonials() {
  const { lang } = useLang()
  const items = testimonialsData[lang]
  const [t1, t2] = sectionTitles[lang]

  return (
    <section className="section testimonials-section" id="testimonials">
      <div className="container">
        <div className="section-head">
          <div className="section-label">
            <Star size={13} /> {sectionLabels[lang]}
          </div>
          <h2 className="section-title">
            {t1}<br />
            <span className="gradient-text">{t2}</span>
          </h2>
        </div>

        <div className="testimonials-grid">
          {items.map((item, i) => (
            <div key={i} className="testimonial-card">
              <div className="tc-stars">
                {Array.from({ length: item.rating }).map((_, j) => (
                  <Star key={j} size={14} fill="#1E3A5F" color="#1E3A5F" />
                ))}
              </div>
              <p className="tc-text">"{item.text}"</p>
              <div className="tc-author">
                <div className="tc-avatar" style={{ background: avatarColors[i % avatarColors.length] }}>
                  {item.name[0]}
                </div>
                <div>
                  <div className="tc-name">{item.name}</div>
                  <div className="tc-role">{item.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
