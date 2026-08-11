// Spin — daily prize wheel (Flutter spin_screen.dart). Weighted prize is decided
// server-side; the wheel animates to the returned prize_id.
import { useEffect, useRef, useState } from 'react'
import { useApp, useTheme, useT } from '../../store'
import { api } from '../../api'
import { AppBar, BackBtn, Button, Spinner, Center } from '../../ui'
import { hexA, FONT } from '../../theme'
import { haptic, showAlert } from '../../tg'

export default function Spin() {
  const { pop, lang } = useApp()
  const t = useTheme()
  const tr = useT()
  const [status, setStatus] = useState(null)
  const [angle, setAngle] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState(null)
  const wheelRef = useRef(null)

  useEffect(() => { api.getSpinStatus().then(setStatus).catch(() => setStatus({ prizes: [] })) }, [])

  if (status == null) return <Wrap pop={pop} tr={tr} t={t}><Center><Spinner /></Center></Wrap>
  const prizes = status.prizes || []
  const n = prizes.length || 1
  const seg = 360 / n
  const canSpin = status.can_spin && !spinning && prizes.length > 0

  async function doSpin() {
    if (!canSpin) return
    haptic('medium'); setSpinning(true); setResult(null)
    try {
      const res = await api.spinWheel()
      const idx = Math.max(0, prizes.findIndex(p => p.id === res.prize_id))
      // land segment idx center at the top pointer
      const target = 360 * 6 - (idx * seg + seg / 2)
      setAngle(prev => prev - (prev % 360) + target)
      setTimeout(() => {
        setSpinning(false); setResult(res); haptic('success')
      }, 4200)
    } catch (e) {
      setSpinning(false)
      showAlert(e.message || tr('comeBackTomorrow'))
    }
  }

  const colors = prizes.map((p, i) => p.color && p.color.length === 7 ? p.color : (i % 2 ? t.accent : t.accentDeep))
  const gradient = `conic-gradient(${prizes.map((p, i) => `${colors[i]} ${i * seg}deg ${(i + 1) * seg}deg`).join(', ')})`

  return (
    <Wrap pop={pop} tr={tr} t={t}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 20px 0' }}>
        {/* Pointer */}
        <div style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: `18px solid ${t.ink}`, marginBottom: -6, zIndex: 2 }} />
        {/* Wheel */}
        <div ref={wheelRef} style={{
          width: 280, height: 280, borderRadius: '50%', background: prizes.length ? gradient : t.paperAlt,
          transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 4s cubic-bezier(0.18,0.9,0.25,1)' : 'none',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)', position: 'relative', border: `6px solid ${t.paperRaised}`,
        }}>
          {prizes.map((p, i) => {
            const a = i * seg + seg / 2
            const label = lang === 'ru' && p.label_ru ? p.label_ru : p.label
            return (
              <div key={p.id} style={{
                position: 'absolute', top: '50%', left: '50%', transformOrigin: '0 0',
                transform: `rotate(${a}deg) translate(70px, -8px)`, color: '#fff', fontSize: 11, fontWeight: 700,
                fontFamily: FONT, whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.4)',
              }}>{label}</div>
            )
          })}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 54, height: 54, borderRadius: '50%', background: t.paperRaised, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: t.accent }}>★</div>
        </div>

        <div style={{ marginTop: 28, width: '100%', maxWidth: 280 }}>
          {result ? (
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: t.accent }}>🎉 {result.label}</div>
              {result.xp_won ? <div style={{ fontSize: 13, color: t.inkMute, marginTop: 2 }}>+{result.xp_won} XP</div> : null}
            </div>
          ) : null}
          <Button variant="accent" disabled={!canSpin} onClick={doSpin}>
            {spinning ? '…' : status.can_spin ? tr('spin') : tr('comeBackTomorrow')}
          </Button>
        </div>
      </div>
    </Wrap>
  )
}

function Wrap({ children, pop, tr, t }) {
  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('spinWheel')} leading={<BackBtn onClick={pop} />} />
      {children}
    </div>
  )
}
