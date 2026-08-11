// Contests — list of contests with join + inline leaderboard (Flutter contests_screen.dart).
import { useEffect, useState } from 'react'
import { useApp, useTheme, useT } from '../store'
import { api } from '../api'
import { AppBar, BackBtn, Card, Button, Spinner, EmptyState, Icon, Center } from '../ui'
import { groupSep, hexA, FONT } from '../theme'
import { haptic, showAlert } from '../tg'

export default function Contests() {
  const { pop, lang } = useApp()
  const t = useTheme()
  const tr = useT()
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(null) // contest id → leaderboard
  const [board, setBoard] = useState(null)

  async function load() {
    try { setItems(await api.getContests({ includeFinished: true }) || []) } catch (_) { setItems([]) }
  }
  useEffect(() => { load() }, [])

  async function join(c) {
    haptic('light')
    try {
      await api.joinContest(c.id)
      haptic('success')
      setItems(prev => prev.map(x => x.id === c.id ? { ...x, is_joined: true, participants_count: (x.participants_count || 0) + 1 } : x))
    } catch (e) { showAlert(e.message || tr('error')) }
  }

  async function toggleBoard(c) {
    if (open === c.id) { setOpen(null); setBoard(null); return }
    setOpen(c.id); setBoard(null)
    try { setBoard(await api.getContestLeaderboard(c.id, 50)) } catch (_) { setBoard({ entries: [] }) }
  }

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('contests')} leading={<BackBtn onClick={pop} />} />
      {items == null ? <Center><Spinner /></Center>
        : items.length === 0 ? <EmptyState icon="flame" title={tr('noContests')} />
        : (
          <div style={{ padding: '6px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(c => (
              <ContestCard key={c.id} c={c} lang={lang} tr={tr}
                onJoin={() => join(c)} onBoard={() => toggleBoard(c)}
                open={open === c.id} board={board} />
            ))}
          </div>
        )}
    </div>
  )
}

function ContestCard({ c, lang, tr, onJoin, onBoard, open, board }) {
  const t = useTheme()
  const title = lang === 'ru' && c.title_ru ? c.title_ru : c.title
  const desc = lang === 'ru' && c.description_ru ? c.description_ru : c.description
  const prize = lang === 'ru' && c.prize_description_ru ? c.prize_description_ru : c.prize_description
  const finished = c.status === 'finished' || (c.ends_at && new Date(c.ends_at) < new Date())
  const color = c.banner_url ? t.accent : t.accent

  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, background: hexA(color, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="trophy" size={22} color={color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.ink }}>{title}</div>
            {desc ? <div style={{ fontSize: 12.5, color: t.inkMute, marginTop: 3, lineHeight: 1.4 }}>{desc}</div> : null}
          </div>
          {finished ? <span style={{ fontSize: 10, fontWeight: 700, color: t.inkMute, background: t.paperAlt, padding: '3px 8px', borderRadius: 99, height: 'fit-content' }}>{tr('finished')}</span> : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          {prize ? <span style={{ fontSize: 12, color: t.accent, fontWeight: 600 }}>🎁 {prize}</span> : null}
          {c.prize_xp ? <span style={{ fontSize: 12, color: t.inkMute }}>+{groupSep(c.prize_xp)} XP</span> : null}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: t.inkFaint }}>{c.participants_count || 0} 👥</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {!finished && !c.is_joined ? (
            <Button variant="accent" onClick={onJoin}>{tr('join')}</Button>
          ) : c.is_joined ? (
            <Button variant="soft" disabled>{tr('joined')}{c.my_rank ? ` · #${c.my_rank}` : ''}</Button>
          ) : null}
          <Button variant="outline" onClick={onBoard}>{tr('leaderboard')}</Button>
        </div>
      </div>

      {open ? (
        <div style={{ borderTop: `1px solid ${t.line}`, padding: '8px 16px 16px', background: t.paperAlt }}>
          {board == null ? <Center minH="80px"><Spinner size={20} /></Center>
            : (board.entries || []).length === 0 ? <div style={{ fontSize: 13, color: t.inkMute, textAlign: 'center', padding: 12 }}>—</div>
            : (board.entries || []).slice(0, 10).map(e => (
              <div key={e.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 13 }}>
                <span style={{ width: 22, fontWeight: 800, color: t.inkMute }}>{e.rank}</span>
                <span style={{ flex: 1, fontWeight: e.is_me ? 800 : 600, color: t.ink }}>{e.is_me ? tr('you') : e.user_name}</span>
                <span style={{ fontWeight: 700, color: t.accent }}>{groupSep(e.score)}</span>
              </div>
            ))}
        </div>
      ) : null}
    </Card>
  )
}
