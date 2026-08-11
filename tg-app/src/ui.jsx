// ui.jsx — shared HF-style UI primitives, ported from lib/widgets/hf_kit.dart.
// Every component reads the resolved theme via useTheme().
import { useTheme } from './store'
import { hexA, FONT, MONO } from './theme'
import { haptic } from './tg'

// ── Screen scaffold (page with optional app bar) ─────────────────────────────────
export function Screen({ children, padded = false }) {
  const t = useTheme()
  return (
    <div style={{ minHeight: '100%', background: t.paper, color: t.ink, fontFamily: FONT }}>
      <div style={{ padding: padded ? '0 20px' : 0, paddingBottom: 24 }}>{children}</div>
    </div>
  )
}

// ── App bar — centered title, 56px, bottom hairline (HFAppBar 1:1) ────────────────
export function AppBar({ title, subtitle, leading, trailing, transparent = false }) {
  const t = useTheme()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 56, padding: '0 16px',
      position: 'sticky', top: 0, zIndex: 20,
      background: transparent ? 'transparent' : t.paper,
      borderBottom: transparent ? 'none' : `0.5px solid ${t.line}`,
    }}>
      <div style={{ width: 40, flexShrink: 0 }}>{leading}</div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {title ? <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2, color: t.ink, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div> : null}
        {subtitle ? <div style={{ fontSize: 10, color: t.inkMute, marginTop: 1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div> : null}
      </div>
      <div style={{ width: 40, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>{trailing}</div>
    </div>
  )
}

// ── Icon button ──────────────────────────────────────────────────────────────────
export function IconBtn({ children, onClick, badge = false, accent = false }) {
  const t = useTheme()
  return (
    <button
      onClick={() => { haptic('light'); onClick?.() }}
      style={{
        position: 'relative', width: 36, height: 36, flexShrink: 0,
        borderRadius: 12, border: 'none', cursor: 'pointer',
        background: accent ? t.accentSoft : t.paperAlt,
        color: accent ? t.accent : t.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {children}
      {badge ? (
        <span style={{
          position: 'absolute', top: 6, right: 6, width: 8, height: 8,
          borderRadius: 4, background: t.accent, border: `1.5px solid ${t.paperAlt}`,
        }} />
      ) : null}
    </button>
  )
}

// ── Back button (chevron, pops nav stack) ────────────────────────────────────────
export function BackBtn({ onClick }) {
  return (
    <IconBtn onClick={onClick}>
      <Icon name="chevron-left" size={20} />
    </IconBtn>
  )
}

// ── Primary / secondary / accent button ──────────────────────────────────────────
// HFButton 1:1. variants: accent · primary(ink) · ghost · soft(paperAlt) · dark ·
// outline. `fg` overrides the foreground (e.g. soft + red for logout).
export function Button({ children, onClick, variant = 'primary', disabled, full = true, small = false, leading, fg }) {
  const t = useTheme()
  const styles = {
    accent: { bg: t.accent, fg: '#fff', border: 'none' },
    primary: { bg: t.ink, fg: t.paper, border: 'none' },
    ink: { bg: t.ink, fg: t.paper, border: 'none' },
    ghost: { bg: 'transparent', fg: t.ink, border: 'none' },
    soft: { bg: t.paperAlt, fg: t.ink, border: 'none' },
    outline: { bg: 'transparent', fg: t.ink, border: `1px solid ${t.line}` },
    danger: { bg: t.paperAlt, fg: t.danger, border: 'none' },
    dark: { bg: 'rgba(255,255,255,0.1)', fg: '#fff', border: 'none' },
  }[variant] || { bg: t.ink, fg: t.paper, border: 'none' }
  const color = fg || styles.fg
  return (
    <button
      onClick={() => { if (!disabled) { haptic('light'); onClick?.() } }}
      disabled={disabled}
      style={{
        width: full ? '100%' : 'auto',
        minHeight: small ? 36 : 50, padding: small ? '8px 14px' : '13px 20px',
        borderRadius: small ? 10 : 14,
        background: styles.bg, color, border: styles.border,
        fontFamily: FONT, fontSize: small ? 12 : 14, fontWeight: 600, letterSpacing: -0.1,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
      {leading}
      {children}
    </button>
  )
}

// ── Section header / eyebrow ─────────────────────────────────────────────────────
export function SectionHeader({ title, trailing, onTrailing }) {
  const t = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 20px', margin: '2px 0' }}>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 700, letterSpacing: -0.2, color: t.ink }}>{title}</div>
      {trailing ? (
        <button onClick={() => { haptic('light'); onTrailing?.() }}
          style={{ border: 'none', background: 'none', color: t.inkMute, fontWeight: 500, fontSize: 12, cursor: 'pointer', fontFamily: FONT }}>
          {trailing}
        </button>
      ) : null}
    </div>
  )
}

export function Eyebrow({ children }) {
  const t = useTheme()
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: t.inkMute }}>
      {children}
    </div>
  )
}

// ── Card container ───────────────────────────────────────────────────────────────
export function Card({ children, style, onClick, pad = 16 }) {
  const t = useTheme()
  return (
    <div
      onClick={onClick ? () => { haptic('light'); onClick() } : undefined}
      style={{
        background: t.paperRaised, borderRadius: 18, border: `1px solid ${t.line}`,
        padding: pad, cursor: onClick ? 'pointer' : 'default', ...style,
      }}>
      {children}
    </div>
  )
}

// ── Chip ─────────────────────────────────────────────────────────────────────────
export function Chip({ children, active, accent, onClick }) {
  const t = useTheme()
  const bg = active ? (accent ? t.accent : t.ink) : t.paperRaised
  const fg = active ? '#fff' : t.ink
  return (
    <button onClick={() => { haptic('light'); onClick?.() }}
      style={{
        padding: '6px 12px', borderRadius: 99, cursor: 'pointer',
        background: bg, color: fg, fontFamily: FONT, fontSize: 12, fontWeight: 500,
        whiteSpace: 'nowrap', border: active ? 'none' : `1px solid ${t.line}`,
      }}>
      {children}
    </button>
  )
}

// ── Spinner ──────────────────────────────────────────────────────────────────────
export function Spinner({ size = 28, color }) {
  const t = useTheme()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `${Math.max(2, size / 12)}px solid ${hexA(t.inkMute, 0.2)}`,
      borderTopColor: color || t.accent,
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

export function Center({ children, minH = '60vh' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: minH, padding: 24, textAlign: 'center' }}>
      {children}
    </div>
  )
}

// ── Empty / error states ─────────────────────────────────────────────────────────
export function EmptyState({ icon = 'gift', title, subtitle, action }) {
  const t = useTheme()
  return (
    <Center>
      <div style={{
        width: 96, height: 96, borderRadius: 48, background: t.accentSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
      }}>
        <Icon name={icon} size={42} color={t.accent} />
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: t.ink, letterSpacing: -0.3 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 13, color: t.inkMute, marginTop: 8, lineHeight: 1.5, maxWidth: 280 }}>{subtitle}</div> : null}
      {action ? <div style={{ marginTop: 22, width: '100%', maxWidth: 280 }}>{action}</div> : null}
    </Center>
  )
}

export function ErrorState({ message, onRetry, retryLabel = 'Retry' }) {
  const t = useTheme()
  return (
    <Center>
      <Icon name="cloud-off" size={46} color={t.inkFaint} />
      <div style={{ fontSize: 13, color: t.inkMute, marginTop: 12, maxWidth: 280 }}>{message}</div>
      {onRetry ? <div style={{ marginTop: 16 }}><Button variant="accent" onClick={onRetry} full={false}>{retryLabel}</Button></div> : null}
    </Center>
  )
}

// ── Monvo wordmark logo (PNG includes the wordmark, like MonvoLogo) ────────────
export function Logo({ height = 28, white }) {
  const t = useTheme()
  const useWhite = white ?? t.isDark
  const src = `${import.meta.env.BASE_URL}branding/monvo-logo-${useWhite ? 'white' : 'green'}.png?v=2`
  return <img src={src} alt="Monvo" style={{ height, width: 'auto', objectFit: 'contain', display: 'block' }} />
}

// ── Merchant logo / avatar ───────────────────────────────────────────────────────
export function MerchantLogo({ name, logoUrl, size = 40, radius = 10, textColor = '#fff', bg }) {
  const t = useTheme()
  const initial = (name || '?').trim()[0]?.toUpperCase() || '?'
  if (logoUrl) {
    return (
      <img src={logoUrl} alt="" width={size} height={size}
        onError={(e) => { e.currentTarget.style.display = 'none' }}
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: bg || hexA('#FFFFFF', 0.2),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: textColor, fontSize: size * 0.4, fontWeight: 800,
    }}>{initial}</div>
  )
}

// ── Row item (settings / list) ───────────────────────────────────────────────────
export function Row({ icon, iconColor, title, subtitle, trailing, onClick, danger }) {
  const t = useTheme()
  return (
    <div onClick={onClick ? () => { haptic('light'); onClick() } : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', cursor: onClick ? 'pointer' : 'default' }}>
      {icon ? (
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: danger ? t.dangerSoft : t.paperAlt,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={icon} size={16} color={danger ? t.danger : (iconColor || t.ink)} />
        </div>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: danger ? t.danger : t.ink }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 12, color: t.inkMute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div> : null}
      </div>
      {trailing ?? (onClick ? <Icon name="chevron-right" size={16} color={t.inkFaint} /> : null)}
    </div>
  )
}

// ── Inline SVG icon set (Lucide-style strokes) ───────────────────────────────────
const PATHS = {
  'chevron-left': <polyline points="15 18 9 12 15 6" />,
  'chevron-right': <polyline points="9 18 15 12 9 6" />,
  close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  card: <><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
  store: <><path d="M3 9l1-5h16l1 5" /><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M4 9h16" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  qr: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><line x1="14" y1="14" x2="14" y2="17" /><line x1="17" y1="14" x2="21" y2="14" /><line x1="21" y1="17" x2="21" y2="21" /><line x1="14" y1="21" x2="17" y2="21" /></>,
  history: <><polyline points="12 8 12 12 14 14" /><path d="M3.05 11a9 9 0 1 0 .5-4H1" /><polyline points="1 3 1 7 5 7" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  gift: <><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></>,
  search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  'cloud-off': <><path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3" /><line x1="1" y1="1" x2="23" y2="23" /></>,
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  trophy: <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2z" /></>,
  gamepad: <><line x1="6" y1="11" x2="10" y2="11" /><line x1="8" y1="9" x2="8" y2="13" /><line x1="15" y1="12" x2="15.01" y2="12" /><line x1="18" y1="10" x2="18.01" y2="10" /><rect x="2" y="6" width="20" height="12" rx="2" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  star: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />,
  nav: <polygon points="3 11 22 2 13 21 11 13 3 11" />,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  check: <polyline points="20 6 9 17 4 12" />,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  receipt: <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="11" x2="16" y2="11" /></>,
  'arrow-up': <><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>,
  refresh: <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>,
}

export function Icon({ name, size = 24, color = 'currentColor', strokeWidth = 2, fill = 'none' }) {
  const body = PATHS[name] || PATHS.star
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {body}
    </svg>
  )
}

export { MONO, FONT }
