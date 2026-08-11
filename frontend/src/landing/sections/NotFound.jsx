import React, { useEffect } from 'react';
import Nav from './Nav.jsx';
import { Footer } from './BottomSections.jsx';

// 404 — noma'lum URL'lar uchun. SPA bo'lgani uchun server 200 qaytaradi,
// shuning uchun JS render qiladigan crawlerlar uchun noindex meta qo'shamiz
// (soft-404 → duplicate content jazosi oldini olish).
export default function NotFound({ T, lang, setLang, theme, toggleTheme }) {
  useEffect(() => {
    window.scrollTo(0, 0);
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, follow';
    m.setAttribute('data-404', '1');
    document.head.appendChild(m);
    const titles = {
      ru: 'Страница не найдена',
      en: 'Page not found',
      uz: 'Sahifa topilmadi',
    };
    document.title = '404 — ' + (titles[lang] || titles.uz);
    return () => {
      document.head.querySelector('meta[data-404]')?.remove();
    };
  }, [lang]);

  const NOT_FOUND_TEXT = {
    ru: { code: '404', title: 'Страница не найдена', body: 'Такой страницы не существует или она была перемещена.', cta: 'На главную' },
    en: { code: '404', title: 'Page not found', body: 'This page does not exist or has been moved.', cta: 'Back to home' },
    uz: { code: '404', title: 'Sahifa topilmadi', body: "Bunday sahifa mavjud emas yoki ko'chirilgan.", cta: 'Bosh sahifa' },
  };
  const txt = NOT_FOUND_TEXT[lang] || NOT_FOUND_TEXT.uz;

  return (
    <div className="k-root">
      <Nav T={T} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} onCta={() => {}} />
      <main>
        <section style={{ padding: '140px 0 120px', textAlign: 'center' }}>
          <div className="container" style={{ maxWidth: 560 }}>
            <div style={{
              fontFamily: 'var(--k-display)', fontSize: 96, fontWeight: 600,
              letterSpacing: -3, lineHeight: 1, color: 'var(--k-brand, #2F6B3F)',
            }}>
              {txt.code}
            </div>
            <h1 style={{
              fontFamily: 'var(--k-display)', fontSize: 32, fontWeight: 500,
              letterSpacing: -0.5, margin: '16px 0 10px',
            }}>
              {txt.title}
            </h1>
            <p style={{ fontSize: 15, color: 'var(--k-ink-mute)', marginBottom: 32 }}>
              {txt.body}
            </p>
            <a href="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 24px', borderRadius: 10, textDecoration: 'none',
              background: 'var(--k-brand, #2F6B3F)', color: '#fff', fontWeight: 600, fontSize: 14,
            }}>
              ← {txt.cta}
            </a>
          </div>
        </section>
      </main>
      <Footer T={T} lang={lang} setLang={setLang} />
    </div>
  );
}
