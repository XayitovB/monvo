import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Camera, Check, X, RotateCcw, KeyRound } from 'lucide-react'
import './LoyaltyBuilder.css'

function mf(path, options = {}) {
  const token = localStorage.getItem('merchant_token')
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  }).then(async (r) => {
    if (r.status === 401) {
      localStorage.removeItem('merchant_token')
      window.location.href = '/merchant/login'
      return
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err.detail || `HTTP ${r.status}`)
    }
    return r.json()
  })
}

// Card UID ni turli QR format'lardan chiqarib olish
function parseCardUid(raw) {
  if (!raw) return null
  // "monvo://card/<uid>" yoki oddiy UID
  const m = raw.match(/card\/([A-Za-z0-9-]{16,})/)
  if (m) return m[1]
  // Agar raw ichida uid shakli bo'lsa
  if (/^[A-Za-z0-9-]{16,}$/.test(raw)) return raw
  return raw.trim()
}

export default function WebScanner() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)

  const [scanned, setScanned] = useState(null)  // {card_uid, holder, points, tier}
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)  // last scan result
  const [cameraOn, setCameraOn] = useState(false)
  const [manualUid, setManualUid] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) {
      navigate('/merchant/login')
      return
    }
    document.body.classList.add('admin-body')
    return () => {
      document.body.classList.remove('admin-body')
      stopCamera()
    }
  }, [])

  async function startCamera() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
      requestAnimationFrame(tick)
    } catch (e) {
      setError("Kameraga kirish rad etildi: " + e.message)
    }
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraOn(false)
  }

  async function tick() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Native BarcodeDetector API (Chrome/Edge on supported devices)
    if ('BarcodeDetector' in window) {
      try {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] })
        const codes = await det.detect(canvas)
        if (codes && codes.length > 0) {
          onDecoded(codes[0].rawValue)
          return
        }
      } catch (e) { /* ignore */ }
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  async function onDecoded(raw) {
    const uid = parseCardUid(raw)
    if (!uid) return
    stopCamera()
    try {
      // Card ma'lumotini olish (public endpoint)
      const card = await fetch(`/cards/public/${uid}`).then((r) => r.json()).catch(() => null)
      setScanned({
        card_uid: uid,
        holder_name: card?.holder_name || '',
        points: card?.points ?? 0,
        tier: card?.tier || '—',
      })
    } catch {
      setScanned({ card_uid: uid })
    }
  }

  function manualScan() {
    const uid = parseCardUid(manualUid)
    if (!uid) return
    onDecoded(uid)
    setManualUid('')
  }

  async function submitEarn() {
    setError('')
    try {
      const amt = Number(amount || 0)
      if (amt <= 0) throw new Error("Summa kiriting")
      const res = await mf('/transactions/scan', {
        method: 'POST',
        body: JSON.stringify({ card_uid: scanned.card_uid, amount: amt, note }),
      })
      setResult(res)
      setScanned(null)
      setAmount('')
      setNote('')
    } catch (e) {
      setError(e.message)
    }
  }

  function reset() {
    setScanned(null)
    setResult(null)
    setError('')
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}>
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div>
          <div className="lb-title">Web QR Skaner</div>
          <div className="lb-sub">Noutbuk/tablet kamerasidan skanerlang</div>
        </div>
      </header>

      <div className="lb-container" style={{ maxWidth: 640 }}>
        {error && <div className="lb-error">{error}</div>}

        {result && (
          <div className="ws-result">
            <div className="ws-result-icon"><Check size={28} /></div>
            <div className="ws-result-title">+{result.points_delta} ball qo'shildi</div>
            <div className="ws-result-sub">
              Yangi balans: <b>{result.card_points}</b> · Tier: <b>{result.card_tier}</b>
            </div>
            {result.reward_title && (
              <div className="ws-result-reward"><i className="bi bi-gift" style={{fontSize:14, marginRight:4}}/>{result.reward_title}</div>
            )}
            <button className="a-btn a-btn-primary" onClick={reset}>
              <RotateCcw size={14} /> Yana skanerlash
            </button>
          </div>
        )}

        {!result && !scanned && (
          <>
            <div className="ws-video-wrap">
              <video ref={videoRef} className="ws-video" muted playsInline />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {!cameraOn && (
                <div className="ws-video-overlay">
                  <Camera size={40} />
                  <div>Kamerani yoqing</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              {!cameraOn ? (
                <button className="a-btn a-btn-primary" onClick={startCamera} style={{ flex: 1 }}>
                  <Camera size={14} /> Kamerani yoqish
                </button>
              ) : (
                <button className="a-btn a-btn-secondary" onClick={stopCamera} style={{ flex: 1 }}>
                  <X size={14} /> Kamerani o'chirish
                </button>
              )}
            </div>

            <div className="ws-divider">yoki qo'lda kiriting</div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Card UID yoki monvo://card/..."
                value={manualUid}
                onChange={(e) => setManualUid(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 10, color: 'var(--a-text)' }}
              />
              <button className="a-btn a-btn-primary" onClick={manualScan}>
                <KeyRound size={14} /> Kirit
              </button>
            </div>
          </>
        )}

        {scanned && !result && (
          <div className="ws-form">
            <div className="ws-scanned">
              <div className="ws-scanned-label">Skanerlangan karta</div>
              <div className="ws-scanned-uid">{scanned.card_uid}</div>
              {scanned.holder_name && <div className="ws-scanned-holder">{scanned.holder_name}</div>}
              <div className="ws-scanned-meta">
                Ball: <b>{scanned.points}</b> · Tier: <b>{scanned.tier}</b>
              </div>
            </div>

            <label className="lb-field">
              <span>Xarid summasi (so'm)</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="45000"
                autoFocus
              />
            </label>
            <label className="lb-field">
              <span>Izoh (ixtiyoriy)</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="a-btn a-btn-secondary" onClick={reset} style={{ flex: 1 }}>
                <X size={14} /> Bekor
              </button>
              <button className="a-btn a-btn-primary" onClick={submitEarn} style={{ flex: 2 }}>
                <Check size={14} /> Ball qo'shish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
