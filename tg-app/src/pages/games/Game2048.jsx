// Game2048 — classic 4x4 2048 (Flutter game_2048_screen.dart). Score posted to /games/finish.
import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp, useTheme, useT } from '../../store'
import { api } from '../../api'
import { AppBar, BackBtn, Button, Center } from '../../ui'
import { hexA, FONT } from '../../theme'
import { haptic, showAlert } from '../../tg'

const N = 4
const empty = () => Array.from({ length: N }, () => Array(N).fill(0))

function clone(g) { return g.map(r => [...r]) }
function rand(g) {
  const cells = []
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!g[r][c]) cells.push([r, c])
  if (!cells.length) return g
  const [r, c] = cells[Math.floor(Math.random() * cells.length)]
  g[r][c] = Math.random() < 0.9 ? 2 : 4
  return g
}
function slide(row) {
  const a = row.filter(v => v)
  let gained = 0
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] === a[i + 1]) { a[i] *= 2; gained += a[i]; a.splice(i + 1, 1) }
  }
  while (a.length < N) a.push(0)
  return { row: a, gained }
}
function move(g, dir) {
  let grid = clone(g), gained = 0, moved = false
  const rot = (times) => { for (let k = 0; k < times; k++) grid = grid[0].map((_, i) => grid.map(r => r[i]).reverse()) }
  const rots = { left: 0, up: 3, right: 2, down: 1 }[dir]
  rot(rots)
  for (let r = 0; r < N; r++) {
    const before = grid[r].join(',')
    const { row, gained: gg } = slide(grid[r])
    grid[r] = row; gained += gg
    if (row.join(',') !== before) moved = true
  }
  rot((4 - rots) % 4)
  return { grid, gained, moved }
}
function canMove(g) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!g[r][c]) return true
    if (c < N - 1 && g[r][c] === g[r][c + 1]) return true
    if (r < N - 1 && g[r][c] === g[r + 1][c]) return true
  }
  return false
}

const TILE = {
  0: ['transparent', 'transparent'], 2: ['#EEE4DA', '#776E65'], 4: ['#EDE0C8', '#776E65'],
  8: ['#F2B179', '#fff'], 16: ['#F59563', '#fff'], 32: ['#F67C5F', '#fff'], 64: ['#F65E3B', '#fff'],
  128: ['#EDCF72', '#fff'], 256: ['#EDCC61', '#fff'], 512: ['#EDC850', '#fff'],
  1024: ['#EDC53F', '#fff'], 2048: ['#EDC22E', '#fff'],
}

export default function Game2048() {
  const { pop } = useApp()
  const t = useTheme()
  const tr = useT()
  const [grid, setGrid] = useState(() => rand(rand(empty())))
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [result, setResult] = useState(null)
  const session = useRef(null)
  const startedAt = useRef(Date.now())
  const touch = useRef(null)
  const scoreRef = useRef(0)
  scoreRef.current = score

  useEffect(() => {
    api.startGame('2048').then(r => { session.current = r.session_token; startedAt.current = Date.now() }).catch(() => {})
  }, [])

  const apply = useCallback((dir) => {
    if (over) return
    setGrid(prev => {
      const { grid: ng, gained, moved } = move(prev, dir)
      if (!moved) return prev
      haptic('light')
      rand(ng)
      setScore(s => s + gained)
      if (!canMove(ng)) { setOver(true); finish() }
      return ng
    })
  }, [over])

  function finish() {
    const dur = Math.max(10, Math.round((Date.now() - startedAt.current) / 1000))
    if (!session.current) return
    api.finishGame(session.current, scoreRef.current, dur).then(setResult).catch(() => {})
  }

  useEffect(() => {
    const onKey = (e) => {
      const d = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key]
      if (d) { e.preventDefault(); apply(d) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [apply])

  function onTouchStart(e) { const t0 = e.touches[0]; touch.current = { x: t0.clientX, y: t0.clientY } }
  function onTouchEnd(e) {
    if (!touch.current) return
    const t1 = e.changedTouches[0]
    const dx = t1.clientX - touch.current.x, dy = t1.clientY - touch.current.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    apply(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
    touch.current = null
  }

  function restart() {
    setGrid(rand(rand(empty()))); setScore(0); setOver(false); setResult(null)
    api.startGame('2048').then(r => { session.current = r.session_token; startedAt.current = Date.now() }).catch(() => {})
  }

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title="2048" leading={<BackBtn onClick={pop} />}
        trailing={<div style={{ background: t.paperAlt, borderRadius: 10, padding: '6px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: t.inkMute }}>{tr('score')}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>{score}</div>
        </div>} />

      <div style={{ padding: '16px 20px 0', display: 'flex', justifyContent: 'center' }}>
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{
          width: 'min(88vw, 340px)', aspectRatio: '1', background: t.isDark ? '#33302b' : '#BBADA0',
          borderRadius: 12, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, touchAction: 'none',
        }}>
          {grid.flat().map((v, i) => {
            const [bg, fg] = TILE[v] || ['#EDC22E', '#fff']
            return (
              <div key={i} style={{
                background: v ? bg : hexA('#fff', t.isDark ? 0.06 : 0.35), borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, color: fg, fontSize: v >= 1024 ? 18 : v >= 128 ? 22 : 26,
              }}>{v || ''}</div>
            )
          })}
        </div>
      </div>

      {over ? (
        <Center minH="28vh">
          <div style={{ fontSize: 18, fontWeight: 800, color: t.ink }}>{tr('gameOver')}</div>
          <div style={{ fontSize: 14, color: t.inkMute, marginTop: 4 }}>{tr('score')}: {score}{result?.xp_earned ? ` · +${result.xp_earned} XP` : ''}</div>
          <div style={{ marginTop: 18, width: '100%', maxWidth: 260 }}><Button variant="accent" onClick={restart}>{tr('restart')}</Button></div>
        </Center>
      ) : (
        <div style={{ textAlign: 'center', fontSize: 12, color: t.inkMute, marginTop: 16 }}>← ↑ → ↓ / swipe</div>
      )}
    </div>
  )
}
