import React from 'react';
import { I, T, Button, Input, Field, MonvoLogo, Divider } from '../kit';
import { useLang } from '../i18n/LangContext';
import '../merchant.css';

export default function Onboarding() {
  const { t } = useLang();
  const steps = [
    { n: 1, label: t('onb.step1'), done: true },
    { n: 2, label: t('onb.step2'), done: true },
    { n: 3, label: t('onb.step3'), done: false, current: true },
    { n: 4, label: t('onb.step4'), done: false },
    { n: 5, label: t('onb.step5'), done: false },
  ];

  return (
    <div className="merchant-root">
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--m-bg)' }}>
        <div style={{ width: 320, padding: 36, borderRight: '1px solid var(--m-line)', background: 'var(--m-surface)' }}>
          <MonvoLogo size={22}/>
          <div style={{ ...T.h1, marginTop: 36, fontSize: 20 }}>{t('onb.title')}</div>
          <div style={{ ...T.body, marginTop: 6 }}>{t('onb.subtitle')}</div>
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {steps.map(s => (
              <div key={s.n} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 12px', borderRadius: 9,
                background: s.current ? 'var(--m-brand-soft)' : 'transparent',
                color: s.current ? 'var(--m-brand-ink)' : 'var(--m-ink-soft)',
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: s.done ? 'var(--m-good)' : s.current ? 'var(--m-brand)' : 'var(--m-line)',
                  color: s.done || s.current ? '#fff' : 'var(--m-ink-mute)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, fontFamily: 'var(--m-mono)', flexShrink: 0,
                }}>
                  {s.done ? <I.check size={13} stroke={2.4}/> : s.n}
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: s.current ? 500 : 400 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 36, padding: 14, borderRadius: 11, border: '1px dashed var(--m-line-strong)',
            fontSize: 12, color: 'var(--m-ink-mute)', lineHeight: 1.5,
          }}>
            💡 Posle zapuska my pozvonim vam i pokazhem, kak vsye nastraivaetsya.
          </div>
        </div>

        <div style={{ flex: 1, padding: '52px 64px', overflow: 'auto', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)', letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>Shag 3 iz 5</div>
          <div>
            <div style={{ ...T.display }}>Skol'ko ballov dat za rubl'?</div>
            <div style={{ ...T.bodyL, marginTop: 8, maxWidth: 540 }}>
              Eto osnova vashey programmy. Po umolchaniyu — 1 ball za 10 сум s cheka. Vsegda mozhno izmenit' i nastraivat tier'y.
            </div>
          </div>

          <div style={{
            background: 'var(--m-surface)', border: '1px solid var(--m-line)', borderRadius: 14, padding: 28,
            display: 'flex', flexDirection: 'column', gap: 22,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Klient platit" required>
                <Input defaultValue="10 000 сум" />
              </Field>
              <Field label="Poluchaet ballov" required>
                <Input defaultValue="10" />
              </Field>
            </div>

            <Field label="1 ball stoit dlya klienta" hint="Naprimer, 100 ballov = 10 000 сум skidki">
              <div style={{ display: 'flex', gap: 8 }}>
                {['100 сум', '200 сум', '500 сум', 'Sobstvennoe'].map((v, i) => (
                  <div key={v} style={{
                    flex: 1, padding: '10px 12px', textAlign: 'center', fontSize: 13,
                    border: '1px solid var(--m-line-strong)', borderRadius: 9,
                    background: i === 0 ? 'var(--m-brand-soft)' : 'var(--m-surface)',
                    color: i === 0 ? 'var(--m-brand-ink)' : 'var(--m-ink-soft)',
                    fontWeight: i === 0 ? 500 : 400, cursor: 'pointer',
                  }}>{v}</div>
                ))}
              </div>
            </Field>

            <Divider/>
            <div>
              <div style={{ ...T.h2, fontSize: 14, marginBottom: 4 }}>Predpolozhenie</div>
              <div style={{ ...T.body, fontSize: 12.5 }}>S srednim chekom 100 000 сум</div>
              <div style={{
                marginTop: 12, padding: 14, borderRadius: 10, background: 'var(--m-surface-alt)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--m-ink-mute)' }}>Klient kopit za 1 visit</div>
                  <div style={{ fontFamily: 'var(--m-mono)', fontSize: 22, fontWeight: 600, color: 'var(--m-ink)' }}>85 ballov</div>
                </div>
                <I.arrowR style={{ color: 'var(--m-ink-mute)' }}/>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--m-ink-mute)' }}>Posle 4 visitov</div>
                  <div style={{ fontFamily: 'var(--m-mono)', fontSize: 22, fontWeight: 600, color: 'var(--m-brand)' }}>40 000 сум skidki</div>
                </div>
                <I.arrowR style={{ color: 'var(--m-ink-mute)' }}/>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--m-ink-mute)' }}>Yvelichenie LTV</div>
                  <div style={{ fontFamily: 'var(--m-mono)', fontSize: 22, fontWeight: 600, color: 'var(--m-good)' }}>+18%</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <Button variant="ghost" icon={<I.arrowR style={{ transform: 'rotate(180deg)' }}/>}>{t('common.back')}</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary">{t('common.skip')}</Button>
              <Button variant="primary" iconRight={<I.arrowR/>}>{t('common.continue')}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
