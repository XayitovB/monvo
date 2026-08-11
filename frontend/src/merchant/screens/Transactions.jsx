import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  I, Button, Surface, Input, Stat, Th, Td, FilterChip, EmptyState,
} from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useApi } from '../hooks/useApi';
import api from '../api';
import {
  fmtTimeAndDate, fmtMonthLabel, monthRangeIso, currentMonthYYYYMM,
} from '../../utils/datetime';

function _saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function downloadCsv(rows, filename) {
  const csv = rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  // BOM (﻿) so Excel/Numbers detect UTF-8 reliably.
  _saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}

function downloadJson(items, filename) {
  const body = JSON.stringify(items, null, 2);
  _saveBlob(new Blob([body], { type: 'application/json;charset=utf-8' }), filename);
}

export default function Transactions() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState(currentMonthYYYYMM());
  const [exportOpen, setExportOpen] = useState(false);

  const { data: stats } = useApi(() => api.stats(), []);
  const { from: fromIso, to: toIso } = monthRangeIso(month);
  const { data: txns, loading } = useApi(
    () => api.transactionsList({
      q: query || undefined,
      type: tab === 'all' ? undefined : tab,
      from_date: fromIso,
      to_date: toIso,
    }),
    [tab, query, month]
  );

  const list = Array.isArray(txns) ? txns : [];

  const monthLabel = useMemo(() => {
    if (!month) return t('dash.month');
    const [y, m] = month.split('-').map(Number);
    return fmtMonthLabel(new Date(Date.UTC(y, m - 1, 15)), lang);
  }, [month, lang]);

  const exportAs = (format) => {
    setExportOpen(false);
    if (format === 'csv') {
      const rows = [
        ['ID', t('tx.col.time'), t('tx.col.customer'), t('tx.col.type'), t('tx.col.amount'), t('tx.col.points'), t('tx.col.staff'), t('tx.col.branch')],
        ...list.map((tx) => [
          `TX-${tx.id}`,
          fmtTimeAndDate(tx.created_at, lang === 'uz' ? 'uz-UZ' : 'ru-RU'),
          tx.customer_name || tx.holder_name || '',
          tx.tx_type || tx.type || '',
          tx.amount ?? '',
          tx.points_delta ?? tx.points ?? 0,
          tx.staff_name || '',
          tx.branch_name || '',
        ]),
      ];
      downloadCsv(rows, `transactions-${month}.csv`);
    } else if (format === 'json') {
      downloadJson(list, `transactions-${month}.json`);
    }
  };

  const typeBg = (type) => ({
    earn:   { bg: 'var(--m-brand-soft)', fg: 'var(--m-brand-ink)', label: t('tx.type.earn') },
    redeem: { bg: '#FEF3C7', fg: '#92400E', label: t('tx.type.redeem') },
    refund: { bg: 'var(--m-bad-soft)', fg: 'var(--m-bad)', label: t('tx.type.refund') },
    manual: { bg: 'var(--m-surface-alt)', fg: 'var(--m-ink-soft)', label: t('tx.type.manual') },
  })[type] || { bg: 'var(--m-surface-alt)', fg: 'var(--m-ink-soft)', label: type || '—' };

  return (
    <>
      <Topbar
        title={t('tx.title')}
        subtitle={t('tx.subtitle')}
        actions={
          <>
            <MonthPicker
              value={month}
              onChange={setMonth}
              label={monthLabel}
              lang={lang}
              t={t}
            />
            <Button variant="secondary" icon={<I.download/>} onClick={() => setExportOpen(true)} disabled={list.length === 0}>{t('common.export')}</Button>
          </>
        }
      />

      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <Stat label={t('tx.kpi.txn')} value={list.length.toLocaleString('ru-RU')}/>
          <Stat label={t('tx.kpi.issued')} value={(stats?.points_issued ?? 0).toLocaleString('ru-RU')}/>
          <Stat label={t('tx.kpi.redeemed')} value={(stats?.points_redeemed ?? 0).toLocaleString('ru-RU')}/>
          <Stat label={t('tx.kpi.cards')} value={(stats?.cards_active ?? 0).toLocaleString('ru-RU')}/>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            icon={<I.search/>}
            placeholder={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 320 }}
          />
          <FilterChip active={tab === 'all'} onClick={() => setTab('all')}>{t('common.all')} · {list.length}</FilterChip>
          <FilterChip active={tab === 'earn'} onClick={() => setTab('earn')}>{t('tx.type.earn')}</FilterChip>
          <FilterChip active={tab === 'redeem'} onClick={() => setTab('redeem')}>{t('tx.type.redeem')}</FilterChip>
          <FilterChip active={tab === 'refund'} onClick={() => setTab('refund')}>{t('tx.type.refund')}</FilterChip>
          <FilterChip active={tab === 'manual'} onClick={() => setTab('manual')}>{t('tx.type.manual')}</FilterChip>
        </div>

        <Surface padding={0}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>{t('common.loading')}</div>}
          {!loading && list.length === 0 && <EmptyState title={t('tx.empty')}/>}
          {!loading && list.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th w={120}>{t('tx.col.id')}</Th>
                  <Th>{t('tx.col.time')}</Th>
                  <Th>{t('tx.col.customer')}</Th>
                  <Th>{t('tx.col.type')}</Th>
                  <Th align="right">{t('tx.col.amount')}</Th>
                  <Th align="right">{t('tx.col.points')}</Th>
                  <Th>{t('tx.col.staff')}</Th>
                  <Th>{t('tx.col.branch')}</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((tx) => {
                  const type = tx.tx_type || tx.type || 'earn';
                  const tBadge = typeBg(type);
                  const points = tx.points_delta ?? tx.points ?? 0;
                  const positive = points > 0;
                  return (
                    <tr key={tx.id}>
                      <Td mono><span style={{ color: 'var(--m-brand)', fontWeight: 500 }}>#TX-{tx.id}</span></Td>
                      <Td mono style={{ color: 'var(--m-ink-mute)' }}>{fmtTimeAndDate(tx.created_at, lang === 'uz' ? 'uz-UZ' : 'ru-RU')}</Td>
                      <Td>{tx.customer_name || tx.holder_name || '—'}</Td>
                      <Td>
                        <span style={{ background: tBadge.bg, color: tBadge.fg, padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 500 }}>
                          {tBadge.label}
                        </span>
                      </Td>
                      <Td align="right" mono>{tx.amount != null ? `${Number(tx.amount).toLocaleString('ru-RU')} сум` : '—'}</Td>
                      <Td align="right">
                        <span style={{ fontFamily: 'var(--m-mono)', fontWeight: 600, color: positive ? 'var(--m-good)' : 'var(--m-bad)' }}>
                          {positive ? '+' : ''}{points}
                        </span>
                      </Td>
                      <Td>{tx.staff_name || '—'}</Td>
                      <Td>{tx.branch_name || '—'}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Surface>
      </div>

      {exportOpen && (
        <ExportFormatModal
          t={t}
          onCancel={() => setExportOpen(false)}
          onPick={exportAs}
        />
      )}
    </>
  );
}

function ExportFormatModal({ t, onCancel, onPick }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const card = (id, title, sub) => (
    <button
      key={id}
      onClick={() => onPick(id)}
      style={{
        width: '100%', textAlign: 'left',
        padding: '14px 16px', borderRadius: 12,
        background: 'var(--m-surface)', border: '1px solid var(--m-border)',
        cursor: 'pointer', transition: 'border-color .15s, background .15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--m-surface-alt)'; e.currentTarget.style.borderColor = 'var(--m-brand)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--m-surface)'; e.currentTarget.style.borderColor = 'var(--m-border)'; }}
    >
      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--m-ink)' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--m-ink-soft)', marginTop: 2 }}>{sub}</div>
    </button>
  );

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(15,23,32,.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%', maxWidth: 420,
          background: 'var(--m-surface)',
          border: '1px solid var(--m-border)',
          borderRadius: 16,
          padding: 22,
          boxShadow: '0 24px 60px rgba(15,23,32,.25)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{t('export.title')}</div>
        <div style={{ fontSize: 13, color: 'var(--m-ink-soft)', marginBottom: 16 }}>{t('export.sub')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {card('csv', t('export.csv_title'), t('export.csv_sub'))}
          {card('json', t('export.json_title'), t('export.json_sub'))}
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px', borderRadius: 10,
              background: 'transparent', border: '1px solid var(--m-border)',
              fontSize: 13, fontWeight: 600, color: 'var(--m-ink-soft)', cursor: 'pointer',
            }}
          >
            {t('export.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// Month picker — joriy oydan 23 oy orqaga ro'yxat. Native <input type="month">
// `showPicker()` Safari'da ishlamaydi va opacity-0 input button onClick'ni
// to'sib qo'yardi — shuning uchun custom popup ishlatamiz.
function MonthPicker({ value, onChange, label, lang }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const months = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 0; i < 24; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
      const yyyymm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key: yyyymm, label: fmtMonthLabel(d, lang) });
    }
    return out;
  }, [lang]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <Button
        variant="secondary"
        icon={<I.calendar/>}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </Button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
            minWidth: 200, maxHeight: 320, overflowY: 'auto',
            background: 'var(--m-surface)', border: '1px solid var(--m-border)',
            borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,32,.12)',
            padding: 6,
          }}
        >
          {months.map((m) => {
            const active = m.key === value;
            return (
              <button
                key={m.key}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(m.key); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', borderRadius: 8, border: 'none',
                  background: active ? 'var(--m-brand-soft)' : 'transparent',
                  color: active ? 'var(--m-brand-ink)' : 'var(--m-ink)',
                  fontWeight: active ? 600 : 500, fontSize: 14, cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--m-surface-alt)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
