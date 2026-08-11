import React, { useEffect, useState } from 'react';
import { Btn, KIcon, MonvoLogo } from '../kit/index.jsx';

export default function Nav({ T, lang, setLang, theme, toggleTheme, onCta }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const anchors = ['#features', '#how', '#pricing', '#case', '#faq'];

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      transition: 'background .25s, border-color .25s, backdrop-filter .25s',
      background: scrolled ? 'color-mix(in oklab, var(--k-bg) 82%, transparent)' : 'transparent',
      borderBottom: scrolled ? '1px solid var(--k-line)' : '1px solid transparent',
      backdropFilter: scrolled ? 'saturate(180%) blur(14px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(14px)' : 'none',
    }}>
      <div className="container k-nav-row" style={{ display: 'flex', alignItems: 'center', gap: 28, height: 72 }}>
        <a href="#top" aria-label="Monvo — bosh sahifa" style={{ textDecoration: 'none' }}><MonvoLogo size={28} green/></a>
        <nav className="k-nav-anchors" style={{ display: 'flex', gap: 28, marginLeft: 12 }}>
          {T.nav.map((label, i) => (
            <a key={i} href={anchors[i]} style={{
              fontSize: 13.5, color: 'var(--k-ink-soft)', textDecoration: 'none', fontWeight: 500,
              letterSpacing: -0.1,
            }}>{label}</a>
          ))}
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Lang switcher */}
          <div style={{
            display: 'inline-flex', background: 'var(--k-surface-alt)', borderRadius: 999, padding: 3,
          }}>
            {[{ id: 'uz', label: "O'z" }, { id: 'ru', label: 'RU' }].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setLang(opt.id)}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
                  background: lang === opt.id ? 'var(--k-surface)' : 'transparent',
                  color: lang === opt.id ? 'var(--k-ink)' : 'var(--k-ink-mute)',
                  border: 'none', borderRadius: 999, cursor: 'pointer',
                }}
              >{opt.label}</button>
            ))}
          </div>
          {/* Theme toggle */}
          <button
            className="k-nav-theme"
            onClick={toggleTheme}
            style={{
              width: 34, height: 34, borderRadius: 999, border: '1px solid var(--k-line-strong)',
              background: 'transparent', color: 'var(--k-ink-soft)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
            title={theme === 'dark' ? 'Light' : 'Dark'}
          >
            {theme === 'dark' ? <KIcon.sun size={15}/> : <KIcon.moon size={15}/>}
          </button>
          <span className="k-nav-login" style={{ display: 'inline-flex' }}>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => { window.location.href = '/merchant/login'; }}
            >{T.nav_login}</Btn>
          </span>
          <Btn
            variant="primary"
            size="sm"
            iconRight={<KIcon.arrow/>}
            onClick={onCta}
          >{T.nav_cta}</Btn>
        </div>
      </div>
    </header>
  );
}
