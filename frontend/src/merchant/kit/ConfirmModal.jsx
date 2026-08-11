import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Primitives';

export default function ConfirmModal({ message, onConfirm, onCancel, confirmLabel, cancelLabel, danger = true }) {
  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 99999,
        padding: 16,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--m-surface)',
          borderRadius: 20,
          padding: '28px 24px 24px',
          width: '100%',
          maxWidth: 340,
          boxShadow: '0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {danger && (
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'var(--m-bad-soft, rgba(220,53,69,0.1))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 4,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--m-bad, #dc3545)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </div>
          )}
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--m-ink)', lineHeight: 1.4 }}>
            {message}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onCancel} full>
            {cancelLabel ?? 'Отмена'}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} full>
            {confirmLabel ?? 'Подтвердить'}
          </Button>
        </div>
      </div>
    </div>,
    document.querySelector('.merchant-root') || document.body
  );
}
