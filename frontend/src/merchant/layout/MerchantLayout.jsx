import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import HeaderBar from './HeaderBar';
import LoyaltySetupBanner from './LoyaltySetupBanner';
import { useIsMobile } from '../hooks/useIsMobile';
import '../merchant.css';

export default function MerchantLayout({ theme = 'light', brand = '#2F6B3F' }) {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Sahifa almashganda yoki desktopga o'tganda drawer'ni yopamiz.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  useEffect(() => {
    const root = document.querySelector('.merchant-root');
    if (root) {
      root.setAttribute('data-theme', theme);
      root.style.setProperty('--m-brand', brand);
      const soft = theme === 'dark'
        ? `color-mix(in oklab, ${brand} 30%, #161A22 70%)`
        : `color-mix(in oklab, ${brand} 12%, #FFFFFF 88%)`;
      root.style.setProperty('--m-brand-soft', soft);
      root.style.setProperty('--m-brand-ink', theme === 'dark' ? '#F2F4F7' : brand);
    }
  }, [theme, brand]);

  return (
    <div className="merchant-root" data-theme={theme}>
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--m-bg)',
        color: 'var(--m-ink)',
        fontFamily: 'var(--m-sans)',
      }}>
        {isMobile ? (
          <>
            <Sidebar mobile open={drawerOpen} onClose={() => setDrawerOpen(false)}/>
            {drawerOpen && (
              <div
                onClick={() => setDrawerOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 55 }}
              />
            )}
          </>
        ) : (
          <Sidebar/>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <HeaderBar onMenuClick={() => setDrawerOpen(true)} showMenu={isMobile}/>
          <LoyaltySetupBanner/>
          <main style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
            <Outlet/>
          </main>
        </div>
      </div>
    </div>
  );
}
