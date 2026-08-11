import React from 'react';
import { T } from '../kit';
import { useIsMobile } from '../hooks/useIsMobile';

export default function Topbar({ title, subtitle, breadcrumb = [], actions, tabs }) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      padding: isMobile ? '16px 14px 0' : '20px 28px 0',
      borderBottom: tabs ? '1px solid var(--m-line)' : 'none',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'flex-start', gap: isMobile ? 10 : 16,
        flexDirection: isMobile ? 'column' : 'row',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {breadcrumb.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--m-ink-mute)', marginBottom: 6 }}>
              {breadcrumb.map((b, i) => (
                <React.Fragment key={i}>
                  <span style={{ cursor: 'pointer', color: i === breadcrumb.length - 1 ? 'var(--m-ink-soft)' : 'var(--m-ink-mute)' }}>{b}</span>
                  {i < breadcrumb.length - 1 && <span style={{ color: 'var(--m-ink-faint)' }}>/</span>}
                </React.Fragment>
              ))}
            </div>
          )}
          <div style={{ ...T.h1 }}>{title}</div>
          {subtitle && <div style={{ ...T.body, marginTop: 4 }}>{subtitle}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>{actions}</div>}
      </div>

      {tabs && (
        <div style={{ display: 'flex', gap: 4, marginTop: 18, marginBottom: -1, overflowX: 'auto' }}>
          {tabs.map((t, i) => (
            <div key={i} onClick={t.onClick} style={{
              padding: '10px 14px', fontSize: 13,
              color: t.active ? 'var(--m-ink)' : 'var(--m-ink-mute)',
              fontWeight: t.active ? 500 : 400,
              borderBottom: t.active ? '2px solid var(--m-brand)' : '2px solid transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {t.label}
              {t.count != null && (
                <span style={{
                  background: t.active ? 'var(--m-brand-soft)' : 'var(--m-surface-alt)',
                  color: t.active ? 'var(--m-brand-ink)' : 'var(--m-ink-mute)',
                  fontSize: 10.5, fontFamily: 'var(--m-mono)', padding: '1px 6px', borderRadius: 4,
                }}>{t.count}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
