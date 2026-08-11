// store.jsx — app-wide state: auth/me, cards, settings (lang + theme), resolved
// theme tokens, and a navigation stack wired to Telegram's BackButton.
import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { api, getToken } from './api'
import { resolveTheme } from './theme'
import { t as tr } from './i18n'
import { setBackButton, onThemeChanged, setHeaderColor, setBackgroundColor, getTgUser, colorScheme } from './tg'

const Ctx = createContext(null)
export function useApp() { return useContext(Ctx) }
export function useT() {
  const { lang } = useApp()
  return useCallback((key, fb) => tr(lang, key, fb), [lang])
}
export function useTheme() { return useApp().theme }

const LANG_KEY = 'tg_lang'
const THEME_KEY = 'tg_theme_mode' // 'light' | 'dark' | 'system'

export function AppProvider({ children }) {
  const [me, setMe] = useState(null)
  const [cards, setCards] = useState(null)
  const [cardsLoading, setCardsLoading] = useState(false)
  const [lang, setLangState] = useState(localStorage.getItem(LANG_KEY) || 'uz')
  const [themeMode, setThemeMode] = useState(localStorage.getItem(THEME_KEY) || 'system')
  const [scheme, setScheme] = useState(colorScheme())

  // ── Navigation stack ──
  // Base layer is the active tab; everything pushed sits on top.
  const [tab, setTab] = useState('home')
  const [stack, setStack] = useState([]) // [{ screen, props }]

  const theme = useMemo(() => resolveTheme(themeMode), [themeMode, scheme])

  // Telegram theme changes (user flips dark mode) → re-resolve when in system mode.
  useEffect(() => onThemeChanged(() => setScheme(colorScheme())), [])

  // Paint Telegram chrome to match our theme.
  useEffect(() => {
    setHeaderColor(theme.paper)
    setBackgroundColor(theme.paper)
    document.body.style.background = theme.paper
    document.body.style.color = theme.ink
  }, [theme])

  // ── Settings setters ──
  const setLang = useCallback((l) => {
    setLangState(l)
    localStorage.setItem(LANG_KEY, l)
    if (getToken()) api.updateLanguage(l).catch(() => {})
  }, [])
  const setMode = useCallback((m) => {
    setThemeMode(m)
    localStorage.setItem(THEME_KEY, m)
  }, [])

  // ── Data loaders ──
  const loadMe = useCallback(async () => {
    try {
      const u = await api.getMe()
      setMe(u)
      if (u?.language && u.language !== lang) setLang(u.language)
      return u
    } catch (_) { return null }
  }, [lang, setLang])

  const loadCards = useCallback(async () => {
    setCardsLoading(true)
    try {
      const c = await api.getMyCards()
      setCards(Array.isArray(c) ? c : [])
    } catch (_) {
      setCards(prev => prev || [])
    } finally {
      setCardsLoading(false)
    }
  }, [])

  // ── Navigation ──
  const push = useCallback((screen, props = {}) => {
    setStack(s => [...s, { screen, props }])
  }, [])
  const pop = useCallback(() => setStack(s => s.slice(0, -1)), [])
  const popToRoot = useCallback(() => setStack([]), [])
  const switchTab = useCallback((tabKey) => { setStack([]); setTab(tabKey) }, [])

  // Wire Telegram BackButton to the stack depth.
  const popRef = useRef(pop)
  popRef.current = pop
  useEffect(() => {
    return setBackButton(stack.length > 0, () => popRef.current())
  }, [stack.length])

  const value = {
    me, setMe, loadMe,
    cards, cardsLoading, loadCards, setCards,
    lang, setLang,
    themeMode, setMode, theme,
    tgUser: getTgUser(),
    // nav
    tab, switchTab, stack, push, pop, popToRoot,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
