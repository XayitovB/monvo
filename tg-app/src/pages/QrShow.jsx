// QrShow — fullscreen dark QR screen with optional Billz voucher (mirrors qr_show_screen.dart).
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useApp, useT } from '../store'
import { api, ApiError } from '../api'
import { groupSep, FONT, MONO, hexA } from '../theme'
import { Icon, Spinner } from '../ui'
import { haptic, showAlert } from '../tg'

const INK = '#15151A'
const ACCENT = '#2F6B3F'

export default function QrShow({ card }) {
  const { pop } = useApp()
  const tr = useT()
  const [qr, setQr] = useState(null)

  // Billz voucher state
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [hasBillz, setHasBillz] = useState(false)
  const [voucher, setVoucher] = useState(null)
  const [amount, setAmount] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(60)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  const qrData = `monvo://card/${card.card_uid}`

  useEffect(() => {
    QRCode.toDataURL(qrData, { width: 440, margin: 1, color: { dark: INK, light: '#FFFFFF' } })
      .then(setQr).catch(() => {})
    fetchVoucher()
    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchVoucher() {
    if (loading) return
    setLoading(true); setError(null)
    try {
      const body = await api.billzVoucher(card.card_uid)
      setHasBillz(true); setChecked(true)
      setVoucher(body?.voucher_code || null)
      setAmount(Number(body?.amount || 0))
      setSecondsLeft(60)
      setLoading(false)
      startCountdown()
    } catch (e) {
      setLoading(false); setChecked(true)
      if (e instanceof ApiError && e.status === 400) {
        const d = (e.message || '')
        if (d.includes('Billz') || d.includes('ulangan emas')) setHasBillz(false)
        else { setHasBillz(true); setError(d || 'Balans yetarli emas') }
      } else {
        setHasBillz(false)
      }
    }
  }

  function startCountdown() {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { clearInterval(timerRef.current); fetchVoucher(); return 0 }
        return s - 1
      })
    }, 1000)
  }

  function copy(text, msg) {
    haptic('medium')
    navigator.clipboard?.writeText(text).then(() => showAlert(msg)).catch(() => {})
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: INK, color: '#fff', zIndex: 200, fontFamily: FONT, display: 'flex', flexDirection: 'column', padding: '0 0 env(safe-area-inset-bottom)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16 }}>
        <GlassBtn onClick={pop}><Icon name="close" size={18} color="#fff" /></GlassBtn>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{tr('yourQr')}</div>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ flex: 1 }} />

      {/* Merchant pill */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 99, background: 'rgba(255,255,255,0.1)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: ACCENT }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            {card.merchant?.business_name} · {groupSep(card.points)} {tr('som')}
          </span>
        </div>
      </div>

      {/* QR */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
        <div style={{ padding: 18, borderRadius: 22, background: '#fff', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
          {qr ? <img src={qr} width={200} height={200} alt="QR" style={{ display: 'block' }} /> : <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner color={ACCENT} /></div>}
        </div>
      </div>

      {/* Promokod — QR ishlamasa, 180s (3 daqiqa) vaqtinchalik kod (kassir kiritadi) */}
      <PromoCode card={card} tr={tr} copy={copy} />

      {/* Billz / hint */}
      <div style={{ marginTop: 20, minHeight: 60 }}>
        {hasBillz ? (
          <BillzSection {...{ loading, voucher, amount, error, secondsLeft, copy, tr }} />
        ) : !checked ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}><Spinner size={20} color={ACCENT} /></div>
        ) : (
          <p style={{ textAlign: 'center', padding: '0 32px', fontSize: 13, lineHeight: 1.55, color: 'rgba(255,255,255,0.75)' }}>
            {tr('qrHint')}
          </p>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Copy ID */}
      <div style={{ padding: '0 20px 24px' }}>
        <button onClick={() => copy(card.card_uid, tr('copied'))} style={{
          width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,0.1)', color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Icon name="copy" size={16} color="#fff" />{tr('copyId')}
        </button>
      </div>
    </div>
  )
}

function BillzSection({ loading, voucher, amount, error, secondsLeft, copy, tr }) {
  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.07)', border: `1px solid ${hexA(ACCENT, 0.4)}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{tr('voucher')}</span>
          {voucher && !loading ? <CountdownRing seconds={secondsLeft} /> : null}
        </div>
        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', height: 36, alignItems: 'center' }}><Spinner size={22} color={ACCENT} /></div>
          ) : error ? (
            <div style={{ textAlign: 'center', fontSize: 13, color: '#fca5a5' }}>{error}</div>
          ) : voucher ? (
            <>
              <button onClick={() => copy(voucher, tr('copied'))} style={{
                width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.1)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
                  {(voucher.length > 6 ? voucher.slice(-6) : voucher).toUpperCase()}
                </span>
                <Icon name="copy" size={16} color="rgba(255,255,255,0.5)" />
              </button>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>
                {groupSep(amount)} {tr('som')} · {tr('voucherHint')}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Vaqtinchalik promokod — QR ishlamasa, mijoz kassirga aytadi (180s, avtoyangilanadi)
function PromoCode({ card, tr, copy }) {
  const [code, setCode] = useState(null)
  const [secs, setSecs] = useState(180)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(false)
  const timer = useRef(null)

  async function gen() {
    setLoading(true); setErr(false)
    try {
      const r = await api.redeemCode(card.card_uid)
      setCode(r?.code || null)
      setSecs(Number(r?.expires_in || 180))
      setLoading(false)
      clearInterval(timer.current)
      timer.current = setInterval(() => {
        setSecs(s => { if (s <= 1) { clearInterval(timer.current); gen(); return 0 } return s - 1 })
      }, 1000)
    } catch (e) {
      setLoading(false); setErr(true)
    }
  }
  useEffect(() => { gen(); return () => clearInterval(timer.current) }, []) // eslint-disable-line

  return (
    <div style={{ padding: '0 20px', marginTop: 16 }}>
      <div style={{ padding: 16, borderRadius: 18, background: 'rgba(255,255,255,0.07)', border: `1px solid ${hexA(ACCENT, 0.4)}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{tr('promoCode')}</span>
          {code && !loading ? <CountdownRing seconds={secs} max={180} /> : null}
        </div>
        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', height: 40, alignItems: 'center' }}><Spinner size={22} color={ACCENT} /></div>
          ) : err ? (
            <div style={{ textAlign: 'center', fontSize: 13, color: '#fca5a5' }}>{tr('promoErr')}</div>
          ) : code ? (
            <>
              <button onClick={() => copy(code, tr('copied'))} style={{
                width: '100%', padding: '10px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.1)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, letterSpacing: 8 }}>{code}</span>
                <Icon name="copy" size={16} color="rgba(255,255,255,0.5)" />
              </button>
              <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 8 }}>
                {tr('promoHint')}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CountdownRing({ seconds, max = 60 }) {
  const pct = seconds / max
  const color = seconds > 15 ? ACCENT : '#f59e0b'
  return (
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      <svg width="36" height="36" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
        <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={`${2 * Math.PI * 15}`} strokeDashoffset={`${2 * Math.PI * 15 * (1 - pct)}`} strokeLinecap="round" />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{seconds}</span>
    </div>
  )
}

function GlassBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 36, height: 36, borderRadius: 12, border: 'none', cursor: 'pointer',
      background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  )
}
