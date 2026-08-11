import React, { useEffect } from 'react';
import Nav from './Nav.jsx';
import { Footer } from './BottomSections.jsx';

export default function Legal({ T, lang, setLang, theme, toggleTheme, page }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  const content = page === 'terms' ? T.terms : T.privacy;

  return (
    <div className="k-root">
      <Nav T={T} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} onCta={() => {}} />
      <main>
        <section style={{ padding: '120px 0 80px' }}>
          <div className="container" style={{ maxWidth: 820 }}>
            <a
              href="/"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13.5, color: 'var(--k-ink-mute)', textDecoration: 'none',
                marginBottom: 32,
              }}
            >
              ← {T.legal_back}
            </a>
            <h1 style={{
              fontFamily: 'var(--k-display)', fontSize: 44, fontWeight: 500,
              letterSpacing: -1, marginBottom: 12,
            }}>
              {content.title}
            </h1>
            <div style={{ fontSize: 13.5, color: 'var(--k-ink-mute)', marginBottom: 48 }}>
              {T.legal_updated}: {content.updated}
            </div>

            {content.sections.map((sec, i) => (
              <section key={i} style={{ marginBottom: 36 }}>
                <h2 style={{
                  fontFamily: 'var(--k-display)', fontSize: 22, fontWeight: 500,
                  marginBottom: 12, letterSpacing: -0.2,
                }}>
                  {sec.h}
                </h2>
                {(sec.p || []).map((para, j) => (
                  <p key={j} style={{
                    fontSize: 15, lineHeight: 1.65, color: 'var(--k-ink-soft)',
                    marginBottom: 12,
                  }}>
                    {para}
                  </p>
                ))}
                {sec.list && (
                  <ul style={{
                    fontSize: 15, lineHeight: 1.8, color: 'var(--k-ink-soft)',
                    paddingLeft: 22, marginTop: 8,
                  }}>
                    {sec.list.map((item, k) => (
                      <li key={k}>{item}</li>
                    ))}
                  </ul>
                )}
                {sec.extraParas && sec.extraParas.map((para, k) => (
                  <p key={`xp-${k}`} style={{
                    fontSize: 15, lineHeight: 1.65, color: 'var(--k-ink-soft)',
                    marginTop: 12, marginBottom: 0,
                  }}>
                    {para}
                  </p>
                ))}
              </section>
            ))}

            <section style={{
              marginTop: 60, padding: 24, borderRadius: 12,
              background: 'var(--k-surface-2, rgba(127,127,127,0.06))',
              border: '1px solid var(--k-line)',
            }}>
              <div style={{ fontSize: 13, color: 'var(--k-ink-mute)', marginBottom: 12 }}>
                {T.legal_contact_title}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                <strong>{T.legal_full_name || 'BRADHAM MCHJ'}</strong><br />
                {T.legal_tin && <>{T.legal_tin}<br /></>}
                {T.legal_address}<br />
                {T.legal_reg && <span style={{ color: 'var(--k-ink-mute)', fontSize: 13 }}>{T.legal_reg}<br /></span>}
                <span style={{ marginTop: 8, display: 'inline-block' }}>
                  Email: <a href="mailto:info@monvo.uz" style={{ color: 'var(--k-ink)' }}>info@monvo.uz</a><br />
                  Telegram: <a href="https://t.me/Monvo_uz" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--k-ink)' }}>@Monvo_uz</a>
                </span>
              </div>
            </section>
          </div>
        </section>
      </main>
      <Footer T={T} lang={lang} setLang={setLang} />
    </div>
  );
}
