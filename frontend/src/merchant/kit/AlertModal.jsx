import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Primitives';

const VARIANTS = {
  error:   { bg: 'var(--m-bad-soft, rgba(220,53,69,0.1))',  color: 'var(--m-bad, #dc3545)' },
  success: { bg: 'rgba(22,163,74,0.12)',                    color: 'var(--m-good, #16a34a)' },
  warning: { bg: 'rgba(255,190,0,0.12)',                    color: '#e6a000'               },
  info:    { bg: 'var(--m-brand-soft)',                      color: 'var(--m-brand)'        },
  feature: { bg: 'var(--m-brand-soft)',                      color: 'var(--m-brand)'        },
};

function Icon({ variant, color }) {
  const s = { stroke: color, strokeWidth: '2.2', strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  if (variant === 'success') return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 12.5l2.5 2.5L16 9.5"/>
    </svg>
  );
  if (variant === 'feature') return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
  if (variant === 'warning') return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.5" fill={color}/>
    </svg>
  );
  if (variant === 'info') return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="0.5" fill={color}/>
    </svg>
  );
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...s}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill={color}/>
    </svg>
  );
}

export default function AlertModal({ message, title, variant = 'error', okLabel = 'OK', onClose }) {
  const v = VARIANTS[variant] || VARIANTS.error;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--m-surface)',
          borderRadius: 20,
          padding: '28px 24px 24px',
          width: '100%', maxWidth: 360,
          boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            background: v.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon variant={variant} color={v.color} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {title && (
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--m-ink)', lineHeight: 1.35 }}>
                {title}
              </div>
            )}
            <div style={{ fontSize: 13.5, color: 'var(--m-ink-mute)', lineHeight: 1.55 }}>
              {message}
            </div>
          </div>
        </div>

        <Button variant="primary" onClick={onClose} full>{okLabel}</Button>
      </div>
    </div>,
    document.querySelector('.merchant-root') || document.body
  );
}
