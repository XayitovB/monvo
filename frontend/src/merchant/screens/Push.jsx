import React, { useState, useEffect, useRef } from 'react';
import { I, T, Button, Surface, Input, Field, FilterChip } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import api from '../api';

// Tier (daraja) targeting olib tashlandi — SMS faqat "Barchasi" ga yuboriladi.
const SMS_SEGMENTS = [
  { key: 'all', label: 'all' },
];

// Kirill harf bo'lsa 70, aks holda 160 belgidan keyin yangi SMS bo'lagi
function smsParts(text) {
  if (!text) return 0;
  const cyrillic = /[Ѐ-ӿ]/.test(text);
  const limit = cyrillic ? 70 : 160;
  return Math.ceil(text.length / limit);
}

export default function Push() {
  const { t, lang } = useLang();

  const [channel, setChannel] = useState('push'); // 'push' | 'telegram'
  const [audience, setAudience] = useState('all');
  const [sleepingDays, setSleepingDays] = useState(30);
  const [pushCount, setPushCount] = useState(null);
  const [pushCountLoading, setPushCountLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [route, setRoute] = useState('');     // '' | card | promotions | profile | url
  const [routeId, setRouteId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logs, setLogs] = useState([]);
  const [pushStats, setPushStats] = useState(null);

  useEffect(() => {
    api.pushLogs().then((r) => setLogs(Array.isArray(r) ? r : (r?.items ?? []))).catch(() => {});
  }, [success]);

  useEffect(() => {
    api.pushStats().then(setPushStats).catch(() => {});
  }, [success]);

  // SMS auditoriya (yaroqli raqamlar soni + narx)
  const [smsInfo, setSmsInfo] = useState(null); // {valid, invalid, total, price_per_sms}
  const [smsLoading, setSmsLoading] = useState(false);

  // Telegram auditoriya (botga ulangan mijozlar soni)
  const [tgCount, setTgCount] = useState(null);
  const [tgLoading, setTgLoading] = useState(false);

  const isTg = channel === 'telegram';

  useEffect(() => {
    if (channel !== 'sms') return;
    let cancelled = false;
    setSmsLoading(true);
    api.smsAudience(audience)
      .then((d) => { if (!cancelled) setSmsInfo(d); })
      .catch(() => { if (!cancelled) setSmsInfo(null); })
      .finally(() => { if (!cancelled) setSmsLoading(false); });
    return () => { cancelled = true; };
  }, [channel, audience]);

  useEffect(() => {
    if (channel !== 'telegram') return;
    let cancelled = false;
    setTgLoading(true);
    api.telegramAudience(audience)
      .then((d) => { if (!cancelled) setTgCount(d?.count ?? 0); })
      .catch(() => { if (!cancelled) setTgCount(null); })
      .finally(() => { if (!cancelled) setTgLoading(false); });
    return () => { cancelled = true; };
  }, [channel, audience]);

  // Push auditoriya soni (push kanalida)
  const effectiveSegment = audience === 'sleeping' ? `sleeping:${sleepingDays}` : audience;
  useEffect(() => {
    if (channel !== 'push') return;
    let cancelled = false;
    setPushCountLoading(true);
    api.pushAudience(effectiveSegment)
      .then((d) => { if (!cancelled) setPushCount(d?.count ?? 0); })
      .catch(() => { if (!cancelled) setPushCount(null); })
      .finally(() => { if (!cancelled) setPushCountLoading(false); });
    return () => { cancelled = true; };
  }, [channel, effectiveSegment]);

  const parts = smsParts(body);
  const validCount = smsInfo?.valid || 0;
  const pricePer = smsInfo?.price_per_sms || 0;
  const smsTotal = validCount * Math.max(1, parts) * pricePer;

  function validate() {
    if (channel === 'push' && !title.trim()) { setError(t('push.err.noTitle')); return false; }
    if (!body.trim()) { setError(channel === 'sms' ? t('sms.err.noBody') : t('push.err.noBody')); return false; }
    return true;
  }

  async function handleSend() {
    if (!validate()) return;
    setSending(true); setError(''); setSuccess('');
    try {
      if (channel === 'sms') {
        const r = await api.broadcastSms({ body: body.trim(), segment: audience });
        setSuccess(t('sms.sent')
          .replace('{sent}', r.sent ?? 0)
          .replace('{failed}', r.failed ?? 0)
          .replace('{invalid}', r.invalid ?? 0));
      } else if (channel === 'telegram') {
        const r = await api.broadcastTelegram({ title: title.trim(), body: body.trim(), segment: audience });
        setSuccess(lang === 'ru'
          ? `✅ Отправляется ${r.queued ?? 0} клиентам в Telegram…`
          : `✅ ${r.queued ?? 0} ta mijozga Telegram orqali yuborilmoqda…`);
      } else {
        await api.broadcastPush({
          title: title.trim(), body: body.trim(), segment: effectiveSegment,
          imageUrl: imageUrl.trim(), route, routeId: routeId.trim(),
        });
        setSuccess(t('push.sent'));
      }
      setTitle(''); setBody(''); setImageUrl(''); setRoute(''); setRouteId('');
    } catch (e) {
      setError(e?.message || t('common.error'));
    } finally {
      setSending(false);
    }
  }

  async function handleDraft() {
    if (channel === 'sms') return; // SMS uchun qoralama yo'q
    if (!validate()) return;
    setSending(true); setError(''); setSuccess('');
    try {
      await api.createPushTemplate({ name: title.trim(), title: title.trim(), body: body.trim() });
      setSuccess(t('push.draftSaved'));
    } catch (e) {
      setError(e?.message || t('common.error'));
    } finally {
      setSending(false);
    }
  }

  const isSms = channel === 'sms';
  const bodyMax = isSms ? 480 : 178;

  return (
    <>
      <Topbar
        title={t('push.title')}
        actions={
          <>
            {!isSms && (
              <Button variant="secondary" onClick={handleDraft} disabled={sending}>{t('push.draft')}</Button>
            )}
            <Button variant="primary" icon={<I.zap/>} onClick={handleSend} disabled={sending}>
              {sending ? t('common.loading') : (lang === 'ru' ? 'Отправить' : 'Yuborish')}
            </Button>
          </>
        }
      />

      {(error || success) && (
        <div style={{
          margin: '0 28px',
          padding: '12px 16px', borderRadius: 10, fontSize: 13,
          background: error ? 'var(--m-bad-soft)' : 'rgba(63,156,92,0.10)',
          color: error ? 'var(--m-bad)' : 'var(--m-good)',
        }}>
          {error || success}
        </div>
      )}

      {/* Push quota banner */}
      {pushStats && pushStats.limit != null && (
        <div style={{ margin: '0 28px 4px', padding: '12px 16px', borderRadius: 10, background: 'var(--m-paper-raised)', border: '1px solid var(--m-line)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--m-ink-mute)', marginBottom: 6 }}>
              {lang === 'ru' ? 'Push-уведомления в этом месяце' : 'Bu oy push xabarlar'}
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'var(--m-line)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${Math.min(100, Math.round((pushStats.used_this_month / pushStats.limit) * 100))}%`,
                background: pushStats.remaining === 0 ? 'var(--m-bad)' : pushStats.remaining < pushStats.limit * 0.2 ? '#f59e0b' : 'var(--m-brand)',
                transition: 'width 0.3s',
              }}/>
            </div>
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: pushStats.remaining === 0 ? 'var(--m-bad)' : 'var(--m-ink)' }}>
              {pushStats.used_this_month.toLocaleString()} / {pushStats.limit.toLocaleString()}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)' }}>
              {pushStats.remaining === 0
                ? (lang === 'ru' ? 'Лимит исчерпан' : 'Limit tugadi')
                : (lang === 'ru' ? `Осталось: ${pushStats.remaining.toLocaleString()}` : `Qoldi: ${pushStats.remaining.toLocaleString()}`)}
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Auditoriya */}
          <Surface padding={20}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--m-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>1</div>
              <div style={{ ...T.h2 }}>{t('push.step.audience')}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {isSms ? (
                SMS_SEGMENTS.map((s) => (
                  <FilterChip key={s.key} active={audience === s.key} onClick={() => setAudience(s.key)}>
                    {s.key === 'all' ? t('cust.seg.all') : `${t('sms.seg.tier')}: ${s.label}`}
                  </FilterChip>
                ))
              ) : (
                <>
                  <FilterChip active={audience === 'all'} onClick={() => setAudience('all')}>{t('cust.seg.all')}</FilterChip>
                  <FilterChip active={audience === 'sleeping'} onClick={() => setAudience('sleeping')}>{t('cust.seg.sleeping')}</FilterChip>
                  <FilterChip active={audience === 'active'} onClick={() => setAudience('active')}>{t('cust.seg.active')}</FilterChip>
                </>
              )}
            </div>
            {/* Uxlayotgan: necha kun faol emasligini tanlash */}
            {audience === 'sleeping' && !isSms && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--m-ink-mute)' }}>
                  {lang === 'ru' ? 'Неактивны более' : 'Ko\'proq kun faol emas:'}
                </span>
                {[14, 30, 60, 90].map((d) => (
                  <FilterChip key={d} active={sleepingDays === d} onClick={() => setSleepingDays(d)}>
                    {d} {lang === 'ru' ? 'дн.' : 'kun'}
                  </FilterChip>
                ))}
              </div>
            )}
            {/* Push auditoriya soni */}
            {channel === 'push' && (
              <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--m-ink-mute)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <I.users size={13}/>
                {pushCountLoading
                  ? (lang === 'ru' ? 'Считаем…' : 'Hisoblanmoqda…')
                  : pushCount !== null
                    ? (lang === 'ru'
                        ? `Получат уведомление: ${pushCount.toLocaleString()} чел.`
                        : `Bildirishnoma oladi: ${pushCount.toLocaleString()} kishi`)
                    : ''}
              </div>
            )}
            {isSms && (
              <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)', marginTop: 10 }}>
                {lang === 'ru'
                  ? '📍 SMS отправляется только на номера Узбекистана (+998).'
                  : "📍 SMS faqat O'zbekiston (+998) raqamlariga yuboriladi."}
              </div>
            )}
          </Surface>

          {/* Matn */}
          <Surface padding={20}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--m-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>2</div>
              <div style={{ ...T.h2 }}>{t('push.step.text')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!isSms && (
                <Field label={t('push.heading')} hint={t('push.headingHint')}>
                  <Input value={title} onChange={(e) => { setTitle(e.target.value); setError(''); setSuccess(''); }} maxLength={50}/>
                </Field>
              )}
              <Field label={isSms ? t('sms.body') : t('push.body')} hint={isSms ? t('sms.bodyHint') : t('push.bodyHint')}>
                <textarea
                  value={body}
                  onChange={(e) => { setBody(e.target.value); setError(''); setSuccess(''); }}
                  maxLength={bodyMax}
                  style={{
                    border: '1px solid var(--m-line-strong)', borderRadius: 9, padding: '10px 12px',
                    fontSize: 13, color: 'var(--m-ink)', background: 'var(--m-surface)', resize: 'vertical',
                    minHeight: 78, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                />
              </Field>
              {isSms && (
                <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)' }}>
                  {body.length} / {bodyMax} · {t('sms.parts')}: {Math.max(1, parts)}
                </div>
              )}
            </div>
          </Surface>

          {/* Rasm + bosilganda harakat (faqat push) */}
          {!isSms && (
            <Surface padding={20}>
              <div style={{ ...T.h2, marginBottom: 12 }}>
                {lang === 'ru' ? 'Изображение и действие' : 'Rasm va harakat'}
              </div>
              <Field label={lang === 'ru' ? 'Изображение URL (необязательно)' : 'Rasm URL (ixtiyoriy)'}>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://… (banner)" />
              </Field>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const r = await api.uploadImage(f);
                    setImageUrl(r.url || '');
                  } catch (err) {
                    alert(err.message || (lang === 'ru' ? 'Ошибка загрузки' : 'Yuklash xatosi'));
                  } finally {
                    setUploading(false);
                    e.target.value = '';
                  }
                }}
              />
              <div style={{ marginTop: 8 }}>
                <Button
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading
                    ? (lang === 'ru' ? 'Загрузка…' : 'Yuklanmoqda…')
                    : (lang === 'ru' ? '⬆ Загрузить изображение' : '⬆ Rasm yuklash')}
                </Button>
                {imageUrl ? (
                  <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--m-good, #16a34a)' }}>
                    ✓ {lang === 'ru' ? 'загружено' : 'yuklandi'}
                  </span>
                ) : null}
              </div>
              <div style={{ marginTop: 14, marginBottom: 6, fontSize: 11, fontWeight: 600, color: 'var(--m-ink-mute)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {lang === 'ru' ? 'При нажатии открыть' : 'Bosilganda ochilsin'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { v: '', l: lang === 'ru' ? 'Ничего' : 'Hech narsa' },
                  { v: 'card', l: lang === 'ru' ? 'Карта' : 'Karta' },
                  { v: 'promotions', l: lang === 'ru' ? 'Акции' : 'Aksiyalar' },
                  { v: 'profile', l: 'Profil' },
                  { v: 'url', l: lang === 'ru' ? 'Ссылка' : 'Havola' },
                ].map((o) => (
                  <FilterChip key={o.v} active={route === o.v} onClick={() => { setRoute(o.v); setRouteId(''); }}>
                    {o.l}
                  </FilterChip>
                ))}
              </div>
              {(route === 'card' || route === 'url') && (
                <div style={{ marginTop: 10 }}>
                  <Input value={routeId} onChange={(e) => setRouteId(e.target.value)}
                    placeholder={route === 'card' ? 'Karta ID' : 'https://…'} />
                </div>
              )}
            </Surface>
          )}

        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Telefon ko'rinish (push) yoki SMS ko'rinish */}
          {isSms ? (
            <Surface padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ ...T.h2 }}>{t('push.preview')}</div>
              <div style={{
                background: 'var(--m-surface-alt)', borderRadius: 12, padding: 14,
                border: '1px solid var(--m-line)', minHeight: 70,
              }}>
                <div style={{ fontSize: 10.5, color: 'var(--m-ink-mute)', marginBottom: 4, fontWeight: 600 }}>
                  {t('push.channel.sms')} · {smsInfo?.price_per_sms ? 'Eskiz' : '4546'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--m-ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {body || '—'}
                </div>
              </div>
            </Surface>
          ) : (
            <Surface padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ ...T.h2, alignSelf: 'flex-start' }}>{t('push.preview')}</div>
              <div style={{
                width: 240, height: 480, background: '#0F1115', borderRadius: 32,
                border: '8px solid #1A1D24', padding: 14,
                backgroundImage: 'linear-gradient(180deg, #1F2937 0%, #0F1115 60%)',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', fontSize: 11, fontWeight: 600, padding: '0 4px' }}>
                  <span>10:30</span>
                  <span>📶 5G ⛁ 84%</span>
                </div>
                <div style={{
                  background: 'rgba(255,255,255,.94)', borderRadius: 14, padding: 12,
                  display: 'flex', gap: 9, marginTop: 12,
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--m-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700 }}>K</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#666', marginBottom: 2 }}>
                      <span style={{ fontWeight: 600 }}>MONVO</span>
                      <span>seychas</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#0F1115', fontWeight: 600 }}>{title || '—'}</div>
                    <div style={{ fontSize: 10.5, color: '#444', lineHeight: 1.35, marginTop: 2 }}>{body || ''}</div>
                  </div>
                </div>
              </div>
            </Surface>
          )}

          {/* Yuborilgan xabarlar tarixi + o'qilgan statistikasi */}
          {logs.length > 0 && (
            <Surface padding={18}>
              <div style={{ ...T.h2, fontSize: 14, marginBottom: 12 }}>
                {lang === 'ru' ? 'Отправленные' : 'Yuborilgan xabarlar'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {logs.slice(0, 8).map((l) => {
                  const recip = l.recipients ?? 0;
                  const read = l.read_count ?? 0;
                  const pct = recip > 0 ? Math.round((read / recip) * 100) : 0;
                  return (
                    <div key={l.id} style={{ padding: '10px 12px', background: 'var(--m-surface-alt)', borderRadius: 10, border: '1px solid var(--m-line)' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--m-ink)' }}>{l.title || '—'}</div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--m-ink-mute)', marginTop: 4 }}>
                        <span>📬 {l.sent_count ?? 0}</span>
                        {recip > 0 && (
                          <span style={{ color: 'var(--m-brand)', fontWeight: 600 }}>👁 {read} ({pct}%)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Surface>
          )}
        </div>
      </div>
    </>
  );
}
