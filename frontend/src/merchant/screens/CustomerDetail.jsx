import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
  I, T, Button, Surface, Stat, Badge, LoyaltyCardMini, Input, Field,
} from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useApi } from '../hooks/useApi';
import api from '../api';

// Portal modal — renders at document.body to avoid stacking context issues
function Modal({ title, onClose, children }) {
  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--m-paper)', borderRadius: 16, padding: 28, width: 420,
          boxShadow: '0 24px 64px rgba(0,0,0,0.25)', border: '1px solid var(--m-line)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--m-ink)' }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--m-ink-mute)', lineHeight: 1, padding: '0 4px' }}
          >✕</button>
        </div>
        {children}
      </div>
    </div>,
    // .merchant-root ichiga portal qilamiz — aks holda --m-* CSS o'zgaruvchilari
    // (fon, matn rangi) meros bo'lmaydi va modal shaffof bo'lib qoladi.
    document.querySelector('.merchant-root') || document.body
  );
}

function fmtNum(n) {
  return (n ?? 0).toLocaleString('ru-RU');
}

export default function CustomerDetail() {
  const { t, lang } = useLang();
  const locale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const { data: detail, loading, reload } = useApi(() => api.customerDetail(id), [id]);

  const card = detail?.card || {};
  const stats = detail?.stats || {};
  const transactions = detail?.transactions || [];

  const redeemTxs = transactions.filter(tx => tx.tx_type === 'redeem');

  // Ball berish modal
  const [showPoints, setShowPoints] = useState(false);
  const [pointsForm, setPointsForm] = useState({ delta: '', note: '' });
  const [pointsSaving, setPointsSaving] = useState(false);
  const [pointsError, setPointsError] = useState('');

  async function handleAdjustPoints() {
    setPointsError('');
    const delta = parseInt(pointsForm.delta, 10);
    if (!pointsForm.delta || isNaN(delta) || delta === 0) {
      setPointsError(t('cd.error.zeroPoints'));
      return;
    }
    setPointsSaving(true);
    try {
      await api.adjustPoints(id, { delta, note: pointsForm.note.trim() });
      setShowPoints(false);
      setPointsForm({ delta: '', note: '' });
      reload();
    } catch (err) {
      setPointsError(err?.detail || err?.message || t('cd.error.generic'));
    } finally {
      setPointsSaving(false);
    }
  }

  const tabs = [
    { label: t('cd.tabs.overview'), onClick: () => setActiveTab(0), active: activeTab === 0 },
    { label: t('cd.tabs.transactions'), count: transactions.length, onClick: () => setActiveTab(1), active: activeTab === 1 },
    { label: t('cd.tabs.rewards'), count: redeemTxs.length, onClick: () => setActiveTab(2), active: activeTab === 2 },
  ];

  return (
    <>
      <Topbar
        breadcrumb={[t('nav.customers'), card.holder_name || card.name || id]}
        title={card.holder_name || card.name || id}
        subtitle={card.holder_phone || card.phone || card.card_uid || '—'}
        actions={
          <>
            <Button variant="secondary" icon={<I.bell/>} onClick={() => navigate('/push')}>
              {t('cd.actions.push')}
            </Button>
            <Button
              variant="secondary"
              icon={<I.gift/>}
              onClick={() => { setPointsError(''); setPointsForm({ delta: '', note: '' }); setShowPoints(true); }}
            >
              {t('cd.actions.givePoints')}
            </Button>
          </>
        }
        tabs={tabs}
      />

      {/* ── Tab 0: Umumiy ───────────────────────────────────────────────────── */}
      {activeTab === 0 && (
        <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Surface padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <LoyaltyCardMini brand={card.merchant_name || 'Monvo'} balance={card.balance ?? card.points ?? 0} full/>
              <div>
                <div style={{ fontSize: 11, color: 'var(--m-ink-mute)' }}>{t('cust.col.balance')}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--m-ink)', fontFamily: 'var(--m-mono)' }}>
                  {fmtNum(card.balance ?? card.points)} ★
                </div>
              </div>
            </Surface>

            <Surface padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ ...T.h2, fontSize: 14 }}>{t('cd.facts.title')}</div>
              {[
                [t('cd.facts.ltv'), `${fmtNum(stats.total_revenue ?? stats.lifetime_value)} ${t('common.currency')}`, 'mono'],
                [t('cd.facts.visits'), stats.total_visits ?? stats.transactions_count ?? 0],
                [t('cd.facts.avgCheck'), stats.avg_check != null ? `${fmtNum(stats.avg_check)} ${t('common.currency')}` : '—', 'mono'],
                [t('cd.facts.lastVisit'), card.last_used_at ? new Date(card.last_used_at).toLocaleDateString(locale) : '—'],
              ].map(([k, v, type], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--m-ink-mute)' }}>{k}</span>
                  <span style={{
                    color: 'var(--m-ink)', fontWeight: 500,
                    fontFamily: type === 'mono' ? 'var(--m-mono)' : 'inherit',
                  }}>{v}</span>
                </div>
              ))}
            </Surface>

            <Surface padding={18}>
              <div style={{ ...T.h2, fontSize: 14, marginBottom: 10 }}>{t('cd.tags.title')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(card.tags || []).map((tg, i) => <Badge key={i}>{tg}</Badge>)}
                {(!card.tags || card.tags.length === 0) && (
                  <span style={{ fontSize: 12, color: 'var(--m-ink-mute)' }}>—</span>
                )}
              </div>
            </Surface>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <Stat label={t('cd.kpi.visits30')} value={stats.visits_30d ?? 0}/>
              <Stat label={t('cd.kpi.spent30')} value={`${fmtNum(stats.spent_30d)} ${t('common.currency')}`}/>
              <Stat label={t('cd.kpi.earned')} value={fmtNum(stats.points_earned_total ?? stats.total_visits)}/>
              <Stat label={t('cd.kpi.spent')} value={fmtNum(stats.points_spent_total)}/>
            </div>

            <Surface padding={0}>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ ...T.h2 }}>{t('cd.timeline.title')}</div>
              </div>
              <div style={{ padding: '0 20px 20px' }}>
                {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>{t('common.loading')}</div>}
                {!loading && transactions.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>{t('cd.timeline.empty')}</div>
                )}
                {transactions.slice(0, 10).map((tx, i) => (
                  <TxRow key={tx.id || i} tx={tx} i={i} total={Math.min(transactions.length, 10)} t={t} locale={locale}/>
                ))}
                {transactions.length > 10 && (
                  <div
                    style={{ textAlign: 'center', paddingTop: 12, fontSize: 13, color: 'var(--m-brand)', cursor: 'pointer' }}
                    onClick={() => setActiveTab(1)}
                  >
                    {t('cd.timeline.viewAll', { count: transactions.length })}
                  </div>
                )}
              </div>
            </Surface>
          </div>
        </div>
      )}

      {/* ── Tab 1: Tranzaksiyalar ────────────────────────────────────────────── */}
      {activeTab === 1 && (
        <div style={{ padding: '20px 28px 40px' }}>
          <Surface padding={0}>
            {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>{t('common.loading')}</div>}
            {!loading && transactions.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 13 }}>{t('cd.timeline.empty')}</div>
            )}
            {!loading && transactions.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>{t('cd.tx.col.type')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('cd.tx.col.amount')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('cd.tx.col.points')}</th>
                    <th style={thStyle}>{t('cd.tx.col.note')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('cd.tx.col.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, i) => {
                    const isPlus = (tx.points_delta ?? 0) >= 0;
                    return (
                      <tr key={tx.id || i} style={{ borderBottom: '1px solid var(--m-line)' }}>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontSize: 12, padding: '3px 8px', borderRadius: 6,
                            background: tx.tx_type === 'redeem' ? '#FEF3C7' : tx.tx_type === 'manual' ? 'var(--m-warn-soft)' : 'var(--m-good-soft)',
                            color: tx.tx_type === 'redeem' ? '#92400E' : tx.tx_type === 'manual' ? 'var(--m-warn)' : 'var(--m-good)',
                          }}>
                            {tx.tx_type === 'earn' ? t('cd.tx.type.earn') : tx.tx_type === 'redeem' ? t('cd.tx.type.redeem') : t('cd.tx.type.manual')}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--m-mono)', fontSize: 13 }}>
                          {tx.amount > 0 ? `${fmtNum(tx.amount)} ${t('common.currency')}` : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--m-mono)', fontSize: 13, color: isPlus ? 'var(--m-good)' : 'var(--m-bad)', fontWeight: 600 }}>
                          {isPlus ? '+' : ''}{tx.points_delta ?? 0} ★
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--m-ink-mute)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.note || '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--m-mono)', fontSize: 12, color: 'var(--m-ink-mute)', whiteSpace: 'nowrap' }}>
                          {tx.created_at ? new Date(tx.created_at).toLocaleString(locale) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Surface>
        </div>
      )}

      {/* ── Tab 2: Mukofotlar ────────────────────────────────────────────────── */}
      {activeTab === 2 && (
        <div style={{ padding: '20px 28px 40px' }}>
          <Surface padding={0}>
            {redeemTxs.length === 0 && (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 13 }}>
                {t('cd.rewards.empty')}
              </div>
            )}
            {redeemTxs.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>{t('cd.rewards.col.reward')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('cd.rewards.col.spent')}</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{t('cd.rewards.col.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {redeemTxs.map((tx, i) => (
                    <tr key={tx.id || i} style={{ borderBottom: '1px solid var(--m-line)' }}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <I.gift size={14} style={{ color: '#92400E' }}/>
                          </div>
                          <span style={{ fontSize: 13, color: 'var(--m-ink)' }}>{tx.note || t('cd.rewards.default')}</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--m-mono)', fontSize: 13, color: 'var(--m-bad)', fontWeight: 600 }}>
                        {tx.points_delta ?? 0} ★
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--m-mono)', fontSize: 12, color: 'var(--m-ink-mute)', whiteSpace: 'nowrap' }}>
                        {tx.created_at ? new Date(tx.created_at).toLocaleString(locale) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Surface>
        </div>
      )}

      {/* ── Ball berish modal ────────────────────────────────────────────────── */}
      {showPoints && (
        <Modal title={t('cd.actions.givePoints')} onClose={() => setShowPoints(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--m-ink-mute)' }}>
              {t('cd.points.balance')}{' '}
              <strong style={{ color: 'var(--m-ink)', fontFamily: 'var(--m-mono)' }}>
                {fmtNum(card.balance ?? card.points)} ★
              </strong>
            </div>
            <Field label={t('cd.points.amount')}>
              <Input
                type="number"
                placeholder={t('cd.points.amountPlaceholder')}
                value={pointsForm.delta}
                onChange={e => setPointsForm(f => ({ ...f, delta: e.target.value }))}
                autoFocus
              />
            </Field>
            <Field label={t('cd.points.note')}>
              <Input
                placeholder={t('cd.points.notePlaceholder')}
                value={pointsForm.note}
                onChange={e => setPointsForm(f => ({ ...f, note: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAdjustPoints()}
              />
            </Field>
            {pointsError && (
              <div style={{ fontSize: 12.5, color: 'var(--m-bad)', padding: '8px 12px', background: 'var(--m-bad-soft)', borderRadius: 8 }}>
                {pointsError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button variant="secondary" onClick={() => setShowPoints(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={handleAdjustPoints} disabled={pointsSaving}>
                {pointsSaving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

const thStyle = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
  color: 'var(--m-ink-mute)', textTransform: 'uppercase', textAlign: 'left',
  borderBottom: '1px solid var(--m-line)', background: 'var(--m-paper-alt)',
};
const tdStyle = { padding: '12px 16px', fontSize: 13, color: 'var(--m-ink)' };

function TxRow({ tx, i, total, t, locale }) {
  const isPlus = (tx.points_delta ?? 0) >= 0;
  return (
    <div style={{ display: 'flex', gap: 14, paddingTop: 6 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: tx.tx_type === 'redeem' ? '#FEF3C7' : tx.tx_type === 'manual' ? 'var(--m-warn-soft)' : 'var(--m-brand-soft)',
          color: tx.tx_type === 'redeem' ? '#92400E' : tx.tx_type === 'manual' ? 'var(--m-warn)' : 'var(--m-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {tx.tx_type === 'redeem' ? <I.gift size={14}/> : tx.tx_type === 'manual' ? <I.edit size={14}/> : <I.qr size={14}/>}
        </div>
        {i < total - 1 && <div style={{ width: 1, flex: 1, background: 'var(--m-line)', marginTop: 2 }}/>}
      </div>
      <div style={{ flex: 1, paddingBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-ink)' }}>
            {tx.amount != null && Number(tx.amount) > 0 ? `${Number(tx.amount).toLocaleString(locale)} ${t('common.currency')} · ` : ''}
            <span style={{ color: isPlus ? 'var(--m-good)' : 'var(--m-bad)', fontFamily: 'var(--m-mono)' }}>
              {isPlus ? '+' : ''}{tx.points_delta ?? 0} ★
            </span>
            {tx.note && <span style={{ color: 'var(--m-ink-mute)', fontSize: 12, fontWeight: 400, marginLeft: 6 }}>· {tx.note}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)', fontFamily: 'var(--m-mono)', whiteSpace: 'nowrap' }}>
            {tx.created_at ? new Date(tx.created_at).toLocaleString(locale) : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
