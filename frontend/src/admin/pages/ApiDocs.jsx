import { useState } from 'react'
import { Copy, ExternalLink, Check } from 'lucide-react'

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://monvo.uz'

const sections = [
  {
    title: 'Autentifikatsiya',
    tag: 'Auth',
    description: "Foydalanuvchi (customer) va merchant uchun JWT autentifikatsiya. Barcha muhofazalangan endpointlar `Authorization: Bearer <token>` talab qiladi.",
    endpoints: [
      { method: 'POST', path: '/auth/register',  desc: 'Customer akkaunt yaratish',   auth: 'none',     body: '{ "name": "...", "email": "...", "password": "..." }' },
      { method: 'POST', path: '/auth/login',     desc: 'Customer login (OAuth2 form)', auth: 'none',     body: 'form: username=<email>&password=<pw>' },
      { method: 'POST', path: '/auth/google',    desc: 'Google Sign-In',               auth: 'none',     body: '{ "id_token": "<google id token>" }' },
      { method: 'GET',  path: '/auth/me',        desc: 'Joriy customer profili',       auth: 'user JWT', body: '—' },
      { method: 'POST', path: '/merchants/register', desc: 'Biznes akkaunt yaratish',  auth: 'none',     body: '{ "business_name": "...", "email": "...", "password": "...", "phone": "...", "description": "..." }' },
      { method: 'POST', path: '/merchants/login',    desc: 'Merchant login (OAuth2 form)', auth: 'none', body: 'form: username=<email>&password=<pw>' },
      { method: 'GET',  path: '/merchants/me',       desc: 'Joriy merchant profili',   auth: 'merchant JWT', body: '—' },
      { method: 'PATCH',path: '/merchants/me',       desc: 'Merchant profilini yangilash', auth: 'merchant JWT', body: '{ "business_name": "...", "logo_url": "...", "brand_color": "#2F6B3F" }' },
      { method: 'GET',  path: '/merchants/stats',    desc: 'Biznes KPI',               auth: 'merchant JWT', body: '—' },
    ],
  },
  {
    title: 'Kartalar (Cards)',
    tag: 'Cards',
    description: 'Merchant mijozlariga QR loyalty karta chiqaradi. Public endpoint mobil skan paytida karta holatini ko\'rsatadi.',
    endpoints: [
      { method: 'POST',   path: '/cards',                 desc: 'Yangi karta generatsiya (QR UID + payload)', auth: 'merchant JWT', body: '{ "holder_name": "...", "holder_phone": "...", "user_id": 1 }' },
      { method: 'GET',    path: '/cards',                 desc: 'Merchantning barcha kartalari',              auth: 'merchant JWT', body: '—' },
      { method: 'GET',    path: '/cards/{card_uid}',      desc: 'Karta tafsilotlari',                         auth: 'merchant JWT', body: '—' },
      { method: 'GET',    path: '/cards/{card_uid}/qr',   desc: 'QR payload (monvo://card/<uid>)',           auth: 'merchant JWT', body: '—' },
      { method: 'PATCH',  path: '/cards/{card_uid}',      desc: 'Karta yangilash',                            auth: 'merchant JWT', body: '{ "holder_name": "...", "holder_phone": "..." }' },
      { method: 'DELETE', path: '/cards/{card_uid}',      desc: 'Kartani bloklash',                           auth: 'merchant JWT', body: '—' },
      { method: 'GET',    path: '/cards/public/{card_uid}', desc: 'Public karta holati (mobil skan)',         auth: 'none',         body: '—' },
    ],
  },
  {
    title: 'Tranzaksiyalar (Scan / Redeem)',
    tag: 'Transactions',
    description: 'QR skanerlab ball berish (earn), yoki mukofot uchun ball yechish (redeem).',
    endpoints: [
      { method: 'POST', path: '/transactions/scan',             desc: 'QR skanerla → ball qo\'sh',           auth: 'merchant JWT', body: '{ "card_uid": "...", "amount": 45000, "rule_id": 1, "note": "..." }' },
      { method: 'POST', path: '/transactions/redeem',           desc: "Ballarni reward'ga almashtirish",     auth: 'merchant JWT', body: '{ "card_uid": "...", "reward_id": 1 }' },
      { method: 'GET',  path: '/transactions',                  desc: 'Merchant tarixi (filter: tx_type)',   auth: 'merchant JWT', body: '—' },
      { method: 'GET',  path: '/transactions/card/{card_uid}',  desc: 'Aniq karta tarixi',                   auth: 'merchant JWT', body: '—' },
    ],
  },
  {
    title: 'Push bildirishnomalar',
    tag: 'Push',
    description: 'Firebase FCM token ro\'yxatdan o\'tkazish. Mobil ilova token olgach shu endpoint\'ga yuboradi.',
    endpoints: [
      { method: 'POST',   path: '/push/register',   desc: 'FCM token ro\'yxatga olish',   auth: 'user JWT', body: '{ "token": "<fcm>", "platform": "android" }' },
      { method: 'DELETE', path: '/push/unregister', desc: 'Token o\'chirish',             auth: 'user JWT', body: '{ "token": "<fcm>" }' },
    ],
  },
  {
    title: 'Parolni tiklash',
    tag: 'Password',
    description: "6 xonali OTP email orqali yuboriladi, 15 daqiqa amal qiladi.",
    endpoints: [
      { method: 'POST', path: '/reset/request', desc: 'Email ga OTP yuborish',   auth: 'none', body: '{ "email": "..." }' },
      { method: 'POST', path: '/reset/verify',  desc: 'OTP + yangi parol',       auth: 'none', body: '{ "code": "123456", "token": "...", "new_password": "..." }' },
    ],
  },
  {
    title: 'Yordamchi',
    tag: 'Misc',
    description: 'App linklar, landing traffic, waitlist.',
    endpoints: [
      { method: 'GET',  path: '/links',           desc: 'App yuklab olish linklari',  auth: 'none', body: '—' },
      { method: 'POST', path: '/traffic/page-view', desc: 'Landing sahifa ko\'rish', auth: 'none', body: '{ "path": "/" }' },
      { method: 'POST', path: '/waitlist/join',   desc: 'Waitlist\'ga qo\'shilish',    auth: 'none', body: '{ "email": "..." }' },
      { method: 'GET',  path: '/health',          desc: 'Health check (DB + Redis)',  auth: 'none', body: '—' },
    ],
  },
]

const methodColors = {
  GET:    { bg: 'rgba(47,107,63,0.12)',   color: '#5FAE6F' },
  POST:   { bg: 'rgba(34,197,94,0.14)',   color: '#4ADE80' },
  PATCH:  { bg: 'rgba(251,191,36,0.14)',  color: '#FCD34D' },
  PUT:    { bg: 'rgba(251,191,36,0.14)',  color: '#FCD34D' },
  DELETE: { bg: 'rgba(239,68,68,0.14)',   color: '#F87171' },
}

function CopyBtn({ value }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="a-btn a-btn-secondary td-icon-btn"
      style={{ padding: 6 }}
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
      title="Copy"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

export default function ApiDocs() {
  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">API</div>
          <div className="a-page-sub">Android / iOS ilovalari uchun REST API ma'lumotnomasi</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="a-btn a-btn-secondary" href="/docs" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> Swagger UI
          </a>
          <a className="a-btn a-btn-secondary" href="/redoc" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> ReDoc
          </a>
          <a className="a-btn a-btn-secondary" href="/openapi.json" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> OpenAPI JSON
          </a>
        </div>
      </div>

      <div className="a-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--a-muted)' }}>Base URL</div>
          <code style={{ fontSize: 13, background: 'var(--a-card2)', padding: '6px 12px', borderRadius: 8, color: 'var(--a-text)' }}>
            {BASE_URL}
          </code>
          <CopyBtn value={BASE_URL} />
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--a-muted)' }}>
            Auth: <code style={{ background: 'var(--a-card2)', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>Authorization: Bearer &lt;JWT&gt;</code>
          </div>
        </div>
      </div>

      {sections.map((section, i) => (
        <div key={i} className="a-card" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--a-text)' }}>{section.title}</div>
            <span className="a-badge a-badge-blue" style={{ fontSize: 10 }}>{section.tag}</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--a-muted)', margin: '4px 0 16px', lineHeight: 1.6 }}>
            {section.description}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {section.endpoints.map((ep, j) => {
              const m = methodColors[ep.method] || methodColors.GET
              const fullUrl = `${BASE_URL}${ep.path}`
              return (
                <div
                  key={j}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--a-card2)',
                    borderRadius: 8,
                    border: '1px solid var(--a-border)',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px 0',
                      background: m.bg,
                      color: m.color,
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 6,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {ep.method}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <code style={{ fontSize: 13, fontWeight: 600, color: 'var(--a-text)' }}>{ep.path}</code>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, fontSize: 12, color: 'var(--a-muted)' }}>
                      <span>{ep.desc}</span>
                      <span style={{ opacity: 0.5 }}>·</span>
                      <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10, fontWeight: 700 }}>
                        {ep.auth}
                      </span>
                    </div>
                    {ep.body !== '—' && (
                      <code style={{ display: 'block', marginTop: 6, fontSize: 11, color: 'var(--a-dim)', wordBreak: 'break-word' }}>
                        {ep.body}
                      </code>
                    )}
                  </div>
                  <CopyBtn value={fullUrl} />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="a-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Mobile integration misollari</div>
        <div style={{ fontSize: 12, color: 'var(--a-muted)', marginBottom: 14 }}>
          Android (Kotlin + Retrofit) yoki iOS (Swift + URLSession) uchun tipik oqim:
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--a-dim)', marginBottom: 8 }}>
              1. Merchant login
            </div>
            <pre style={{ fontSize: 11, padding: 14, background: 'var(--a-card2)', borderRadius: 8, overflow: 'auto', border: '1px solid var(--a-border)', lineHeight: 1.55 }}>
{`POST /merchants/login
Content-Type: application/x-www-form-urlencoded

username=owner@cafe.uz&password=***

→ { "access_token": "...", "merchant_id": 1 }`}
            </pre>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--a-dim)', marginBottom: 8 }}>
              2. QR skan → ball berish
            </div>
            <pre style={{ fontSize: 11, padding: 14, background: 'var(--a-card2)', borderRadius: 8, overflow: 'auto', border: '1px solid var(--a-border)', lineHeight: 1.55 }}>
{`POST /transactions/scan
Authorization: Bearer <merchant JWT>
Content-Type: application/json

{ "card_uid": "<scanned>", "amount": 45000 }

→ { "tx_type": "earn", "points_delta": 45 }`}
            </pre>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--a-dim)', marginBottom: 8 }}>
              3. Mijoz — karta balansi (public)
            </div>
            <pre style={{ fontSize: 11, padding: 14, background: 'var(--a-card2)', borderRadius: 8, overflow: 'auto', border: '1px solid var(--a-border)', lineHeight: 1.55 }}>
{`GET /cards/public/<card_uid>

→ {
  "points": 680,
  "tier": "gold",
  "merchant": { "business_name": "...", "brand_color": "#2F6B3F" }
}`}
            </pre>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--a-dim)', marginBottom: 8 }}>
              4. Reward redeem
            </div>
            <pre style={{ fontSize: 11, padding: 14, background: 'var(--a-card2)', borderRadius: 8, overflow: 'auto', border: '1px solid var(--a-border)', lineHeight: 1.55 }}>
{`POST /transactions/redeem
Authorization: Bearer <merchant JWT>
Content-Type: application/json

{ "card_uid": "...", "reward_id": 1 }

→ { "tx_type": "redeem", "points_delta": -100 }`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
