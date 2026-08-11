import React, { useEffect, useState } from 'react';
import api from '../api';
import { I, T, Button, Input, Field, Surface, Badge } from '../kit';
import { useLang } from '../i18n/LangContext';
import { useConfirm } from '../hooks/useConfirm';

export default function ApiTokens() {
  const { t, lang } = useLang();
  const [askConfirm, confirmModal] = useConfirm();
  const [items, setItems] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [createdToken, setCreatedToken] = useState(null);
  const [copied, setCopied] = useState(false);

  const locale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';

  async function load() {
    try {
      const data = await api.apiTokensList();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || t('apt.err_load'));
      setItems([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function onCreate() {
    if (!name.trim()) { setError(t('apt.err_name_required')); return; }
    setBusy(true); setError(null);
    try {
      const res = await api.apiTokensCreate(name.trim());
      setCreatedToken({ token: res.token, name: res.name, prefix: res.token_prefix });
      setName('');
      setCreating(false);
      await load();
    } catch (e) {
      setError(e.message || t('apt.err_create'));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(id) {
    if (!await askConfirm(t('apt.confirm_revoke'), { danger: true })) return;
    setBusy(true); setError(null);
    try {
      await api.apiTokensRevoke(id);
      await load();
    } catch (e) {
      setError(e.message || t('apt.err_revoke'));
    } finally {
      setBusy(false);
    }
  }

  async function copyToken(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('apt.err_clipboard'));
    }
  }

  const active = (items || []).filter(i => !i.revoked_at);
  const revoked = (items || []).filter(i => i.revoked_at);

  return (
    <div style={{ padding: '24px 32px', maxWidth: 980 }}>
      {confirmModal}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div>
          <div style={{ ...T.h1 }}>{t('apt.title')}</div>
          <div style={{ ...T.body, marginTop: 4, maxWidth: 640 }}>
            {t('apt.desc')}
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => { setCreating(true); setError(null); }}
          icon={<I.plus/>}
          disabled={busy || creating}
        >{t('apt.new')}</Button>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', background: 'var(--m-bad-soft)',
          color: 'var(--m-bad)', borderRadius: 9, fontSize: 13.5, marginBottom: 14,
        }}>{error}</div>
      )}

      {/* Yaratilgan token banneri (bir marta) */}
      {createdToken && (
        <Surface style={{ padding: 20, marginBottom: 18, borderColor: 'var(--m-brand)', background: 'var(--m-brand-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <i className="bi bi-key-fill" style={{ fontSize: 18, color: 'var(--m-brand-ink)' }}/>
            <strong style={{ color: 'var(--m-brand-ink)' }}>{t('apt.created_title', { name: createdToken.name })}</strong>
          </div>
          <div style={{ ...T.body, marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <i className="bi bi-exclamation-triangle-fill" style={{ color: 'var(--m-warn)', marginTop: 2 }}/>
            <span>{t('apt.created_warn')}</span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#0E0F0C', padding: '12px 16px', borderRadius: 10,
            fontFamily: 'var(--m-mono)', fontSize: 13.5, color: '#a7f3d0',
            wordBreak: 'break-all',
          }}>
            <span style={{ flex: 1 }}>{createdToken.token}</span>
            <button
              onClick={() => copyToken(createdToken.token)}
              style={{
                padding: '6px 12px', border: 'none', borderRadius: 6,
                background: copied ? '#16a34a' : '#fff', color: copied ? '#fff' : '#0E0F0C',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              }}
            >{copied ? <><i className="bi bi-check2"/> {t('apt.copied')}</> : t('apt.copy')}</button>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="sm" onClick={() => setCreatedToken(null)}>
              {t('apt.dismiss')}
            </Button>
          </div>
        </Surface>
      )}

      {/* Yangi token formasi */}
      {creating && (
        <Surface style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ ...T.label, marginBottom: 10 }}>{t('apt.form_title')}</div>
          <Field label={t('apt.form_name_label')} required>
            <Input
              icon={<I.tag/>}
              placeholder={t('apt.form_name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
          </Field>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Button variant="primary" onClick={onCreate} disabled={busy || !name.trim()}>
              {busy ? t('apt.creating') : t('apt.create')}
            </Button>
            <Button variant="ghost" onClick={() => { setCreating(false); setName(''); setError(null); }}>
              {t('common.cancel')}
            </Button>
          </div>
        </Surface>
      )}

      {/* Aktiv tokenlar */}
      <Surface style={{ padding: 0, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--m-line)', fontWeight: 600, fontSize: 13.5 }}>
          {t('apt.active_section', { n: active.length })}
        </div>
        {items === null ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--m-ink-mute)' }}>{t('apt.loading')}</div>
        ) : active.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--m-ink-mute)' }}>
            {t('apt.empty')}
          </div>
        ) : (
          <div>
            {active.map(tok => (
              <TokenRow key={tok.id} tok={tok} onRevoke={() => onRevoke(tok.id)} busy={busy} t={t} locale={locale}/>
            ))}
          </div>
        )}
      </Surface>

      {/* Revoked tokenlar */}
      {revoked.length > 0 && (
        <details style={{ marginBottom: 24 }}>
          <summary style={{
            cursor: 'pointer', padding: '10px 14px',
            color: 'var(--m-ink-mute)', fontSize: 13,
          }}>
            {t('apt.revoked_section', { n: revoked.length })}
          </summary>
          <Surface style={{ padding: 0, marginTop: 8, overflow: 'hidden', opacity: 0.7 }}>
            {revoked.map(tok => (
              <TokenRow key={tok.id} tok={tok} disabled t={t} locale={locale}/>
            ))}
          </Surface>
        </details>
      )}

      {/* Foydalanish ko'rsatmasi */}
      <Surface style={{ padding: 18 }}>
        <div style={{ ...T.label, marginBottom: 10 }}>{t('apt.usage_title')}</div>
        <div style={{
          background: '#0E0F0C', padding: '14px 18px', borderRadius: 10,
          fontFamily: 'var(--m-mono)', fontSize: 12.5, color: '#cbd5e1',
          whiteSpace: 'pre', overflow: 'auto',
        }}>
{`curl https://monvo.uz/api/v1/me \\
     -H "Authorization: Bearer kar_live_..."`}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--m-ink-soft)' }}>
          {t('apt.docs_link')}{' '}
          <a href="/api-docs" target="_blank" rel="noreferrer" style={{ color: 'var(--m-brand)' }}>
            {t('apt.docs_label')}
          </a>
        </div>
      </Surface>
    </div>
  );
}

function TokenRow({ tok, onRevoke, busy, disabled, t, locale }) {
  const lastUsed = tok.last_used_at
    ? new Date(tok.last_used_at).toLocaleString(locale)
    : t('apt.never_used');
  const created = tok.created_at ? new Date(tok.created_at).toLocaleDateString(locale) : '—';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 16,
      alignItems: 'center', padding: '14px 18px',
      borderTop: '1px solid var(--m-line)',
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <strong style={{ fontSize: 14 }}>{tok.name}</strong>
          {tok.revoked_at && <Badge tone="bad">{t('apt.revoked_badge')}</Badge>}
        </div>
        <div style={{
          fontFamily: 'var(--m-mono)', fontSize: 12.5,
          color: 'var(--m-ink-soft)', marginBottom: 4,
        }}>
          {tok.token_masked}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--m-ink-mute)' }}>
          <span>{t('apt.created_at', { date: created })}</span>
          <span>{t('apt.last_used', { date: lastUsed })}</span>
          {tok.last_used_ip && <span>IP: <code>{tok.last_used_ip}</code></span>}
        </div>
      </div>
      {!disabled && onRevoke && (
        <button
          onClick={onRevoke}
          disabled={busy}
          style={{
            padding: '8px 14px', border: '1px solid var(--m-bad)', background: 'transparent',
            color: 'var(--m-bad)', borderRadius: 8, fontSize: 13, fontWeight: 500,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >{t('apt.revoke_btn')}</button>
      )}
    </div>
  );
}
