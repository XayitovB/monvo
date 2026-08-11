// LoyaltyCard.jsx — Monvo universal loyalty card with 4 premium templates.
// Pixel-equivalent to the Flutter MonvoCardFace (loyalty_card_widget.dart).
// Templates (card_design.template): aurora · minimal · carbon · wave.
// Each is a distinct backdrop; the content layout (logo+name · chip · balance)
// is shared. Honours brand colours, custom image, tier and auto-contrast text.
import { hexA, lerpToBlack, groupSep, FONT, MONO } from '../theme'
import { MerchantLogo } from '../ui'

export const TEMPLATES = ['aurora', 'minimal', 'carbon', 'wave']

function hex(s, fb = '#2F6B3F') {
  if (!s) return fb
  const h = String(s).replace('#', '')
  return h.length === 6 ? `#${h}` : fb
}
function lum(h) {
  const c = h.replace('#', '')
  if (c.length !== 6) return 0
  const v = [0, 2, 4].map(i => {
    const x = parseInt(c.slice(i, i + 2), 16) / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
function lighten(h, t) {
  const c = h.replace('#', ''); if (c.length !== 6) return h
  const ch = [0, 2, 4].map(i => { const x = parseInt(c.slice(i, i + 2), 16); return Math.round(x + (255 - x) * t) })
  return `#${ch.map(x => x.toString(16).padStart(2, '0')).join('')}`
}
function maskUid(uid) {
  if (!uid || uid.length < 4) return uid || ''
  return `•••• •••• ${uid.slice(-4).toUpperCase()}`
}

export default function LoyaltyCard({ card, compact = false, onClick, somLabel = "so'm", balanceLabel = 'BALANS' }) {
  const merchant = card.merchant || {}
  const design = merchant.card_design || {}
  const brand = hex(merchant.brand_color)

  const hasColors = design.bg_color_1 != null
  const c1 = hasColors ? hex(String(design.bg_color_1), brand) : brand
  const c2 = hasColors ? hex(String(design.bg_color_2 || ''), lerpToBlack(brand, 0.55)) : lerpToBlack(brand, 0.5)

  const bgImage = String(design.background_image || '')
  const useImage = String(design.background_type || '') === 'image' && !!bgImage
  const template = TEMPLATES.includes(design.template) ? design.template : 'aurora'

  // Auto-contrast text unless the merchant fixed a colour. Carbon is always light.
  let text
  if (design.text_color) text = hex(String(design.text_color), '#FFFFFF')
  else if (useImage || template === 'carbon') text = '#FFFFFF'
  else text = lum(template === 'minimal' ? c1 : c1) > 0.6 ? '#15151A' : '#FFFFFF'

  const name = merchant.business_name || 'Biznes'
  const points = Number(card.points || 0)
  const showChip = template !== 'minimal'

  return (
    <div onClick={onClick} style={{
      position: 'relative', width: compact ? 160 : '100%', flexShrink: compact ? 0 : undefined,
      aspectRatio: compact ? '1.6' : '1.586', borderRadius: compact ? 16 : 22, overflow: 'hidden',
      color: text, cursor: onClick ? 'pointer' : 'default', fontFamily: FONT,
    }}>
      {useImage
        ? <ImageBackdrop design={design} bgImage={bgImage} c1={c1} />
        : <Backdrop template={template} c1={c1} c2={c2} compact={compact} />}

      {compact
        ? <CompactFace name={name} logo={merchant.logo_url} text={text} points={points} somLabel={somLabel} />
        : <FullFace name={name} logo={merchant.logo_url} text={text} points={points} uid={card.card_uid} somLabel={somLabel} balanceLabel={balanceLabel} showChip={showChip} />}
    </div>
  )
}

// ── Backdrops (4 templates) ──────────────────────────────────────────────────
function Backdrop({ template, c1, c2, compact }) {
  if (template === 'minimal') {
    return (
      <>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${lighten(c1, 0.06)}, ${c1})` }} />
        <div style={{ position: 'absolute', left: 22, right: 22, top: '58%', height: 1, background: hexA('#FFFFFF', 0.18) }} />
        <Sheen soft />
      </>
    )
  }
  if (template === 'carbon') {
    const dark = lerpToBlack(c1, 0.78)
    return (
      <>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(145deg, ${lerpToBlack(c1, 0.62)}, ${dark})` }} />
        {/* carbon weave */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5, background: `repeating-linear-gradient(45deg, ${hexA('#FFFFFF', 0.045)} 0 1px, transparent 1px 7px), repeating-linear-gradient(-45deg, ${hexA('#000000', 0.18)} 0 1px, transparent 1px 7px)` }} />
        {/* neon accent edge */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: c1, boxShadow: `0 0 18px ${hexA(c1, 0.9)}` }} />
        <div style={{ position: 'absolute', right: -60, top: -70, width: 220, height: 220, borderRadius: '50%', background: `radial-gradient(circle, ${hexA(c1, 0.28)}, transparent 70%)` }} />
        <Sheen />
      </>
    )
  }
  if (template === 'wave') {
    return (
      <>
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${lighten(c1, 0.1)}, ${c2})` }} />
        {/* flowing waves */}
        <svg viewBox="0 0 340 214" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <path d="M0 150 C 90 110, 150 200, 250 150 S 360 120, 360 150 L360 214 L0 214 Z" fill={hexA('#FFFFFF', 0.10)} />
          <path d="M0 175 C 100 140, 170 215, 280 170 S 360 150, 360 170 L360 214 L0 214 Z" fill={hexA('#FFFFFF', 0.08)} />
        </svg>
        <div style={{ position: 'absolute', right: -50, top: -60, width: 190, height: 190, borderRadius: '50%', background: `radial-gradient(circle, ${hexA('#FFFFFF', 0.2)}, transparent 70%)` }} />
        <Sheen />
      </>
    )
  }
  // aurora (default)
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${lighten(c1, 0.08)}, ${c2})` }} />
      <div style={{ position: 'absolute', right: compact ? -50 : -70, top: compact ? -60 : -80, width: compact ? 160 : 250, height: compact ? 160 : 250, borderRadius: '50%', background: `radial-gradient(circle, ${hexA('#FFFFFF', 0.24)}, transparent 70%)` }} />
      <div style={{ position: 'absolute', left: -80, bottom: -90, width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle, ${hexA('#000000', 0.16)}, transparent 70%)` }} />
      <Sheen />
    </>
  )
}

function ImageBackdrop({ design, bgImage, c1 }) {
  const fit = String(design.image_fit || 'cover')
  const align = { top: 'top', bottom: 'bottom' }[design.image_align] || 'center'
  const opacity = Math.min(100, Math.max(0, Number(design.image_opacity ?? 100))) / 100
  const overlay = Math.min(100, Math.max(0, Number(design.image_overlay ?? 0))) / 100
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: c1 }} />
      <img src={bgImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit, objectPosition: align, opacity }} />
      {overlay > 0 ? <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${overlay})` }} /> : null}
      <Sheen soft />
    </>
  )
}

function Sheen({ soft }) {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `linear-gradient(115deg, transparent 38%, ${hexA('#FFFFFF', soft ? 0.06 : 0.1)} 48%, transparent 58%)` }} />
}

// ── Shared content ───────────────────────────────────────────────────────────
function FullFace({ name, logo, text, points, uid, somLabel, balanceLabel, showChip }) {
  const logoBg = hexA(text === '#15151A' ? '#000000' : '#FFFFFF', 0.16)
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <MerchantLogo name={name} logoUrl={logo} size={34} radius={9} textColor={text} bg={logoBg} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
        </div>
        <Contactless color={text} />
      </div>

      {showChip ? <div><Chip /></div> : <div />}

      <div>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: hexA(text, 0.6) }}>{balanceLabel}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 3 }}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>{groupSep(points)}</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: hexA(text, 0.72) }}>{somLabel}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, color: hexA(text, 0.62), marginTop: 8 }}>{maskUid(uid)}</div>
      </div>
    </div>
  )
}

function CompactFace({ name, logo, text, points, somLabel }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Contactless color={text} size={16} />
        <MerchantLogo name={name} logoUrl={logo} size={24} radius={6} textColor={text} bg={hexA(text === '#15151A' ? '#000000' : '#FFFFFF', 0.16)} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 12, color: hexA(text, 0.78), marginTop: 2 }}>{groupSep(points)} {somLabel}</div>
      </div>
    </div>
  )
}

function Chip() {
  const line = { position: 'absolute', background: 'rgba(120,90,20,0.55)' }
  return (
    <div style={{ position: 'relative', width: 38, height: 28, borderRadius: 6, background: 'linear-gradient(135deg, #F6E3A8, #C9A24B)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}>
      <div style={{ position: 'absolute', inset: 5, border: '1px solid rgba(120,90,20,0.4)', borderRadius: 3 }} />
      <div style={{ ...line, left: 6, right: 6, top: '50%', height: 1 }} />
      <div style={{ ...line, top: 5, bottom: 5, left: '33%', width: 1 }} />
      <div style={{ ...line, top: 5, bottom: 5, left: '66%', width: 1 }} />
    </div>
  )
}

function Contactless({ color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" style={{ opacity: 0.75, flexShrink: 0 }}>
      <path d="M7 9.5a4.5 4.5 0 0 1 0 5" />
      <path d="M10.5 7a8 8 0 0 1 0 10" />
      <path d="M14 4.5a11.5 11.5 0 0 1 0 15" />
    </svg>
  )
}
