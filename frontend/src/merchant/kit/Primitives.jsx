import React from 'react';
import { I, T } from './Icon';

export const Surface = ({ style, children, padding = 0, ...rest }) => (
  <div style={{
    background: 'var(--m-surface)',
    border: '1px solid var(--m-line)',
    borderRadius: 16,
    padding,
    ...style,
  }} {...rest}>{children}</div>
);

export const Divider = ({ vertical, style }) => (
  <div style={{
    background: 'var(--m-line)',
    ...(vertical ? { width: 1, height: '100%' } : { height: 1, width: '100%' }),
    ...style,
  }}/>
);

export const Badge = ({ tone = 'neutral', children, dot = false, style }) => {
  const tones = {
    neutral: { bg: 'var(--m-surface-alt)', fg: 'var(--m-ink-soft)', d: 'var(--m-ink-mute)' },
    brand:   { bg: 'var(--m-brand-soft)',  fg: 'var(--m-brand-ink)', d: 'var(--m-brand)' },
    good:    { bg: 'var(--m-good-soft)',   fg: 'var(--m-good)',     d: 'var(--m-good)' },
    warn:    { bg: 'var(--m-warn-soft)',   fg: 'var(--m-warn)',     d: 'var(--m-warn)' },
    bad:     { bg: 'var(--m-bad-soft)',    fg: 'var(--m-bad)',      d: 'var(--m-bad)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: t.bg, color: t.fg,
      padding: '3px 8px', borderRadius: 6,
      fontSize: 11.5, fontWeight: 500, letterSpacing: 0.1,
      ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.d }}/>}
      {children}
    </span>
  );
};

export const Button = ({ variant = 'secondary', size = 'md', icon, iconRight, children, full, style, ...rest }) => {
  const variants = {
    primary:   { bg: 'var(--m-brand)', fg: '#fff', bd: 'var(--m-brand)' },
    secondary: { bg: 'var(--m-surface)', fg: 'var(--m-ink)', bd: 'var(--m-line-strong)' },
    ghost:     { bg: 'transparent', fg: 'var(--m-ink-soft)', bd: 'transparent' },
    danger:    { bg: 'var(--m-bad)', fg: '#fff', bd: 'var(--m-bad)' },
    soft:      { bg: 'var(--m-brand-soft)', fg: 'var(--m-brand-ink)', bd: 'transparent' },
  };
  const sizes = {
    sm: { p: '7px 12px', fs: 12.5, ic: 14, r: 10 },
    md: { p: '10px 16px', fs: 13.5, ic: 16, r: 12 },
    lg: { p: '13px 20px', fs: 14.5, ic: 18, r: 12 },
  };
  const v = variants[variant], s = sizes[size];
  return (
    <button style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      background: v.bg, color: v.fg, border: `1px solid ${v.bd}`,
      padding: s.p, fontSize: s.fs, fontWeight: 500,
      borderRadius: s.r, cursor: 'pointer',
      width: full ? '100%' : undefined, whiteSpace: 'nowrap',
      transition: 'background 0.15s, border-color 0.15s',
      ...style,
    }} {...rest}>
      {icon && React.cloneElement(icon, { size: s.ic })}
      {children}
      {iconRight && React.cloneElement(iconRight, { size: s.ic })}
    </button>
  );
};

export const Input = React.forwardRef(function Input({ icon, style, ...rest }, ref) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--m-surface)', border: '1px solid var(--m-line)',
      borderRadius: 12, padding: '11px 14px', ...style,
    }}>
      {icon && React.cloneElement(icon, { size: 16, style: { color: 'var(--m-ink-mute)' } })}
      <input ref={ref} {...rest} style={{
        border: 'none', outline: 'none', background: 'transparent',
        color: 'var(--m-ink)', fontSize: 14, fontWeight: 500, flex: 1, padding: 0,
        width: '100%',
      }}/>
    </div>
  );
});

export const Field = ({ label, hint, children, required }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <span style={{
      fontSize: 11, fontWeight: 500, letterSpacing: 0.6,
      textTransform: 'uppercase', color: 'var(--m-ink-mute)',
    }}>
      {label}{required && <span style={{ color: 'var(--m-bad)' }}> *</span>}
    </span>
    {children}
    {hint && <span style={{ fontSize: 11.5, color: 'var(--m-ink-mute)' }}>{hint}</span>}
  </label>
);

export const Avatar = ({ name = '?', size = 32, color }) => {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  const palette = ['#7C4A8C','#0F766E','#A65A3D','#1F3A5F','#9F1239','#2F6B3F','#5B21B6','#B45309'];
  const idx = (name.charCodeAt(0) + name.charCodeAt(name.length - 1 || 0)) % palette.length;
  const bg = color || palette[idx];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 600, flexShrink: 0,
      letterSpacing: 0.3,
    }}>{initials}</div>
  );
};

export const Stat = ({ label, value, delta, deltaTone = 'good', sub, sparkline, accent }) => (
  <div style={{
    background: 'var(--m-surface)', border: '1px solid var(--m-line)',
    borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10,
    minHeight: 124, position: 'relative', overflow: 'hidden',
  }}>
    {accent && (
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent,
      }}/>
    )}
    <div style={{ ...T.micro, color: 'var(--m-ink-mute)' }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--m-ink)', letterSpacing: -0.5, fontFamily: 'var(--m-mono)' }}>
        {value}
      </div>
      {delta && <Badge tone={deltaTone}>{delta}</Badge>}
    </div>
    {sub && <div style={{ ...T.meta, marginTop: 'auto' }}>{sub}</div>}
    {sparkline}
  </div>
);

export const Th = ({ children, w, align = 'left' }) => (
  <th style={{
    fontSize: 11.5, color: 'var(--m-ink-mute)', fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: 0.5,
    textAlign: align, padding: '12px 14px',
    borderBottom: '1px solid var(--m-line)', width: w,
    background: 'var(--m-surface-alt)',
  }}>{children}</th>
);

export const Td = ({ children, align = 'left', mono, style }) => (
  <td style={{
    padding: '12px 14px', borderBottom: '1px solid var(--m-line)',
    fontSize: 13, color: 'var(--m-ink-soft)', textAlign: align,
    fontFamily: mono ? 'var(--m-mono)' : 'inherit',
    ...style,
  }}>{children}</td>
);

export const FilterChip = ({ active, children, onClick }) => (
  <div onClick={onClick} style={{
    padding: '6px 11px', fontSize: 12, borderRadius: 7,
    background: active ? 'var(--m-brand)' : 'var(--m-surface)',
    color: active ? '#fff' : 'var(--m-ink-soft)',
    border: `1px solid ${active ? 'var(--m-brand)' : 'var(--m-line-strong)'}`,
    cursor: 'pointer', fontWeight: active ? 500 : 400,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }}>{children}</div>
);

export const TierChip = ({ tier }) => {
  const map = {
    Gold: { bg: '#FEF3C7', fg: '#92400E' },
    Silver: { bg: '#E5E7EB', fg: '#374151' },
    Bronze: { bg: '#FED7AA', fg: '#9A3412' },
  };
  const c = map[tier] || map.Bronze;
  return (
    <span style={{
      background: c.bg, color: c.fg,
      padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
      letterSpacing: 0.3, textTransform: 'uppercase',
    }}>{tier}</span>
  );
};

export const EmptyState = ({ title, sub, action }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: 40, gap: 8, textAlign: 'center',
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: 10, background: 'var(--m-surface-alt)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--m-ink-mute)',
    }}>
      <I.search size={20}/>
    </div>
    <div style={{ ...T.h2 }}>{title}</div>
    {sub && <div style={{ ...T.body, maxWidth: 320 }}>{sub}</div>}
    {action && <div style={{ marginTop: 6 }}>{action}</div>}
  </div>
);
