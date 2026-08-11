import { useState, useEffect } from 'react'
import { Settings, Save, RefreshCw, Send, Eye, EyeOff, CreditCard } from 'lucide-react'
import { api } from '../api'

export default function AppSettings() {
  const [form, setForm] = useState({ app_name: '', logo_url: '', primary_color: '#2F6B3F' })
  const [gam, setGam] = useState(true)
  const [gamSaving, setGamSaving] = useState(false)
  const [gamSaved, setGamSaved] = useState(false)
  const [tg, setTg] = useState({
    telegram_enabled: false,
    telegram_chat_id: '',
    telegram_bot_token_masked: '',
    telegram_bot_token_set: false,
  })
  const [tokenInput, setTokenInput] = useState('')
  const [botInfo, setBotInfo] = useState(null)
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [tgSaving, setTgSaving] = useState(false)
  const [tgSaved, setTgSaved]   = useState(false)
  const [tgTesting, setTgTesting] = useState(false)
  const [tgTestMsg, setTgTestMsg] = useState('')

  const [payme, setPayme] = useState({
    payme_merchant_id: '',
    payme_key_masked: '', payme_key_set: false,
    payme_test_key_masked: '', payme_test_key_set: false,
    payme_test_mode: false,
    payme_checkout_url: 'https://checkout.paycom.uz',
  })
  const [paymeKeyInput, setPaymeKeyInput] = useState('')
  const [paymeTestKeyInput, setPaymeTestKeyInput] = useState('')
  const [showPaymeKey, setShowPaymeKey] = useState(false)
  const [showPaymeTestKey, setShowPaymeTestKey] = useState(false)
  const [paymeSaving, setPaymeSaving] = useState(false)
  const [paymeSaved, setPaymeSaved] = useState(false)

  const [upd, setUpd] = useState({
    update_latest_build_ios: 0, update_min_build_ios: 0,
    update_latest_build_android: 0, update_min_build_android: 0,
    merchant_update_latest_build_ios: 0, merchant_update_min_build_ios: 0,
    merchant_update_latest_build_android: 0, merchant_update_min_build_android: 0,
  })
  const [updSaving, setUpdSaving] = useState(false)
  const [updSaved, setUpdSaved] = useState(false)

  function applyData(d) {
    setForm({
      app_name: d.app_name || '',
      logo_url: d.logo_url || '',
      primary_color: d.primary_color || '#2F6B3F',
    })
    setGam(d.gamification_enabled !== false)
    setPayme({
      payme_merchant_id: d.payme_merchant_id || '',
      payme_key_masked: d.payme_key_masked || '',
      payme_key_set: !!d.payme_key_set,
      payme_test_key_masked: d.payme_test_key_masked || '',
      payme_test_key_set: !!d.payme_test_key_set,
      payme_test_mode: !!d.payme_test_mode,
      payme_checkout_url: d.payme_checkout_url || 'https://checkout.paycom.uz',
    })
    setTg({
      telegram_enabled: !!d.telegram_enabled,
      telegram_chat_id: d.telegram_chat_id || '',
      telegram_bot_token_masked: d.telegram_bot_token_masked || '',
      telegram_bot_token_set: !!d.telegram_bot_token_set,
    })
    setUpd({
      update_latest_build_ios: d.update_latest_build_ios || 0,
      update_min_build_ios: d.update_min_build_ios || 0,
      update_latest_build_android: d.update_latest_build_android || 0,
      update_min_build_android: d.update_min_build_android || 0,
      merchant_update_latest_build_ios: d.merchant_update_latest_build_ios || 0,
      merchant_update_min_build_ios: d.merchant_update_min_build_ios || 0,
      merchant_update_latest_build_android: d.merchant_update_latest_build_android || 0,
      merchant_update_min_build_android: d.merchant_update_min_build_android || 0,
    })
  }

  const saveUpdate = async () => {
    setUpdSaving(true)
    try {
      const d = await api.patch('/admin/app-settings', {
        update_latest_build_ios: Number(upd.update_latest_build_ios) || 0,
        update_min_build_ios: Number(upd.update_min_build_ios) || 0,
        update_latest_build_android: Number(upd.update_latest_build_android) || 0,
        update_min_build_android: Number(upd.update_min_build_android) || 0,
        merchant_update_latest_build_ios: Number(upd.merchant_update_latest_build_ios) || 0,
        merchant_update_min_build_ios: Number(upd.merchant_update_min_build_ios) || 0,
        merchant_update_latest_build_android: Number(upd.merchant_update_latest_build_android) || 0,
        merchant_update_min_build_android: Number(upd.merchant_update_min_build_android) || 0,
      })
      applyData(d)
      setUpdSaved(true)
      setTimeout(() => setUpdSaved(false), 2500)
    } finally {
      setUpdSaving(false)
    }
  }

  const loadBotInfo = () => {
    api.get('/admin/telegram/bot-info')
      .then(r => setBotInfo(r))
      .catch(() => setBotInfo(null))
  }

  useEffect(() => {
    api.get('/admin/app-settings').then(d => {
      applyData(d)
      if (d.telegram_bot_token_set) loadBotInfo()
    }).finally(() => setLoading(false))
  }, [])

  const saveGam = async (next) => {
    setGam(next)
    setGamSaving(true)
    try {
      const d = await api.patch('/admin/app-settings', { gamification_enabled: next })
      applyData(d)
      setGamSaved(true)
      setTimeout(() => setGamSaved(false), 2500)
    } finally {
      setGamSaving(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.patch('/admin/app-settings', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const saveTelegram = async () => {
    setTgSaving(true)
    setTgTestMsg('')
    try {
      const payload = {
        telegram_enabled: tg.telegram_enabled,
        telegram_chat_id: tg.telegram_chat_id,
      }
      if (tokenInput.trim()) payload.telegram_bot_token = tokenInput.trim()
      const d = await api.patch('/admin/app-settings', payload)
      applyData(d)
      setTokenInput('')
      if (d.telegram_bot_token_set) loadBotInfo()
      setTgSaved(true)
      setTimeout(() => setTgSaved(false), 2500)
    } finally {
      setTgSaving(false)
    }
  }

  const clearToken = async () => {
    if (!confirm("Telegram bot tokenini o'chirishni tasdiqlaysizmi?")) return
    setTgSaving(true)
    try {
      const d = await api.patch('/admin/app-settings', { telegram_bot_token: '__clear__' })
      applyData(d)
      setTokenInput('')
    } finally {
      setTgSaving(false)
    }
  }

  const savePayme = async () => {
    setPaymeSaving(true)
    try {
      const payload = {
        payme_merchant_id: payme.payme_merchant_id,
        payme_test_mode: payme.payme_test_mode,
        payme_checkout_url: payme.payme_checkout_url,
      }
      if (paymeKeyInput.trim()) payload.payme_key = paymeKeyInput.trim()
      if (paymeTestKeyInput.trim()) payload.payme_test_key = paymeTestKeyInput.trim()
      const d = await api.patch('/admin/app-settings', payload)
      applyData(d)
      setPaymeKeyInput('')
      setPaymeTestKeyInput('')
      setPaymeSaved(true)
      setTimeout(() => setPaymeSaved(false), 2500)
    } finally {
      setPaymeSaving(false)
    }
  }

  const clearPaymeKey = async (field) => {
    if (!confirm(`${field === 'payme_key' ? 'Production' : 'Test'} kalitni o'chirishni tasdiqlaysizmi?`)) return
    setPaymeSaving(true)
    try {
      const d = await api.patch('/admin/app-settings', { [field]: '__clear__' })
      applyData(d)
    } finally {
      setPaymeSaving(false)
    }
  }

  const testTelegram = async () => {
    setTgTesting(true)
    setTgTestMsg('')
    try {
      const r = await api.post('/admin/telegram/test', {})
      setTgTestMsg(r.ok ? 'OK Test xabar yuborildi' : `Xato: ${r.info || 'noma\'lum'}`)
    } catch (e) {
      setTgTestMsg(`${e.message || 'Xato'}`)
    } finally {
      setTgTesting(false)
    }
  }

  if (loading) return <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">App Sozlamalari</div>
          <div className="a-page-sub">Telegram bot va Payme integratsiyalari</div>
        </div>
      </div>

      <div style={{ maxWidth: 560 }}>
        {/* ── Yutuqlar (geymifikatsiya) ────────────────────────────────────── */}
        <div className="a-card" style={{ padding: 28, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Settings size={18} />
            <div className="a-page-title" style={{ fontSize: 18 }}>Yutuqlar bo'limi</div>
          </div>
          <div className="a-page-sub" style={{ marginBottom: 22 }}>
            Foydalanuvchi ilovasidagi "Yutuqlar" (geymifikatsiya) bo'limini yoqib/o'chiradi.
            O'chirilsa — barcha userlarda yashiriladi (ilova yangilanishisiz).
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={gam}
              disabled={gamSaving}
              onChange={e => saveGam(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 600 }}>
              "Yutuqlar" bo'limini yoqish
            </span>
            {gamSaving && <span style={{ fontSize: 12, color: 'var(--a-muted)' }}>saqlanmoqda…</span>}
            {gamSaved && <span style={{ fontSize: 12, color: '#16a34a' }}>Saqlandi ✓</span>}
          </label>
        </div>

        {/* ── Telegram bot integratsiyasi ─────────────────────────────────── */}
        <div className="a-card" style={{ padding: 28, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Send size={18} />
            <div className="a-page-title" style={{ fontSize: 18 }}>Telegram bot</div>
            {botInfo?.ok && botInfo.username && (
              <a
                href={`https://t.me/${botInfo.username}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  marginLeft: 4, padding: '3px 10px', borderRadius: 20, fontSize: 12.5,
                  fontWeight: 700, background: 'rgba(16,185,129,.12)', color: '#10B981',
                  textDecoration: 'none',
                }}
              >
                @{botInfo.username}
              </a>
            )}
            {botInfo && !botInfo.ok && botInfo.error && (
              <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--a-danger, #dc2626)' }}>
                Bot aniqlanmadi
              </span>
            )}
          </div>
          <div className="a-page-sub" style={{ marginBottom: 22 }}>
            Landing demo formasidan kelgan zayafkalar tanlangan Telegram chatga avtomatik yuboriladi.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Enabled toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={tg.telegram_enabled}
                onChange={e => setTg(s => ({ ...s, telegram_enabled: e.target.checked }))}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>Telegramga yuborishni yoqish</span>
            </label>

            {/* Bot token */}
            <div>
              <label className="a-label">Bot token</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="a-input"
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder={tg.telegram_bot_token_set
                    ? `O'rnatilgan (${tg.telegram_bot_token_masked}) — yangilash uchun yangi token kiriting`
                    : '123456:ABC-DEF...'}
                  maxLength={200}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="a-btn"
                  onClick={() => setShowToken(s => !s)}
                  title={showToken ? 'Yashirish' : "Ko'rish"}
                  style={{ padding: '0 12px', height: 40 }}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>
                @BotFather'dan oling. Bo'sh qoldirsangiz mavjud token saqlanadi.
                {tg.telegram_bot_token_set && (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={clearToken}
                      style={{ background: 'none', border: 'none', color: '#ef4444',
                               cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >
                      Tokenni o'chirish
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Chat ID */}
            <div>
              <label className="a-label">Chat ID (qayerga yuborilsin)</label>
              <input
                className="a-input"
                value={tg.telegram_chat_id}
                onChange={e => setTg(s => ({ ...s, telegram_chat_id: e.target.value }))}
                placeholder="-1001234567890 yoki 123456789"
                maxLength={100}
              />
              <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>
                User ID, group ID (-...) yoki kanal @username. ID olish uchun
                botga xabar yozib, <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
                ni oching.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button
                className="a-btn a-btn-primary"
                onClick={saveTelegram}
                disabled={tgSaving}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {tgSaving ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                {tgSaved ? 'Saqlandi ✓' : 'Saqlash'}
              </button>
              <button
                className="a-btn"
                onClick={testTelegram}
                disabled={tgTesting || !tg.telegram_bot_token_set || !tg.telegram_chat_id}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                title={
                  !tg.telegram_bot_token_set ? 'Avval token o\'rnating' :
                  !tg.telegram_chat_id ? 'Avval chat ID kiriting' :
                  'Test xabar yuborish'
                }
              >
                {tgTesting ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                Test yuborish
              </button>
            </div>

            {tgTestMsg && (
              <div style={{
                padding: '10px 14px', borderRadius: 8, fontSize: 13,
                background: tgTestMsg.startsWith('OK') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${tgTestMsg.startsWith('OK') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              }}>
                {tgTestMsg}
              </div>
            )}
          </div>
        </div>

        {/* ── Payme integratsiyasi ──────────────────────────────────────── */}
        <div className="a-card" style={{ padding: 28, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <CreditCard size={18} />
            <div className="a-page-title" style={{ fontSize: 18 }}>Payme</div>
          </div>
          <div className="a-page-sub" style={{ marginBottom: 22 }}>
            Merchantlar obuna uchun Payme orqali to'lov qilishi uchun sozlang.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Test mode toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={payme.payme_test_mode}
                onChange={e => setPayme(s => ({ ...s, payme_test_mode: e.target.checked }))}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 600 }}>Test rejim (sandbox)</span>
            </label>

            {/* Merchant ID */}
            <div>
              <label className="a-label">Merchant ID</label>
              <input
                className="a-input"
                value={payme.payme_merchant_id}
                onChange={e => setPayme(s => ({ ...s, payme_merchant_id: e.target.value }))}
                placeholder="5e730e8e0b852a417aa49ceb"
                maxLength={100}
              />
              <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>
                Payme business.payme.uz kabinetidan oling.
              </div>
            </div>

            {/* Production key */}
            <div>
              <label className="a-label">Production kalit (Secret Key)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="a-input"
                  type={showPaymeKey ? 'text' : 'password'}
                  value={paymeKeyInput}
                  onChange={e => setPaymeKeyInput(e.target.value)}
                  placeholder={payme.payme_key_set
                    ? `O'rnatilgan (${payme.payme_key_masked}) — yangilash uchun yangi kalit kiriting`
                    : 'Production secret key'}
                  maxLength={200}
                  style={{ flex: 1 }}
                />
                <button type="button" className="a-btn" onClick={() => setShowPaymeKey(s => !s)}
                  style={{ padding: '0 12px', height: 40 }}>
                  {showPaymeKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {payme.payme_key_set && (
                <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>
                  <button type="button" onClick={() => clearPaymeKey('payme_key')}
                    style={{ background: 'none', border: 'none', color: '#ef4444',
                             cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    Kalitni o'chirish
                  </button>
                </div>
              )}
            </div>

            {/* Test key */}
            <div>
              <label className="a-label">Test kalit (Sandbox Secret Key)</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="a-input"
                  type={showPaymeTestKey ? 'text' : 'password'}
                  value={paymeTestKeyInput}
                  onChange={e => setPaymeTestKeyInput(e.target.value)}
                  placeholder={payme.payme_test_key_set
                    ? `O'rnatilgan (${payme.payme_test_key_masked}) — yangilash uchun yangi kalit kiriting`
                    : 'Test secret key (ixtiyoriy)'}
                  maxLength={200}
                  style={{ flex: 1 }}
                />
                <button type="button" className="a-btn" onClick={() => setShowPaymeTestKey(s => !s)}
                  style={{ padding: '0 12px', height: 40 }}>
                  {showPaymeTestKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {payme.payme_test_key_set && (
                <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>
                  <button type="button" onClick={() => clearPaymeKey('payme_test_key')}
                    style={{ background: 'none', border: 'none', color: '#ef4444',
                             cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                    Test kalitni o'chirish
                  </button>
                </div>
              )}
            </div>

            {/* Checkout URL */}
            <div>
              <label className="a-label">Checkout URL</label>
              <input
                className="a-input"
                value={payme.payme_checkout_url}
                onChange={e => setPayme(s => ({ ...s, payme_checkout_url: e.target.value }))}
                placeholder="https://checkout.paycom.uz"
                maxLength={200}
              />
              <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>
                Odatda o'zgartirmang. Test uchun: <code>https://test.paycom.uz</code>
              </div>
            </div>

            <button
              className="a-btn a-btn-primary"
              onClick={savePayme}
              disabled={paymeSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}
            >
              {paymeSaving ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
              {paymeSaved ? 'Saqlandi ✓' : 'Saqlash'}
            </button>
          </div>
        </div>

        {/* ── Ilova yangilanishi (update modali) ─────────────────────────── */}
        <div className="a-card" style={{ padding: 28, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <RefreshCw size={18} />
            <div className="a-page-title" style={{ fontSize: 18 }}>Ilova yangilanishi</div>
          </div>
          <div className="a-page-sub" style={{ marginBottom: 22 }}>
            Store'dagi eng so'nggi build raqamini kiriting. Foydalanuvchi versiyasi undan
            past bo'lsa — ilovada "yangilang" modali chiqadi. <b>0 = o'chiq</b> (modal chiqmaydi).
            Majburiy build — undan past bo'lsa modal yopilmaydi.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <label className="a-label">🍎 iOS — so'nggi build</label>
              <input className="a-input" type="number" min={0} value={upd.update_latest_build_ios}
                onChange={e => setUpd(s => ({ ...s, update_latest_build_ios: e.target.value }))} />
            </div>
            <div>
              <label className="a-label">🍎 iOS — majburiy build (min)</label>
              <input className="a-input" type="number" min={0} value={upd.update_min_build_ios}
                onChange={e => setUpd(s => ({ ...s, update_min_build_ios: e.target.value }))} />
            </div>
            <div>
              <label className="a-label">🤖 Android — so'nggi build</label>
              <input className="a-input" type="number" min={0} value={upd.update_latest_build_android}
                onChange={e => setUpd(s => ({ ...s, update_latest_build_android: e.target.value }))} />
            </div>
            <div>
              <label className="a-label">🤖 Android — majburiy build (min)</label>
              <input className="a-input" type="number" min={0} value={upd.update_min_build_android}
                onChange={e => setUpd(s => ({ ...s, update_min_build_android: e.target.value }))} />
            </div>
          </div>

          <div className="a-page-title" style={{ fontSize: 15, marginTop: 26, marginBottom: 14 }}>
            🏪 Monvo Business (merchant ilova)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <label className="a-label">🍎 iOS — so'nggi build</label>
              <input className="a-input" type="number" min={0} value={upd.merchant_update_latest_build_ios}
                onChange={e => setUpd(s => ({ ...s, merchant_update_latest_build_ios: e.target.value }))} />
            </div>
            <div>
              <label className="a-label">🍎 iOS — majburiy build (min)</label>
              <input className="a-input" type="number" min={0} value={upd.merchant_update_min_build_ios}
                onChange={e => setUpd(s => ({ ...s, merchant_update_min_build_ios: e.target.value }))} />
            </div>
            <div>
              <label className="a-label">🤖 Android — so'nggi build</label>
              <input className="a-input" type="number" min={0} value={upd.merchant_update_latest_build_android}
                onChange={e => setUpd(s => ({ ...s, merchant_update_latest_build_android: e.target.value }))} />
            </div>
            <div>
              <label className="a-label">🤖 Android — majburiy build (min)</label>
              <input className="a-input" type="number" min={0} value={upd.merchant_update_min_build_android}
                onChange={e => setUpd(s => ({ ...s, merchant_update_min_build_android: e.target.value }))} />
            </div>
          </div>

          <button
            className="a-btn a-btn-primary"
            onClick={saveUpdate}
            disabled={updSaving}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}
          >
            {updSaving ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
            {updSaved ? 'Saqlandi ✓' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}
