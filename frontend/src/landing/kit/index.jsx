import React from 'react';
import { KIcon } from './Icons';

export const BRAND = '#2F6B3F';
export const BRAND_DEEP = '#1F4A2A';
export const BRAND_SOFT = '#E8F1EA';

export { KIcon };

// ── Logo ─────────────────────────────────────────────────────────────────────
// PNG logo — dark variant on light bg, white variant on dark bg.
// `light=true` forces the white version regardless of theme.
export const MonvoMark = ({ size = 28, light = false }) => (
  <span style={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}>
    {light ? (
      <img src="/branding/monvo-logo-white.webp" alt="Monvo"
        style={{ height: size, width: 'auto', display: 'block' }}/>
    ) : (
      <>
        <img src="/branding/monvo-logo-dark.webp" alt="Monvo"
          className="k-logo-on-light"
          style={{ height: size, width: 'auto', display: 'block' }}/>
        <img src="/branding/monvo-logo-white.webp" alt=""
          aria-hidden className="k-logo-on-dark"
          style={{ height: size, width: 'auto', display: 'none' }}/>
      </>
    )}
  </span>
);

export const MonvoLogo = ({ size = 28, light = false, green = false }) => {
  if (green) {
    return (
      <span style={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}>
        <img src="/branding/monvo-logo-green.webp" alt="Monvo"
          style={{ height: size, width: 'auto', display: 'block' }}/>
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}>
      {light ? (
        <img src="/branding/monvo-logo-white.webp" alt="Monvo"
          style={{ height: size, width: 'auto', display: 'block' }}/>
      ) : (
        <>
          <img src="/branding/monvo-logo-dark.webp" alt="Monvo"
            className="k-logo-on-light"
            style={{ height: size, width: 'auto', display: 'block' }}/>
          <img src="/branding/monvo-logo-white.webp" alt=""
            aria-hidden className="k-logo-on-dark"
            style={{ height: size, width: 'auto', display: 'none' }}/>
        </>
      )}
    </span>
  );
};

// ── Btn ──────────────────────────────────────────────────────────────────────
export const Btn = ({ variant = 'primary', size = 'md', children, icon, iconRight, full, style, ...rest }) => {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: 'var(--k-font)', fontWeight: 500, cursor: 'pointer',
    border: '1px solid transparent', borderRadius: 999,
    transition: 'transform .12s, background .15s, color .15s, border-color .15s',
    width: full ? '100%' : 'auto', whiteSpace: 'nowrap', letterSpacing: -0.1,
  };
  const sizes = {
    sm: { padding: '8px 14px', fontSize: 13 },
    md: { padding: '11px 20px', fontSize: 14 },
    lg: { padding: '14px 26px', fontSize: 15 },
  };
  const variants = {
    primary:   { background: 'var(--k-ink)', color: 'var(--k-bg)' },
    accent:    { background: 'var(--k-brand)', color: '#fff' },
    secondary: { background: 'transparent', color: 'var(--k-ink)', borderColor: 'var(--k-line-strong)' },
    ghost:     { background: 'transparent', color: 'var(--k-ink-soft)' },
    onDark:    { background: '#fff', color: '#0F1115' },
    onDarkOut: { background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.25)' },
  };
  const s = sizes[size] || sizes.md;
  const v = variants[variant] || variants.primary;
  return (
    <button
      style={{ ...base, ...s, ...v, ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
      {...rest}
    >
      {icon && React.cloneElement(icon, { size: size === 'lg' ? 16 : 14 })}
      {children}
      {iconRight && React.cloneElement(iconRight, { size: size === 'lg' ? 16 : 14 })}
    </button>
  );
};

// ── Tag ──────────────────────────────────────────────────────────────────────
export const Tag = ({ children, tone = 'neutral' }) => {
  const tones = {
    neutral: { bg: 'var(--k-surface-alt)', fg: 'var(--k-ink-soft)' },
    brand:   { bg: 'var(--k-brand-soft)', fg: 'var(--k-brand-deep)' },
    onDark:  { bg: 'rgba(255,255,255,.12)', fg: '#fff' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 10px', fontSize: 11.5, fontWeight: 500,
      letterSpacing: 0.4, textTransform: 'uppercase',
      background: t.bg, color: t.fg, borderRadius: 999,
    }}>{children}</span>
  );
};

// ── Section header ───────────────────────────────────────────────────────────
export const SectionHead = ({ eyebrow, title, sub, align = 'left', dark = false }) => (
  <div style={{ textAlign: align, maxWidth: 720, marginInline: align === 'center' ? 'auto' : 0 }}>
    {eyebrow && <Tag tone={dark ? 'onDark' : 'brand'}>{eyebrow}</Tag>}
    <h2 style={{
      fontFamily: 'var(--k-display)', fontSize: 'clamp(32px, 4.6vw, 56px)',
      fontWeight: 600, lineHeight: 1.05, letterSpacing: -1.4,
      color: dark ? '#fff' : 'var(--k-ink)',
      margin: '14px 0 14px',
    }}>{title}</h2>
    {sub && <p style={{
      fontSize: 18, lineHeight: 1.5, color: dark ? 'rgba(255,255,255,.7)' : 'var(--k-ink-mute)',
      margin: 0, maxWidth: 580, marginInline: align === 'center' ? 'auto' : 0,
    }}>{sub}</p>}
  </div>
);
