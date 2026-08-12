import React, { useEffect, useState } from 'react';
import { BRAND, BRAND_DEEP, BRAND_SOFT, KIcon, Btn, SectionHead } from '../kit/index.jsx';
import DashPreview from '../kit/DashPreview.jsx';
import { PhoneMockA, PhoneMockB, StoreBtn, TelegramBtn } from '../kit/PhoneMock.jsx';

// ── Logo wall ────────────────────────────────────────────────────────────────
// Admin paneldan boshqariladigan real biznes logolari (/landing-logos).
// API bo'sh yoki xato qaytarsa — eski matnli fallback ishlaydi (tarmoq tushgan
// taqdirda ham social trust bo'limi ko'rinishi uchun).
const FALLBACK_LOGOS = ['Coffee Lab', 'Beauty Bar', 'Pizza House', 'Plov Center', 'TashBeauty', 'Sushi Master', 'Lochinkebab', 'Korzinka'];

export function LogoWall({ T }) {
  const [logos, setLogos] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/landing-logos')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        setLogos(Array.isArray(data) ? data : []);
      })
      .catch(() => { if (!cancelled) setLogos([]); });
    return () => { cancelled = true; };
  }, []);

  const useReal = Array.isArray(logos) && logos.length > 0;
  const cols = Math.min(8, Math.max(4, useReal ? logos.length : FALLBACK_LOGOS.length));

  return (
    <section style={{ padding: '40px 0 60px', borderTop: '1px solid var(--k-line)', borderBottom: '1px solid var(--k-line)' }}>
      <div className="container">
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--k-ink-mute)', textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 28, fontWeight: 500 }}>
          {T.logos_label}
        </div>
        <div className="k-grid-logos" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 36, alignItems: 'center', opacity: 0.7 }}>
          {useReal
            ? logos.map((logo) => {
                const img = (
                  <img
                    src={logo.image_url}
                    alt={logo.name}
                    loading="lazy"
                    style={{ maxWidth: '100%', maxHeight: 40, width: 'auto', height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto', filter: 'grayscale(1)', opacity: 0.85 }}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'grayscale(0)'; e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'grayscale(1)'; e.currentTarget.style.opacity = '0.85'; }}
                  />
                );
                return logo.href
                  ? <a key={logo.id} href={logo.href} target="_blank" rel="noopener noreferrer" aria-label={logo.name}>{img}</a>
                  : <div key={logo.id} title={logo.name}>{img}</div>;
              })
            : FALLBACK_LOGOS.map((n, i) => (
                <div key={i} style={{
                  fontFamily: 'var(--k-display)', fontSize: 18, fontWeight: 600,
                  color: 'var(--k-ink-mute)', textAlign: 'center', letterSpacing: -0.3,
                  fontStyle: i % 3 === 1 ? 'italic' : 'normal',
                }}>{n}</div>
              ))
          }
        </div>
      </div>
    </section>
  );
}

// ── Stats ────────────────────────────────────────────────────────────────────
export function Stats({ T }) {
  const items = [
    { k: '1 248', l: T.stats_active, s: T.stats_active_sub },
    { k: '3.2 mln', l: T.stats_cards, s: T.stats_cards_sub },
    { k: '+18%', l: T.stats_growth, s: T.stats_growth_sub, gradient: true },
    { k: '4.9 / 5', l: T.stats_rating, s: T.stats_rating_sub },
  ];
  return (
    <section style={{ padding: '100px 0' }}>
      <div className="container k-grid-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
        {items.map((s, i) => (
          <div key={i} style={{ padding: '12px 28px', borderLeft: i === 0 ? 'none' : '1px solid var(--k-line)' }}>
            <div style={{
              fontFamily: 'var(--k-display)', fontSize: 'clamp(38px, 4.4vw, 60px)', fontWeight: 600,
              letterSpacing: -1.6, lineHeight: 1, color: 'var(--k-ink)',
              ...(s.gradient ? {
                background: `linear-gradient(135deg, ${BRAND}, ${BRAND_DEEP})`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              } : {}),
            }}>{s.k}</div>
            <div style={{ fontSize: 14, color: 'var(--k-ink)', fontWeight: 500, marginTop: 10 }}>{s.l}</div>
            <div style={{ fontSize: 12.5, color: 'var(--k-ink-mute)', marginTop: 2 }}>{s.s}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── How it works ─────────────────────────────────────────────────────────────
export function HowItWorks({ T }) {
  const steps = [
    { n: '01', t: T.how_step1_t, d: T.how_step1_d, icon: <KIcon.zap/> },
    { n: '02', t: T.how_step2_t, d: T.how_step2_d, icon: <KIcon.layers/> },
    { n: '03', t: T.how_step3_t, d: T.how_step3_d, icon: <KIcon.qr/> },
    { n: '04', t: T.how_step4_t, d: T.how_step4_d, icon: <KIcon.chart/> },
  ];
  return (
    <section id="how" style={{ padding: '120px 0', background: 'var(--k-surface-alt)' }}>
      <div className="container">
        <SectionHead eyebrow={T.nav[1]} title={T.sect_how} sub={T.sect_how_sub} align="center"/>
        <div className="k-grid-how" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18, marginTop: 64 }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              padding: 28, background: 'var(--k-surface)', borderRadius: 18, border: '1px solid var(--k-line)',
              display: 'flex', flexDirection: 'column', gap: 18, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: -8, right: -8, fontFamily: 'var(--k-display)',
                fontSize: 90, fontWeight: 600, color: 'var(--k-line)', lineHeight: 1, letterSpacing: -3,
              }}>{s.n}</div>
              <div style={{
                width: 44, height: 44, borderRadius: 11, background: BRAND_SOFT, color: BRAND_DEEP,
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>{React.cloneElement(s.icon, { size: 22 })}</div>
              <div style={{ position: 'relative' }}>
                <div style={{ fontFamily: 'var(--k-display)', fontSize: 20, fontWeight: 600, color: 'var(--k-ink)', letterSpacing: -0.4, marginBottom: 8 }}>{s.t}</div>
                <div style={{ fontSize: 13.5, color: 'var(--k-ink-soft)', lineHeight: 1.55 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Features ─────────────────────────────────────────────────────────────────
export function Features({ T }) {
  const items = [
    { i: <KIcon.qr/>, t: T.feat_card_t, d: T.feat_card_d },
    { i: <KIcon.bell/>, t: T.feat_push_t, d: T.feat_push_d },
    { i: <KIcon.users/>, t: T.feat_crm_t, d: T.feat_crm_d },
    { i: <KIcon.gift/>, t: T.feat_rewards_t, d: T.feat_rewards_d },
    { i: <KIcon.chart/>, t: T.feat_analytics_t, d: T.feat_analytics_d },
    { i: <KIcon.branch/>, t: T.feat_branches_t, d: T.feat_branches_d },
    { i: <KIcon.lock/>, t: T.feat_security_t, d: T.feat_security_d },
    { i: <KIcon.layers/>, t: T.feat_integrations_t, d: T.feat_integrations_d },
  ];
  return (
    <section id="features" style={{ padding: '120px 0' }}>
      <div className="container">
        <SectionHead eyebrow={T.nav[0]} title={T.sect_features} sub={T.sect_features_sub}/>
        <div className="k-grid-feat" style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 56,
          border: '1px solid var(--k-line)', borderRadius: 18, overflow: 'hidden',
        }}>
          {items.map((it, i) => (
            <div key={i}
              style={{
                padding: 28, background: 'var(--k-surface)',
                borderRight: (i + 1) % 4 === 0 ? 'none' : '1px solid var(--k-line)',
                borderBottom: i < 4 ? '1px solid var(--k-line)' : 'none',
                transition: 'background .2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--k-surface-alt)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--k-surface)'; }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10, background: BRAND_SOFT, color: BRAND_DEEP,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>{React.cloneElement(it.i, { size: 19 })}</div>
              <div style={{ fontFamily: 'var(--k-display)', fontSize: 17, fontWeight: 600, color: 'var(--k-ink)', letterSpacing: -0.3, marginBottom: 6 }}>{it.t}</div>
              <div style={{ fontSize: 13, color: 'var(--k-ink-soft)', lineHeight: 1.55 }}>{it.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Dashboard section ───────────────────────────────────────────────────────
export function DashSection({ T }) {
  return (
    <section style={{ padding: '120px 0', background: 'var(--k-surface-alt)', borderTop: '1px solid var(--k-line)', borderBottom: '1px solid var(--k-line)' }}>
      <div className="container">
        <div className="k-grid-dash" style={{ display: 'grid', gridTemplateColumns: '.85fr 1.15fr', gap: 56, alignItems: 'center' }}>
          <div>
            <SectionHead eyebrow={T.dash_eyebrow} title={T.sect_dash} sub={T.sect_dash_sub}/>
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                [T.dash_b1_t, T.dash_b1_d],
                [T.dash_b2_t, T.dash_b2_d],
                [T.dash_b3_t, T.dash_b3_d],
                [T.dash_b4_t, T.dash_b4_d],
              ].map(([t, d], i) => (
                <div key={i} style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: BRAND_SOFT, color: BRAND_DEEP, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <KIcon.check size={14}/>
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--k-ink)' }}>{t}</div>
                    <div style={{ fontSize: 13, color: 'var(--k-ink-mute)', marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DashPreview T={T}/>
        </div>
      </div>
    </section>
  );
}

// ── POS integrations ────────────────────────────────────────────────────────
// Admin paneldan boshqariladigan POS tizim logolari (/landing-logos?category=pos).
// Bo'sh bo'lsa fallback matnli ko'rinish (PROVIDER_CATALOGUE bilan mos).
const FALLBACK_POS = ['iiko', 'Billz', 'ALIPOS', 'r_keeper', 'Poster', '1C', 'YCLIENTS', 'MoySklad'];

// Taniqli POS brendlar uchun haqiqiy logolar (/public/branding/pos/*.png).
// Admin DB'da placeholder qoldirgan bo'lsa, bu mahalliy fayl tortib ko'rsatadi.
const KNOWN_POS_LOGOS = {
  billz: '/branding/pos/billz.png',
  iiko: '/branding/pos/iiko.png',
};

function _resolveLogoSrc(p) {
  if (p.image_url) return p.image_url;
  const key = String(p?.name || '').trim().toLowerCase();
  return KNOWN_POS_LOGOS[key] || '';
}

export function PosIntegrations({ T }) {
  const [logos, setLogos] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/landing-logos?category=pos')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        setLogos(Array.isArray(data) ? data : []);
      })
      .catch(() => { if (!cancelled) setLogos([]); });
    return () => { cancelled = true; };
  }, []);

  const useReal = Array.isArray(logos) && logos.length > 0;
  const list = useReal ? logos : FALLBACK_POS;

  return (
    <section
      id="integrations"
      style={{
        // Force light palette inside this section even when the rest of the
        // page is in dark mode — keeps POS logos legible on a light backdrop.
        '--k-surface': '#FFFFFF',
        '--k-surface-alt': '#F4F2EE',
        '--k-ink': '#0F1115',
        '--k-ink-soft': '#3A3F47',
        '--k-ink-mute': '#6B7280',
        '--k-line': '#E8E5DE',
        '--k-line-strong': '#C9C5BA',
        '--k-brand-soft': '#E8F1EA',
        '--k-brand-deep': '#1F4A2A',
        padding: '120px 0',
        background: 'var(--k-surface-alt)',
        borderTop: '1px solid var(--k-line)',
        borderBottom: '1px solid var(--k-line)',
        color: 'var(--k-ink)',
      }}
    >
      <div className="container">
        <SectionHead
          eyebrow={T.pos_eyebrow}
          title={T.sect_pos}
          sub={T.sect_pos_sub}
          align="center"
        />
        <div
          className="k-grid-pos"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`,
            gap: 16,
            marginTop: 56,
          }}
        >
          {useReal
            ? list.map((p) => {
                const card = (
                  <div style={{
                    height: 92, padding: '20px 22px',
                    background: '#FAFAFA', border: '1px solid var(--k-line)', borderRadius: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'transform .18s, border-color .18s, box-shadow .18s',
                  }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.borderColor = 'var(--k-line-strong)';
                      e.currentTarget.style.boxShadow = '0 10px 24px rgba(15,23,32,.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = 'var(--k-line)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <img
                      src={_resolveLogoSrc(p)}
                      alt={p.name}
                      title={p.name}
                      loading="lazy"
                      style={{ maxWidth: '100%', maxHeight: 52, objectFit: 'contain' }}
                    />
                  </div>
                );
                return p.href
                  ? <a key={p.id} href={p.href} target="_blank" rel="noopener noreferrer" aria-label={p.name} style={{ textDecoration: 'none' }}>{card}</a>
                  : <div key={p.id}>{card}</div>;
              })
            : list.map((name, i) => {
                const logoSrc = KNOWN_POS_LOGOS[String(name).trim().toLowerCase()];
                return (
                  <div key={i} style={{
                    height: 92, padding: '20px 22px',
                    background: 'var(--k-surface)', border: '1px solid var(--k-line)', borderRadius: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--k-display)', fontSize: 18, fontWeight: 600,
                    color: 'var(--k-ink-mute)', letterSpacing: -0.4,
                  }}>
                    {logoSrc
                      ? <img src={logoSrc} alt={name} title={name} loading="lazy" style={{ maxWidth: '100%', maxHeight: 52, objectFit: 'contain' }}/>
                      : name}
                  </div>
                );
              })
          }
        </div>
      </div>
    </section>
  );
}


// ── App preview ─────────────────────────────────────────────────────────────
export function AppPreview({ T }) {
  return (
    <section style={{ padding: '120px 0' }}>
      <div className="container">
        <div className="k-grid-app" style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 56, alignItems: 'center' }}>
          <div className="k-phone-stack" style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
            <div style={{ zIndex: 2 }}><PhoneMockA T={T}/></div>
            <div className="k-phone-b" style={{ position: 'absolute', left: '52%', top: -18, zIndex: 1, opacity: 0.85, transform: 'rotate(6deg)' }}>
              <PhoneMockB T={T}/>
            </div>
          </div>
          <div>
            <SectionHead eyebrow={T.app_eyebrow} title={T.sect_app} sub={T.sect_app_sub}/>
            <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[T.app_b1, T.app_b2, T.app_b3, T.app_b4, T.app_b5].map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14.5, color: 'var(--k-ink-soft)' }}>
                  <KIcon.check size={16} style={{ color: BRAND, flexShrink: 0 }}/>
                  {it}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 32 }}>
              <StoreBtn store="apple" soonLabel={T.store_soon}/>
              <StoreBtn store="google" soonLabel={T.store_soon}/>
              <TelegramBtn openLabel={T.telegram_open}/>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
