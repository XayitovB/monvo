// GamesHub — entry to mini-games with daily quota (Flutter games_hub_screen.dart).
import { useEffect, useState } from 'react'
import { useApp, useTheme, useT } from '../../store'
import { api } from '../../api'
import { AppBar, BackBtn, Card, Icon, Spinner, Center } from '../../ui'
import { hexA, FONT } from '../../theme'

export default function GamesHub() {
  const { pop, push } = useApp()
  const t = useTheme()
  const tr = useT()
  const [quota, setQuota] = useState(null)

  useEffect(() => { api.getGameQuota().then(setQuota).catch(() => setQuota({})) }, [])

  const rem = (g) => quota?.[g]?.remaining ?? quota?.[g]?.daily_limit ?? '—'
  const canSpin = quota?.spin?.can_spin

  const GAMES = [
    { key: 'spin', icon: 'gift', title: tr('spinWheel'), color: '#7C3AED', sub: canSpin ? '✓ ' + tr('spin') : tr('comeBackTomorrow') },
    { key: 'clicker', icon: 'flame', title: tr('clicker'), color: '#EA580C', sub: `${rem('clicker')} ${tr('attemptsLeft')}` },
    { key: 'game2048', icon: 'gamepad', title: tr('game2048'), color: '#0EA5E9', sub: `${rem('2048')} ${tr('attemptsLeft')}` },
  ]

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('gamesHub')} leading={<BackBtn onClick={pop} />} />
      {quota == null ? <Center><Spinner /></Center> : (
        <div style={{ padding: '6px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {GAMES.map(g => (
            <Card key={g.key} pad={16} onClick={() => push(g.key)} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, background: hexA(g.color, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={g.icon} size={26} color={g.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.ink }}>{g.title}</div>
                <div style={{ fontSize: 12.5, color: t.inkMute, marginTop: 2 }}>{g.sub}</div>
              </div>
              <Icon name="chevron-right" size={18} color={t.inkFaint} />
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
