// Gamification — XP/level/streak header + achievements grid (Flutter gamification_screen.dart).
import { useEffect, useState } from 'react'
import { useApp, useTheme, useT } from '../store'
import { api } from '../api'
import { AppBar, BackBtn, IconBtn, Card, Eyebrow, Icon, Spinner, Center } from '../ui'
import { groupSep, hexA, FONT } from '../theme'

export default function Gamification() {
  const { pop, push, lang } = useApp()
  const t = useTheme()
  const tr = useT()
  const [stats, setStats] = useState(null)
  const [achs, setAchs] = useState(null)

  useEffect(() => {
    api.getMyStats().then(setStats).catch(() => setStats({}))
    api.getMyAchievements().then(a => setAchs(Array.isArray(a) ? a : [])).catch(() => setAchs([]))
  }, [])

  const pct = stats?.progress_percent ?? 0
  const earned = (achs || []).filter(a => a.is_earned ?? a.is_unlocked ?? a.unlocked).length

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('achievements')} leading={<BackBtn onClick={pop} />}
        trailing={
          <div style={{ display: 'flex', gap: 6 }}>
            <IconBtn onClick={() => push('games')}><Icon name="gamepad" size={19} /></IconBtn>
            <IconBtn onClick={() => push('leaderboard')}><Icon name="star" size={19} /></IconBtn>
            <IconBtn onClick={() => push('contests')}><Icon name="flame" size={19} /></IconBtn>
          </div>
        } />

      {stats == null ? <Center><Spinner /></Center> : (
        <>
          {/* XP / level hero */}
          <div style={{ padding: '4px 20px 0' }}>
            <div style={{ borderRadius: 22, padding: 20, background: t.isDark ? t.paperAlt : '#15151A', color: '#fff', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: '50%', background: `radial-gradient(circle, ${hexA(t.accent, 0.4)}, transparent 70%)` }} />
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="trophy" size={18} color={t.accent} />
                  <span style={{ fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{tr('level')} {stats.level ?? 1}</span>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, marginTop: 8 }}>{groupSep(stats.xp ?? 0)} XP</div>
                {/* Progress */}
                <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.15)', marginTop: 14, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: t.accent, borderRadius: 4 }} />
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>
                  {stats.xp_to_next_level ?? 0} XP → {tr('level')} {(stats.level ?? 1) + 1}
                </div>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ padding: '16px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <MiniStat icon="flame" value={`${stats.streak_days ?? 0}`} label={tr('streak')} />
            <MiniStat icon="qr" value={`${stats.total_scans ?? 0}`} label={lang === 'ru' ? 'Сканы' : 'Skanlar'} />
            <MiniStat icon="store" value={`${stats.unique_merchants ?? 0}`} label={tr('tabPlaces')} />
          </div>

          {/* Achievements */}
          <div style={{ padding: '22px 20px 0' }}>
            <Eyebrow>{tr('achievements')} · {earned}/{(achs || []).length} {tr('unlocked')}</Eyebrow>
          </div>
          {achs == null ? <Center minH="20vh"><Spinner /></Center> : (
            <div style={{ padding: '12px 20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {achs.map(a => <AchTile key={a.id} a={a} lang={lang} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MiniStat({ icon, value, label }) {
  const t = useTheme()
  return (
    <div style={{ background: t.paperRaised, border: `1px solid ${t.line}`, borderRadius: 16, padding: '14px 8px', textAlign: 'center' }}>
      <Icon name={icon} size={18} color={t.accent} />
      <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: t.inkMute }}>{label}</div>
    </div>
  )
}

function AchTile({ a, lang }) {
  const t = useTheme()
  const done = a.is_earned ?? a.is_unlocked ?? a.unlocked ?? false
  const title = lang === 'ru' && a.title_ru ? a.title_ru : a.title
  const cur = a.progress_current ?? 0
  const target = a.criteria_threshold ?? a.progress_target ?? 0
  const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : (done ? 100 : 0)
  const color = a.color && a.color.length === 7 ? a.color : t.accent
  return (
    <div style={{
      background: done ? hexA(color, 0.1) : t.paperRaised, borderRadius: 16,
      border: `1px solid ${done ? hexA(color, 0.3) : t.line}`, padding: 14, opacity: done ? 1 : 0.85,
    }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: done ? color : t.paperAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={iconFor(a.icon)} size={20} color={done ? '#fff' : t.inkFaint} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginTop: 10 }}>{title}</div>
      {!done && target > 0 ? (
        <>
          <div style={{ height: 5, borderRadius: 3, background: t.paperAlt, marginTop: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color }} />
          </div>
          <div style={{ fontSize: 10, color: t.inkMute, marginTop: 4 }}>{cur}/{target}</div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: done ? color : t.inkMute, marginTop: 6, fontWeight: 600 }}>+{a.xp_reward ?? 0} XP</div>
      )}
    </div>
  )
}

function iconFor(name) {
  const map = { trophy: 'trophy', star: 'star', flame: 'flame', gift: 'gift', qr: 'qr', store: 'store', medal: 'trophy' }
  return map[name] || 'star'
}
