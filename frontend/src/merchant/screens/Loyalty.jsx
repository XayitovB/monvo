import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { I, T, Button, Surface, Field, Input } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { useApi } from '../hooks/useApi';
import { useConfirm } from '../hooks/useConfirm';
import { useAlert } from '../hooks/useAlert';
import api from '../api';

function ruleTypeLabel(rule_type, t, fallback) {
  const key = `loy.rule_type.${rule_type}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return fallback || rule_type;
}

function ruleSummary(r, t) {
  const c = r.config || {};
  switch (r.rule_type) {
    case 'classic_points':
      return `${Number(c.amount_per_point ?? 1000).toLocaleString()} ${t('common.currency')} = 1 ★`;
    case 'per_visit':
      return `${c.points_per_visit ?? 1} ★`;
    case 'cashback_percent':
      return `${c.percent ?? 0}% cashback${c.min_amount ? ` (${t('loy.rules.from')} ${Number(c.min_amount).toLocaleString()} ${t('common.currency')})` : ''}`;
    case 'tier_cashback':
      return `${c.tiers?.bronze ?? 2}% / ${c.tiers?.silver ?? 4}% / ${c.tiers?.gold ?? 6}%`;
    case 'punch_card':
      return `${c.threshold ?? 10} → +${c.reward_points ?? 500} ★`;
    case 'spend_threshold':
      return `${Number(c.threshold_amount ?? 0).toLocaleString()} ${t('common.currency')} → +${c.reward_points ?? 0} ★`;
    case 'happy_hour':
      return `×${c.multiplier ?? 2}`;
    case 'first_visit':
      return `+${c.bonus_points ?? 500} ★`;
    case 'birthday_bonus':
      return `×${c.multiplier ?? 2} +${c.bonus_points ?? 500} ★`;
    case 'referral':
      return `+${c.referrer_points ?? 1000} / +${c.referee_points ?? 500} ★`;
    default:
      return c.percent != null ? `${c.percent}%`
        : c.points_per_visit != null ? `${c.points_per_visit} ★`
        : r.description || r.rule_type;
  }
}

function AddRuleModal({ onClose, onCreated, editRule = null }) {
  const { t, lang } = useLang();
  const isEdit = !!editRule;
  const { data: ruleTypes, loading: typesLoading } = useApi(() => api.loyaltyRuleTypes(), []);
  const [selectedType, setSelectedType] = useState(editRule?.rule_type ?? null);
  const [name, setName] = useState(editRule?.name ?? '');
  const [config, setConfig] = useState(editRule?.config ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const typeList = Array.isArray(ruleTypes) ? ruleTypes : [];
  // Backend rule-types `key` qaytaradi (rule_type emas) — shu bo'yicha tanlaymiz.
  const currentType = typeList.find(rt => rt.key === selectedType);

  function setField(key, value) {
    setConfig(prev => {
      // handle dotted keys like "tiers.bronze"
      if (key.includes('.')) {
        const [parent, child] = key.split('.');
        return { ...prev, [parent]: { ...(prev[parent] || {}), [child]: value } };
      }
      return { ...prev, [key]: value };
    });
  }

  function getFieldValue(key) {
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      return config[parent]?.[child] ?? '';
    }
    return config[key] ?? '';
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!selectedType) { setError(t('loy.add.selectType')); return; }
    setError(''); setSaving(true);
    try {
      const nm = name.trim() || ruleTypeLabel(selectedType, t, currentType?.label);
      if (isEdit) {
        await api.updateLoyaltyRule(editRule.id, { name: nm, config });
      } else {
        await api.createLoyaltyRule({ rule_type: selectedType, name: nm, config });
      }
      onCreated();
    } catch (err) {
      setError(err?.message || err?.detail || t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--m-paper)', borderRadius: 16, padding: 28, width: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', border: '1px solid var(--m-line)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--m-ink)' }}>{isEdit ? (lang === 'ru' ? 'Редактировать правило' : 'Qoidani tahrirlash') : t('loy.add.title')}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--m-ink-mute)', lineHeight: 1 }}>✕</button>
        </div>

        {typesLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 13 }}>{t('common.loading')}</div>
        ) : (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Qoida turi tanlash — tahrirlashda tur o'zgarmaydi, yashiramiz */}
            {!isEdit && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.4px', color: 'var(--m-ink-mute)', textTransform: 'uppercase', marginBottom: 8 }}>
                {t('loy.add.selectType')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {typeList.map(rt => (
                  <label
                    key={rt.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 9, cursor: 'pointer',
                      background: selectedType === rt.key ? 'var(--m-brand-soft)' : 'var(--m-surface-alt)',
                      border: `1px solid ${selectedType === rt.key ? 'var(--m-brand)' : 'transparent'}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="ruleType"
                      value={rt.key}
                      checked={selectedType === rt.key}
                      onChange={() => { setSelectedType(rt.key); setConfig({}); }}
                      style={{ accentColor: 'var(--m-brand)' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--m-ink)', fontWeight: selectedType === rt.key ? 500 : 400 }}>
                      {ruleTypeLabel(rt.key, t, rt.label)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            )}

            {/* Qoida nomi */}
            {selectedType && (
              <>
                <Field label={t('loy.add.ruleName')}>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={t('loy.add.ruleNamePlaceholder')}
                    autoFocus
                  />
                </Field>

                {/* Dinamik fieldlar */}
                {(currentType?.fields || []).map(f => (
                  f.type === 'days' ? null : (
                    <Field key={f.key} label={f.label}>
                      <Input
                        type={f.type === 'number' ? 'number' : 'text'}
                        value={getFieldValue(f.key) !== '' ? getFieldValue(f.key) : (f.default ?? '')}
                        onChange={e => setField(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                        min={f.type === 'number' ? f.min : undefined}
                        max={f.type === 'number' ? f.max : undefined}
                        step={f.type === 'number' ? (f.step ?? 1) : undefined}
                        placeholder={String(f.default ?? '')}
                      />
                    </Field>
                  )
                ))}
              </>
            )}

            {error && (
              <div style={{ fontSize: 12.5, color: 'var(--m-bad)', padding: '8px 12px', background: 'var(--m-bad-soft)', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
              <Button type="submit" variant="primary" disabled={saving || !selectedType}>
                {saving ? t('loy.add.creating') : (isEdit ? t('common.save') : t('loy.add.create'))}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    // .merchant-root ichiga portal — --m-* o'zgaruvchilari meros bo'lishi uchun
    document.querySelector('.merchant-root') || document.body
  );
}

const MODEL_META = {
  cashback: { emoji: '💰', uz: 'Cashback (ball)', ru: 'Кэшбэк (баллы)' },
  stamp:    { emoji: '⭐', uz: 'N+1 (shtamp)',    ru: 'N+1 (штампы)' },
  spend:    { emoji: '🎯', uz: 'Xarid maqsadi',   ru: 'Цель покупок' },
};

// "Hozirgi ishlab turgan aksiya" — mijozlar hozir oladigan LIVE model.
function ActivePromo({ activeModel, ruleList, ru }) {
  const title = ru ? 'Текущая активная акция' : 'Hozirgi ishlab turgan aksiya';
  const sub = ru ? 'Клиенты сейчас получают это' : 'Mijozlar hozir shuni oladi';
  if (!activeModel) {
    return (
      <Surface padding={20}>
        <div style={{ ...T.h2, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--m-ink-mute)' }}>{ru ? 'Загрузка…' : 'Yuklanmoqda…'}</div>
      </Surface>
    );
  }
  const m = MODEL_META[activeModel.loyalty_type] || MODEL_META.cashback;
  const name = ru ? m.ru : m.uz;
  let detail;
  if (activeModel.loyalty_type === 'stamp') {
    detail = `${activeModel.stamp_threshold} ${ru ? 'штампов' : 'shtamp'} → ${activeModel.stamp_reward_title}`;
  } else if (activeModel.loyalty_type === 'spend') {
    detail = `${Number(activeModel.spend_goal).toLocaleString()} ${ru ? 'сум' : "so'm"} → ${activeModel.stamp_reward_title}`;
  } else {
    const active = (ruleList || []).filter(r => r.is_active).length;
    detail = ru ? `${active} активных правил` : `${active} ta faol qoida`;
  }
  return (
    <Surface padding={20}>
      <div style={{ ...T.h2, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--m-ink-mute)', marginBottom: 14 }}>{sub}</div>
      <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--m-brand)', background: 'var(--m-brand-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 24 }}>{m.emoji}</div>
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase',
            color: 'var(--m-good, #16a34a)', background: 'rgba(22,163,74,0.12)',
            padding: '3px 8px', borderRadius: 6,
          }}>{ru ? 'Активно' : 'Faol'}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8, color: 'var(--m-ink)' }}>{name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--m-ink-soft)', marginTop: 4 }}>{detail}</div>
      </div>
    </Surface>
  );
}

export default function Loyalty() {
  const { t, lang } = useLang();
  const ru = lang === 'ru';
  const [askConfirm, confirmModal] = useConfirm();
  const [showAlert, alertModal] = useAlert();
  const [reload, setReload] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const { data: rules, loading: rulesLoading } = useApi(() => api.loyaltyRules().catch(() => []), [reload]);

  const ruleList = Array.isArray(rules) ? rules : [];

  // ── Loyalty modeli (cashback ↔ N+1 shtamp) ──────────────────────────────────
  const [loyaltyType, setLoyaltyType] = useState('cashback');
  const [stampThreshold, setStampThreshold] = useState(7);
  const [stampReward, setStampReward] = useState('Bepul mahsulot');
  const [stampIcon, setStampIcon] = useState('coffee');
  const [spendGoal, setSpendGoal] = useState(1000000);
  const [savingModel, setSavingModel] = useState(false);
  // Hozir LIVE (saqlangan) model — "Hozirgi ishlab turgan aksiya" ustuni shuni
  // ko'rsatadi (tahrirlanayotgan tanlov emas).
  const [activeModel, setActiveModel] = useState(null);

  useEffect(() => {
    api.me().then((m) => {
      if (!m) return;
      setLoyaltyType(m.loyalty_type || 'cashback');
      setStampThreshold(m.stamp_threshold || 7);
      setStampReward(m.stamp_reward_title || 'Bepul mahsulot');
      setStampIcon(m.stamp_icon || 'coffee');
      setSpendGoal(m.spend_goal || 1000000);
      setActiveModel({
        loyalty_type: m.loyalty_type || 'cashback',
        stamp_threshold: m.stamp_threshold || 7,
        stamp_reward_title: m.stamp_reward_title || 'Bepul mahsulot',
        stamp_icon: m.stamp_icon || 'coffee',
        spend_goal: m.spend_goal || 1000000,
      });
    }).catch(() => {});
  }, []);

  const saveModel = async () => {
    setSavingModel(true);
    try {
      await api.updateProfile({
        loyalty_type: loyaltyType,
        stamp_threshold: Number(stampThreshold) || 7,
        stamp_reward_title: stampReward.trim() || 'Bepul mahsulot',
        stamp_icon: stampIcon,
        spend_goal: Number(spendGoal) || 1000000,
      });
      setActiveModel({
        loyalty_type: loyaltyType,
        stamp_threshold: Number(stampThreshold) || 7,
        stamp_reward_title: stampReward.trim() || 'Bepul mahsulot',
        stamp_icon: stampIcon,
        spend_goal: Number(spendGoal) || 1000000,
      });
      showAlert(ru ? 'Сохранено ✓' : 'Saqlandi ✓', { variant: 'success' });
    } catch (e) {
      showAlert(e.message || t('common.error'));
    } finally {
      setSavingModel(false);
    }
  };

  const handleToggle = async (rule) => {
    try {
      await api.toggleLoyaltyRule(rule.id, !rule.is_active);
      setReload((n) => n + 1);
    } catch (e) {
      showAlert(e.message || t('common.error'));
    }
  };

  const handleDelete = async (rule) => {
    if (!await askConfirm(t('common.confirm_delete'), { danger: true })) return;
    try {
      await api.deleteLoyaltyRule(rule.id);
      setReload((n) => n + 1);
    } catch (e) {
      showAlert(e.message || t('common.error'));
    }
  };

  return (
    <>
      {confirmModal}
      {alertModal}
      <Topbar
        title={t('loy.title')}
        subtitle={t('loy.subtitle')}
      />

      <div style={{ padding: 28, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Chap ustun — model sozlamalari + cashback qoidalari */}
        <div style={{ flex: '3 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Loyalty modeli: cashback (ball) yoki N+1 shtamp */}
        <Surface padding={20}>
          <div style={{ ...T.h2, marginBottom: 6 }}>{ru ? 'Модель лояльности' : 'Loyalty modeli'}</div>
          <div style={{ fontSize: 12, color: 'var(--m-ink-mute)', marginBottom: 14 }}>
            {ru ? 'Выберите, как работает карта клиента.' : 'Mijoz kartasi qanday ishlashini tanlang.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { v: 'cashback', emoji: '💰', t: ru ? 'Кэшбэк (баллы)' : 'Cashback (ball)', d: ru ? 'За каждую покупку — баллы/кэшбэк' : 'Har xariddan ball / cashback to\'planadi' },
              { v: 'stamp', emoji: '⭐', t: ru ? 'N+1 (штампы)' : 'N+1 (shtamp)', d: ru ? 'Штамп за визит, после N — бесплатно' : 'Har tashrifga shtamp, N tadan keyin bepul mahsulot' },
              { v: 'spend', emoji: '🎯', t: ru ? 'Цель покупок' : 'Xarid maqsadi', d: ru ? 'Накопил N сум покупок — подарок' : 'N so\'mga xarid qilsa — sovg\'a' },
            ].map((o) => (
              <button key={o.v} type="button" onClick={() => setLoyaltyType(o.v)} style={{
                textAlign: 'left', padding: 14, borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${loyaltyType === o.v ? 'var(--m-brand)' : 'var(--m-line)'}`,
                background: loyaltyType === o.v ? 'var(--m-brand-soft)' : 'var(--m-surface)',
              }}>
                <div style={{ fontSize: 20 }}>{o.emoji}</div>
                <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 4, color: 'var(--m-ink)' }}>{o.t}</div>
                <div style={{ fontSize: 11, color: 'var(--m-ink-mute)', marginTop: 2 }}>{o.d}</div>
              </button>
            ))}
          </div>

          {loyaltyType === 'stamp' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 14 }}>
              <Field label={ru ? 'Сколько штампов (N)' : 'Nechta shtamp (N)'}>
                <Input type="number" min={2} max={50} value={stampThreshold}
                  onChange={(e) => setStampThreshold(e.target.value)} />
              </Field>
              <Field label={ru ? 'Название подарка' : 'Sovg\'a nomi'}>
                <Input value={stampReward} onChange={(e) => setStampReward(e.target.value)}
                  placeholder={ru ? 'Бесплатный товар' : 'Bepul mahsulot'} />
              </Field>
            </div>
          )}
          {loyaltyType === 'spend' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 14 }}>
              <Field label={ru ? 'Цель покупок (сум)' : 'Xarid maqsadi (so\'m)'}>
                <Input type="number" min={1000} step={50000} value={spendGoal}
                  onChange={(e) => setSpendGoal(e.target.value)} />
              </Field>
              <Field label={ru ? 'Название подарка' : 'Sovg\'a nomi'}>
                <Input value={stampReward} onChange={(e) => setStampReward(e.target.value)}
                  placeholder={ru ? 'Бесплатный товар' : 'Bepul mahsulot'} />
              </Field>
            </div>
          )}
          {loyaltyType === 'stamp' && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--m-ink-mute)', marginBottom: 8 }}>
                {ru ? 'Иконка штампа (на карте клиента)' : 'Shtamp ikonkasi (mijoz kartasida)'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  ['coffee', '☕'], ['tea', '🍵'], ['pizza', '🍕'], ['burger', '🍔'],
                  ['fastfood', '🌭'], ['icecream', '🍦'], ['cake', '🍰'], ['bakery', '🥐'],
                  ['gift', '🎁'], ['star', '⭐'], ['heart', '❤️'], ['cart', '🛍️'],
                ].map(([key, emoji]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStampIcon(key)}
                    title={key}
                    style={{
                      width: 44, height: 44, fontSize: 20, cursor: 'pointer',
                      borderRadius: 12,
                      border: stampIcon === key ? '2px solid var(--m-accent, #2F6B3F)' : '1px solid var(--m-line, #e5e7eb)',
                      background: stampIcon === key ? 'rgba(47,107,63,.10)' : 'var(--m-paper, #fff)',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          {loyaltyType === 'stamp' && (
            <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)', marginTop: 10 }}>
              {ru
                ? `ℹ️ В режиме штампов каждое сканирование = 1 штамп. После ${Number(stampThreshold) || 7} клиент получает «${stampReward || 'Бесплатный товар'}», счётчик обнуляется. Баллы/кэшбэк не работают.`
                : `ℹ️ Shtamp modelida har skanerlashda 1 shtamp qo'shiladi. ${Number(stampThreshold) || 7} ta to'lganda mijozga «${stampReward || 'Bepul mahsulot'}» beriladi va hisoblagich nolga qaytadi. Ball/cashback ishlamaydi.`}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Button variant="primary" icon={<I.check/>} onClick={saveModel} disabled={savingModel}>
              {savingModel ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </Surface>

        {/* Cashback qoidalari — faqat cashback modelida kerak */}
        {loyaltyType === 'cashback' && (
        <Surface padding={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ ...T.h2 }}>{t('loy.rules.title')}</div>
            <Button variant="ghost" size="sm" icon={<I.plus/>} onClick={() => setShowAdd(true)}>
              {t('loy.rules.add')}
            </Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rulesLoading && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12 }}>{t('common.loading')}</div>
            )}
            {!rulesLoading && ruleList.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 12.5 }}>
                {t('loy.rules.empty')}
              </div>
            )}
            {ruleList.map((r) => (
              <div key={r.id} style={{
                padding: '14px 16px', border: '1px solid var(--m-line)', borderRadius: 11,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 9,
                  background: r.is_active ? 'var(--m-brand-soft)' : 'var(--m-surface-alt)',
                  color: r.is_active ? 'var(--m-brand)' : 'var(--m-ink-mute)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <I.zap size={18}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--m-ink)' }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)', marginTop: 2 }}>
                    <span style={{ color: 'var(--m-ink-soft)' }}>{ruleTypeLabel(r.rule_type, t)}</span>
                    {' → '}
                    <span style={{ color: 'var(--m-brand)', fontWeight: 500 }}>{ruleSummary(r, t)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setEditRule(r)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--m-ink-soft)', padding: '4px 7px', borderRadius: 6,
                    fontSize: 14, lineHeight: 1,
                  }}
                  aria-label="edit"
                  title={t('common.edit')}
                >✎</button>
                <button
                  onClick={() => handleDelete(r)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--m-bad)', padding: 6, borderRadius: 6, display: 'flex',
                  }}
                  aria-label="delete"
                >
                  <I.x size={15}/>
                </button>
                <div
                  onClick={() => handleToggle(r)}
                  style={{
                    width: 36, height: 20, borderRadius: 10,
                    background: r.is_active ? 'var(--m-brand)' : 'var(--m-line-strong)',
                    position: 'relative', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: r.is_active ? 18 : 2, width: 16, height: 16,
                    background: '#fff', borderRadius: '50%', transition: 'left .2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,.15)',
                  }}/>
                </div>
              </div>
            ))}
          </div>
        </Surface>
        )}
        </div>

        {/* O'ng ustun — hozirgi ishlab turgan aksiya (LIVE model) */}
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <ActivePromo activeModel={activeModel} ruleList={ruleList} ru={ru} />
        </div>
      </div>

      {showAdd && (
        <AddRuleModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); setReload(n => n + 1); }}
        />
      )}

      {editRule && (
        <AddRuleModal
          editRule={editRule}
          onClose={() => setEditRule(null)}
          onCreated={() => { setEditRule(null); setReload(n => n + 1); }}
        />
      )}
    </>
  );
}
