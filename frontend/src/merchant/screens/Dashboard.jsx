import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  I, T, Button, Surface, Divider, Stat, Th, Td, Avatar,
  Sparkline, LineChart, LoyaltyCardMini,
} from '../kit';
import Topbar from '../layout/Topbar';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useApi } from '../hooks/useApi';
import api from '../api';

function fmtMoney(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('ru-RU') + ' сум';
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const { data: stats } = useApi(() => api.stats(), []);
  const { data: trend } = useApi(() => api.trend(14), []);
  const { data: recent } = useApi(() => api.transactionsList({ limit: 6 }), []);

  const trendSeries = useMemo(() => {
    if (!Array.isArray(trend) || trend.length === 0) return null;
    // Backend (analytics/trend) qaytaradi: { date, earn_count, redeem_count, points_earned, points_redeemed }
    const earned = trend.map((p) => p.points_earned ?? p.revenue ?? 0);
    const transactions = trend.map((p) => (p.earn_count ?? 0) + (p.redeem_count ?? 0));
    const labels = trend.map((p) => (p.date || '').slice(5));
    return { earned, transactions, labels };
  }, [trend]);

  const firstName = user?.owner_name?.split(' ')[0] || user?.name?.split(' ')[0];
  const greeting = firstName ? t('dash.greetName', { name: firstName }) : t('dash.greet');

  return (
    <>
      <Topbar
        title={greeting}
        subtitle={user?.business_name ? `${user.business_name} · ${t('dash.synced')}` : t('dash.synced')}
        actions={
          <Button variant="primary" icon={<I.bell/>} onClick={() => navigate('/push')}>{t('nav.push')}</Button>
        }
      />

      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <Stat
            label={t('dash.kpi.activeCards')}
            value={(stats?.cards_active ?? stats?.cards_total ?? 0).toLocaleString('ru-RU')}
            sub={stats?.cards_total != null ? t('dash.kpi.activeCardsSub', { total: stats.cards_total.toLocaleString('ru-RU') }) : undefined}
            sparkline={trendSeries ? <Sparkline data={trendSeries.transactions.slice(-7)} w={140} h={32}/> : null}
          />
          <Stat
            label={t('dash.kpi.transactions')}
            value={(trendSeries?.transactions || []).reduce((a, b) => a + b, 0).toLocaleString('ru-RU')}
            sub={t('dash.kpi.transactionsSub')}
          />
          <Stat
            label={t('dash.kpi.pointsIssued')}
            value={(stats?.points_issued ?? 0).toLocaleString('ru-RU')}
            sub={t('dash.kpi.pointsIssuedSub')}
          />
          <Stat
            label={t('dash.kpi.pointsRedeemed')}
            value={(stats?.points_redeemed ?? 0).toLocaleString('ru-RU')}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <Surface padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ ...T.h2 }}>{t('dash.chart.title')}</div>
                <div style={{ ...T.meta, marginTop: 2 }}>{t('dash.chart.subtitle')}</div>
              </div>
            </div>
            {trendSeries ? (
              <LineChart
                w={760} h={220}
                labels={trendSeries.labels}
                series={[
                  { color: 'var(--m-brand)', fill: true, data: trendSeries.earned },
                  { color: 'var(--m-ink-mute)', fill: false, data: trendSeries.transactions },
                ]}
              />
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--m-ink-faint)', fontSize: 12 }}>
                {t('dash.chart.empty')}
              </div>
            )}
          </Surface>

          <Surface padding={18}>
            <div style={{ ...T.h2, marginBottom: 16 }}>{t('dash.actions.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: <I.users/>, t: t('dash.actions.customers.title'), s: t('dash.actions.customers.sub'), to: '/customers' },
                { icon: <I.staff/>, t: t('dash.actions.staff.title'), s: t('dash.actions.staff.sub'), to: '/staff' },
              ].map((a, i) => (
                <div key={i} onClick={() => navigate(a.to)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
                  borderRadius: 9, background: 'var(--m-surface-alt)', cursor: 'pointer',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: 'var(--m-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--m-brand)', flexShrink: 0,
                  }}>{a.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-ink)' }}>{a.t}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)' }}>{a.s}</div>
                  </div>
                  <I.arrowR size={15} style={{ color: 'var(--m-ink-mute)' }}/>
                </div>
              ))}
            </div>
          </Surface>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 14 }}>
          <Surface padding={0}>
            <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ ...T.h2 }}>{t('dash.recent.title')}</div>
              <Button variant="ghost" size="sm" iconRight={<I.arrowR/>} onClick={() => navigate('/transactions')}>{t('dash.recent.all')}</Button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>{t('dash.recent.col.customer')}</Th>
                  <Th align="right">{t('dash.recent.col.amount')}</Th>
                  <Th align="right">{t('dash.recent.col.points')}</Th>
                  <Th align="right">{t('dash.recent.col.time')}</Th>
                </tr>
              </thead>
              <tbody>
                {(recent || []).slice(0, 6).map((tx, i) => {
                  const points = tx.points_delta ?? tx.points ?? 0;
                  const customer = tx.customer_name || tx.holder_name || tx.card_holder_name || '—';
                  return (
                    <tr key={tx.id || i}>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Avatar name={customer} size={26}/>
                          <span style={{ color: 'var(--m-ink)', fontWeight: 500 }}>{customer}</span>
                        </div>
                      </Td>
                      <Td align="right" mono>{fmtMoney(tx.amount)}</Td>
                      <Td align="right">
                        <span style={{
                          fontFamily: 'var(--m-mono)', fontWeight: 600,
                          color: points < 0 ? 'var(--m-bad)' : 'var(--m-good)',
                        }}>{points > 0 ? '+' : ''}{points}</span>
                      </Td>
                      <Td align="right" mono style={{ color: 'var(--m-ink-mute)' }}>
                        {tx.created_at ? new Date(tx.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </Td>
                    </tr>
                  );
                })}
                {(!recent || recent.length === 0) && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--m-ink-faint)' }}>{t('dash.recent.empty')}</td></tr>
                )}
              </tbody>
            </table>
          </Surface>

          <Surface padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ ...T.h2 }}>{t('dash.card.title')}</div>
              <div style={{ ...T.meta, marginTop: 2 }}>{t('dash.card.subtitle')}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <LoyaltyCardMini brand={user?.business_name || 'Monvo'} balance={248} scale={0.85}/>
            </div>
            <Divider/>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
              <div>
                <div style={{ color: 'var(--m-ink-mute)' }}>{t('dash.card.activeCards')}</div>
                <div style={{ fontFamily: 'var(--m-mono)', fontSize: 18, fontWeight: 600, color: 'var(--m-ink)' }}>
                  {stats?.cards_total?.toLocaleString('ru-RU') ?? '—'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--m-ink-mute)' }}>{t('dash.card.weekDelta')}</div>
                <div style={{ fontFamily: 'var(--m-mono)', fontSize: 18, fontWeight: 600, color: 'var(--m-good)' }}>
                  {stats?.cards_new_week != null ? `+${stats.cards_new_week}` : '—'}
                </div>
              </div>
            </div>
            <Button variant="secondary" full icon={<I.sparkles/>} onClick={() => navigate('/design')}>{t('dash.card.editDesign')}</Button>
          </Surface>

        </div>
      </div>
    </>
  );
}
