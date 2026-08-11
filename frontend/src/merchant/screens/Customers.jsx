import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  I, Button, Surface, Input, Avatar,
  Th, Td, FilterChip, EmptyState,
} from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { fmtDate } from '../i18n/date';
import { useApi } from '../hooks/useApi';
import api from '../api';

function fmtTime(iso, t, lang) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  const locale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
  if (diff < 60) return t('common.now');
  if (diff < 3600) return `${Math.floor(diff / 60)} ${t('common.min_ago')}`;
  if (diff < 86400) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} ${t('common.days_ago')}`;
  return fmtDate(d, lang, { year: false });
}

function generateCsv(data, filename, headers) {
  const rows = data.map(c => [
    c.holder_name || c.name || '',
    c.holder_phone || c.phone || '',
    c.points ?? c.balance ?? 0,
    c.visits ?? 0,
    c.last_visit_at || c.last_used_at || '',
    c.segment || '',
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const EXPORT_PERIODS = [7, 14, 30, 60, 90];

function ExportModal({ onClose, currentList }) {
  const { t } = useLang();
  const [filter, setFilter] = useState('current');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);

  const exportOptions = [
    { id: 'all',      label: t('cust.export.all') },
    { id: 'active',   label: t('cust.export.active') },
    { id: 'inactive', label: t('cust.export.inactive') },
    { id: 'current',  label: t('cust.export.current') },
  ];

  const csvHeaders = [t('cust.col.client'), t('cust.col.balance'), t('cust.col.lifetime'), t('cust.col.visits'), t('cust.col.lastVisit'), 'Segment'];

  async function doExport() {
    setLoading(true);
    try {
      let data = currentList;
      const suffix = new Date().toISOString().slice(0, 10);
      let filename = `monvo-mijozlar-${suffix}.csv`;

      if (filter === 'all') {
        data = await api.customers({ limit: 500 });
        filename = `monvo-barcha-${suffix}.csv`;
      } else if (filter === 'active') {
        data = await api.customers({ segment: 'active', limit: 500 });
        filename = `monvo-faol-${suffix}.csv`;
      } else if (filter === 'inactive') {
        data = await api.customers({ inactive_days: days, limit: 500 });
        filename = `monvo-kelmagan-${days}kun-${suffix}.csv`;
      }

      generateCsv(Array.isArray(data) ? data : (data?.customers || []), filename, csvHeaders);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--m-paper)', borderRadius: 16, padding: 28, width: 400,
          boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid var(--m-line)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--m-ink)' }}>{t('cust.export.title')}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--m-ink-mute)', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {exportOptions.map(opt => (
            <label
              key={opt.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                borderRadius: 10, cursor: 'pointer',
                background: filter === opt.id ? 'var(--m-brand-soft)' : 'var(--m-surface-alt)',
                border: `1px solid ${filter === opt.id ? 'var(--m-brand)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              <input
                type="radio"
                name="exportFilter"
                value={opt.id}
                checked={filter === opt.id}
                onChange={() => setFilter(opt.id)}
                style={{ marginTop: 2, accentColor: 'var(--m-brand)' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-ink)' }}>{opt.label}</div>
                {opt.id === 'current' && (
                  <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)', marginTop: 2 }}>
                    {t('cust.export.currentCount', { n: currentList.length })}
                  </div>
                )}
                {opt.id === 'inactive' && filter === 'inactive' && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {EXPORT_PERIODS.map(d => (
                      <div
                        key={d}
                        onClick={e => { e.preventDefault(); setDays(d); }}
                        style={{
                          padding: '4px 12px', borderRadius: 14, cursor: 'pointer', fontSize: 12,
                          fontWeight: 500,
                          background: days === d ? 'var(--m-brand)' : 'var(--m-paper)',
                          color: days === d ? '#fff' : 'var(--m-ink-mute)',
                          border: `1px solid ${days === d ? 'var(--m-brand)' : 'var(--m-line)'}`,
                        }}
                      >
                        {t('cust.inactive_period', { d })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={<I.download/>} onClick={doExport} disabled={loading}>
            {loading ? t('common.loading') : t('cust.export.submit')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function NewCustomerModal({ onClose, onCreated }) {
  const { t } = useLang();
  const [form, setForm] = useState({ name: '', phone: '', birthday: '', notes: '', tags: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError(t('cust.add.err.noName')); return; }
    if (!form.phone.trim()) { setError(t('cust.add.err.noPhone')); return; }
    setLoading(true);
    setError('');
    try {
      const tags = form.tags.split(',').map(tg => tg.trim()).filter(Boolean);
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        ...(form.birthday ? { birthday: form.birthday } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        ...(tags.length ? { tags } : {}),
      };
      const result = await api.createCustomer(body);
      onCreated(result);
    } catch (err) {
      setError(err?.message || err?.detail || t('cust.add.err.generic'));
    } finally {
      setLoading(false);
    }
  }

  const fieldStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13,
    border: '1px solid var(--m-line)', background: 'var(--m-surface-alt)',
    color: 'var(--m-ink)', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 500, letterSpacing: '0.4px', color: 'var(--m-ink-mute)',
    textTransform: 'uppercase', marginBottom: 5, display: 'block',
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--m-paper)', borderRadius: 16, padding: 28, width: 440, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid var(--m-line)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--m-ink)' }}>{t('cust.add.title')}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--m-ink-mute)', lineHeight: 1 }}>✕</button>
        </div>
        <form onSubmit={submit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>{t('cust.add.name')}</label>
              <input style={fieldStyle} placeholder={t('cust.add.namePlaceholder')} value={form.name} onChange={set('name')} />
            </div>
            <div>
              <label style={labelStyle}>{t('cust.add.phone')}</label>
              <input style={fieldStyle} placeholder={t('cust.add.phonePlaceholder')} value={form.phone} onChange={set('phone')} type="tel" />
            </div>
            <div>
              <label style={labelStyle}>{t('cust.add.birthday')}</label>
              <input style={fieldStyle} type="date" value={form.birthday} onChange={set('birthday')} />
            </div>
            <div>
              <label style={labelStyle}>{t('cust.add.tags')}</label>
              <input style={fieldStyle} placeholder={t('cust.add.tagsPlaceholder')} value={form.tags} onChange={set('tags')} />
            </div>
            <div>
              <label style={labelStyle}>{t('cust.add.notes')}</label>
              <textarea
                style={{ ...fieldStyle, resize: 'vertical', minHeight: 72 }}
                placeholder={t('cust.add.notesPlaceholder')}
                value={form.notes}
                onChange={set('notes')}
              />
            </div>
          </div>
          {error && <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--m-bad)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
            <Button variant="primary" type="submit" icon={<I.user/>} disabled={loading}>
              {loading ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default function Customers() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [segment, setSegment] = useState('all');
  const [query, setQuery] = useState('');
  const [inactiveDays, setInactiveDays] = useState('');
  const [showPeriods, setShowPeriods] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const PERIODS = [7, 14, 30, 60, 90];

  const SEGMENTS = [
    { id: 'all', label: t('cust.seg.all') },
    { id: 'active', label: t('cust.seg.active') },
  ];

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  const { data: counts } = useApi(() => api.segmentCounts(), [refreshKey]);
  const { data: customers, loading } = useApi(
    () => api.customers({
      segment: inactiveDays ? undefined : (segment !== 'all' ? segment : undefined),
      q: query || undefined,
      inactive_days: inactiveDays ? parseInt(inactiveDays, 10) : undefined,
    }),
    [segment, query, inactiveDays, refreshKey]
  );

  const list = Array.isArray(customers) ? customers : [];

  // Loyalty modeli — stamp bo'lsa balans o'rniga shtamp (X/N) ko'rsatamiz.
  // Cashback ballari saqlanib qoladi (qayta cashback'ga o'tilganda ko'rinadi).
  const { data: me } = useApi(() => api.me(), [refreshKey]);
  const isStamp = me?.loyalty_type === 'stamp';
  const stampThreshold = me?.stamp_threshold || 7;

  const segCount = (id) => {
    if (!counts) return null;
    if (id === 'all') return counts.total ?? counts.all;
    return counts[id];
  };

  return (
    <>
      <Topbar
        title={t('cust.title')}
        subtitle={counts?.total != null
          ? t('cust.subtitle', { total: counts.total.toLocaleString('ru-RU'), sleep: counts.sleeping || 0 })
          : t('cust.subtitleNone')}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" icon={<I.user/>} onClick={() => setShowCreate(true)}>
              {t('cust.new')}
            </Button>
            <Button variant="secondary" icon={<I.download/>} onClick={() => setShowExport(true)}>
              {t('common.export')}
            </Button>
          </div>
        }
      />

      <div style={{ padding: '20px 28px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            icon={<I.search/>}
            placeholder={t('cust.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 320 }}
          />
          <div style={{ width: 1, height: 22, background: 'var(--m-line)', margin: '0 4px' }}/>
          {SEGMENTS.map((s) => {
            const c = segCount(s.id);
            return (
              <FilterChip
                key={s.id}
                active={!inactiveDays && segment === s.id}
                onClick={() => { setSegment(s.id); setInactiveDays(''); setShowPeriods(false); }}
              >
                {s.label}{c != null ? ` · ${c}` : ''}
              </FilterChip>
            );
          })}
          <div style={{ width: 1, height: 22, background: 'var(--m-line)', margin: '0 4px' }}/>
          <FilterChip
            active={!!inactiveDays || showPeriods}
            onClick={() => setShowPeriods(s => !s)}
          >
            {inactiveDays ? t('cust.inactive_period', { d: inactiveDays }) : t('cust.inactive')}
            <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>{showPeriods ? '▲' : '▼'}</span>
            {inactiveDays && (
              <span
                style={{ marginLeft: 4, opacity: 0.6, padding: '0 2px' }}
                onClick={e => { e.stopPropagation(); setInactiveDays(''); setShowPeriods(false); }}
              >✕</span>
            )}
          </FilterChip>
        </div>

        {showPeriods && (
          <div style={{ display: 'flex', gap: 6, paddingLeft: 2 }}>
            {PERIODS.map(d => (
              <FilterChip
                key={d}
                active={inactiveDays === String(d)}
                onClick={() => { setInactiveDays(String(d)); setShowPeriods(false); setSegment('all'); }}
              >
                {t('cust.inactive_period', { d })}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 28px 28px' }}>
        <Surface padding={0}>
          {loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>
              {t('common.loading')}
            </div>
          )}
          {!loading && list.length === 0 && (
            <EmptyState
              title={t('cust.empty.title')}
              sub={query ? t('cust.empty.subSearch') : t('cust.empty.sub')}
            />
          )}
          {!loading && list.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>{t('cust.col.client')}</Th>
                  <Th align="right">{t('cust.col.balance')}</Th>
                  <Th align="right">{t('cust.col.lifetime')}</Th>
                  <Th align="right">{t('cust.col.visits')}</Th>
                  <Th>{t('cust.col.lastVisit')}</Th>
                  <Th w={36}/>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const name = c.name || c.holder_name || c.full_name || '—';
                  return (
                    <tr
                      key={c.card_uid || c.id}
                      onClick={() => navigate(`/customers/${c.card_uid || c.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={name} size={32}/>
                          <div>
                            <div style={{ color: 'var(--m-ink)', fontWeight: 500, fontSize: 13 }}>
                              {name}
                            </div>
                            <div style={{ color: 'var(--m-ink-mute)', fontSize: 11.5, fontFamily: 'var(--m-mono)' }}>
                              {c.phone || c.holder_phone || c.card_uid || '—'}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td align="right" mono>
                        <span style={{ color: 'var(--m-ink)', fontWeight: 600 }}>
                          {isStamp
                            ? `${c.stamp_count ?? 0}/${stampThreshold}`
                            : (c.balance ?? c.points ?? 0).toLocaleString('ru-RU')}
                        </span>
                      </Td>
                      <Td align="right" mono style={{ color: 'var(--m-ink-soft)' }}>
                        {(c.total_revenue ?? c.lifetime_value ?? c.lifetime ?? 0).toLocaleString('ru-RU')} {t('common.currency')}
                      </Td>
                      <Td align="right" mono>{c.visits ?? c.transactions_count ?? 0}</Td>
                      <Td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {c.segment === 'sleeping' && <span style={{ width: 6, height: 6, background: 'var(--m-warn)', borderRadius: '50%' }}/>}
                          {c.segment === 'churned'  && <span style={{ width: 6, height: 6, background: 'var(--m-bad)',  borderRadius: '50%' }}/>}
                          {fmtTime(c.last_visit_at || c.last_seen_at, t, lang)}
                        </span>
                      </Td>
                      <Td><I.more size={16} style={{ color: 'var(--m-ink-mute)', cursor: 'pointer' }}/></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Surface>
      </div>

      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} currentList={list}/>
      )}
      {showCreate && (
        <NewCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={(created) => {
            setShowCreate(false);
            refresh();
            if (created?.card_uid) navigate(`/customers/${created.card_uid}`);
          }}
        />
      )}
    </>
  );
}
