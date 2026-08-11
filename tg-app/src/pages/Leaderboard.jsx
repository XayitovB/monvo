// Leaderboard — global XP ranking with my-rank pinned (Flutter leaderboard_screen.dart).
import { useEffect, useState } from 'react'
import { useApp, useTheme, useT } from '../store'
import { api } from '../api'
import { AppBar, BackBtn, Spinner, EmptyState, Center } from '../ui'
import { groupSep, hexA, FONT } from '../theme'
import { TIER } from '../theme'

export default function Leaderboard() {
  const { pop } = useApp()
  const t = useTheme()
  const tr = useT()
  const [data, setData] = useState(null)

  useEffect(() => { api.getGlobalLeaderboard(100).then(setData).catch(() => setData({ entries: [] })) }, [])

  if (data == null) return <div style={{ background: t.paper, minHeight: '100dvh' }}><AppBar title={tr('leaderboard')} leading={<BackBtn onClick={pop} />} /><Center><Spinner /></Center></div>
  const entries = data.entries || []

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('leaderboard')} subtitle={data.total_users ? `${groupSep(data.total_users)} ${tr('you') === 'Siz' ? 'foydalanuvchi' : 'участников'}` : null} leading={<BackBtn onClick={pop} />} />

      {entries.length === 0 ? <EmptyState icon="trophy" title={tr('leaderboard')} /> : (
        <div style={{ padding: '6px 20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(e => <Entry key={e.user_id} e={e} tr={tr} />)}
          {data.my_rank && !entries.some(e => e.is_me) ? (
            <div style={{ marginTop: 10 }}>
              <Entry e={{ rank: data.my_rank, user_name: tr('you'), score: data.my_score || 0, is_me: true }} tr={tr} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Entry({ e, tr }) {
  const t = useTheme()
  const medal = e.rank <= 3
  const medalColor = [TIER.gold, TIER.silver, TIER.bronze][e.rank - 1]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14,
      background: e.is_me ? hexA(t.accent, 0.1) : t.paperRaised,
      border: `1px solid ${e.is_me ? hexA(t.accent, 0.3) : t.line}`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: medal ? medalColor : t.paperAlt, color: medal ? '#fff' : t.inkMute, fontWeight: 800, fontSize: 13,
      }}>{e.rank}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: e.is_me ? 800 : 600, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {e.is_me ? tr('you') : e.user_name}
        </div>
        {e.level ? <div style={{ fontSize: 11, color: t.inkMute }}>{tr('level')} {e.level}{e.badge_count ? ` · ${e.badge_count} 🏅` : ''}</div> : null}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: t.accent }}>{groupSep(e.score)} <span style={{ fontSize: 11, fontWeight: 600, color: t.inkMute }}>XP</span></div>
    </div>
  )
}
