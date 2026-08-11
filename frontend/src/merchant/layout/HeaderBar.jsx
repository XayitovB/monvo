import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { I, Badge, Button, Avatar, Field, Input } from '../kit';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { fmtDate } from '../i18n/date';
import api from '../api';

function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div style={{
      display: 'inline-flex', background: 'var(--m-surface-alt)',
      borderRadius: 7, padding: 2, gap: 0,
    }}>
      {[{ id: 'uz', label: "O'z" }, { id: 'ru', label: 'RU' }].map((opt) => {
        const active = lang === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setLang(opt.id)}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
              background: active ? 'var(--m-surface)' : 'transparent',
              color: active ? 'var(--m-ink)' : 'var(--m-ink-mute)',
              border: 'none', borderRadius: 5, cursor: 'pointer',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,.05)' : 'none',
            }}
          >{opt.label}</button>
        );
      })}
    </div>
  );
}

export default function HeaderBar({ onMenuClick, showMenu = false }) {
  const { user, logout } = useAuth();
  const { t, lang } = useLang();
  const locale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
  const navigate = useNavigate();
  const ownerName = user?.owner_name || user?.name || user?.business_name || '—';
  const [menuOpen, setMenuOpen] = useState(false);
  const [credModal, setCredModal] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxMsgs, setInboxMsgs] = useState([]);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef(null);
  const inboxRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (!inboxOpen) return;
    function onDoc(e) {
      if (inboxRef.current && !inboxRef.current.contains(e.target)) setInboxOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [inboxOpen]);

  // Unread count polling (on mount)
  useEffect(() => {
    api.inboxUnread?.().then(r => setUnread(r?.unread || 0)).catch(() => {});
  }, []);

  async function openInbox() {
    setInboxOpen(o => !o);
    if (!inboxOpen) {
      try {
        const msgs = await api.inbox();
        setInboxMsgs(Array.isArray(msgs) ? msgs : []);
        setUnread(0);
      } catch { /* silent */ }
    }
  }

  async function markRead(mid) {
    try {
      await api.markInboxRead?.(mid);
      setInboxMsgs(m => m.map(x => x.id === mid ? { ...x, is_read: true } : x));
    } catch { /* silent */ }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: showMenu ? '10px 14px' : '11px 28px', borderBottom: '1px solid var(--m-line)',
      background: 'var(--m-surface)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {showMenu && (
          <button
            onClick={onMenuClick}
            aria-label="Menyu"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 4, display: 'flex', color: 'var(--m-ink-soft)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
        )}
        {user?.trial_days_left != null && user.trial_days_left > 0 && (
          <Badge tone="warn" dot>{t('header.trial', { days: user.trial_days_left })}</Badge>
        )}
        {user?.cards_total != null && (
          <span style={{ fontSize: 12, color: 'var(--m-ink-mute)' }}>
            {t('header.cards')}:{' '}
            <span style={{ fontFamily: 'var(--m-mono)', color: 'var(--m-ink-soft)' }}>
              {user.cards_total} / ∞
            </span>
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LangSwitcher/>
        <div style={{ width: 1, height: 18, background: 'var(--m-line)', margin: '0 4px' }}/>
        <div ref={inboxRef} style={{ position: 'relative' }}>
          <button
            onClick={openInbox}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 6,
              position: 'relative', color: inboxOpen ? 'var(--m-brand)' : 'var(--m-ink-soft)',
            }}
          >
            <I.bell size={18}/>
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: 2, width: 8, height: 8,
                background: 'var(--m-bad)', borderRadius: '50%',
                border: '1.5px solid var(--m-surface)',
              }}/>
            )}
          </button>
          {inboxOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              width: 340, maxHeight: 420, overflowY: 'auto',
              background: 'var(--m-surface)', border: '1px solid var(--m-line)',
              borderRadius: 14, boxShadow: '0 10px 30px -10px rgba(15,23,32,.2)',
              zIndex: 200,
            }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--m-line)', fontWeight: 600, fontSize: 14, color: 'var(--m-ink)' }}>
                {t('header.inbox')}
              </div>
              {inboxMsgs.length === 0 && (
                <div style={{ padding: 28, textAlign: 'center', color: 'var(--m-ink-mute)', fontSize: 13 }}>
                  {t('header.inboxEmpty')}
                </div>
              )}
              {inboxMsgs.map(m => (
                <div
                  key={m.id}
                  onClick={() => markRead(m.id)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--m-line)',
                    cursor: 'pointer', background: m.is_read ? 'transparent' : 'var(--m-brand-soft)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--m-surface-alt)'}
                  onMouseLeave={e => e.currentTarget.style.background = m.is_read ? 'transparent' : 'var(--m-brand-soft)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: m.is_read ? 400 : 600, color: 'var(--m-ink)' }}>{m.title}</span>
                    {!m.is_read && <span style={{ width: 7, height: 7, background: 'var(--m-brand)', borderRadius: '50%', flexShrink: 0, marginTop: 4 }}/>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--m-ink-mute)', lineHeight: 1.5 }}>{m.body}</div>
                  {m.created_at && (
                    <div style={{ fontSize: 11, color: 'var(--m-ink-mute)', marginTop: 4 }}>
                      {fmtDate(m.created_at, lang, { year: false, time: true })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            title={ownerName}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <Avatar name={ownerName} size={28}/>
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              minWidth: 220, background: 'var(--m-surface)',
              border: '1px solid var(--m-line)', borderRadius: 12,
              boxShadow: '0 10px 30px -10px rgba(15,23,32,.18)',
              padding: 6, zIndex: 50,
            }}>
              <div style={{
                padding: '8px 10px 10px', borderBottom: '1px solid var(--m-line)', marginBottom: 4,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--m-ink)' }}>{ownerName}</div>
                {user?.email && (
                  <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)', marginTop: 2 }}>
                    {user.email}
                  </div>
                )}
              </div>
              <MenuItem icon={<I.user size={14}/>} onClick={() => { setMenuOpen(false); navigate('/settings'); }}>
                {t('header.profile')}
              </MenuItem>
              <MenuItem icon={<I.lock size={14}/>} onClick={() => { setMenuOpen(false); setCredModal(true); }}>
                {t('header.credentials')}
              </MenuItem>
              <div style={{ height: 1, background: 'var(--m-line)', margin: '4px 0' }}/>
              <MenuItem
                icon={<I.logout size={14}/>}
                danger
                onClick={() => { setMenuOpen(false); logout(); navigate('/login'); }}
              >
                {t('nav.logout')}
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      {credModal && (
        <CredentialsModal
          currentLogin={user?.email}
          onClose={() => setCredModal(false)}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '8px 10px', background: 'transparent', border: 'none',
        borderRadius: 8, cursor: 'pointer', fontSize: 13,
        color: danger ? 'var(--m-bad)' : 'var(--m-ink)', textAlign: 'left',
      }}
      onMouseEnter={e => e.currentTarget.style.background = danger ? 'var(--m-bad-soft)' : 'var(--m-surface-alt)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: danger ? 'var(--m-bad)' : 'var(--m-ink-mute)' }}>{icon}</span>
      <span>{children}</span>
    </button>
  );
}

function CredentialsModal({ currentLogin, onClose }) {
  const { t } = useLang();
  const [currentPw, setCurrentPw] = useState('');
  const [newLogin, setNewLogin] = useState(currentLogin || '');
  const [newPw, setNewPw] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  async function save(e) {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!currentPw) return setErr(t('header.credModal.err.noCurrentPw'));
    const lg = newLogin.trim().toLowerCase();
    const pw = newPw.trim();
    const body = { current_password: currentPw };
    if (lg && lg !== (currentLogin || '').toLowerCase()) body.new_login = lg;
    if (pw) body.new_password = pw;
    if (!body.new_login && !body.new_password) return setErr(t('header.credModal.err.noChange'));
    setBusy(true);
    try {
      await api.updateCredentials(body);
      setMsg(t('header.credModal.saved'));
      setCurrentPw(''); setNewPw('');
      setTimeout(() => onClose?.(), 800);
    } catch (e2) {
      setErr(e2?.message || t('header.credModal.err.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,32,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--m-surface)', borderRadius: 16,
        width: 'min(440px, 100%)', border: '1px solid var(--m-line)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 18, borderBottom: '1px solid var(--m-line)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{t('header.credModal.title')}</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--m-ink-mute)', padding: 4,
          }}><I.x size={16}/></button>
        </div>

        <form onSubmit={save} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={t('header.credModal.currentPw')}>
            <div style={{ position: 'relative' }}>
              <Input
                type={showCur ? 'text' : 'password'}
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                autoComplete="current-password"
              />
              <ToggleEye on={showCur} onClick={() => setShowCur(s => !s)} t={t}/>
            </div>
          </Field>
          <Field label={t('header.credModal.newLogin')} hint={currentLogin ? `Joriy: ${currentLogin}` : ''}>
            <Input
              value={newLogin}
              onChange={e => setNewLogin(e.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
          </Field>
          <Field label={t('header.credModal.newPw')}>
            <div style={{ position: 'relative' }}>
              <Input
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="new-password"
              />
              <ToggleEye on={showNew} onClick={() => setShowNew(s => !s)} t={t}/>
            </div>
          </Field>

          {err && (
            <div style={{
              padding: '10px 12px', background: 'var(--m-bad-soft)',
              color: 'var(--m-bad)', borderRadius: 9, fontSize: 12.5,
            }}>{err}</div>
          )}
          {msg && (
            <div style={{
              padding: '10px 12px', background: 'rgba(63,156,92,0.10)',
              color: 'var(--m-good)', borderRadius: 9, fontSize: 12.5,
            }}>✓ {msg}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToggleEye({ on, onClick, t }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--m-ink-mute)', fontSize: 11, fontWeight: 600, padding: '4px 6px',
      }}
    >{on ? t('common.hide') : t('common.show')}</button>
  );
}
