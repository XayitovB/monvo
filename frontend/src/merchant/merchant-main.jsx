import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap-icons/font/bootstrap-icons.css';
import MerchantApp from './MerchantApp';
import ErrorBoundary from './ErrorBoundary';

// ── Telegram Mini App ──────────────────────────────────────────────────────
// Bot ichida (WebApp) ochilganda to'liq ekran + tasodifan yopilishni oldini
// oladi. Oddiy brauzerda window.Telegram.WebApp no-op — zarar yo'q.
(() => {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
    if (tg.setHeaderColor) tg.setHeaderColor('#0B2545');
    document.documentElement.classList.add('in-telegram');
  } catch { /* ignore */ }
})();

window.addEventListener('error', (e) => {
  console.error('[Merchant] window.error', e.error || e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Merchant] unhandledrejection', e.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <MerchantApp />
    </ErrorBoundary>
  </StrictMode>
);
