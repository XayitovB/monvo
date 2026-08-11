import { useState } from 'react'
import { HelpCircle, ChevronDown } from 'lucide-react'
import { useLang } from '../LangContext'
import './FAQ.css'

const faqData = {
  uz: [
    { q: "Monvo bepulmi?", a: "Ha, bepul tariff mavjud. Har bir biznes 100 tagacha kartani va asosiy reward katalogini bepul boshqara oladi." },
    { q: "QR karta qanday chiqariladi?", a: "Admin paneldan bir bosishda — har bir karta uchun unikal QR kod avtomatik yaratiladi. Raqamli karta yoki plastikaga chop etish mumkin." },
    { q: "Ballar qanday hisoblanadi?", a: "Siz qoidani belgilaysiz: masalan, har 1000 so'm uchun 1 ball yoki har tashrif uchun fiks ball. Bir nechta qoidalarni parallel ishlatish mumkin." },
    { q: "Mobil ilovamga integratsiyalay olamanmi?", a: "Ha, barcha endpointlar ochiq REST API. Swagger/OpenAPI qo'llab-quvvatlanadi. Bearer JWT autentifikatsiyasi bilan." },
    { q: "Ma'lumotlar xavfsizmi?", a: "Parollar bcrypt bilan hash qilinadi, tokenlar JWT orqali beriladi, trafik HTTPS. Mijoz ma'lumotlari uchinchi shaxslarga berilmaydi." },
    { q: "Qoidalarni o'zgartirsam bo'ladimi?", a: "Istalgan vaqtda: ball qoidasi, reward katalogi, narxlari — hammasi admin paneldan jonli tahrirlanadi." },
  ],
  ru: [
    { q: "Monvo бесплатный?", a: "Да, есть бесплатный тариф. Каждый бизнес может управлять до 100 карт и базовым каталогом наград бесплатно." },
    { q: "Как выпускается QR карта?", a: "Одним кликом из админ-панели — уникальный QR код генерируется автоматически. Можно использовать цифровую или напечатать пластик." },
    { q: "Как начисляются баллы?", a: "Правила задаёте вы: например, 1 балл за каждые 1000 сум или фикс за визит. Можно использовать несколько правил одновременно." },
    { q: "Можно интегрировать в моё мобильное приложение?", a: "Да, все эндпоинты — открытый REST API. Swagger/OpenAPI поддерживается. Bearer JWT аутентификация." },
    { q: "Данные в безопасности?", a: "Пароли хешируются bcrypt, токены по JWT, трафик по HTTPS. Данные клиентов не передаются третьим лицам." },
    { q: "Можно ли менять правила?", a: "В любой момент: правила баллов, каталог и цены наград — всё правится в админ-панели вживую." },
  ],
}

const labels = { uz: "Savollar", ru: "Вопросы" }
const titles = {
  uz: ["Ko'p so'raladigan", "savollar"],
  ru: ["Часто задаваемые", "вопросы"],
}

export default function FAQ() {
  const { lang } = useLang()
  const [open, setOpen] = useState(null)
  const items = faqData[lang]
  const [t1, t2] = titles[lang]

  return (
    <section className="section faq-section" id="faq">
      <div className="container faq-container">
        <div className="section-head">
          <div className="section-label">
            <HelpCircle size={13} /> {labels[lang]}
          </div>
          <h2 className="section-title">
            {t1}<br />
            <span className="gradient-text">{t2}</span>
          </h2>
        </div>

        <div className="faq-list">
          {items.map((item, i) => (
            <div
              key={i}
              className={`faq-item ${open === i ? 'open' : ''}`}
              onClick={() => setOpen(open === i ? null : i)}
            >
              <div className="faq-question">
                <span>{item.q}</span>
                <ChevronDown size={18} className="faq-chevron" />
              </div>
              {open === i && (
                <div className="faq-answer">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
