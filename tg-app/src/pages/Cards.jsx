// Cards tab — full vertical list of loyalty cards (Flutter _CardsTab).
import { useApp, useTheme, useT } from '../store'
import { AppBar, IconBtn, Icon, Spinner, EmptyState, Center } from '../ui'
import LoyaltyCard from '../components/LoyaltyCard'

export default function Cards() {
  const { cards, cardsLoading, push } = useApp()
  const t = useTheme()
  const tr = useT()
  const list = cards || []

  return (
    <div style={{ background: t.paper, minHeight: '100dvh' }}>
      <AppBar
        title={tr('tabCards')}
        trailing={<IconBtn onClick={() => push('transactions')}><Icon name="history" size={20} /></IconBtn>}
      />
      {cardsLoading && list.length === 0 ? (
        <Center><Spinner /></Center>
      ) : list.length === 0 ? (
        <EmptyState icon="qr" title={tr('noCards')} subtitle={tr('noCardsHint')} />
      ) : (
        <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {list.map(c => (
            <LoyaltyCard key={c.card_uid} card={c} somLabel={tr('som')}
              onClick={() => push('cardDetail', { card: c })} />
          ))}
        </div>
      )}
    </div>
  )
}
