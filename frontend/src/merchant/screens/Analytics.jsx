import React, { useState } from 'react';
import { T, Surface, Stat, Donut, LineChart, FilterChip } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useApi } from '../hooks/useApi';
import api from '../api';

const PRESETS = [
  { labelKey: 'ana.range.7d',  days: 7 },
  { labelKey: 'ana.range.14d', days: 14 },
  { labelKey: 'ana.range.30d', days: 30 },
  { labelKey: 'ana.range.90d', days: 90 },
];

function toISODate(d) { return d.toISOString().slice(0, 10); }

export default function Analytics() {
  const { t, lang } = useLang();
  const locale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';

  const [preset, setPreset] = useState(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const isCustom = !!(customFrom && customTo);

  const dateFrom = isCustom ? customFrom : null;
  const dateTo   = isCustom ? customTo   : null;

  const { data: rfm }      = useApi(() => api.rfm().catch(() => null), []);
  const { data: trend }    = useApi(() => api.trend(preset, dateFrom, dateTo), [preset, dateFrom, dateTo]);
  const { data: branches } = useApi(() => api.branches().catch(() => []), []);
  const { data: cohort }   = useApi(() => api.cohort().catch(() => null), []);

  const trendSeries = (trend || []).map((p) => ({
    label: (p.date || '').slice(5),
    revenue: p.points_earned ?? 0,
    earned: (p.earn_count ?? 0) + (p.redeem_count ?? 0),
  }));

  return (
    <>
      <Topbar
        title={t('ana.title')}
        subtitle={`${(branches || []).length} ${t('nav.branches').toLowerCase()}`}
      />

      <div style={{ padding: '0 28px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--m-line)', paddingBottom: 14, paddingTop: 14 }}>
        {PRESETS.map(p => (
          <FilterChip
            key={p.days}
            active={!isCustom && preset === p.days}
            onClick={() => { setPreset(p.days); setCustomFrom(''); setCustomTo(''); }}
          >{t(p.labelKey)}</FilterChip>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <input
            type="date"
            value={customFrom}
            max={customTo || toISODate(new Date())}
            onChange={e => setCustomFrom(e.target.value)}
            style={{
              border: '1px solid var(--m-line-strong)', borderRadius: 8, padding: '5px 10px',
              fontSize: 12.5, color: 'var(--m-ink)', background: 'var(--m-surface)',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--m-ink-mute)' }}>—</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            max={toISODate(new Date())}
            onChange={e => setCustomTo(e.target.value)}
            style={{
              border: '1px solid var(--m-line-strong)', borderRadius: 8, padding: '5px 10px',
              fontSize: 12.5, color: 'var(--m-ink)', background: 'var(--m-surface)',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          {isCustom && (
            <button
              onClick={() => { setCustomFrom(''); setCustomTo(''); }}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--m-ink-mute)', fontSize: 14, padding: '0 4px' }}
            >✕</button>
          )}
        </div>
      </div>

      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <Stat accent="var(--m-brand)" label={t('ana.kpi.revenue')} value={`${(rfm?.total_points || 0).toLocaleString(locale)} ${t('common.currency')}`}/>
          <Stat accent="var(--m-good)"  label={t('ana.kpi.activeCustomers')} value={(rfm?.active_count || 0).toLocaleString(locale)}/>
          <Stat accent="#D4AF37"        label={t('ana.kpi.ltv')} value={`${(rfm?.avg_ltv || 0).toLocaleString(locale)} ${t('common.currency')}`}/>
          <Stat accent="#7C4A8C"        label={t('ana.kpi.retention')} value={rfm?.retention_30d != null ? `${rfm.retention_30d}%` : '—'}/>
          <Stat accent="var(--m-warn)"  label={t('ana.kpi.churn')} value={rfm?.churn_rate != null ? `${rfm.churn_rate}%` : '—'} deltaTone="good"/>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
          <Surface padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ ...T.h2 }}>{t('ana.chart.title')}</div>
                <div style={{ ...T.meta, marginTop: 2 }}>{t('ana.chart.subtitle')}</div>
              </div>
            </div>
            {trendSeries.length > 0 ? (
              <LineChart
                w={760} h={260}
                labels={trendSeries.map((p) => p.label)}
                series={[
                  { color: 'var(--m-brand)', fill: true, data: trendSeries.map((p) => p.revenue) },
                  { color: '#D4AF37', fill: false, data: trendSeries.map((p) => p.earned) },
                ]}
              />
            ) : (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--m-ink-faint)', fontSize: 12 }}>
                {t('dash.chart.empty')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 18, fontSize: 12, marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: 'var(--m-brand)', borderRadius: 2 }}/>
                {t('dash.chart.legend.points')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: '#D4AF37', borderRadius: 2 }}/>
                {t('dash.chart.legend.txn')}
              </span>
            </div>
          </Surface>

          <Surface padding={20}>
            <div style={{ ...T.h2, marginBottom: 4 }}>{t('ana.rfm.title')}</div>
            <div style={{ ...T.meta, marginBottom: 16 }}>{t('ana.rfm.subtitle')}</div>
            {(() => {
              const segs = [
                { name: t('ana.rfm.champions'), value: rfm?.segments?.champions || 0, color: 'var(--m-good)' },
                { name: t('ana.rfm.loyal'),     value: rfm?.segments?.loyal     || 0, color: 'var(--m-brand)' },
                { name: t('ana.rfm.atRisk'),    value: rfm?.segments?.at_risk   || 0, color: 'var(--m-warn)' },
                { name: t('ana.rfm.lost'),      value: rfm?.segments?.lost      || 0, color: 'var(--m-bad)' },
                { name: t('ana.rfm.new'),       value: rfm?.segments?.new       || 0, color: '#9CA3AF' },
              ];
              const total = segs.reduce((acc, s) => acc + s.value, 0);
              return (
                <>
                  <Donut
                    segments={total > 0
                      ? segs.map(s => ({ value: s.value, color: s.color }))
                      : [{ value: 1, color: 'var(--m-line)' }]
                    }
                    size={160}
                    label={total.toLocaleString(locale)}
                    sub={t('ana.donut.sub')}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 16 }}>
                    {segs.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                        <span style={{ width: 8, height: 8, background: s.color, borderRadius: 2 }}/>
                        <span style={{ flex: 1, color: 'var(--m-ink-soft)' }}>{s.name}</span>
                        <span style={{ color: 'var(--m-ink-mute)' }}>
                          {total > 0 ? Math.round(s.value / total * 100) : 0}%
                        </span>
                        <span style={{ fontFamily: 'var(--m-mono)', color: 'var(--m-ink)', fontWeight: 600, minWidth: 36, textAlign: 'right' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </Surface>
        </div>

        {(branches || []).length > 0 && (
          <Surface padding={20}>
            <div style={{ ...T.h2, marginBottom: 14 }}>{t('ana.branches.title')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(branches || []).map((b, i) => (
                <div key={b.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--m-ink)', fontWeight: 500 }}>{b.name || '—'}</span>
                  {b.address && <span style={{ fontSize: 12, color: 'var(--m-ink-mute)' }}>{b.address}</span>}
                </div>
              ))}
            </div>
          </Surface>
        )}
      </div>
    </>
  );
}
