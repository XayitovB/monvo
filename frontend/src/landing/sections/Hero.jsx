import React from 'react';
import { Btn, KIcon, Tag, BRAND, BRAND_DEEP, BRAND_SOFT } from '../kit/index.jsx';
import LoyaltyCard3D from '../kit/LoyaltyCard3D.jsx';

export default function Hero({ T, onCta }) {
  return (
    <section id="top" style={{
      paddingTop: 'clamp(140px, 16vh, 200px)',
      paddingBottom: 'clamp(80px, 10vh, 140px)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(60% 50% at 80% 30%, color-mix(in oklab, var(--k-brand) 14%, transparent) 0%, transparent 70%), radial-gradient(50% 40% at 10% 60%, color-mix(in oklab, var(--k-brand) 8%, transparent) 0%, transparent 70%)',
      }}/>

      <div className="container k-grid-hero" style={{
        display: 'grid', gridTemplateColumns: '1.15fr .85fr',
        gap: 60, alignItems: 'center', position: 'relative',
      }}>
        <div>
          <Tag tone="brand">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND }}/>
            {T.eyebrow}
          </Tag>
          <h1 style={{
            fontFamily: 'var(--k-display)', fontWeight: 600,
            fontSize: 'clamp(44px, 6.4vw, 88px)', lineHeight: 0.98,
            letterSpacing: -2.6, margin: '20px 0 22px',
            color: 'var(--k-ink)',
          }}>
            {T.h1_a}
            <span style={{
              background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DEEP} 100%)`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>{T.h1_b}</span>
          </h1>
          <p style={{
            fontSize: 'clamp(16px, 1.4vw, 19px)', lineHeight: 1.55, color: 'var(--k-ink-soft)',
            margin: '0 0 32px', maxWidth: 560,
          }}>{T.sub}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Btn variant="accent" size="lg" iconRight={<KIcon.arrow/>} onClick={onCta}>{T.primary}</Btn>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--k-ink-mute)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <KIcon.check size={14} style={{ color: BRAND }}/>
            {T.note}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <div className="k-hero-art" style={{ position: 'relative', minHeight: 460, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <FloatPill style={{ top: 30, left: 10, animationDelay: '0s' }}
              icon={<KIcon.zap/>} bg={BRAND_SOFT} fg={BRAND_DEEP}
              title={T.mock?.pill_coffee_title || '+25 ★'}
              sub={T.mock?.pill_coffee_sub || 'за чашку кофе'}/>
            <FloatPill style={{ top: 70, right: 0, animationDelay: '.8s' }}
              icon={<KIcon.gift/>} bg="#FEF3C7" fg="#92400E"
              title={T.mock?.pill_capuccino_title || 'Капучино'}
              sub={T.mock?.pill_capuccino_sub || 'в подарок при 200 ★'}/>
            <div className="k-hero-stat-card" style={{
              position: 'absolute', bottom: 60, left: -16,
              background: 'var(--k-surface)', border: '1px solid var(--k-line)',
              padding: '12px 16px', borderRadius: 14, fontSize: 12.5,
              boxShadow: '0 14px 30px rgba(15,23,32,.08)',
              animation: 'monvo-float 5s ease-in-out infinite 1.6s',
            }}>
              <div style={{ fontSize: 10.5, color: 'var(--k-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{T.hero_today_label}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: 'var(--k-ink)', marginTop: 2 }}>
                {T.hero_today_value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--k-brand)', fontWeight: 600 }}>{T.hero_today_delta}</div>
            </div>
            <div style={{ animation: 'monvo-bob 7s ease-in-out infinite' }}>
              <LoyaltyCard3D T={T}/>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatPill({ style, icon, bg, fg, title, sub }) {
  return (
    <div className="k-hero-pill" style={{
      position: 'absolute', ...style,
      background: 'var(--k-surface)', border: '1px solid var(--k-line)',
      padding: '10px 14px', borderRadius: 12, fontSize: 12.5,
      boxShadow: '0 14px 30px rgba(15,23,32,.08)',
      animation: 'monvo-float 5s ease-in-out infinite',
      animationDelay: style.animationDelay,
      display: 'flex', alignItems: 'center', gap: 9,
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 7, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {React.cloneElement(icon, { size: 14 })}
      </div>
      <div>
        <div style={{ fontWeight: 600, color: 'var(--k-ink)' }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--k-ink-mute)' }}>{sub}</div>
      </div>
    </div>
  );
}
