// Home tab — balance hero + cards carousel + announcements, mirroring the
// Flutter _HomeTab (home_screen.dart).
import { useEffect, useState } from 'react'
import { useApp, useTheme, useT } from '../store'
import { api } from '../api'
import { groupSep, hexA, FONT } from '../theme'
import { IconBtn, Icon, SectionHeader, Spinner, MerchantLogo, Logo } from '../ui'
import LoyaltyCard from '../components/LoyaltyCard'

export default function Home() {
  const { cards, cardsLoading, tgUser, me, push, switchTab } = useApp()
  const t = useTheme()
  const tr = useT()
  const [anns, setAnns] = useState([])

  useEffect(() => {
    api.getActiveAnnouncements('users').then(a => setAnns(Array.isArray(a) ? a : [])).catch(() => {})
  }, [])

  const list = cards || []
  const totalPoints = list.reduce((s, c) => s + Number(c.points || 0), 0)
  const name = me?.name || tgUser?.first_name || 'Monvo'

  return (
    <div style={{ fontFamily: FONT, color: t.ink }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px 8px' }}>
        <Logo height={28} />
        <div style={{ flex: 1 }} />
        <IconBtn onClick={() => push('transactions')}><Icon name="history" size={20} /></IconBtn>
        <div style={{ width: 8 }} />
        <IconBtn badge={anns.length > 0} onClick={() => push('notifications')}><Icon name="bell" size={20} /></IconBtn>
      </div>

      {/* Balance hero */}
      <div style={{ padding: '6px 20px 0' }}>
        <div style={{
          position: 'relative', overflow: 'hidden', padding: 20, borderRadius: 22,
          background: t.isDark ? t.paperAlt : '#15151A', color: '#fff',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        }}>
          <div style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, ${hexA(t.accent, 0.4)}, transparent 70%)` }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: 600, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase' }}>{tr('totalBalance')}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1 }}>{groupSep(totalPoints)}</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{tr('som')}</span>
            </div>
            <div style={{ display: 'inline-block', marginTop: 18, padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>{tr('cardsLabel')}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{list.length} {tr('tabCards').toLowerCase()}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Announcements */}
      {anns.length > 0 && (
        <div style={{ padding: '16px 20px 0' }}>
          {anns.slice(0, 2).map(a => <AnnBanner key={a.id} a={a} />)}
        </div>
      )}

      {/* My cards (matches Flutter _HomeTab: top bar + hero + cards row only) */}
      <div style={{ marginTop: 18 }}>
        <SectionHeader
          title={tr('myCards')}
          trailing={list.length ? `${tr('seeAll')} ${list.length} →` : null}
          onTrailing={() => switchTab('cards')}
        />
        <div style={{ marginTop: 10, overflowX: 'auto', display: 'flex', gap: 10, padding: '0 20px 4px' }}>
          {cardsLoading && list.length === 0 ? (
            <div style={{ height: 100, display: 'flex', alignItems: 'center', padding: '0 40px' }}><Spinner /></div>
          ) : (
            <>
              {list.map(c => (
                <LoyaltyCard key={c.card_uid} card={c} compact somLabel={tr('som')}
                  onClick={() => push('cardDetail', { card: c })} />
              ))}
              <AddChip onClick={() => push('qrScan', { fullscreen: true })} label={tr('addCard')} />
            </>
          )}
        </div>
      </div>

    </div>
  )
}

function AddChip({ onClick, label }) {
  const t = useTheme()
  return (
    <button onClick={onClick} style={{
      width: 100, height: 100, flexShrink: 0, borderRadius: 16, cursor: 'pointer',
      background: 'transparent', border: `1.5px solid ${t.lineStrong}`, color: t.inkMute,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: FONT,
    }}>
      <Icon name="plus" size={22} color={t.inkMute} />
      <span style={{ fontSize: 11 }}>{label}</span>
    </button>
  )
}

function AnnBanner({ a }) {
  const t = useTheme()
  const tone = {
    success: t.good, promo: t.accent, warning: t.warn, info: t.inkSoft,
  }[a.type] || t.accent
  return (
    <div style={{ display: 'flex', gap: 10, padding: 14, borderRadius: 16, background: hexA(tone, 0.1), border: `1px solid ${hexA(tone, 0.25)}`, marginBottom: 10 }}>
      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: tone }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>{a.title}</div>
        {a.body ? <div style={{ fontSize: 12.5, color: t.inkSoft, marginTop: 3, lineHeight: 1.4 }}>{a.body}</div> : null}
      </div>
    </div>
  )
}
