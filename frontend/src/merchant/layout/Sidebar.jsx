import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { I, MonvoLogo } from '../kit';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { APP_VERSION } from '../../version';

const SidebarItem = ({ icon, label, to, badge, locked }) => {
  const { pathname } = useLocation();
  const active = pathname === to || pathname.startsWith(to + '/');
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(to)} style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: '8px 11px', borderRadius: 8,
      color: active ? 'var(--m-brand-ink)' : 'var(--m-ink-soft)',
      background: active ? 'var(--m-brand-soft)' : 'transparent',
      fontSize: 13, fontWeight: active ? 500 : 400,
      cursor: 'pointer', position: 'relative',
      opacity: locked ? 0.6 : 1,
    }}>
      {React.cloneElement(icon, { size: 17, style: { color: active ? 'var(--m-brand)' : 'var(--m-ink-mute)', flexShrink: 0 } })}
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {locked && (
        <I.lock size={13} style={{ color: 'var(--m-ink-mute)', flexShrink: 0 }}/>
      )}
      {!locked && badge != null && badge !== '' && (
        <span style={{
          background: active ? 'var(--m-brand)' : 'var(--m-line-strong)',
          color: active ? '#fff' : 'var(--m-ink-soft)',
          fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 5,
          fontFamily: 'var(--m-mono)',
        }}>{badge}</span>
      )}
      {active && <span style={{
        position: 'absolute', left: -16, top: 6, bottom: 6, width: 2,
        background: 'var(--m-brand)', borderRadius: '0 2px 2px 0',
      }}/>}
    </div>
  );
};

const SidebarSection = ({ title, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginBottom: 4 }}>
    {title && <div style={{
      fontSize: 10.5, fontWeight: 600, color: 'var(--m-ink-mute)',
      letterSpacing: 0.6, textTransform: 'uppercase',
      padding: '14px 11px 8px',
    }}>{title}</div>}
    {children}
  </div>
);

export default function Sidebar({ mobile = false, open = false, onClose }) {
  const { user, hasFeature } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const businessName = user?.business_name || user?.name || 'Monvo';
  const logoUrl = user?.logo_url || user?.logo || '';
  const initials = businessName.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  const tariff = user?.tariff || 'Pro';
  const trialDays = user?.trial_days_left;

  const asideStyle = mobile
    ? {
        width: 264, flexShrink: 0,
        background: 'var(--m-surface)',
        borderRight: '1px solid var(--m-line)',
        display: 'flex', flexDirection: 'column',
        padding: '0 16px',
        height: '100vh',
        position: 'fixed', top: 0, left: 0, zIndex: 60,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .25s ease',
        boxShadow: open ? '8px 0 40px rgba(0,0,0,.22)' : 'none',
        overflowY: 'auto',
      }
    : {
        width: 232, flexShrink: 0,
        background: 'var(--m-surface)',
        borderRight: '1px solid var(--m-line)',
        display: 'flex', flexDirection: 'column',
        padding: '0 16px',
        height: '100vh',
        position: 'sticky',
        top: 0,
      };

  // Mobil drawer'da har qanday navigatsiyadan keyin yopiladi (event bubbling).
  const handleNavClick = mobile ? () => onClose?.() : undefined;

  return (
    <aside style={asideStyle} onClick={handleNavClick}>
      <div style={{ padding: '18px 4px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <MonvoLogo size={20}/>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 10px', borderRadius: 9,
        background: 'var(--m-surface-alt)',
        border: '1px solid var(--m-line)',
        marginBottom: 8, cursor: 'pointer',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6, background: 'var(--m-brand)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, flexShrink: 0, overflow: 'hidden',
        }}>
          {logoUrl
            ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--m-ink)', lineHeight: 1.2 }}>{businessName}</div>
          <div style={{ fontSize: 10.5, color: 'var(--m-ink-mute)' }}>{tariff}</div>
        </div>
      </div>


      <div style={{ flex: 1, overflowY: 'auto', marginTop: 4, marginLeft: -2, paddingRight: 2 }}>
        <SidebarSection>
          <SidebarItem icon={<I.home/>} label={t('nav.dashboard')} to="/dashboard"/>
        </SidebarSection>

        <SidebarSection title={t('nav.crm')}>
          <SidebarItem icon={<I.users/>} label={t('nav.customers')} to="/customers" badge={user?.cards_total}/>
          <SidebarItem icon={<I.card/>} label={t('nav.cards')} to="/cards" badge={user?.cards_total}/>
          <SidebarItem icon={<I.receipt/>} label={t('nav.transactions')} to="/transactions"/>
        </SidebarSection>

        <SidebarSection title={t('nav.growth')}>
          <SidebarItem icon={<I.sparkles/>} label={t('nav.loyalty')} to="/loyalty"/>
          <SidebarItem icon={<I.bell/>} label={t('nav.push')} to="/push"/>
          <SidebarItem icon={<I.chart/>} label={t('nav.analytics')} to="/analytics"/>
        </SidebarSection>

        <SidebarSection title={t('nav.ops')}>
          <SidebarItem icon={<I.branch/>} label={t('nav.branches')} to="/branches"/>
          <SidebarItem icon={<I.staff/>} label={t('nav.staff')} to="/staff"/>
          <SidebarItem icon={<I.sparkles/>} label={t('nav.design')} to="/design" locked={!hasFeature('card_design_custom')}/>
          <SidebarItem icon={<I.qr/>} label={t('nav.qr')} to="/qr"/>
        </SidebarSection>

        <SidebarSection title={t('nav.developer')}>
          <SidebarItem icon={<I.zap/>} label={t('nav.api_tokens')} to="/api-tokens" locked={!hasFeature('api_access')}/>
        </SidebarSection>

        <SidebarSection title={t('nav.account')}>
          <SidebarItem icon={<I.wallet/>} label={t('nav.billing')} to="/billing"/>
          <SidebarItem icon={<I.cog/>} label={t('nav.settings')} to="/settings"/>
        </SidebarSection>
      </div>

      {trialDays != null && trialDays > 0 && (
        <div style={{
          margin: '8px 0 12px', padding: 14, borderRadius: 11,
          background: 'linear-gradient(135deg, var(--m-brand) 0%, color-mix(in oklab, var(--m-brand) 70%, #000) 100%)',
          color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <I.zap size={14} fill="rgba(255,255,255,.2)"/>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{t('nav.trial.title', { days: trialDays })}</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.4, marginBottom: 8 }}>
            {t('nav.trial.subtitle')}
          </div>
          <div
            onClick={() => navigate('/billing')}
            style={{
              background: 'rgba(255,255,255,0.95)', color: 'var(--m-brand-ink)',
              padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 500,
              textAlign: 'center', cursor: 'pointer',
            }}>{t('nav.trial.cta')}</div>
        </div>
      )}

      <div style={{
        textAlign: 'center', fontSize: 11, color: 'var(--m-ink-mute)',
        padding: '8px 0 4px', opacity: 0.7,
      }}>
        Monvo · v{APP_VERSION}
      </div>
    </aside>
  );
}
