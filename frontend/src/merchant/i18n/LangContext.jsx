import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { STRINGS, SUPPORTED_LANGS, DEFAULT_LANG } from './strings';

const STORAGE_KEY = 'merchant_lang';
const LangContext = createContext(null);

function detectInitial() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  if (SUPPORTED_LANGS.includes(nav)) return nav;
  return DEFAULT_LANG;
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] != null ? String(params[key]) : `{${key}}`
  );
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(detectInitial);

  const setLang = useCallback((next) => {
    if (!SUPPORTED_LANGS.includes(next)) return;
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const t = useCallback((key, params) => {
    const dict = STRINGS[lang] || STRINGS[DEFAULT_LANG];
    const fallback = STRINGS[DEFAULT_LANG];
    const raw = dict[key] ?? fallback[key] ?? key;
    return interpolate(raw, params);
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be inside <LangProvider>');
  return ctx;
}

// Convenience hook for components that only care about the t() function.
export function useT() {
  return useLang().t;
}
