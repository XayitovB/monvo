import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Store, Phone, KeyRound, ArrowLeft } from 'lucide-react'
import './AdminLogin.css'

export default function MerchantPhoneLogin() {
  const navigate = useNavigate()
  const [step, setStep] = useState('phone') // 'phone' | 'otp'
  const [phone, setPhone] = useState('+998')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const otpRef = useRef(null)

  useEffect(() => {
    document.body.classList.add('admin-body')
    if (localStorage.getItem('merchant_token')) navigate('/merchant/home')
    return () => document.body.classList.remove('admin-body')
  }, [])

  useEffect(() => {
    if (step === 'otp' && otpRef.current) otpRef.current.focus()
  }, [step])

  function normalizePhone(v) {
    let p = v.trim()
    if (!p.startsWith('+')) p = '+' + p
    return p
  }

  async function handlePhoneSubmit(e) {
    e.preventDefault()
    setError('')
    const p = normalizePhone(phone)
    if (p.length < 10) {
      setError('Telefon raqam noto\'g\'ri')
      return
    }
    setLoading(true)
    try {
      const checkRes = await fetch('/auth/phone/check-merchant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p }),
      })
      if (!checkRes.ok) {
        const err = await checkRes.json().catch(() => ({}))
        throw new Error(err.detail || 'Tekshirishda xatolik')
      }

      const sendRes = await fetch('/auth/phone/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: p }),
      })
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}))
        throw new Error(err.detail || 'SMS yuborilmadi')
      }

      setPhone(p)
      setStep('otp')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleOtpSubmit(e) {
    e.preventDefault()
    setError('')
    if (code.length < 4) {
      setError('Kod kamida 4 raqam bo\'lishi kerak')
      return
    }
    setLoading(true)
    try {
      const verifyRes = await fetch('/auth/phone/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      })
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}))
        throw new Error(err.detail || 'Kod noto\'g\'ri')
      }
      const verifyData = await verifyRes.json()
      const userToken = verifyData.access_token

      const mtRes = await fetch('/auth/merchant-token', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}` },
      })
      if (!mtRes.ok) {
        const err = await mtRes.json().catch(() => ({}))
        throw new Error(err.detail || 'Merchant tokenini olishda xatolik')
      }
      const mtData = await mtRes.json()

      localStorage.setItem('merchant_token', mtData.access_token)
      localStorage.setItem('merchant_id', String(mtData.merchant_id))
      if (mtData.business_name) localStorage.setItem('merchant_name', mtData.business_name)

      navigate('/merchant/home')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="al-login-bg">
      <div className="al-login-orb al-login-orb-1" />
      <div className="al-login-orb al-login-orb-2" />

      <div className="al-login-card">
        <div className="al-login-brand">
          <div className="al-login-icon"><Store size={22} /></div>
          <div>
            <div className="al-login-title">Monvo Biznes</div>
            <div className="al-login-sub">Merchant paneli</div>
          </div>
        </div>

        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="al-login-form">
            <div className="al-field">
              <label>Telefon raqam</label>
              <div className="al-input-wrap">
                <Phone size={15} className="al-input-icon" />
                <input
                  className="a-input al-padded"
                  type="tel"
                  placeholder="+998 90 123 45 67"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  autoFocus
                  inputMode="tel"
                />
              </div>
            </div>

            {error && <div className="al-error">{error}</div>}

            <button type="submit" className="a-btn a-btn-primary al-submit" disabled={loading}>
              {loading ? <><span className="a-spinner" /> Tekshirilmoqda...</> : 'Kodni yuborish'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleOtpSubmit} className="al-login-form">
            <div className="al-field">
              <label>Tasdiqlash kodi</label>
              <div className="al-input-wrap">
                <KeyRound size={15} className="al-input-icon" />
                <input
                  ref={otpRef}
                  className="a-input al-padded"
                  type="text"
                  placeholder="6 xonali kod"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  inputMode="numeric"
                  maxLength={6}
                />
              </div>
              <div className="al-login-sub" style={{ marginTop: 8 }}>
                Kod {phone} raqamiga yuborildi
              </div>
            </div>

            {error && <div className="al-error">{error}</div>}

            <button type="submit" className="a-btn a-btn-primary al-submit" disabled={loading}>
              {loading ? <><span className="a-spinner" /> Kirilmoqda...</> : 'Kirish'}
            </button>

            <button
              type="button"
              className="a-btn"
              onClick={() => { setStep('phone'); setCode(''); setError('') }}
              style={{ width: '100%', justifyContent: 'center', background: 'transparent' }}
            >
              <ArrowLeft size={14} /> Raqamni o'zgartirish
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
