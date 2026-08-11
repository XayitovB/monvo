// Rewards — grid of reward tiles, single-merchant or aggregate (Flutter rewards_screen.dart).
import { useEffect, useState } from 'react'
import { useApp, useTheme, useT } from '../store'
import { api } from '../api'
import { AppBar, BackBtn, Spinner, EmptyState, ErrorState, Icon, Center } from '../ui'
import { groupSep, FONT } from '../theme'

export default function Rewards({ merchantId }) {
  const { pop, cards } = useApp()
  const t = useTheme()
  const tr = useT()
  const [rewards, setRewards] = useState(null)
  const [err, setErr] = useState(null)

  const totalPoints = (cards || []).reduce((s, c) => s + Number(c.points || 0), 0)

  async function load() {
    setErr(null); setRewards(null)
    try {
      if (merchantId) {
        setRewards(await api.getPublicRewards(merchantId) || [])
      } else {
        const ids = [...new Set((cards || []).map(c => c.merchant?.id).filter(Boolean))]
        const all = []
        await Promise.all(ids.map(async id => {
          try { all.push(...(await api.getPublicRewards(id) || [])) } catch (_) {}
        }))
        setRewards(all)
      }
    } catch (e) { setErr(e.message) }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [merchantId])

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('rewardsTitle')} subtitle={`${groupSep(totalPoints)} ${tr('som')} ${tr('available')}`} leading={<BackBtn onClick={pop} />} />

      {/* Search (decorative, matches Flutter) */}
      <div style={{ padding: '6px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: t.paperAlt, color: t.inkMute }}>
          <Icon name="search" size={18} color={t.inkMute} />
          <span style={{ fontSize: 13 }}>{tr('searchReward')}</span>
        </div>
      </div>

      {err ? <ErrorState message={err} onRetry={load} retryLabel={tr('retry')} />
        : rewards == null ? <Center><Spinner /></Center>
        : rewards.length === 0 ? <EmptyState icon="gift" title={tr('noRewards')} subtitle={tr('noRewardsHint')} />
        : (
          <div style={{ padding: '4px 20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {rewards.map((r, i) => <RewardTile key={`${r.id}-${i}`} r={r} />)}
          </div>
        )}
    </div>
  )
}

function RewardTile({ r }) {
  const t = useTheme()
  const tr = useT()
  const available = r.is_active && r.stock !== 0
  return (
    <div style={{ background: t.paperRaised, border: `1px solid ${t.line}`, borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 90, background: t.paperAlt }}>
        {r.image_url ? <img src={r.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        {available ? (
          <span style={{ position: 'absolute', top: 8, right: 8, padding: '3px 7px', borderRadius: 99, background: t.paperRaised, fontSize: 9, fontWeight: 600, color: t.ink }}>{tr('inStock')}</span>
        ) : null}
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 32 }}>{r.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: t.accent }}>{groupSep(r.points_cost)} {tr('som')}</span>
          <span style={{ flex: 1 }} />
          <span style={{ width: 24, height: 24, borderRadius: 8, background: available ? t.ink : t.inkFaint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={14} color="#fff" />
          </span>
        </div>
      </div>
    </div>
  )
}
