// theme.js — Monvo HF design tokens, ported 1:1 from the Flutter app
// (lib/theme/app_theme.dart). Light + dark variants. Resolved against the
// Telegram WebApp colorScheme so the mini-app matches the user's Telegram theme.
import { tg } from './tg'

// ── HF tokens · light ────────────────────────────────────────────────────────
const LIGHT = {
  paper: '#FAFAF7',
  paperAlt: '#F1EFE9',
  paperRaised: '#FFFFFF',
  ink: '#15151A',
  inkSoft: '#3A3A44',
  inkMute: '#6E6E78',
  inkFaint: '#AEAEB6',
  line: '#E6E4DC',
  lineStrong: '#D4D2C9',
  accent: '#2F6B3F',
  accentSoft: '#E5F2E8',
  accentDeep: '#1F4D2C',
  good: '#3F9C5C',
  goodSoft: '#E6F4EA',
  warn: '#C97A1E',
  warnSoft: '#FBF0E0',
  danger: '#C8453B',
  dangerSoft: '#FBE8E6',
  isDark: false,
}

// ── HF tokens · dark ───────────────────────────────────────────────────────────
const DARK = {
  paper: '#14141A',
  paperAlt: '#1F1F26',
  paperRaised: '#1A1A20',
  ink: '#F4F3EE',
  inkSoft: '#D2D1CB',
  inkMute: '#8A8A93',
  inkFaint: '#4A4A52',
  line: '#2A2A32',
  lineStrong: '#36363E',
  accent: '#5FAE6F',
  accentSoft: '#1B2D21',
  accentDeep: '#84CC16',
  good: '#5FAE6F',
  goodSoft: '#1B2D21',
  warn: '#E0A45A',
  warnSoft: '#2A2117',
  danger: '#E0655B',
  dangerSoft: '#2A1715',
  isDark: true,
}

// Tier colours (shared)
export const TIER = {
  bronze: '#CD7F32',
  silver: '#A8A9AD',
  gold: '#D4AF37',
  platinum: '#9FB4C7',
}

export function resolveTheme(mode) {
  // mode: 'light' | 'dark' | 'system'
  let dark
  if (mode === 'dark') dark = true
  else if (mode === 'light') dark = false
  else dark = (tg?.colorScheme || 'light') === 'dark'
  return dark ? DARK : LIGHT
}

// ── Helpers ────────────────────────────────────────────────────────────────────
export function hexA(hex, alpha) {
  const h = (hex || '').replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function lerpToBlack(hex, t) {
  const h = (hex || '#2F6B3F').replace('#', '')
  if (h.length !== 6) return hex
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - t))
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - t))
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - t))
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// Thousands-grouped with thin space, matching the Flutter formatter.
export function groupSep(n) {
  return Math.round(Number(n) || 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

export const FONT =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
export const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"
