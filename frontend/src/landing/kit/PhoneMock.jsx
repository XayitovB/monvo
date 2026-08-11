import React from 'react';
import { BRAND, BRAND_DEEP, BRAND_SOFT, KIcon } from './index.jsx';

export function PhoneMockA({ T }) {
  const m = T?.mock || {};
  return (
    <div style={{
      width: 280, height: 580, background: '#0F1115', borderRadius: 44, padding: 12,
      boxShadow: '0 40px 80px -20px rgba(15,23,32,.3), 0 0 0 6px rgba(0,0,0,.06)',
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 32, background: 'var(--k-surface)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative',
      }}>
        <div style={{ padding: '14px 24px 8px', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--k-ink)', fontWeight: 600 }}>
          <span>10:30</span>
          <span>5G · 84%</span>
        </div>
        <div style={{ padding: '8px 18px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--k-ink-mute)' }}>{m.greeting || 'Привет, Мадина'}</div>
            <div style={{ fontFamily: 'var(--k-display)', fontSize: 19, fontWeight: 600, color: 'var(--k-ink)' }}>{m.your_cards || 'Ваши карты'}</div>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#7C4A8C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}>M</div>
        </div>
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            padding: 16, borderRadius: 16, color: '#fff',
            background: `linear-gradient(135deg, #143822 0%, ${BRAND_DEEP} 60%, ${BRAND} 100%)`,
            boxShadow: `0 12px 24px -8px ${BRAND}66`, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 80% 0%, rgba(212,175,55,.4) 0%, transparent 50%)', pointerEvents: 'none' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
              <div>
                <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 0.6, textTransform: 'uppercase' }}>Coffee Lab</div>
                <div style={{ fontFamily: 'var(--k-display)', fontSize: 14, fontWeight: 600, marginTop: 2 }}>{m.club_card || 'Клубная карта'}</div>
              </div>
              <div style={{ padding: '3px 8px', borderRadius: 999, background: '#D4AF37', color: '#1A1100', fontSize: 9, fontWeight: 700 }}>GOLD</div>
            </div>
            <div style={{ marginTop: 16, position: 'relative' }}>
              <div style={{ fontSize: 9, opacity: 0.6 }}>{m.balance || 'БАЛАНС'}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 26, fontWeight: 600, lineHeight: 1, marginTop: 2 }}>248 <span style={{ fontSize: 16, color: '#D4AF37' }}>★</span></div>
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, background: 'linear-gradient(135deg, #1F3A5F, #0F1115)', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 9, opacity: 0.6, letterSpacing: 0.6 }}>BEAUTY BAR</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>{m.regular_customer || 'Постоянный клиент'}</div>
              </div>
              <div style={{ padding: '3px 7px', borderRadius: 999, background: 'rgba(212,175,55,.85)', color: '#1A1100', fontSize: 9, fontWeight: 700 }}>SILVER</div>
            </div>
            <div style={{ marginTop: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 600 }}>112 ★</div>
          </div>
          <div style={{
            padding: 12, borderRadius: 12, background: 'var(--k-brand-soft)',
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 6,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: BRAND, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KIcon.gift size={14}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: BRAND_DEEP }}>{m.reward_bonus_title || '+50 ★'}</div>
              <div style={{ fontSize: 10, color: BRAND_DEEP, opacity: 0.8 }}>{m.reward_bonus_sub || 'Coffee Lab · 2h'}</div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 'auto', padding: '12px 14px 18px', borderTop: '1px solid var(--k-line)', display: 'flex', justifyContent: 'space-around', background: 'var(--k-surface)' }}>
          {[<KIcon.qr/>, <KIcon.gift/>, <KIcon.chart/>, <KIcon.users/>].map((ic, i) => (
            <div key={i} style={{
              width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i === 0 ? BRAND_SOFT : 'transparent',
              color: i === 0 ? BRAND_DEEP : 'var(--k-ink-mute)',
            }}>{React.cloneElement(ic, { size: 18 })}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PhoneMockB({ T }) {
  const m = T?.mock || {};
  return (
    <div style={{
      width: 240, height: 500, background: '#0F1115', borderRadius: 38, padding: 10,
      boxShadow: '0 30px 60px -16px rgba(15,23,32,.3)',
    }}>
      <div style={{
        width: '100%', height: '100%', borderRadius: 28, background: '#0F1115',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative',
        backgroundImage: `radial-gradient(circle at 30% 20%, ${BRAND}22, transparent 60%)`,
      }}>
        <div style={{ padding: '14px 20px', textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: 0.5, textTransform: 'uppercase' }}>{m.qr_code || 'QR-код'}</div>
          <div style={{ fontFamily: 'var(--k-display)', fontSize: 17, fontWeight: 600, marginTop: 4 }}>{m.show_at_pos || 'Покажите на кассе'}</div>
        </div>
        <div style={{
          margin: 'auto', padding: 16, background: '#fff', borderRadius: 16,
          width: 160, height: 160, display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 1,
        }}>
          {Array.from({ length: 225 }).map((_, i) => (
            <div key={i} style={{ background: ((i * 13 + i / 15) % 3) > 1.4 ? '#0F1115' : 'transparent' }}/>
          ))}
        </div>
        <div style={{ padding: '14px 20px', textAlign: 'center', color: '#fff' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 600 }}>248 ★</div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Coffee Lab · Gold</div>
        </div>
      </div>
    </div>
  );
}

function AppleLogo({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  );
}

function GoogleLogo({ size = 22 }) {
  // Google Play "triangle" mark — 4 coloured polygons
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#34A853" d="M3.5 1.5l10.55 10.5L3.5 22.5c-.32-.19-.5-.51-.5-.89V2.39c0-.38.18-.7.5-.89z" opacity="0"/>
      <path fill="#4285F4" d="M3.61 1.39C3.24 1.55 3 1.92 3 2.39v19.22c0 .47.24.84.61 1l11.06-11L3.61 1.39z"/>
      <path fill="#EA4335" d="M14.67 12L3.61 22.61c.18.07.39.07.6-.04l11.6-6.59c.35-.2.46-.6.31-.93l-1.45-3.05z"/>
      <path fill="#FBBC04" d="M20.81 10.43l-3.4-1.93-2.74 3.5 2.74 3.5 3.4-1.93c.71-.41.71-1.73 0-2.14z"/>
      <path fill="#34A853" d="M14.67 12l1.45-3.05c.15-.33.04-.73-.31-.93L4.21 1.43c-.21-.11-.42-.11-.6-.04L14.67 12z"/>
    </svg>
  );
}

const STORE_URLS = {
  google: 'https://play.google.com/store/apps/details?id=uz.monvo.app',
  apple: 'https://apps.apple.com/app/monvo/id6781256822',
};

// Ilovalar hali App Store / Play Market'da e'lon qilinmagan — havolalar
// o'chirilgan va "Tez kunda" belgisi ko'rsatiladi. Chiqqach shu flag'ni
// true qiling — havolalar va belgisi avtomatik yo'qoladi.
const STORES_LIVE = false;

export function StoreBtn({ store, soonLabel }) {
  const url = STORES_LIVE ? (STORE_URLS[store] || '') : '';
  const soon = !STORES_LIVE && soonLabel;
  return (
    <a
      href={url || '#'}
      target={url ? '_blank' : undefined}
      rel={url ? 'noreferrer' : undefined}
      onClick={url ? undefined : (e) => e.preventDefault()}
      style={{
      position: 'relative',
      display: 'inline-flex', alignItems: 'center', gap: 12,
      padding: '10px 18px', background: 'var(--k-ink)', color: 'var(--k-bg)',
      borderRadius: 12, textDecoration: 'none', minWidth: 168,
      opacity: url ? 1 : 0.6, cursor: url ? 'pointer' : 'default',
    }}>
      {soon && (
        <span style={{
          position: 'absolute', top: -9, right: -8,
          background: 'var(--k-brand, #2F6B3F)', color: '#fff',
          fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
          padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
          boxShadow: '0 2px 6px rgba(0,0,0,.25)',
        }}>{soonLabel}</span>
      )}
      {store === 'apple' ? <AppleLogo size={26}/> : <GoogleLogo size={24}/>}
      <span>
        <span style={{ display: 'block', fontSize: 9.5, opacity: 0.7, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {store === 'apple' ? 'Download on the' : 'Get it on'}
        </span>
        <span style={{ display: 'block', fontFamily: 'var(--k-display)', fontSize: 17, fontWeight: 600, marginTop: -1 }}>
          {store === 'apple' ? 'App Store' : 'Google Play'}
        </span>
      </span>
    </a>
  );
}
