// CardDetail — large card hero, primary actions, details (Flutter card_detail_screen.dart).
import { useApp, useTheme, useT } from '../store'
import { AppBar, BackBtn, Button, Card, Icon, Row, Eyebrow } from '../ui'
import { haptic, showAlert } from '../tg'
import LoyaltyCard from '../components/LoyaltyCard'

export default function CardDetail({ card }) {
  const { pop, push } = useApp()
  const t = useTheme()
  const tr = useT()
  const merchant = card.merchant || {}

  function copyId() {
    haptic('light')
    navigator.clipboard?.writeText(card.card_uid).then(() => showAlert(tr('copied'))).catch(() => {})
  }

  return (
    <div style={{ minHeight: '100dvh', background: t.paper, paddingBottom: 100 }}>
      <AppBar title={merchant.business_name || tr('details')} leading={<BackBtn onClick={pop} />} />

      <div style={{ padding: '8px 20px 0' }}>
        <LoyaltyCard card={card} somLabel={tr('som')} />
      </div>

      {/* Primary actions */}
      <div style={{ padding: '18px 20px 0', display: 'flex', gap: 10 }}>
        <Button variant="accent" leading={<Icon name="qr" size={18} color="#fff" />}
          onClick={() => push('qrShow', { card, fullscreen: true })}>{tr('showQr')}</Button>
        <Button variant="outline" leading={<Icon name="gift" size={18} />}
          onClick={() => push('rewards', { merchantId: merchant.id })}>{tr('rewards')}</Button>
      </div>

      {/* Details */}
      <div style={{ padding: '22px 20px 0' }}>
        <Eyebrow>{tr('details')}</Eyebrow>
        <div style={{ height: 8 }} />
        <Card pad={0}>
          <Row icon="card" title={tr('cardId')} subtitle={card.card_uid}
            trailing={<button onClick={copyId} style={{ border: 'none', background: 'none', cursor: 'pointer', color: t.accent }}><Icon name="copy" size={18} color={t.accent} /></button>} />
          <div style={{ height: 0.5, background: t.line, marginLeft: 60 }} />
          <Row icon="history" title={tr('history')} onClick={() => push('transactions')} />
        </Card>
      </div>
    </div>
  )
}
