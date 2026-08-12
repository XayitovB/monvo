import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { I, T, Button, Input, Field, MonvoLogo } from '../kit';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import '../merchant.css';

// User icon (login uchun)
const UserIcon = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none"
       stroke={p.color || 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

// Lock icon (Icon.jsx kitida yo'q — inline)
const LockIcon = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none"
       stroke={p.color || 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const EyeOffIcon = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24M10.73 5.08a11 11 0 0 1 12.13 6.92 11 11 0 0 1-1.51 2.42M6.61 6.61A13.5 13.5 0 0 0 1 12s4 8 11 8a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20"/>
  </svg>
);

// Telegram bot orqali ochilganmi — shunda "sayt"ga o'xshamasligi uchun
// marketing hero karta va tashqi ro'yxatdan o'tish havolasi olib tashlanadi.
const isTelegramWebApp = typeof window !== 'undefined' && !!window.Telegram?.WebApp?.initData;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { t, lang, setLang } = useLang();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loginHint, setLoginHint] = useState(null);

  useEffect(() => {
    document.title = 'Monvo Business — Login';
    fetch('/admin/login-hint')
      .then(r => r.json())
      .then(d => setLoginHint(d))
      .catch(() => {});
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    const id = identifier.trim();
    if (!id) { setError(t('login.errLoginEmpty')); return; }
    if (!password) { setError(t('login.errPasswordEmpty')); return; }

    setLoading(true);
    try {
      const result = await login({ email: id, password });
      // Admin login bo'lsa — /panel/dashboard ga (boshqa SPA), aks holda merchant
      if (result?.kind === 'admin') {
        window.location.href = '/panel/dashboard';
        return;
      }
      const to = location.state?.from?.pathname || '/dashboard';
      navigate(to, { replace: true });
    } catch (err) {
      const msg = err?.status === 401
        ? t('login.errBadCredentials')
        : (err?.message || t('login.errLoginFailed'));
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const formBlock = (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Field label={t('login.username')} required>
        <Input
          icon={<UserIcon/>}
          type="text"
          placeholder={t('login.usernamePlaceholder')}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          autoFocus
        />
      </Field>

      <Field label={t('login.password')} required>
        <div style={{ position: 'relative' }}>
          <Input
            icon={<LockIcon/>}
            type={showPw ? 'text' : 'password'}
            placeholder={t('login.passwordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--m-ink-mute)', padding: 4, display: 'flex',
            }}
          >
            {showPw ? <EyeOffIcon size={16}/> : <I.eye size={16}/>}
          </button>
        </div>
      </Field>

      {error && (
        <div style={{
          padding: '10px 12px', background: 'var(--m-bad-soft)',
          color: 'var(--m-bad)', borderRadius: 9, fontSize: 12.5, lineHeight: 1.4,
        }}>{error}</div>
      )}

      <Button
        type="submit" variant="primary" size="lg" full
        iconRight={loading ? null : <I.arrowR/>}
        disabled={loading || !identifier || !password}
        style={loading ? { opacity: 0.7, cursor: 'wait' } : undefined}
      >
        {loading ? t('login.signingIn') : t('login.signIn')}
      </Button>

      <div style={{ fontSize: 11.5, color: 'var(--m-ink-mute)', lineHeight: 1.5 }}>
        {t('login.terms')}
      </div>
    </form>
  );

  const loginHintBlock = (loginHint?.admin || loginHint?.merchant) && (
    <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.55, textAlign: 'center', lineHeight: 1.6 }}>
      {loginHint.admin && <div>{loginHint.admin}</div>}
      {loginHint.merchant && <div>{loginHint.merchant}</div>}
    </div>
  );

  // ── Telegram Mini App: soddaroq, "ilova"ga o'xshash ko'rinish — marketing
  // hero karta va tashqi (brauzerga chiqib ketadigan) ro'yxatdan o'tish
  // havolasi yo'q, chunki merchant botga taklif qilingan biznes egasi bo'ladi.
  if (isTelegramWebApp) {
    return (
      <div className="merchant-root">
        <div style={{
          minHeight: '100vh', background: 'var(--m-bg)',
          display: 'flex', flexDirection: 'column',
          padding: '20px 20px 32px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ display: 'inline-flex', background: 'var(--m-surface-alt)', borderRadius: 7, padding: 2 }}>
              {[{ id: 'uz', label: "O'z" }, { id: 'ru', label: 'RU' }].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setLang(opt.id)}
                  style={{
                    padding: '4px 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: 0.4,
                    background: lang === opt.id ? 'var(--m-surface)' : 'transparent',
                    color: lang === opt.id ? 'var(--m-ink)' : 'var(--m-ink-mute)',
                    border: 'none', borderRadius: 5, cursor: 'pointer',
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
            width: '100%', maxWidth: 420, margin: '0 auto', gap: 24,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <MonvoLogo size={30}/>
              <div style={{ ...T.h1, textAlign: 'center' }}>{t('login.title')}</div>
              <div style={{ ...T.body, textAlign: 'center' }}>{t('login.subtitle')}</div>
            </div>
            {formBlock}
            {loginHintBlock}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="merchant-root">
      <div style={{
        minHeight: '100vh', background: 'var(--m-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}>
        <div style={{
          width: '100%', maxWidth: 460, background: 'var(--m-surface)',
          borderRadius: 24, overflow: 'hidden',
          border: '1px solid var(--m-line)',
          boxShadow: '0 30px 60px -20px rgba(15,23,32,.18)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Top dark hero */}
          <div style={{
            background: '#0E0F0C', color: '#fff',
            padding: '32px 28px 28px',
            borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <MonvoLogo size={26} mono/>
              <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,.10)', borderRadius: 7, padding: 2 }}>
                {[{ id: 'uz', label: "O'z" }, { id: 'ru', label: 'RU' }].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setLang(opt.id)}
                    style={{
                      padding: '4px 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: 0.4,
                      background: lang === opt.id ? '#fff' : 'transparent',
                      color: lang === opt.id ? '#0E0F0C' : '#fff',
                      border: 'none', borderRadius: 5, cursor: 'pointer',
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 28 }}>
              <div style={{
                fontFamily: 'var(--m-display)', fontSize: 28, fontWeight: 500,
                fontStyle: 'italic', letterSpacing: -0.6, lineHeight: 1.1,
                whiteSpace: 'pre-line',
              }}>{t('login.heroTitle')}</div>
              <div style={{
                fontSize: 13.5, color: 'rgba(255,255,255,.7)',
                marginTop: 12, lineHeight: 1.55,
              }}>{t('login.heroBody')}</div>
            </div>
          </div>

          {/* Form body */}
          <div style={{
            background: 'var(--m-surface)',
            padding: '28px 28px 32px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div>
              <div style={{ ...T.h1, fontSize: 24 }}>{t('login.title')}</div>
              <div style={{ ...T.body, marginTop: 4 }}>{t('login.subtitle')}</div>
            </div>

            {formBlock}

            {/* Sign-up CTA box */}
            <div style={{
              marginTop: 8, padding: 14, background: 'var(--m-surface-alt)',
              borderRadius: 12, fontSize: 12, color: 'var(--m-ink-soft)',
              textAlign: 'center', lineHeight: 1.55,
            }}>
              {t('login.noAccount')}{' '}
              <a href="https://monvo.uz#pricing"
                 style={{ color: 'var(--m-brand)', fontWeight: 600, textDecoration: 'none' }}>
                {t('login.register')}
              </a>
            </div>

            {loginHintBlock}
          </div>
        </div>
      </div>
    </div>
  );
}
