import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react'
import './AdminLogin.css'

/**
 * Yagona biznes login: email/login + parol orqali avtomatik role aniqlanadi.
 *
 * Tartib:
 *   1. Avval `/merchants/login` (form-urlencoded) sinaladi.
 *   2. Muvaffaqiyatsiz bo'lsa `/admin/admins/login` (JSON, multi-admin DB).
 *   3. U ham muvaffaqiyatsiz bo'lsa `/admin/login` (legacy .env admin).
 *   4. Token va role aniqlangach mos panelga yo'naltirish:
 *      - merchant → /merchant/dashboard
 *      - admin    → /panel/dashboard
 */
export default function BusinessLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ identifier: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loginHint, setLoginHint] = useState(null)

  useEffect(() => {
    fetch('/admin/login-hint')
      .then(r => r.json())
      .then(d => setLoginHint(d))
      .catch(() => {})
  }, [])

  // Allaqachon login bo'lsa darhol panelga yo'naltirish
  useEffect(() => {
    document.body.classList.add('admin-body')
    const merchantToken = localStorage.getItem('merchant_token')
    const adminToken = localStorage.getItem('admin_token')
    // Merchant SPA — alohida bundle (merchant.html). Backend serve qilishi
    // uchun navigate() yetarli emas — hard reload kerak.
    if (merchantToken) window.location.replace('/merchant/dashboard')
    else if (adminToken) navigate('/panel/dashboard', { replace: true })
    return () => document.body.classList.remove('admin-body')
  }, [])

  // URL'da ?as=admin bo'lsa admin panelga, default — merchant'ga yo'naltirish hint
  const wantAdminFirst = new URLSearchParams(location.search).get('as') === 'admin'

  async function tryMerchantLogin(identifier, password) {
    const body = new URLSearchParams()
    body.set('username', identifier)
    body.set('password', password)
    const res = await fetch('/merchants/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return null
    return await res.json() // {access_token, merchant_id, business_name}
  }

  async function tryAdminLogin(identifier, password) {
    // 1) Multi-admin DB
    let res = await fetch('/admin/admins/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: identifier, password }),
    })
    if (res.ok) return await res.json()
    // 2) Legacy single-admin (.env)
    res = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: identifier, password }),
    })
    if (res.ok) return await res.json()
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const identifier = form.identifier.trim()
    const password = form.password

    try {
      // Tartib: agar URL'da ?as=admin bo'lsa avval admin sinaladi.
      // Aks holda — merchant first (ko'pchilik foydalanuvchilar merchantlar).
      const order = wantAdminFirst
        ? ['admin', 'merchant']
        : ['merchant', 'admin']

      let kind = null
      let data = null

      for (const which of order) {
        if (which === 'merchant') {
          data = await tryMerchantLogin(identifier, password)
          if (data) { kind = 'merchant'; break }
        } else {
          data = await tryAdminLogin(identifier, password)
          if (data) { kind = 'admin'; break }
        }
      }

      if (!kind) {
        throw new Error("Email/login yoki parol noto'g'ri")
      }

      if (kind === 'merchant') {
        localStorage.setItem('merchant_token', data.access_token)
        localStorage.setItem('merchant_id', String(data.merchant_id))
        localStorage.setItem('merchant_name', data.business_name || '')
        // Merchant SPA — boshqa bundle, hard reload qilamiz
        window.location.replace('/merchant/dashboard')
      } else {
        localStorage.setItem('admin_token', data.access_token)
        if (data.role) localStorage.setItem('admin_role', data.role)
        if (data.full_name) localStorage.setItem('admin_name', data.full_name)
        navigate('/panel/dashboard')
      }
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
        <div className="al-hero">
          <div className="al-hero-top">
            <div className="al-hero-icon"><ArrowRight size={18} /></div>
            <span className="al-hero-brand">Monvo Business</span>
          </div>
          <div className="al-hero-title">Boshqaruv<br/>paneli</div>
          <div className="al-hero-sub">
            Biznes egalari va platforma adminlari uchun yagona kirish.
          </div>
        </div>

        <div className="al-form-body">
          <form onSubmit={handleSubmit} className="al-login-form">
            <div className="al-field">
              <label>Email yoki login</label>
              <div className="al-input-wrap">
                <Mail size={15} className="al-input-icon" />
                <input
                  className="a-input al-padded"
                  type="text"
                  placeholder="owner@cafe.uz"
                  value={form.identifier}
                  onChange={e => setForm(p => ({ ...p, identifier: e.target.value }))}
                  required
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="al-field">
              <label>Parol</label>
              <div className="al-input-wrap">
                <Lock size={15} className="al-input-icon" />
                <input
                  className="a-input al-padded"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="al-eye"
                  onClick={() => setShowPw(s => !s)}
                  aria-label={showPw ? 'Parolni yashirish' : "Parolni ko'rsatish"}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && <div className="al-error">{error}</div>}

            <button
              type="submit"
              className="a-btn a-btn-primary al-submit"
              disabled={loading}
            >
              {loading ? <><span className="a-spinner" /> Kirish...</> : 'Kirish'}
            </button>
          </form>

          <div className="al-footnote">
            Biznes egasimi? <a href="https://monvo.uz" style={{ color: 'inherit', textDecoration: 'underline' }}>monvo.uz</a> orqali ro'yxatdan o'ting.
          </div>

          {(loginHint?.admin || loginHint?.merchant) && (
            <div style={{ marginTop: 10, fontSize: 11.5, opacity: 0.55, textAlign: 'center', lineHeight: 1.6 }}>
              {loginHint.admin && <div>{loginHint.admin}</div>}
              {loginHint.merchant && <div>{loginHint.merchant}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
