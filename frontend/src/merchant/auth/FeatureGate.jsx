import React from 'react';
import { useNavigate } from 'react-router-dom';
import { I, T, Surface, Button } from '../kit';
import { useAuth } from './AuthContext';
import { useLang } from '../i18n/LangContext';

/**
 * FeatureGate — funksiyani tarifga qarab qulflaydi.
 *
 * <FeatureGate feature="api_access">
 *   <ApiTokens/>
 * </FeatureGate>
 *
 * Agar tarifda funksiya bo'lsa — children ko'rsatiladi.
 * Aks holda qulf + "Tarifni yangilash" taklifi chiqadi.
 *
 * `inline` — kichik (sahifa ichidagi bo'lim uchun) variant.
 */
export default function FeatureGate({ feature, children, inline = false, title }) {
  const { hasFeature } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  if (hasFeature(feature)) return children;

  const label = title || t(`feature.${feature}`) || feature;

  if (inline) {
    return (
      <Surface padding={20} style={{
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'var(--m-surface-alt)', borderStyle: 'dashed',
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><I.lock size={18}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...T.body, color: 'var(--m-ink)', fontWeight: 500 }}>{label}</div>
          <div style={{ ...T.meta }}>{t('feature.locked.hint')}</div>
        </div>
        <Button size="sm" variant="primary" icon={<I.zap/>} onClick={() => navigate('/billing')}>
          {t('feature.locked.cta')}
        </Button>
      </Surface>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <Surface padding={40} style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, margin: '0 auto 20px',
          background: 'var(--m-brand-soft)', color: 'var(--m-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><I.lock size={30}/></div>
        <div style={{ ...T.h1, marginBottom: 8 }}>{t('feature.locked.title')}</div>
        <div style={{ ...T.bodyL, marginBottom: 6 }}>
          {t('feature.locked.body', { feature: label })}
        </div>
        <div style={{ ...T.meta, marginBottom: 24 }}>{t('feature.locked.hint')}</div>
        <Button variant="primary" icon={<I.zap/>} onClick={() => navigate('/billing')}>
          {t('feature.locked.cta')}
        </Button>
      </Surface>
    </div>
  );
}
