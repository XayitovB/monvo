import React, { useEffect, useState, useCallback } from 'react';
// Self-hosted fontlar (Google Fonts @import o'rniga — render-blocking zanjir
// yo'qoladi). Aynan o'sha oilalar: Geist (latin+kirill, variable), Fraunces
// (opsz+wght, roman → italic faux, avvalgidek), JetBrains Mono 500/600.
import '@fontsource-variable/geist';
import '@fontsource-variable/fraunces/standard.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';
import { STRINGS } from './i18n';
import Nav from './sections/Nav.jsx';
import Hero from './sections/Hero.jsx';
import {
  LogoWall, Stats, HowItWorks, Features, DashSection, AppPreview, PosIntegrations,
} from './sections/MidSections.jsx';
import {
  Pricing, CaseStudy, Reviews, FAQ, DemoSection, AppDownload, Footer,
} from './sections/BottomSections.jsx';
import Legal from './sections/Legal.jsx';
import NotFound from './sections/NotFound.jsx';
import ChatWidget from './sections/ChatWidget.jsx';

// SEO indekslanadigan ma'lum yo'llar
const KNOWN_PATHS = new Set(['/', '/uz', '/ru', '/privacy', '/terms']);
function isKnownPath(p) {
  if (KNOWN_PATHS.has(p)) return true;
  return /^\/(uz|ru)(\/(privacy|terms))?\/?$/.test(p);
}

const LANG_KEY = 'monvo_lang';
const THEME_KEY = 'monvo_theme';

// SEO metadata per language — used to update <title>, meta description and OG tags
// when the user switches language. Keeps the document in sync with rendered content.
const SEO = {
  uz: {
    title: "Monvo — QR Loyalty Kartalar Platformasi · Toshkent, O'zbekiston",
    description: "Monvo — biznes uchun raqamli QR loyalty kartalar platformasi. Apple Wallet va Google Pay'da kartalar, push xabarlar, CRM va analitika. 1 200+ biznes ishlatadi. 14 kun bepul.",
    ogLocale: 'uz_UZ',
  },
  ru: {
    title: 'Monvo — Платформа цифровых карт лояльности · Ташкент, Узбекистан',
    description: 'Monvo — цифровые карты в Apple Wallet и Google Pay, push-рассылки, CRM и аналитика для бизнеса. Более 1 200 бизнесов в Ташкенте, Самарканде и Бухаре. 14 дней бесплатно.',
    ogLocale: 'ru_RU',
  },
};

function detectLang() {
  // Priority: /uz|/ru|/en pathname → ?lang= query → localStorage → browser → 'uz'
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path === '/uz' || path.startsWith('/uz/')) return 'uz';
    if (path === '/ru' || path.startsWith('/ru/')) return 'ru';
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('lang');
    if (fromQuery === 'uz' || fromQuery === 'ru') return fromQuery;
  }
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'ru' || saved === 'uz') return saved;
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  if (nav === 'ru') return 'ru';
  return 'uz';
}

function detectTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return 'light';
}

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

function applySeo(lang) {
  const seo = SEO[lang] || SEO.uz;
  document.title = seo.title;
  setMeta('meta[name="description"]', 'content', seo.description);
  setMeta('meta[property="og:title"]', 'content', seo.title);
  setMeta('meta[property="og:description"]', 'content', seo.description);
  setMeta('meta[property="og:locale"]', 'content', seo.ogLocale);
  setMeta('meta[name="twitter:title"]', 'content', seo.title);
  setMeta('meta[name="twitter:description"]', 'content', seo.description);
}

export default function LandingApp() {
  const [lang, setLangState] = useState(detectLang);
  const [theme, setThemeState] = useState(detectTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
    applySeo(lang);
    // Sync URL — prefer path-based (/uz, /ru, /en) since the backend renders
    // language-specific meta on those routes; fall back to ?lang= when on '/'.
    try {
      const path = window.location.pathname || '';
      const onLangPath = path === '/uz' || path === '/ru' || path === '/en' || path.startsWith('/uz/') || path.startsWith('/ru/') || path.startsWith('/en/');
      if (onLangPath) {
        const want = `/${lang}${path.replace(/^\/(uz|ru|en)/, '')}`;
        if (path !== want && want.length > 0) {
          window.history.replaceState({}, '', want + window.location.search + window.location.hash);
        }
      } else {
        const url = new URL(window.location.href);
        if (url.searchParams.get('lang') !== lang) {
          url.searchParams.set('lang', lang);
          window.history.replaceState({}, '', url.toString());
        }
      }
    } catch { /* no-op */ }
  }, [lang]);

  const setLang = useCallback((v) => setLangState(v), []);
  const toggleTheme = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  const T = STRINGS[lang] || STRINGS.uz;

  const onCta = useCallback(() => {
    const demoForm = document.querySelector('section form input');
    if (demoForm) {
      demoForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => demoForm.focus(), 600);
    } else {
      document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Detect legal pages from pathname (after hooks)
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const legalPage = path.endsWith('/privacy') ? 'privacy' : (path.endsWith('/terms') ? 'terms' : null);

  if (legalPage) {
    return <Legal T={T} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} page={legalPage} />;
  }

  // Noma'lum yo'l → 404 (soft-404 o'rniga noindex)
  if (path && !isKnownPath(path)) {
    return <NotFound T={T} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} />;
  }

  return (
    <div className="k-root">
      <Nav T={T} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} onCta={onCta}/>
      <main>
        <Hero T={T} onCta={onCta}/>
        <LogoWall T={T}/>
        <Stats T={T}/>
        <HowItWorks T={T}/>
        <Features T={T}/>
        <PosIntegrations T={T}/>
        <DashSection T={T}/>
        <AppPreview T={T}/>
        <Pricing T={T} onCta={onCta}/>
        <CaseStudy T={T}/>
        <Reviews T={T} lang={lang}/>
        <FAQ T={T}/>
        <DemoSection T={T}/>
        <AppDownload T={T}/>
      </main>
      <Footer T={T} lang={lang} setLang={setLang}/>
      <ChatWidget T={T}/>
    </div>
  );
}
