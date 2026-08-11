import React from 'react';
import { I, T, Button, Surface, Input, Field, Badge, Avatar } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';

export default function Scan() {
  const { t } = useLang();
  return (
    <>
      <Topbar
        title={t('scan.title')}
        subtitle={t('scan.subtitle')}
        actions={<Button variant="secondary" icon={<I.cog/>}>{t('nav.settings')}</Button>}
      />

      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18 }}>
        <Surface padding={28} style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center' }}>
          <Badge tone="brand" dot>{t('scan.waiting')}</Badge>
          <div style={{
            width: 320, height: 320, borderRadius: 16, position: 'relative',
            background: 'var(--m-ink)', overflow: 'hidden',
          }}>
            {[0, 1, 2, 3].map(i => {
              const rot = [0, 90, -90, 180][i];
              return (
                <div key={i} style={{
                  position: 'absolute',
                  top: i < 2 ? 16 : 'auto',
                  bottom: i >= 2 ? 16 : 'auto',
                  left: i % 2 === 0 ? 16 : 'auto',
                  right: i % 2 === 1 ? 16 : 'auto',
                  width: 28, height: 28,
                  borderTop: '3px solid var(--m-brand)',
                  borderLeft: '3px solid var(--m-brand)',
                  transform: `rotate(${rot}deg)`,
                }}/>
              );
            })}
            <div style={{
              position: 'absolute', left: 30, right: 30, top: '50%', height: 2,
              background: 'var(--m-brand)', boxShadow: '0 0 10px var(--m-brand)',
              animation: 'm-blink 1.4s infinite',
            }}/>
            <div style={{
              position: 'absolute', inset: 60, opacity: 0.15, display: 'grid',
              gridTemplate: 'repeat(8, 1fr) / repeat(8, 1fr)', gap: 2,
            }}>
              {Array.from({ length: 64 }).map((_, i) => (
                <div key={i} style={{ background: i % 3 === 0 ? '#fff' : 'transparent' }}/>
              ))}
            </div>
          </div>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ ...T.h2 }}>{t('scan.aim')}</div>
            <div style={{ ...T.body }}>{t('scan.aimHint')}</div>
          </div>
          <Input icon={<I.phone/>} placeholder={t('scan.phone')} style={{ width: '100%', maxWidth: 360 }}/>
        </Surface>

        <Surface padding={0} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--m-line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ ...T.h2 }}>{t('scan.cheque')}</div>
            </div>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: 30, background: 'var(--m-surface-alt)', borderRadius: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--m-ink-mute)',
            }}>
              <I.users size={28}/>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-ink-soft)' }}>{t('scan.findCustomer')}</div>
            </div>

            <Field label={t('scan.amount')} required>
              <Input placeholder="100 000 сум" disabled/>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: 14, border: '1px solid var(--m-line)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--m-ink-mute)' }}>{t('scan.earn')}</div>
                <div style={{ fontFamily: 'var(--m-mono)', fontSize: 22, fontWeight: 600, color: 'var(--m-good)' }}>—</div>
              </div>
              <div style={{ padding: 14, border: '1px solid var(--m-line)', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--m-ink-mute)' }}>{t('scan.redeem')}</div>
                <div style={{ fontFamily: 'var(--m-mono)', fontSize: 22, fontWeight: 600, color: 'var(--m-ink)' }}>—</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
              <Button variant="secondary" full>{t('scan.cancel')}</Button>
              <Button variant="primary" full icon={<I.check/>} disabled>{t('scan.process')}</Button>
            </div>
          </div>
        </Surface>
      </div>
    </>
  );
}
