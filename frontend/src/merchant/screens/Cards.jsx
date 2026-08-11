import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  I, T, Button, Surface, Input, Badge, Avatar,
  Th, Td, EmptyState,
} from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useApi } from '../hooks/useApi';
import api from '../api';

export default function Cards() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const { data: stats } = useApi(() => api.stats(), []);
  const { data: cards, loading } = useApi(() => api.cardsList({ q: query || undefined }), [query]);

  const list = Array.isArray(cards) ? cards : [];

  const filtered = tab === 'blocked'
    ? list.filter((c) => c.is_blocked || c.status === 'blocked')
    : list;

  const cardsTotal = stats?.cards_total ?? list.length;
  const cardsActive = stats?.cards_active ?? list.length;

  return (
    <>
      <Topbar
        title={t('cards.title')}
        subtitle={t('cards.subtitle', { total: cardsTotal, active: cardsActive })}
        actions={
          <>
            <Button variant="secondary" icon={<I.sparkles/>} onClick={() => navigate('/design')}>{t('nav.design')}</Button>
            <Button variant="primary" icon={<I.plus/>}>{t('cards.issue')}</Button>
          </>
        }
        tabs={[
          { label: t('common.all'), count: list.length, active: tab === 'all', onClick: () => setTab('all') },
        ]}
      />

      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Surface padding={0}>
          <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Input
              icon={<I.search/>}
              placeholder={t('cust.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: 320 }}
            />
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--m-ink-mute)' }}>
              {t('common.all')}: <span style={{ color: 'var(--m-ink)', fontFamily: 'var(--m-mono)', fontWeight: 500 }}>{filtered.length}</span>
            </span>
          </div>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>{t('common.loading')}</div>}
          {!loading && filtered.length === 0 && <EmptyState title={t('cust.empty.title')} sub={t('cust.empty.sub')}/>}
          {!loading && filtered.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <Th>{t('cards.col.uid')}</Th>
                  <Th>{t('cards.col.holder')}</Th>
                  <Th align="right">{t('cards.col.balance')}</Th>
                  <Th>{t('cards.col.issued')}</Th>
                  <Th>{t('cards.col.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const blocked = c.is_blocked || c.status === 'blocked';
                  const issued = c.issued_at || c.created_at;
                  return (
                    <tr
                      key={c.card_uid || c.id}
                      onClick={() => navigate(`/customers/${c.card_uid || c.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <Td mono>
                        <span style={{ color: 'var(--m-brand)', fontWeight: 600 }}>
                          {c.card_uid || c.id || '—'}
                        </span>
                      </Td>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Avatar name={c.name || c.holder_name || '?'} size={28}/>
                          <span style={{ color: 'var(--m-ink)', fontWeight: 500 }}>{c.name || c.holder_name || '—'}</span>
                        </div>
                      </Td>
                      <Td align="right" mono>
                        <span style={{ color: 'var(--m-ink)', fontWeight: 600 }}>
                          {(c.balance ?? c.points ?? 0).toLocaleString('ru-RU')}
                        </span>
                      </Td>
                      <Td>{issued ? new Date(issued).toLocaleDateString('ru-RU') : '—'}</Td>
                      <Td>
                        {blocked
                          ? <Badge tone="bad" dot>{t('cards.status.blocked')}</Badge>
                          : <Badge tone="good" dot>{t('cards.status.active')}</Badge>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Surface>
      </div>
    </>
  );
}
