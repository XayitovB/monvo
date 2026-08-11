// QrScan — full-screen in-app camera scanner matching the mobile app's
// qr_scan_screen.dart: dark canvas, green corner brackets, animated scan line,
// torch toggle, bottom hint + "show my QR". Uses getUserMedia + jsQR. Falls
// back to Telegram's native scanner if the camera can't be accessed.
import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { useApp, useT } from '../store'
import { Icon, Spinner } from '../ui'
import { resolveScannedCard, isMonvoQr } from '../scan'
import { haptic, showAlert, tg } from '../tg'

const CANVAS_BG = '#0A0A0D'
const ACCENT = '#2F6B3F'

export default function QrScan() {
  const { pop, push, setCards, loadCards, cards } = useApp()
  const tr = useT()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const busy = useRef(false)
  const [error, setError] = useState(null)
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvail, setTorchAvail] = useState(false)
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    start()
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function start() {
    setError(null); setStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }, audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) return
      v.srcObject = stream
      v.setAttribute('playsinline', 'true')
      await v.play()
      const track = stream.getVideoTracks()[0]
      const caps = track.getCapabilities?.() || {}
      setTorchAvail(!!caps.torch)
      setStarting(false)
      tick()
    } catch (e) {
      setStarting(false)
      setError(e?.name || 'camera')
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current)
    const s = streamRef.current
    if (s) s.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function tick() {
    const v = videoRef.current
    if (!v || busy.current) { rafRef.current = requestAnimationFrame(tick); return }
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      const w = v.videoWidth, h = v.videoHeight
      if (w && h) {
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(v, 0, 0, w, h)
        const img = ctx.getImageData(0, 0, w, h)
        const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
        if (code && code.data) onFound(code.data)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  async function onFound(raw) {
    if (busy.current) return
    if (!isMonvoQr(raw)) return // ignore non-Monvo codes silently
    busy.current = true
    haptic('success')
    stop()
    try {
      const card = await resolveScannedCard(raw)
      if (card) {
        setCards(prev => {
          const list = prev || []
          return list.some(c => c.card_uid === card.card_uid) ? list : [...list, card]
        })
        loadCards()
        pop()
        push('cardDetail', { card })
      } else {
        showAlert(tr('cardNotFound')); pop()
      }
    } catch (e) {
      showAlert(e.message || tr('error')); pop()
    }
  }

  async function toggleTorch() {
    haptic('light')
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] })
      setTorchOn(v => !v)
    } catch (_) {}
  }

  function tgFallback() {
    if (!tg?.showScanQrPopup) { showAlert(tr('camDeniedDesc')); return }
    stop()
    tg.showScanQrPopup({ text: 'Monvo' }, (raw) => {
      tg.closeScanQrPopup?.()
      onFound(raw)
      return true
    })
  }

  function showMyQr() {
    const first = (cards || [])[0]
    pop()
    if (first) push('qrShow', { card: first, fullscreen: true })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: CANVAS_BG, zIndex: 300, overflow: 'hidden' }}>
      <video ref={videoRef} muted playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

      {/* dim + cutout via overlay */}
      {!error ? <Reticle /> : null}

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'calc(env(safe-area-inset-top) + 8px) 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <GlassBtn onClick={pop}><Icon name="close" size={18} color="#fff" /></GlassBtn>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{tr('scannerTitle')}</span>
        <GlassBtn onClick={toggleTorch} active={torchOn} disabled={!torchAvail}>
          <Icon name="flame" size={18} color={torchAvail ? '#fff' : 'rgba(255,255,255,0.35)'} />
        </GlassBtn>
      </div>

      {starting && !error ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner color="#fff" /></div>
      ) : null}

      {/* Error / camera-denied view */}
      {error ? (
        <div style={{ position: 'absolute', inset: 0, background: CANVAS_BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(229,69,59,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cloud-off" size={30} color="#E5453B" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginTop: 16 }}>{tr('camDenied')}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 1.4, maxWidth: 300 }}>{tr('camDeniedDesc')}</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <OutlineBtn onClick={start}><Icon name="refresh" size={16} color="#fff" /> {tr('retry')}</OutlineBtn>
            <OutlineBtn onClick={tgFallback}><Icon name="qr" size={16} color="#fff" /> {tr('useTgScanner')}</OutlineBtn>
          </div>
        </div>
      ) : null}

      {/* Bottom hint + show-my-QR */}
      {!error ? (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '20px 20px calc(env(safe-area-inset-bottom) + 20px)' }}>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: '0 0 18px' }}>{tr('scanHint')}</p>
          <button onClick={showMyQr} style={{
            width: '100%', padding: 14, borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Icon name="qr" size={18} color="#fff" />{tr('showMyQr')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Reticle() {
  const size = 'min(65vw, 280px)'
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        {[['tl', { top: 0, left: 0 }], ['tr', { top: 0, right: 0 }], ['bl', { bottom: 0, left: 0 }], ['br', { bottom: 0, right: 0 }]].map(([k, pos]) => (
          <span key={k} style={{
            position: 'absolute', width: 36, height: 36, ...pos,
            borderTop: k[0] === 't' ? `3px solid ${ACCENT}` : 'none',
            borderBottom: k[0] === 'b' ? `3px solid ${ACCENT}` : 'none',
            borderLeft: k[1] === 'l' ? `3px solid ${ACCENT}` : 'none',
            borderRight: k[1] === 'r' ? `3px solid ${ACCENT}` : 'none',
            borderTopLeftRadius: k === 'tl' ? 8 : 0, borderTopRightRadius: k === 'tr' ? 8 : 0,
            borderBottomLeftRadius: k === 'bl' ? 8 : 0, borderBottomRightRadius: k === 'br' ? 8 : 0,
          }} />
        ))}
        <div style={{ position: 'absolute', left: 8, right: 8, height: 2, background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, boxShadow: `0 0 16px ${ACCENT}`, animation: 'scanline 1.8s ease-in-out infinite' }} />
      </div>
    </div>
  )
}

function GlassBtn({ children, onClick, active, disabled }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      width: 36, height: 36, borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer',
      background: active ? 'rgba(47,107,63,0.85)' : 'rgba(255,255,255,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  )
}

function OutlineBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10,
      background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.24)',
      cursor: 'pointer', fontSize: 13, fontWeight: 600,
    }}>{children}</button>
  )
}
