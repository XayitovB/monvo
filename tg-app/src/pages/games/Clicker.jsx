// Clicker — 30s tap game (Flutter clicker_screen.dart). Score sent to /games/finish.
import { useEffect, useRef, useState } from 'react'
import { useApp, useTheme, useT } from '../../store'
import { api } from '../../api'
import { AppBar, BackBtn, Button, Spinner, Center } from '../../ui'
import { hexA, FONT } from '../../theme'
import { haptic, showAlert } from '../../tg'

const DURATION = 30
const MAX_SCORE = 200

export default function Clicker() {
  const { pop } = useApp()
  const t = useTheme()
  const tr = useT()
  const [phase, setPhase] = useState('idle') // idle | playing | done
  const [score, setScore] = useState(0)
  const [time, setTime] = useState(DURATION)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const session = useRef(null)
  const startedAt = useRef(0)
  const timer = useRef(null)

  useEffect(() => () => clearInterval(timer.current), [])

  async function start() {
    setBusy(true)
    try {
      const r = await api.startGame('clicker')
      session.current = r.session_token
      startedAt.current = Date.now()
      setScore(0); setTime(DURATION); setResult(null); setPhase('playing')
      timer.current = setInterval(() => {
        setTime(s => {
          if (s <= 1) { clearInterval(timer.current); finish() ; return 0 }
          return s - 1
        })
      }, 1000)
    } catch (e) { showAlert(e.message || tr('noAttempts')) }
    finally { setBusy(false) }
  }

  function tap() {
    if (phase !== 'playing') return
    haptic('light')
    setScore(s => Math.min(MAX_SCORE, s + 1))
  }

  async function finish() {
    setPhase('done')
    const dur = Math.round((Date.now() - startedAt.current) / 1000)
    try {
      const r = await api.finishGame(session.current, Math.min(MAX_SCORE, scoreRef.current), Math.max(5, dur))
      setResult(r); haptic('success')
    } catch (e) { /* still show local score */ }
  }

  // keep latest score for the async finish
  const scoreRef = useRef(0)
  scoreRef.current = score

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('clicker')} leading={<BackBtn onClick={pop} />} />

      {phase === 'idle' ? (
        <Center>
          <div style={{ width: 96, height: 96, borderRadius: 28, background: hexA('#EA580C', 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>🔥</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 18 }}>{tr('clicker')}</div>
          <div style={{ fontSize: 13, color: t.inkMute, marginTop: 6, maxWidth: 260 }}>{tr('tapToEarn')} · {DURATION}s</div>
          <div style={{ marginTop: 22, width: '100%', maxWidth: 260 }}>
            <Button variant="accent" disabled={busy} onClick={start}>{busy ? '…' : tr('play')}</Button>
          </div>
        </Center>
      ) : phase === 'playing' ? (
        <div style={{ padding: '10px 20px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: t.inkMute, marginTop: 6 }}>{tr('score')}</div>
          <div style={{ fontSize: 56, fontWeight: 900, color: t.accent, letterSpacing: -2 }}>{score}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: time <= 5 ? t.danger : t.inkSoft }}>⏱ {time}s</div>
          <button onClick={tap} style={{
            marginTop: 24, width: 200, height: 200, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: `radial-gradient(circle at 35% 30%, ${hexA('#EA580C', 0.95)}, #C2410C)`,
            color: '#fff', fontSize: 22, fontWeight: 900, boxShadow: '0 12px 30px rgba(234,88,12,0.5)',
            userSelect: 'none', WebkitUserSelect: 'none',
          }}>TAP</button>
        </div>
      ) : (
        <Center>
          <div style={{ fontSize: 44 }}>🎉</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 12 }}>{tr('score')}: {score}</div>
          {result?.xp_earned ? <div style={{ fontSize: 14, color: t.accent, marginTop: 4, fontWeight: 700 }}>+{result.xp_earned} XP</div> : <div style={{ marginTop: 8 }}><Spinner size={20} /></div>}
          <div style={{ marginTop: 22, width: '100%', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="accent" onClick={start}>{tr('restart')}</Button>
            <Button variant="outline" onClick={pop}>{tr('back')}</Button>
          </div>
        </Center>
      )}
    </div>
  )
}
