import React from 'react';
import { BRAND, BRAND_DEEP, BRAND_SOFT, MonvoMark, Tag } from './index.jsx';

export default function DashPreview({ compact = false, T }) {
  const W = compact ? 540 : 980;
  const H = compact ? 320 : 580;
  const labels = T?.dash_preview || {};
  const navItems = labels.nav || ['Dashboard', 'Customers', 'Rewards', 'Program', 'Campaigns', 'Analytics', 'Branches'];
  const kpis = labels.kpis || [
    ['Revenue', '18.4 mln UZS', '+12%'],
    ['Active', '968', '+5.2%'],
    ['LTV', '240k UZS', '+8%'],
  ];

  return (
    <div style={{
      width: '100%', maxWidth: W, aspectRatio: `${W} / ${H}`,
      background: 'var(--k-surface)', borderRadius: 16, overflow: 'hidden',
      border: '1px solid var(--k-line)',
      boxShadow: '0 30px 60px -12px rgba(15,23,32,.18), 0 0 0 1px rgba(0,0,0,.02)',
      display: 'flex', position: 'relative',
    }}>
      <div style={{
        width: compact ? 140 : 200, background: 'var(--k-surface-alt)',
        padding: compact ? 14 : 20, borderRight: '1px solid var(--k-line)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
          <img src="/branding/monvo-logo-green.webp" alt="Monvo" style={{ height: 22, width: 'auto', display: 'block' }}/>
        </div>
        {navItems.map((it, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7,
            fontSize: compact ? 11.5 : 13, fontWeight: i === 0 ? 600 : 400,
            background: i === 0 ? 'var(--k-brand-soft)' : 'transparent',
            color: i === 0 ? 'var(--k-brand-deep)' : 'var(--k-ink-soft)',
            marginBottom: 3,
          }}>
            <span style={{ width: 4, height: 4, background: 'currentColor', borderRadius: 2, opacity: 0.6 }}/>
            {it}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          padding: compact ? '14px 18px' : '16px 24px', borderBottom: '1px solid var(--k-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--k-display)', fontSize: compact ? 17 : 22, fontWeight: 600, color: 'var(--k-ink)', letterSpacing: -0.4 }}>
              {labels.title || 'Dashboard'}
            </div>
            <div style={{ fontSize: compact ? 10.5 : 12, color: 'var(--k-ink-mute)' }}>
              {labels.subtitle || 'Coffee Lab · 3 branches'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: compact ? 22 : 28, height: compact ? 22 : 28, borderRadius: 7, background: 'var(--k-brand-soft)' }}/>
            <div style={{ width: compact ? 22 : 28, height: compact ? 22 : 28, borderRadius: '50%', background: '#7C4A8C' }}/>
          </div>
        </div>

        <div style={{ padding: compact ? '14px 18px' : '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ padding: compact ? 12 : 14, background: 'var(--k-surface-alt)', borderRadius: 10 }}>
              <div style={{ fontSize: compact ? 9.5 : 11, color: 'var(--k-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500 }}>{k[0]}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: compact ? 16 : 22, fontWeight: 600, color: 'var(--k-ink)', marginTop: 4, letterSpacing: -0.4 }}>{k[1]}</div>
              <div style={{ fontSize: compact ? 9.5 : 11, color: 'var(--k-brand)', fontWeight: 600, marginTop: 2 }}>{k[2]}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: compact ? '0 18px 14px' : '0 24px 20px', flex: 1 }}>
          <div style={{
            background: 'var(--k-surface-alt)', borderRadius: 10, padding: compact ? 14 : 18, height: '100%',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: compact ? 11 : 13, fontWeight: 600, color: 'var(--k-ink)' }}>
                {labels.chart_title || 'Revenue per day'}
              </div>
              <Tag tone="brand">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--k-brand)' }}/>
                Real-time
              </Tag>
            </div>
            <svg viewBox="0 0 400 120" preserveAspectRatio="none" style={{ width: '100%', flex: 1 }}>
              <defs>
                <linearGradient id="dashGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--k-brand)" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="var(--k-brand)" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0 90 L40 75 L80 80 L120 60 L160 65 L200 50 L240 55 L280 35 L320 40 L360 25 L400 20 L400 120 L0 120 Z" fill="url(#dashGrad)"/>
              <path d="M0 90 L40 75 L80 80 L120 60 L160 65 L200 50 L240 55 L280 35 L320 40 L360 25 L400 20" stroke="var(--k-brand)" strokeWidth="2" fill="none" strokeLinecap="round"/>
              {[[0,90],[40,75],[80,80],[120,60],[160,65],[200,50],[240,55],[280,35],[320,40],[360,25],[400,20]].map(([x,y], i) => (
                <circle key={i} cx={x} cy={y} r="2.5" fill="var(--k-brand)"/>
              ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
