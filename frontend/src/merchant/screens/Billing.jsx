import React, { useState } from 'react';
import { I, T, Button, Surface, Badge } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { fmtDate } from '../i18n/date';
import api from '../api';

function limitText(value, unlimited) {
  if (value == null || value === 0) return unlimited;
  return value.toLocaleString('ru-RU');
}

function buildFeatureList(tf, t) {
  const lim = tf.limits || {};
  const f = tf.features || {};
  const unlimited = t('bl.feat.unlimited');
  const out = [];

  out.push(`${limitText(lim.customers, unlimited)} ${t('bl.feat.customers')}`);
  out.push(`${limitText(lim.branches, unlimited)} ${t('bl.feat.branches')}`);
  out.push(`${limitText(lim.staff, unlimited)} ${t('bl.feat.staff')}`);

  if (lim.push_per_month != null && lim.push_per_month > 0) {
    out.push(`${lim.push_per_month.toLocaleString('ru-RU')} ${t('bl.feat.pushPerMonth')}`);
  } else {
    out.push(`${unlimited} ${t('bl.feat.pushPerMonth')}`);
  }

  if (f.tier) out.push(t('bl.feat.tier'));
  if (f.gamification) out.push(t('bl.feat.gamification'));
  if (f.games) out.push(t('bl.feat.games'));
  if (f.birthday_bonus) out.push(t('bl.feat.birthday'));
  if (f.segments_advanced) out.push(t('bl.feat.segments'));
  if (f.card_design_custom) out.push(t('bl.feat.cardDesign'));
  if (f.scheduled_push) out.push(t('bl.feat.scheduledPush'));
  if (f.pos_integration) out.push(t('bl.feat.posIntegration'));
  if (f.api_access) out.push(t('bl.feat.api'));
  if (f.priority_support) out.push(t('bl.feat.support'));

  if (Array.isArray(tf.extra_features)) {
    for (const ex of tf.extra_features) {
      if (typeof ex === 'string' && ex.trim()) out.push(ex);
    }
  }
  return out;
}

export default function Billing() {
  const { t, lang } = useLang();
  const locale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
  const { user } = useAuth();
  const trial = user?.trial_days_left;
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState('');
  const paidSuccess = new URLSearchParams(window.location.search).get('paid') === '1';

  const { data: tariffsList, loading: tariffsLoading } = useApi(() => api.tariffs().catch(() => []), []);
  const { data: myTariff } = useApi(() => api.myTariff().catch(() => null), []);
  const { data: billing } = useApi(() => api.myBilling().catch(() => null), []);

  const plans = Array.isArray(tariffsList) ? tariffsList : [];

  async function handlePay(tariffId) {
    setPayingId(tariffId); setPayError('');
    try {
      const res = await api.checkoutPayme(tariffId, 'monthly', lang);
      if (res?.checkout_url) {
        window.location.href = res.checkout_url;
      }
    } catch (e) {
      setPayError(e?.message || t('common.error'));
      setPayingId(null);
    }
  }
  const currentTariffId = myTariff?.tariff?.id ?? null;
  const invoices = Array.isArray(billing?.invoices) ? billing.invoices : [];

  const cardsCount = user?.cards_count ?? user?.cards_total ?? 0;
  const branchesCount = user?.branches_count ?? 0;
  const currentLimits = myTariff?.tariff?.limits ?? {};
  const maxCards = currentLimits.customers ?? -1;
  const maxBranches = currentLimits.branches ?? -1;

  return (
    <>
      <Topbar
        title={t('bl.title')}
        subtitle={trial ? `${t('nav.trial.title', { days: trial })}` : t('bl.subtitle')}
        actions={<Button variant="primary" icon={<I.zap/>}>{t('bl.activate')}</Button>}
      />

      {paidSuccess && (
        <div style={{ margin: '0 28px', padding: '12px 16px', borderRadius: 10, fontSize: 13, background: 'rgba(63,156,92,0.10)', color: 'var(--m-good)' }}>
          {t('bl.plan.paidSuccess')}
        </div>
      )}
      {payError && (
        <div style={{ margin: '0 28px', padding: '12px 16px', borderRadius: 10, fontSize: 13, background: 'var(--m-bad-soft)', color: 'var(--m-bad)' }}>
          {payError}
        </div>
      )}

      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Current plan banner */}
        {(() => {
          const tf = myTariff?.tariff;
          const title = tf ? (lang === 'uz' ? tf.title_uz : tf.title_ru) : null;
          const status = myTariff?.expired ? 'expired'
            : myTariff?.tariff ? (billing?.subscription?.status === 'trial' ? 'trial' : 'active')
            : 'none';
          const statusLabel = {
            active:  t('bl.current.status.active'),
            trial:   t('bl.current.status.trial'),
            expired: t('bl.current.status.expired'),
            none:    t('bl.current.status.none'),
          }[status];
          const statusColor = { active: 'var(--m-good)', trial: 'var(--m-warn)', expired: 'var(--m-bad)', none: 'var(--m-ink-mute)' }[status];
          const expiresAt = myTariff?.expires_at;
          const daysLeft = myTariff?.days_remaining;
          const price = tf?.monthly_price;

          return (
            <Surface padding={20}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                  background: status === 'active' ? 'var(--m-brand-soft)' : 'var(--m-surface-alt)',
                  color: status === 'active' ? 'var(--m-brand)' : 'var(--m-ink-mute)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <I.zap size={20}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--m-ink-mute)', marginBottom: 2 }}>
                    {t('bl.current.title')}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--m-ink)' }}>
                    {title ?? t('bl.tariff.noSub')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  {price != null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--m-ink-mute)', marginBottom: 2 }}>{t('bl.current.price')}</div>
                      <div style={{ fontFamily: 'var(--m-mono)', fontSize: 15, fontWeight: 600, color: 'var(--m-ink)' }}>
                        {price === 0 ? t('bl.tariff.free') : `${price.toLocaleString(locale)} ${t('common.currency')}`}
                      </div>
                    </div>
                  )}
                  {expiresAt && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--m-ink-mute)', marginBottom: 2 }}>{t('bl.current.expires')}</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: daysLeft != null && daysLeft <= 7 ? 'var(--m-bad)' : 'var(--m-ink)' }}>
                        {fmtDate(expiresAt, lang)}
                        {daysLeft != null && (
                          <span style={{ marginLeft: 6, fontSize: 12, color: daysLeft <= 7 ? 'var(--m-bad)' : 'var(--m-ink-mute)' }}>
                            ({t('bl.tariff.daysLeft', { days: daysLeft })})
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <Badge tone={status === 'active' ? 'good' : status === 'trial' ? 'warn' : 'bad'}>
                    {statusLabel}
                  </Badge>
                </div>
              </div>
            </Surface>
          );
        })()}

        {/* Plan cards */}
        {tariffsLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 13 }}>
            {t('common.loading')}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(plans.length, 4)}, 1fr)`, gap: 14 }}>
            {plans.map((p) => {
              const isCurrent = currentTariffId !== null && p.id === currentTariffId;
              const title = lang === 'uz' ? p.title_uz : p.title_ru;
              const features = buildFeatureList(p, t);
              const priceDisplay = p.monthly_price === 0
                ? t('bl.tariff.free')
                : `${p.monthly_price.toLocaleString(locale)} ${t('common.currency')}`;

              return (
                <div key={p.id} style={{
                  padding: 24, borderRadius: 14, position: 'relative',
                  background: isCurrent ? 'var(--m-brand)' : 'var(--m-surface)',
                  color: isCurrent ? '#fff' : 'var(--m-ink)',
                  border: isCurrent ? 'none' : '1px solid var(--m-line)',
                }}>
                  {isCurrent && (
                    <Badge tone="warn" style={{ position: 'absolute', top: 18, right: 18, background: '#fff', color: '#92400E' }}>
                      {t('bl.plan.youHere')}
                    </Badge>
                  )}
                  {p.is_recommended && !isCurrent && (
                    <Badge tone="brand" style={{ position: 'absolute', top: 18, right: 18 }}>
                      ★
                    </Badge>
                  )}
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 32, fontWeight: 600, fontFamily: 'var(--m-mono)', letterSpacing: -0.5 }}>
                    {priceDisplay}
                  </div>
                  {p.monthly_price > 0 && (
                    <div style={{ fontSize: 11.5, opacity: 0.7, marginBottom: 18 }}>
                      {t('bl.tariff.perMonth')}
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, opacity: 0.7, marginBottom: p.monthly_price > 0 ? 0 : 18 }}>
                    {p.monthly_price === 0 ? ' ' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {features.map((f, j) => (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, opacity: isCurrent ? 0.95 : 0.85 }}>
                        <I.check size={13} stroke={2.4} style={{ color: isCurrent ? '#fff' : 'var(--m-good)', flexShrink: 0 }}/>
                        {f}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!isCurrent && p.monthly_price > 0 && (
                      <Button
                        variant={p.is_recommended ? 'primary' : 'secondary'}
                        full
                        disabled={payingId === p.id}
                        onClick={() => handlePay(p.id)}
                        icon={payingId !== p.id ? <I.zap/> : null}
                      >
                        {payingId === p.id ? t('common.loading') : t('bl.plan.payPayme')}
                      </Button>
                    )}
                    {!isCurrent && p.monthly_price === 0 && (
                      <Button variant="secondary" full>
                        {t('bl.plan.choose')} {title}
                      </Button>
                    )}
                    {isCurrent && (
                      <Button variant="secondary" full style={{ background: 'rgba(255,255,255,.15)', color: '#fff', borderColor: 'transparent' }}>
                        {t('bl.plan.current')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
          <Surface padding={20}>
            <div style={{ ...T.h2, marginBottom: 16 }}>{t('bl.usage.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                [t('nav.cards'),    cardsCount,    maxCards === -1    ? '∞' : maxCards,    maxCards === -1    ? null : Math.round(cardsCount / maxCards * 100),    maxCards === -1    ? 'unlim' : null],
                [t('nav.push'),     0,             '∞',               null, 'unlim'],
                [t('nav.branches'), branchesCount, maxBranches === -1 ? '∞' : maxBranches, maxBranches === -1 ? null : Math.round(branchesCount / maxBranches * 100), maxBranches === -1 ? 'unlim' : null],
                [t('nav.staff'),    0,             '∞',               null, 'unlim'],
              ].map(([k, v, max, pct, type], idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--m-ink-soft)' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--m-mono)', fontSize: 13, color: 'var(--m-ink)', fontWeight: 600 }}>
                      {Number(v).toLocaleString(locale)} <span style={{ color: 'var(--m-ink-mute)', fontWeight: 400 }}>/ {max}</span>
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--m-surface-alt)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: type === 'unlim'
                        ? (v > 0 ? '12%' : '0%')
                        : `${Math.min(pct ?? 0, 100)}%`,
                      height: '100%',
                      background: (pct ?? 0) > 80 ? 'var(--m-warn)' : 'var(--m-brand)',
                    }}/>
                  </div>
                </div>
              ))}
            </div>
          </Surface>

          <Surface padding={20}>
            <div style={{ ...T.h2, marginBottom: 14 }}>{t('bl.invoices.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {invoices.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--m-ink-faint)' }}>
                  {t('common.empty')}
                </div>
              )}
              {invoices.map(inv => (
                <div key={inv.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid var(--m-line)',
                }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--m-ink)' }}>{inv.invoice_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--m-ink-mute)', marginTop: 2 }}>
                      {fmtDate(inv.created_at, lang)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--m-mono)', fontSize: 13, fontWeight: 600, color: 'var(--m-ink)' }}>
                      {Number(inv.amount).toLocaleString(locale)} {t('common.currency')}
                    </div>
                    <Badge tone={inv.status === 'paid' ? 'good' : 'warn'} style={{ fontSize: 10, marginTop: 2 }}>
                      {inv.status === 'paid' ? t('bl.invoices.paid') : inv.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </>
  );
}
