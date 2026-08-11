import React, { useState, useEffect, useRef } from 'react';
import { BRAND, BRAND_DEEP, BRAND_SOFT, KIcon, Btn, Tag, SectionHead, MonvoLogo } from '../kit/index.jsx';
import { PhoneMockA, StoreBtn } from '../kit/PhoneMock.jsx';

// ── Pricing ──────────────────────────────────────────────────────────────────
export function Pricing({ T, onCta }) {
  const tiers = [
    {
      name: T.price_start, price: '239 000', unit: T.price_unit_sumMonth,
      sub: T.price_start_sub, bullets: T.price_start_features,
      cta: T.price_choose, tone: 'plain',
    },
    {
      name: T.price_business, price: '490 000', unit: T.price_unit_sumMonth,
      sub: T.price_business_sub, bullets: T.price_business_features,
      cta: T.price_choose, tone: 'dark', badge: T.price_popular,
    },
    {
      name: T.price_ent, price: '990 000', unit: T.price_unit_sumMonth,
      sub: T.price_ent_sub, bullets: T.price_ent_features,
      cta: T.price_contact, tone: 'plain',
    },
  ];
  return (
    <section id="pricing" style={{ padding: '120px 0' }}>
      <div className="container">
        <SectionHead eyebrow={T.nav[2]} title={T.sect_pricing} sub={T.sect_pricing_sub} align="center"/>
        <div className="k-grid-pricing" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 56 }}>
          {tiers.map((t, i) => {
            const dark = t.tone === 'dark';
            return (
              <div key={i} className="k-pricing-card" style={{
                padding: 32, borderRadius: 20,
                background: dark ? '#0F1115' : 'var(--k-surface)',
                color: dark ? '#FAFAF7' : 'var(--k-ink)',
                border: dark ? 'none' : '1px solid var(--k-line)',
                position: 'relative', display: 'flex', flexDirection: 'column',
                boxShadow: dark ? '0 30px 60px -20px rgba(15,23,32,.4)' : 'none',
              }}>
                {t.badge && (
                  <div style={{
                    position: 'absolute', top: -12, left: 32,
                    padding: '4px 12px', background: BRAND, color: '#fff', fontSize: 11,
                    borderRadius: 999, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase',
                  }}>{t.badge}</div>
                )}
                <div style={{ fontFamily: 'var(--k-display)', fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>{t.name}</div>
                <div style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,.6)' : 'var(--k-ink-mute)', marginTop: 6, minHeight: 36 }}>{t.sub}</div>
                <div style={{ marginTop: 22, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--k-display)', fontSize: 44, fontWeight: 600, letterSpacing: -1.4, lineHeight: 1 }}>{t.price}</span>
                  <span style={{ fontSize: 13, color: dark ? 'rgba(255,255,255,.5)' : 'var(--k-ink-mute)' }}>{t.unit}</span>
                </div>
                <Btn variant={dark ? 'onDark' : 'primary'} size="md" style={{ marginTop: 22 }} iconRight={<KIcon.arrow/>} onClick={onCta}>{t.cta}</Btn>
                <div style={{ height: 1, background: dark ? 'rgba(255,255,255,.12)' : 'var(--k-line)', margin: '24px 0' }}/>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {t.bullets.map((b, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, lineHeight: 1.5 }}>
                      <KIcon.check size={14} style={{ color: dark ? '#A7E2B5' : BRAND, marginTop: 4, flexShrink: 0 }}/>
                      <span style={{ color: dark ? 'rgba(255,255,255,.85)' : 'var(--k-ink-soft)' }}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36, fontSize: 13, color: 'var(--k-ink-mute)' }}>
          {T.pricing_disclaimer}
        </div>
      </div>
    </section>
  );
}

// ── Case study ───────────────────────────────────────────────────────────────
export function CaseStudy({ T }) {
  return (
    <section id="case" style={{ padding: '120px 0', background: '#0F1115', color: '#fff' }}>
      <div className="container">
        <div className="k-grid-case" style={{ display: 'grid', gridTemplateColumns: '.95fr 1.05fr', gap: 64, alignItems: 'center' }}>
          <div>
            <Tag tone="onDark">{T.nav[3]}</Tag>
            <h2 style={{
              fontFamily: 'var(--k-display)', fontSize: 'clamp(34px, 4.4vw, 56px)',
              fontWeight: 600, lineHeight: 1.05, letterSpacing: -1.4,
              margin: '14px 0 14px',
            }}>{T.sect_case}</h2>
            <p style={{ fontSize: 18, lineHeight: 1.55, color: 'rgba(255,255,255,.7)', margin: 0, maxWidth: 540 }}>
              {T.sect_case_sub}
            </p>
            <blockquote style={{
              margin: '40px 0 0', padding: '24px 28px',
              borderLeft: `3px solid ${BRAND}`, fontSize: 18, lineHeight: 1.5,
              fontFamily: 'var(--k-display)', fontStyle: 'italic', color: 'rgba(255,255,255,.92)', fontWeight: 400,
            }}>
              {T.case_quote}
              <footer style={{ marginTop: 16, fontSize: 13.5, fontFamily: 'var(--k-font)', fontStyle: 'normal', color: 'rgba(255,255,255,.6)' }}>
                {T.case_author}
              </footer>
            </blockquote>
            <div style={{ display: 'flex', gap: 10, marginTop: 32 }}>
              <Btn variant="onDark" size="md" iconRight={<KIcon.arrow/>}>{T.case_full}</Btn>
              <Btn variant="onDarkOut" size="md">{T.case_other}</Btn>
            </div>
          </div>
          <div className="k-grid-case-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {[
              { k: T.case_mv1, l: T.case_m1, c: BRAND },
              { k: T.case_mv2, l: T.case_m2, c: '#D4AF37' },
              { k: T.case_mv3, l: T.case_m3, c: '#7C4A8C' },
              { k: T.case_mv4, l: T.case_m4, c: '#fff' },
            ].map((m, i) => (
              <div key={i} style={{
                padding: 28, background: 'rgba(255,255,255,.04)',
                border: '1px solid rgba(255,255,255,.08)', borderRadius: 16,
                aspectRatio: '1 / 1', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <div style={{ fontFamily: 'var(--k-display)', fontSize: 56, fontWeight: 600, letterSpacing: -1.6, lineHeight: 1, color: m.c }}>{m.k}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 1.4 }}>{m.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Reviews ──────────────────────────────────────────────────────────────────
// Admin paneldan boshqariladigan sharhlar (/landing-reviews?lang=...).
// API bo'sh yoki xato qaytarsa — i18n.js'dagi reviews_list fallback ishlaydi.
const AVATAR_COLORS = ['#7C4A8C', '#1F4A2A', '#D4AF37', '#1F3A5F', '#9B2C2C', '#2C5F4A'];

export function Reviews({ T, lang = 'uz' }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/landing-reviews?lang=${encodeURIComponent(lang)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled) return;
        setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [lang]);

  const useReal = Array.isArray(items) && items.length > 0;
  const list = useReal
    ? items.map(it => ({
        quote: it.quote,
        who: it.author_name,
        role: it.author_role,
        rating: it.rating,
        avatar: it.avatar_url,
      }))
    : (T.reviews_list || []).map(it => ({
        quote: it.q,
        who: it.who,
        role: it.role,
        rating: 5,
        avatar: '',
      }));

  return (
    <section style={{ padding: '120px 0' }}>
      <div className="container">
        <SectionHead eyebrow={T.reviews_eyebrow} title={T.sect_reviews} sub={T.sect_reviews_sub} align="center"/>
        <div className="k-grid-reviews" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 56 }}>
          {list.map((r, i) => (
            <div key={i} style={{
              padding: 26, background: 'var(--k-surface)', border: '1px solid var(--k-line)', borderRadius: 16,
              display: 'flex', flexDirection: 'column', gap: 18,
            }}>
              <div style={{ display: 'flex', gap: 2, color: '#D4AF37' }}>
                {Array.from({ length: r.rating || 5 }).map((_, j) => <KIcon.star key={j} size={14}/>)}
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--k-ink)', margin: 0, flex: 1 }}>«{r.quote}»</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid var(--k-line)' }}>
                {r.avatar ? (
                  <img src={r.avatar} alt={r.who} loading="lazy"
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}/>
                ) : (
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 600,
                  }}>{(r.who || '?')[0]}</div>
                )}
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--k-ink)' }}>{r.who}</div>
                  <div style={{ fontSize: 12, color: 'var(--k-ink-mute)' }}>{r.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
export function FAQ({ T }) {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" style={{ padding: '120px 0', background: 'var(--k-surface-alt)' }}>
      <div className="container k-grid-faq" style={{ display: 'grid', gridTemplateColumns: '.85fr 1.15fr', gap: 72, alignItems: 'flex-start' }}>
        <div className="k-faq-side" style={{ position: 'sticky', top: 100 }}>
          <SectionHead eyebrow={T.faq_eyebrow} title={T.sect_faq} sub={T.chat_help}/>
          <div style={{ marginTop: 28 }}>
            <Btn variant="secondary" size="md" iconRight={<KIcon.arrow/>}>{T.chat_open}</Btn>
          </div>
        </div>
        <div>
          {T.faq_items.map((it, i) => (
            <div key={i} style={{ borderTop: i === 0 ? '1px solid var(--k-line)' : 'none', borderBottom: '1px solid var(--k-line)' }}>
              <button onClick={() => setOpen(open === i ? -1 : i)} style={{
                width: '100%', padding: '22px 0', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--k-font)',
              }}>
                <span style={{ fontFamily: 'var(--k-display)', fontSize: 19, fontWeight: 600, color: 'var(--k-ink)', textAlign: 'left', letterSpacing: -0.3 }}>{it.q}</span>
                <span style={{ color: 'var(--k-ink-soft)', flexShrink: 0, marginLeft: 16, transition: 'transform .2s', transform: open === i ? 'rotate(45deg)' : 'rotate(0)' }}>
                  <KIcon.plus size={20}/>
                </span>
              </button>
              <div style={{ maxHeight: open === i ? 280 : 0, overflow: 'hidden', transition: 'max-height .35s ease' }}>
                <div style={{ padding: '0 0 24px', fontSize: 15, lineHeight: 1.6, color: 'var(--k-ink-soft)', maxWidth: 640 }}>
                  {it.a}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Demo (lead form) ─────────────────────────────────────────────────────────
export function DemoSection({ T }) {
  const [submitted, setSubmitted] = useState(false);
  const defaultType = T.biz_types?.[0]?.items?.[0] || T.biz_cafe;
  const [form, setForm] = useState({ name: '', phone: '', business: '', type: defaultType });
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('/demo-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          business_name: form.business,
          business_type: form.type,
          source: 'landing-demo-form',
        }),
      });
    } catch {}
    setSubmitted(true);
    setSubmitting(false);
  }

  return (
    <section style={{ padding: '120px 0' }}>
      <div className="container">
        <div className="k-grid-demo k-demo-card" style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
          background: '#0F1115', color: '#FAFAF7', borderRadius: 24, overflow: 'hidden',
          boxShadow: '0 40px 80px -20px rgba(15,23,32,.4)',
        }}>
          <div className="k-demo-pane" style={{ padding: 56, position: 'relative', overflow: 'hidden' }}>
            <div aria-hidden style={{
              position: 'absolute', inset: 0,
              background: `radial-gradient(circle at 20% 80%, ${BRAND}55, transparent 60%)`,
              pointerEvents: 'none',
            }}/>
            <div style={{ position: 'relative' }}>
              <Tag tone="onDark">{T.demo_eyebrow}</Tag>
              <h2 style={{
                fontFamily: 'var(--k-display)', fontSize: 'clamp(34px, 3.6vw, 48px)',
                fontWeight: 600, lineHeight: 1.05, letterSpacing: -1.4,
                margin: '14px 0 14px',
              }}>{T.sect_demo}</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.55, color: 'rgba(255,255,255,.7)', margin: '0 0 32px', maxWidth: 420 }}>
                {T.sect_demo_sub}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {T.demo_perks.map(([k, v], i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                    <div style={{ fontFamily: 'var(--k-display)', fontSize: 22, fontWeight: 600, color: '#fff', minWidth: 80, letterSpacing: -0.4 }}>{k}</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,.7)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="k-demo-pane" style={{ padding: 56, background: 'rgba(255,255,255,.04)' }}>
            {!submitted ? (
              <form onSubmit={onSubmit}>
                <div style={{ fontFamily: 'var(--k-display)', fontSize: 22, fontWeight: 600, color: '#fff', marginBottom: 24, letterSpacing: -0.3 }}>
                  {T.demo_form_title}
                </div>
                {[
                  { l: T.demo_field_name, k: 'name', p: 'Aziz Karimov' },
                  { l: T.demo_field_phone, k: 'phone', p: '+998 90 123 45 67' },
                  { l: T.demo_field_business, k: 'business', p: 'Coffee Lab' },
                ].map((f) => (
                  <label key={f.k} style={{ display: 'block', marginBottom: 16 }}>
                    <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.6)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 500 }}>{f.l}</span>
                    <input
                      placeholder={f.p}
                      required
                      value={form[f.k]}
                      onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                      style={{
                        width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,.06)',
                        border: '1px solid rgba(255,255,255,.12)', borderRadius: 10,
                        fontSize: 14.5, color: '#fff', fontFamily: 'var(--k-font)', outline: 'none',
                        transition: 'border-color .15s, background .15s',
                      }}
                      onFocus={(e) => { e.target.style.borderColor = BRAND; e.target.style.background = 'rgba(255,255,255,.1)'; }}
                      onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,.12)'; e.target.style.background = 'rgba(255,255,255,.06)'; }}
                    />
                  </label>
                ))}
                <label style={{ display: 'block', marginBottom: 22 }}>
                  <span style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,.6)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 500 }}>{T.demo_field_type}</span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    style={{
                      width: '100%', padding: '12px 14px', paddingRight: 36,
                      background: 'rgba(255,255,255,.06)',
                      border: '1px solid rgba(255,255,255,.12)', borderRadius: 10,
                      fontSize: 14.5, color: '#fff', fontFamily: 'var(--k-font)',
                      outline: 'none', cursor: 'pointer',
                      appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                      backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\' fill=\'none\'><path d=\'M1 1.5L6 6.5L11 1.5\' stroke=\'rgba(255,255,255,0.6)\' stroke-width=\'1.5\' stroke-linecap=\'round\'/></svg>")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 14px center',
                    }}
                  >
                    {(T.biz_types || []).map((g) => (
                      <optgroup key={g.group} label={g.group} style={{ color: '#888', background: '#1a1a1a' }}>
                        {g.items.map((it) => (
                          <option key={it} value={it} style={{ color: '#fff', background: '#0F1115' }}>
                            {it}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <Btn variant="accent" size="lg" full type="submit" iconRight={<KIcon.arrow/>} disabled={submitting}>
                  {submitting ? '…' : T.demo_submit}
                </Btn>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.4)', marginTop: 14, textAlign: 'center' }}>
                  {T.demo_privacy}
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, height: '100%', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: BRAND, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KIcon.check size={32}/>
                </div>
                <div style={{ fontFamily: 'var(--k-display)', fontSize: 24, fontWeight: 600, color: '#fff', letterSpacing: -0.3 }}>{T.demo_thanks}</div>
                <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,.7)', maxWidth: 320, lineHeight: 1.5 }}>
                  {T.demo_thanks_sub}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── App download ─────────────────────────────────────────────────────────────
export function AppDownload({ T }) {
  return (
    <section style={{ padding: '80px 0 120px' }}>
      <div className="container">
        <div className="k-grid-app-dl k-app-dl-card" style={{
          padding: 56, borderRadius: 24, background: 'var(--k-brand-soft)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center',
        }}>
          <div>
            <Tag tone="brand">{T.app_dl_eyebrow}</Tag>
            <h2 style={{
              fontFamily: 'var(--k-display)', fontSize: 'clamp(28px, 3.2vw, 44px)',
              fontWeight: 600, lineHeight: 1.1, letterSpacing: -1.2, margin: '14px 0 14px', color: 'var(--k-brand-deep)',
            }}>{T.sect_app_dl}</h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--k-brand-deep)', opacity: 0.85, margin: '0 0 28px', maxWidth: 460 }}>
              {T.sect_app_dl_sub}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <StoreBtn store="apple"/>
              <StoreBtn store="google"/>
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 26 }}>
              {[['4.9', 'App Store'], ['4.8', 'Google Play'], ['3.2M', T.app_dl_cards]].map(([k, l], i) => (
                <React.Fragment key={i}>
                  {i > 0 && <div style={{ width: 1, background: 'var(--k-brand-deep)', opacity: 0.15 }}/>}
                  <div>
                    <div style={{ fontFamily: 'var(--k-display)', fontSize: 28, fontWeight: 600, color: 'var(--k-brand-deep)', lineHeight: 1, letterSpacing: -0.6 }}>{k}</div>
                    <div style={{ fontSize: 11, color: 'var(--k-brand-deep)', opacity: 0.7, marginTop: 4 }}>{l}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="k-app-dl-phone" style={{ display: 'flex', justifyContent: 'center', gap: 20, alignItems: 'center' }}>
            <div style={{ transform: 'translateY(20px) rotate(-4deg)' }}><PhoneMockA T={T}/></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Social icons ─────────────────────────────────────────────────────────────
const SOCIAL_ICONS = {
  telegram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  instagram: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  ),
  facebook: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  youtube: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  x: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  ),
  tiktok: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.19 8.19 0 0 0 4.79 1.52V6.75a4.85 4.85 0 0 1-1.02-.06z"/>
    </svg>
  ),
  linkedin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
};

const SOCIAL_COLORS = {
  telegram: '#2AABEE', instagram: '#E1306C', facebook: '#1877F2',
  youtube: '#FF0000', x: '#000000', tiktok: '#010101', linkedin: '#0A66C2',
};

// ── Footer ───────────────────────────────────────────────────────────────────
export function Footer({ T, lang, setLang }) {
  const [socialLinks, setSocialLinks] = useState([]);

  useEffect(() => {
    fetch('/landing-social-links')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setSocialLinks(data); })
      .catch(() => {});
  }, []);

  const cols = [
    { t: T.footer_product, items: [
      { label: T.nav[0], href: '#features' },
      { label: T.nav[2], href: '#pricing' },
      { label: T.footer_pos, href: '#integrations' },
      { label: T.app_dl_eyebrow, href: '#download' },
    ]},
    { t: T.footer_company, items: [
      { label: T.nav[3], href: '#case' },
      { label: T.footer_contact, href: 'mailto:info@monvo.uz' },
    ]},
    { t: T.footer_resources, items: [
      { label: 'Docs', href: '/api-docs' },
      { label: 'API', href: '/api-docs' },
      { label: 'Telegram', href: 'https://t.me/Monvo_uz' },
    ]},
    { t: T.footer_legal, items: [
      { label: T.footer_privacy, href: '/privacy' },
      { label: T.footer_terms, href: '/terms' },
    ]},
  ];
  return (
    <footer style={{ padding: '80px 0 32px', borderTop: '1px solid var(--k-line)' }}>
      <div className="container">
        <div className="k-grid-footer" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 48, marginBottom: 60 }}>
          <div>
            <MonvoLogo size={28} green/>
            <p style={{ fontSize: 13.5, color: 'var(--k-ink-soft)', lineHeight: 1.55, marginTop: 18, maxWidth: 280 }}>
              {T.footer_about}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
              {socialLinks.map(link => (
                <a key={link.id} href={link.url} target="_blank" rel="noreferrer" title={link.platform}
                  style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: SOCIAL_COLORS[link.platform] || 'var(--k-surface-alt)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', textDecoration: 'none',
                    transition: 'opacity .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {SOCIAL_ICONS[link.platform] || link.platform.slice(0, 2).toUpperCase()}
                </a>
              ))}
            </div>
          </div>
          {cols.map((c, i) => (
            <div key={i}>
              <div style={{ fontSize: 12, color: 'var(--k-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 500, marginBottom: 16 }}>{c.t}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.items.map((it, j) => {
                  const isObj = typeof it === 'object' && it !== null;
                  const label = isObj ? it.label : it;
                  const href = isObj ? it.href : '#';
                  return (
                    <a key={j} href={href} style={{ fontSize: 13.5, color: 'var(--k-ink-soft)', textDecoration: 'none' }}>{label}</a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="k-footer-bottom" style={{
          paddingTop: 28, borderTop: '1px solid var(--k-line)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 12.5, color: 'var(--k-ink-mute)',
        }}>
          <div>{T.footer_copy}</div>
          <div style={{ display: 'flex', gap: 18 }}>
            <button onClick={() => setLang('ru')} style={{ background: 'transparent', border: 'none', color: lang === 'ru' ? 'var(--k-ink)' : 'var(--k-ink-mute)', cursor: 'pointer', fontWeight: lang === 'ru' ? 600 : 400 }}>Русский</button>
            <button onClick={() => setLang('uz')} style={{ background: 'transparent', border: 'none', color: lang === 'uz' ? 'var(--k-ink)' : 'var(--k-ink-mute)', cursor: 'pointer', fontWeight: lang === 'uz' ? 600 : 400 }}>O'zbek</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
