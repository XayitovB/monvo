import React, { useState, useEffect, useRef } from 'react';
import { I, T, Button, Surface, Badge, Field, Input } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import { fmtDate } from '../i18n/date';
import { useAuth } from '../auth/AuthContext';
import FeatureGate from '../auth/FeatureGate';
import { useConfirm } from '../hooks/useConfirm';
import { useAlert } from '../hooks/useAlert';
import api from '../api';

export default function Settings() {
  const { t, lang } = useLang();
  const [askConfirm, confirmModal] = useConfirm();
  const [showAlert, alertModal] = useAlert();
  const tagline = (p) => (lang === 'uz' ? p.tagline_uz : p.tagline_ru) || p.tagline_uz || p.tagline_ru || '';
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({
    business_name: user?.business_name || '',
    domain: user?.domain || '',
    phone: user?.phone || '',
    email: user?.email || '',
    logo_url: user?.logo_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState('profile'); // 'profile' | 'integrations'

  // POS integratsiyalar (Billz, iiko, r_keeper va h.k.)
  const [posList, setPosList] = useState([]);
  const [posLoading, setPosLoading] = useState(true);
  const [connectModal, setConnectModal] = useState(null); // {provider object}
  const [verifying, setVerifying] = useState(null); // slug
  const [verifyResult, setVerifyResult] = useState({}); // {slug: {ok, error}}

  // API tokenlar
  const [tokens, setTokens] = useState([]);
  const [tokenName, setTokenName] = useState('');
  const [tokenExpiry, setTokenExpiry] = useState('90'); // kun; '' = cheksiz
  const [creatingToken, setCreatingToken] = useState(false);
  const [newToken, setNewToken] = useState(null); // {name, token, prefix} — bir martalik
  const [copiedTokenId, setCopiedTokenId] = useState(null);

  async function reloadTokens() {
    try {
      const list = await api.apiTokensList();
      setTokens(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('apiTokensList failed', e);
      setTokens([]);
    }
  }
  async function createToken() {
    if (creatingToken) return;
    // Nom bo'sh bo'lsa — takrorlanmaydigan avtomatik nom ("Token N").
    const nm = (tokenName || '').trim() || `Token ${tokens.length + 1}`;
    const expDays = tokenExpiry ? parseInt(tokenExpiry, 10) : null;
    setCreatingToken(true);
    try {
      const res = await api.apiTokensCreate(nm, expDays);
      setNewToken({ name: nm, token: res.token, prefix: res.token_prefix });
      setTokenName('');
      await reloadTokens();
    } catch (e) {
      showAlert(e?.message || t('common.error'));
    } finally {
      setCreatingToken(false);
    }
  }

  function fmtTokenDate(iso) {
    if (!iso) return null;
    return fmtDate(iso, lang);
  }
  async function revokeToken(id) {
    if (!await askConfirm(t('common.confirm_delete'), { danger: true })) return;
    try {
      await api.apiTokensRevoke(id);
      await reloadTokens();
    } catch (e) {
      showAlert(e?.message || t('common.error'));
    }
  }
  function copyText(text, id) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTokenId(id);
      setTimeout(() => setCopiedTokenId(null), 1500);
    }).catch(() => {});
  }

  async function reloadPos() {
    setPosLoading(true);
    try {
      const raw = await api.posList();
      const list = Array.isArray(raw) ? [...raw].sort((a, b) => (b.connected ? 1 : 0) - (a.connected ? 1 : 0)) : [];
      setPosList(list);
    } catch (e) {
      console.error('posList failed', e);
      setPosList([]);
    } finally {
      setPosLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      setForm({
        business_name: user.business_name || '',
        domain: user.domain || '',
        phone: user.phone || '',
        email: user.email || '',
        logo_url: user.logo_url || '',
      });
    }
  }, [user]);

  useEffect(() => { reloadPos(); reloadTokens(); }, []);

  async function save() {
    setSaving(true);
    try {
      await api.updateProfile(form);
      await refresh();
    } catch (e) {
      showAlert(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Logo yuklash — fayl → data:image/...;base64 → backend
  const MAX_LOGO_BYTES = 20 * 1024 * 1024; // 20 MB

  function pickLogo() {
    setUploadErr(null);
    fileInputRef.current?.click();
  }

  async function handleLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadErr(null);

    if (!/^image\/(svg\+xml|png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      setUploadErr(t('settings.upload.typeError'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setUploadErr(t('settings.upload.sizeError', { size: (file.size / 1024 / 1024).toFixed(1) }));
      return;
    }

    setUploadingLogo(true);
    try {
      // Convert any format (including SVG) to a 512x512 PNG via Canvas.
      // Flutter's image codec doesn't support SVG, so we always store raster.
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(t('settings.upload.readError')));
        reader.onload = () => {
          const img = new Image();
          img.onerror = () => reject(new Error(t('settings.upload.readError')));
          img.onload = () => {
            const SIZE = 512;
            const canvas = document.createElement('canvas');
            canvas.width = SIZE;
            canvas.height = SIZE;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, SIZE, SIZE);
            resolve(canvas.toDataURL('image/png'));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
      setForm(prev => ({ ...prev, logo_url: dataUrl }));
      await api.updateProfile({ logo_url: dataUrl });
      await refresh();
    } catch (e) {
      setUploadErr(e.message || t('settings.upload.uploadError'));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    if (!form.logo_url) return;
    if (!await askConfirm(t('settings.logo.confirmDelete'), { danger: true })) return;
    setUploadingLogo(true);
    try {
      const next = { ...form, logo_url: '' };
      setForm(next);
      await api.updateProfile({ logo_url: '' });
      await refresh();
    } catch (e) {
      setUploadErr(e.message || t('settings.logo.deleteError'));
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <>
      {confirmModal}
      {alertModal}
      <Topbar
        title={t('set.title')}
        subtitle={t('set.subtitle')}
        actions={<Button variant="primary" icon={<I.check/>} onClick={save} disabled={saving}>{saving ? t('common.loading') : t('common.save')}</Button>}
        tabs={[
          { label: t('set.tabs.profile'),       active: tab === 'profile',      onClick: () => setTab('profile') },
          { label: t('set.tabs.integrations'),  active: tab === 'integrations', onClick: () => setTab('integrations') },
        ]}
      />

      {tab === 'profile' && (
        <div style={{ padding: 28, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, maxWidth: 1100 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Surface padding={20}>
              <div style={{ ...T.h2, marginBottom: 4 }}>{t('set.business.title')}</div>
              <div style={{ ...T.meta, marginBottom: 18 }}>{t('set.business.subtitle')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 14,
                  background: form.logo_url ? 'var(--m-surface-alt)' : 'var(--m-brand)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 700, overflow: 'hidden', flexShrink: 0,
                }}>
                  {form.logo_url ? (
                    <img
                      src={form.logo_url} alt="Logo"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    (form.business_name || 'M').slice(0, 2).toUpperCase()
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--m-ink)' }}>Logo</div>
                  <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)' }}>SVG / PNG / JPG ≤ 20 MB · ≥ 256 px</div>
                  {uploadErr && (
                    <div style={{ fontSize: 11, color: 'var(--m-bad)', marginTop: 3 }}>{uploadErr}</div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={handleLogoFile}
                />
                {form.logo_url && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={removeLogo}
                    disabled={uploadingLogo}
                    style={{ color: 'var(--m-bad)' }}
                  >{t('common.delete')}</Button>
                )}
                <Button
                  variant="secondary" size="sm"
                  onClick={pickLogo}
                  disabled={uploadingLogo}
                >{uploadingLogo ? t('common.loading') : t('set.upload')}</Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={t('set.business.name')} required>
                  <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })}/>
                </Field>
                <Field label={t('set.business.phone')}>
                  <Input icon={<I.phone/>} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}/>
                </Field>
                <Field label={t('set.business.email')}>
                  <Input icon={<I.mail/>} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}/>
                </Field>
              </div>
            </Surface>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Surface padding={20}>
              <div style={{ ...T.h2, marginBottom: 14 }}>{t('set.api.title')}</div>

              {newToken && (
                <div style={{
                  padding: 12, marginBottom: 12, borderRadius: 9,
                  background: 'rgba(63,156,92,0.08)', border: '1px solid rgba(63,156,92,0.25)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--m-good)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="bi bi-check-circle-fill"/>{newToken.name} — {t('set.api.save_once')}
                  </div>
                  <div style={{
                    padding: 10, background: 'var(--m-surface)', borderRadius: 7,
                    fontFamily: 'var(--m-mono)', fontSize: 11.5, color: 'var(--m-ink)',
                    wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ flex: 1 }}>{newToken.token}</span>
                    <button
                      onClick={() => copyText(newToken.token, 'new')}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--m-ink-mute)' }}
                    >
                      {copiedTokenId === 'new' ? <I.check size={14}/> : <I.copy size={14}/>}
                    </button>
                  </div>
                  <button
                    onClick={() => setNewToken(null)}
                    style={{
                      marginTop: 8, background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--m-ink-mute)', fontSize: 11.5, padding: 0,
                    }}
                  >{t('set.api.close')}</button>
                </div>
              )}

              {tokens.length === 0 && !newToken ? (
                <div style={{ ...T.meta, padding: '6px 0' }}>—</div>
              ) : tokens.map(tk => (
                <div key={tk.id} style={{
                  padding: 10, marginBottom: 8, borderRadius: 8,
                  background: 'var(--m-surface-alt)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--m-ink)' }}>{tk.name}</div>
                    <div style={{
                      fontSize: 11, fontFamily: 'var(--m-mono)', color: 'var(--m-ink-mute)',
                      marginTop: 2,
                    }}>{tk.token_prefix}••••••••</div>
                    <div style={{
                      fontSize: 10.5, color: 'var(--m-ink-faint)', marginTop: 3,
                      display: 'flex', gap: 10, flexWrap: 'wrap',
                    }}>
                      {fmtTokenDate(tk.created_at) && (
                        <span>{t('set.api.created')}: {fmtTokenDate(tk.created_at)}</span>
                      )}
                      <span>
                        {tk.last_used_at
                          ? `${t('set.api.last_used')}: ${fmtTokenDate(tk.last_used_at)}`
                          : t('set.api.never_used')}
                      </span>
                      {tk.expires_at && (
                        <span style={{
                          color: new Date(tk.expires_at) <= new Date()
                            ? 'var(--m-bad)' : 'var(--m-ink-faint)',
                        }}>
                          {new Date(tk.expires_at) <= new Date()
                            ? t('set.api.expired')
                            : `${t('set.api.expires')}: ${fmtTokenDate(tk.expires_at)}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => revokeToken(tk.id)}
                    title="O'chirish"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--m-bad)' }}
                  >
                    <I.x size={13}/>
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <Input
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createToken(); }}
                  placeholder={t('set.api.key_name_placeholder')}
                  style={{ flex: 1, padding: '7px 10px' }}
                />
                <select
                  value={tokenExpiry}
                  onChange={(e) => setTokenExpiry(e.target.value)}
                  title={t('set.api.expiry_label')}
                  style={{
                    padding: '7px 10px', fontSize: 12, borderRadius: 8,
                    border: '1px solid var(--m-line-strong)', background: 'var(--m-surface)',
                    color: 'var(--m-ink)', cursor: 'pointer',
                  }}
                >
                  <option value="30">{t('set.api.expiry_30')}</option>
                  <option value="90">{t('set.api.expiry_90')}</option>
                  <option value="365">{t('set.api.expiry_365')}</option>
                  <option value="">{t('set.api.expiry_never')}</option>
                </select>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<I.plus/>}
                  onClick={createToken}
                  disabled={creatingToken}
                >{creatingToken ? '...' : t('set.api.create')}</Button>
              </div>
            </Surface>
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div style={{ padding: 28, maxWidth: 760 }}>
          <FeatureGate feature="pos_integration" inline title={t('feature.pos_integration')}>
          <Surface padding={20}>
            <div style={{ ...T.h2, marginBottom: 14 }}>{t('set.integrations.title')}</div>
            {posLoading ? (
              <div style={{ ...T.meta, padding: '8px 0' }}>{t('common.loading')}</div>
            ) : posList.length === 0 ? (
              <div style={{ ...T.meta, padding: '8px 0' }}>—</div>
            ) : posList.map((it, i) => (
              <div key={it.slug} style={{ marginTop: i > 0 ? 8 : 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 9, background: 'var(--m-surface-alt)',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--m-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--m-ink-mute)' }}>
                  <I.link size={16}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--m-ink)' }}>{it.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)' }}>{tagline(it)}</div>
                </div>
                {it.connected ? (
                  <>
                    {verifyResult[it.slug] ? (
                      verifyResult[it.slug].ok ? (
                        <Badge tone="good" dot>OK</Badge>
                      ) : (
                        <Badge tone="bad" dot>{t('set.integrations.error')}</Badge>
                      )
                    ) : (
                      <Badge tone="good" dot>{t('set.integrations.connected')}</Badge>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      disabled={verifying === it.slug}
                      onClick={async () => {
                        setVerifying(it.slug);
                        setVerifyResult(prev => ({ ...prev, [it.slug]: null }));
                        try {
                          const res = await api.posVerify(it.slug);
                          setVerifyResult(prev => ({ ...prev, [it.slug]: res }));
                        } catch (e) {
                          setVerifyResult(prev => ({ ...prev, [it.slug]: { ok: false, error: e?.message || t('set.integrations.error') } }));
                        } finally {
                          setVerifying(null);
                        }
                      }}
                    >{verifying === it.slug ? '...' : t('set.integrations.test')}</Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={async () => {
                        if (!await askConfirm(t('set.integrations.disconnect_confirm').replace('{name}', it.name), { danger: true })) return;
                        try { await api.posDisconnect(it.slug); await reloadPos(); }
                        catch (e) { showAlert(e.message || t('set.integrations.error')); }
                      }}
                    >{t('set.integrations.disconnect')}</Button>
                  </>
                ) : !it.enabled_globally ? (
                  <Badge tone="neutral">{t('set.integrations.coming_soon')}</Badge>
                ) : (
                  <Button
                    variant="secondary" size="sm"
                    onClick={() => setConnectModal(it)}
                  >{t('set.integrations.connect')}</Button>
                )}
              </div>
              {verifyResult[it.slug] && (
                <div style={{
                  marginTop: 6, padding: '8px 12px', borderRadius: 7, fontSize: 11.5,
                  background: verifyResult[it.slug].ok ? 'rgba(63,156,92,0.10)' : 'var(--m-bad-soft)',
                  color: verifyResult[it.slug].ok ? 'var(--m-good)' : 'var(--m-bad)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <i className={`bi bi-${verifyResult[it.slug].ok ? 'check-circle-fill' : 'x-circle-fill'}`}/>
                  {verifyResult[it.slug].ok
                    ? t('set.integrations.verify_ok').replace('{name}', it.name)
                    : (verifyResult[it.slug].error || verifyResult[it.slug].message || t('set.integrations.verify_fail'))}
                </div>
              )}
              {it.connected && it.last_error && (
                <WebhookStatusLine raw={it.last_error}/>
              )}
              {it.connected && it.webhook_url && (
                <ConnectedWebhookRow url={it.webhook_url} providerName={it.name}/>
              )}
              </div>
            ))}
          </Surface>
          </FeatureGate>
        </div>
      )}

      {connectModal && (
        <PosConnectModal
          provider={connectModal}
          providerTagline={tagline(connectModal)}
          onClose={() => setConnectModal(null)}
          onConnected={async () => { setConnectModal(null); await reloadPos(); }}
        />
      )}
    </>
  );
}

function PosConnectModal({ provider, providerTagline, onClose, onConnected }) {
  const { t } = useLang();
  const fields = provider.credential_fields || [];
  const [creds, setCreds] = useState(() => Object.fromEntries(fields.map(f => [f.key, ''])));
  const [show, setShow] = useState({}); // {field_key: bool}
  const [busy, setBusy] = useState(null); // 'test' | 'save' | null
  const [err, setErr] = useState(null);
  const [tested, setTested] = useState(null); // {ok, message}
  const [connected, setConnected] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  function setField(k, v) { setCreds(prev => ({ ...prev, [k]: v })); setTested(null); }

  async function copyText(value, fieldKey) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      /* noop */
    }
  }

  async function handleTest() {
    const missing = fields.filter(f => !creds[f.key]).map(f => f.label);
    if (missing.length) {
      setTested({ ok: false, message: t('set.integrations.missing_fields').replace('{fields}', missing.join(', ')) });
      return;
    }
    setErr(null); setTested(null); setBusy('test');
    try {
      const res = await api.posTest(provider.slug, creds);
      setTested({ ok: !!res?.ok, message: res?.message || (res?.ok ? 'OK' : t('set.integrations.error')) });
    } catch (e) {
      setTested({ ok: false, message: e?.message || t('set.integrations.error') });
    } finally { setBusy(null); }
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr(null); setBusy('save');
    try {
      const missing = fields.filter(f => !creds[f.key]).map(f => f.label);
      if (missing.length) throw new Error(t('set.integrations.missing_fields').replace('{fields}', missing.join(', ')));
      const res = await api.posConnect(provider.slug, creds);
      // Connect javobida webhook_url va webhook_secret bor — ularni ko'rsatamiz.
      setConnected(res || {});
    } catch (e2) {
      setErr(e2?.message || t('set.integrations.error'));
    } finally { setBusy(null); }
  }

  function handleDone() {
    onConnected?.();
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    padding: 16,
  };
  const box = {
    background: 'var(--m-surface)', borderRadius: 16,
    width: 'min(480px, 100%)', maxHeight: '90vh', overflow: 'auto',
    border: '1px solid var(--m-line)',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: 20, borderBottom: '1px solid var(--m-line)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...T.h2 }}>{provider.name}</div>
            <div style={{ ...T.meta, marginTop: 2 }}>{providerTagline}</div>
            {provider.doc_url && (
              <a href={provider.doc_url} target="_blank" rel="noreferrer"
                 style={{ fontSize: 12, color: 'var(--m-brand)', marginTop: 4, display: 'inline-block' }}>
                {t('set.integrations.docs')}
              </a>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--m-ink-mute)', padding: 4,
          }}><I.x size={18}/></button>
        </div>

        {connected ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: '12px 14px', borderRadius: 9,
              background: 'rgba(63,156,92,0.10)', color: 'var(--m-good)',
              fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <i className="bi bi-check-circle-fill"/>
              {t('set.integrations.connected_msg').replace('{name}', provider.name)}
            </div>

            {connected.webhook_url && (
              <Field label="Webhook URL">
                <div style={{ position: 'relative' }}>
                  <Input
                    readOnly
                    value={connected.webhook_url}
                    onClick={(e) => e.target.select()}
                    style={{ paddingRight: 84, fontFamily: 'var(--m-mono)' }}
                  />
                  <button
                    type="button"
                    onClick={() => copyText(connected.webhook_url, 'url')}
                    style={{
                      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                      padding: '5px 10px', borderRadius: 7,
                      background: copiedField === 'url' ? 'var(--m-good)' : 'var(--m-brand)',
                      color: '#fff', border: 'none', fontSize: 11.5, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <i className={`bi bi-${copiedField === 'url' ? 'check2' : 'clipboard'}`}/>
                    {copiedField === 'url' ? t('set.integrations.copied') : t('set.integrations.copy')}
                  </button>
                </div>
              </Field>
            )}

            {connected.webhook_secret && (
              <Field label={t('set.integrations.webhook_secret_label')}>
                <div style={{ position: 'relative' }}>
                  <Input
                    readOnly
                    value={connected.webhook_secret}
                    type={show.__secret ? 'text' : 'password'}
                    onClick={(e) => e.target.select()}
                    style={{ paddingRight: 134, fontFamily: 'var(--m-mono)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(s => ({ ...s, __secret: !s.__secret }))}
                    style={{
                      position: 'absolute', right: 78, top: '50%', transform: 'translateY(-50%)',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--m-ink-mute)', fontSize: 11, fontWeight: 600,
                    }}
                  >{show.__secret ? t('set.integrations.hide') : t('set.integrations.show')}</button>
                  <button
                    type="button"
                    onClick={() => copyText(connected.webhook_secret, 'secret')}
                    style={{
                      position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                      padding: '5px 10px', borderRadius: 7,
                      background: copiedField === 'secret' ? 'var(--m-good)' : 'var(--m-brand)',
                      color: '#fff', border: 'none', fontSize: 11.5, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <i className={`bi bi-${copiedField === 'secret' ? 'check2' : 'clipboard'}`}/>
                    {copiedField === 'secret' ? t('set.integrations.copied') : t('set.integrations.copy')}
                  </button>
                </div>
              </Field>
            )}

            <div style={{
              padding: '10px 12px', borderRadius: 9, fontSize: 12,
              background: 'var(--m-surface-alt)', color: 'var(--m-ink-soft)',
              lineHeight: 1.55,
            }}>
              {t('set.integrations.webhook_instruction').replace('{name}', provider.name)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <Button type="button" variant="primary" onClick={handleDone}>
                {t('set.integrations.done')}
              </Button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSave} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields.map(f => {
            const isPwd = f.type === 'password';
            const visible = !!show[f.key];
            return (
              <Field key={f.key} label={f.label} required>
                <div style={{ position: 'relative' }}>
                  <Input
                    type={isPwd && !visible ? 'password' : 'text'}
                    value={creds[f.key] || ''}
                    onChange={e => setField(f.key, e.target.value)}
                    placeholder={f.placeholder || ''}
                    autoComplete="off"
                    spellCheck="false"
                  />
                  {isPwd && (
                    <button
                      type="button"
                      onClick={() => setShow(s => ({ ...s, [f.key]: !s[f.key] }))}
                      style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--m-ink-mute)', fontSize: 11, fontWeight: 600,
                      }}
                    >{visible ? t('set.integrations.hide') : t('set.integrations.show')}</button>
                  )}
                </div>
              </Field>
            );
          })}

          {tested && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, fontSize: 12.5,
              background: tested.ok ? 'rgba(63,156,92,0.10)' : 'var(--m-bad-soft)',
              color: tested.ok ? 'var(--m-good)' : 'var(--m-bad)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {tested.ok ? (
                <><i className="bi bi-check-circle-fill"/>{t('set.integrations.confirm_ok')}</>
              ) : (
                <><i className="bi bi-x-circle-fill"/>{tested.message}</>
              )}
            </div>
          )}

          {err && (
            <div style={{
              padding: '10px 12px', background: 'var(--m-bad-soft)',
              color: 'var(--m-bad)', borderRadius: 9, fontSize: 12.5,
            }}>{err}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="ghost" onClick={handleTest} disabled={busy !== null}>
              {busy === 'test' ? t('set.integrations.testing') : t('set.integrations.test')}
            </Button>
            <Button type="submit" variant="primary" disabled={busy !== null}>
              {busy === 'save' ? t('set.integrations.connecting') : t('set.integrations.connect')}
            </Button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

function WebhookStatusLine({ raw }) {
  // last_error endi uch xil prefiks bilan keladi:
  //   "ok @..."     — muvaffaqiyatli tx (yashil)
  //   "info @..."   — webhook keldi, lekin ball berilmadi (kulrang/sariq)
  //   boshqa        — haqiqiy xato (qizil)
  const text = String(raw || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  let tone = 'bad';
  if (lower.startsWith('ok @')) tone = 'good';
  else if (lower.startsWith('info @')) tone = 'warn';

  const styles = {
    good: { bg: 'rgba(63,156,92,0.10)', fg: 'var(--m-good)', icon: 'check-circle-fill' },
    warn: { bg: 'rgba(217,156,32,0.12)', fg: '#a26b00', icon: 'info-circle-fill' },
    bad:  { bg: 'var(--m-bad-soft)', fg: 'var(--m-bad)', icon: 'x-circle-fill' },
  }[tone];

  // "ok @..."/"info @..." prefiksini olib tashlab, qolganini ko'rsatamiz
  const display = text.replace(/^(ok|info) @[^:]+:\s*/i, '');

  return (
    <div style={{
      marginTop: 6, padding: '7px 10px', borderRadius: 7, fontSize: 11.5,
      background: styles.bg, color: styles.fg,
      display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4,
    }}>
      <i className={`bi bi-${styles.icon}`} style={{ marginTop: 1, flexShrink: 0 }}/>
      <span style={{ wordBreak: 'break-word' }}>{display || text}</span>
    </div>
  );
}

function ConnectedWebhookRow({ url, providerName }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          marginTop: 6, padding: '6px 10px', borderRadius: 7,
          background: 'transparent', border: '1px dashed var(--m-line)',
          color: 'var(--m-ink-soft)', fontSize: 11.5, fontWeight: 500,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
        }}
      >
        <i className="bi bi-link-45deg"/>
        {t('set.integrations.show_webhook')}
      </button>
    );
  }

  return (
    <div style={{
      marginTop: 6, padding: 10, borderRadius: 7,
      background: 'var(--m-surface-alt)', border: '1px solid var(--m-line)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--m-ink-mute)', marginBottom: 4, fontWeight: 600 }}>
        {t('set.integrations.webhook_url_label').replace('{name}', providerName)}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          readOnly
          value={url}
          onClick={(e) => e.target.select()}
          style={{
            width: '100%', padding: '7px 84px 7px 10px',
            borderRadius: 6, border: '1px solid var(--m-line)',
            background: 'var(--m-surface)', fontSize: 11.5,
            fontFamily: 'var(--m-mono)', color: 'var(--m-ink)',
          }}
        />
        <button
          onClick={copy}
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            padding: '4px 8px', borderRadius: 5,
            background: copied ? 'var(--m-good)' : 'var(--m-brand)',
            color: '#fff', border: 'none', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
          }}
        >
          <i className={`bi bi-${copied ? 'check2' : 'clipboard'}`}/>
          {copied ? t('set.integrations.copied') : t('set.integrations.copy')}
        </button>
      </div>
    </div>
  );
}
