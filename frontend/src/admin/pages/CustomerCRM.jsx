import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Tag, Save, Phone, Calendar, Star } from 'lucide-react'
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

export default function CustomerCRM() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) {
      navigate('/merchant/login')
      return
    }
    document.body.classList.add('admin-body')
    load()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ search, tier, limit: 200 })
      const data = await mf(`/merchants/me/customers?${params}`)
      setCustomers(data?.customers || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function openCustomer(c) {
    setSelected(c)
    try {
      const d = await mf(`/merchants/me/customers/${c.card_uid}`)
      setDetail(d)
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveTagsNotes() {
    try {
      await mf(`/merchants/me/customers/${selected.card_uid}`, {
        method: 'PATCH',
        body: JSON.stringify({
          tags: detail.card.tags,
          notes: detail.card.notes,
        }),
      })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  function updateTag(v) {
    if (!detail) return
    setDetail({ ...detail, card: { ...detail.card, tags: v.split(',').map(s => s.trim()).filter(Boolean) } })
  }

  function updateNotes(v) {
    if (!detail) return
    setDetail({ ...detail, card: { ...detail.card, notes: v } })
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}>
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div>
          <div className="lb-title">Mijozlar CRM</div>
          <div className="lb-sub">Mijozlar kartochkasi, teg, izoh va tarix</div>
        </div>
      </header>

      <div className="crm-container">
        {error && <div className="lb-error">{error}</div>}

        <div className="crm-list">
          <div className="crm-filters">
            <div className="crm-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Ism yoki telefon"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
            </div>
          </div>

          {loading ? (
            <div className="a-loading"><div className="a-spinner" /></div>
          ) : (
            <div className="crm-rows">
              {customers.map((c) => (
                <button
                  key={c.card_uid}
                  className={`crm-row ${selected?.card_uid === c.card_uid ? 'active' : ''}`}
                  onClick={() => openCustomer(c)}
                >
                  <div className="crm-row-name">{c.holder_name || '—'}</div>
                  <div className="crm-row-meta">
                    <span>{c.holder_phone || '—'}</span>
                  </div>
                  <div className="crm-row-pts">{c.points.toLocaleString('ru-RU')} so'm</div>
                  {c.tags?.length > 0 && (
                    <div className="crm-tags">
                      {c.tags.slice(0, 3).map((t) => (
                        <span key={t} className="crm-tag">{t}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
              {customers.length === 0 && !loading && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--a-muted)' }}>Mijoz topilmadi</div>
              )}
            </div>
          )}
        </div>

        <div className="crm-detail">
          {!detail ? (
            <div className="crm-placeholder">Mijozni tanlang</div>
          ) : (
            <>
              <div className="crm-head">
                <div>
                  <div className="crm-head-name">{detail.card.holder_name || 'Anonim'}</div>
                  <div className="crm-head-sub">
                    <Phone size={12} /> {detail.card.holder_phone || '—'}
                    {detail.card.holder_birth_date && (
                      <>
                        &nbsp;·&nbsp;<Calendar size={12} />
                        {new Date(detail.card.holder_birth_date).toLocaleDateString()}
                      </>
                    )}
                  </div>
                </div>
                <div className="crm-head-right">
                  <div className="crm-head-pts">{detail.card.points.toLocaleString('ru-RU')} so'm</div>
                </div>
              </div>

              <div className="crm-kpis">
                <div><div className="crm-kpi-v">{detail.stats.total_visits}</div><div className="crm-kpi-l">Tashriflar</div></div>
                <div><div className="crm-kpi-v">{(detail.stats.total_revenue || 0).toLocaleString()}</div><div className="crm-kpi-l">Jami savdo</div></div>
                <div>
                  <div className="crm-kpi-v">{detail.transactions.length}</div>
                  <div className="crm-kpi-l">So'nggi 100 tx</div>
                </div>
              </div>

              <div className="crm-section">
                <div className="crm-section-title"><Tag size={14} /> Teglar (vergul bilan ajratilgan)</div>
                <input
                  type="text"
                  value={(detail.card.tags || []).join(', ')}
                  onChange={(e) => updateTag(e.target.value)}
                  placeholder="VIP, aperitif, mumtoz"
                  className="crm-input"
                />
              </div>

              <div className="crm-section">
                <div className="crm-section-title">Eslatmalar</div>
                <textarea
                  rows={3}
                  value={detail.card.notes || ''}
                  onChange={(e) => updateNotes(e.target.value)}
                  placeholder="Mijoz haqida maxsus ma'lumot..."
                  className="crm-input"
                />
              </div>

              <button className="a-btn a-btn-primary" onClick={saveTagsNotes}>
                <Save size={14} /> Saqlash
              </button>

              <div className="crm-section">
                <div className="crm-section-title">Tarix</div>
                <div className="crm-tx-list">
                  {detail.transactions.map((t) => (
                    <div key={t.id} className={`crm-tx crm-tx-${t.tx_type}`}>
                      <div className="crm-tx-type">{t.tx_type === 'earn' ? '📥' : '📤'}</div>
                      <div className="crm-tx-body">
                        <div>{t.note || (t.tx_type === 'earn' ? 'Ball qo\'shish' : 'Ball yechish')}</div>
                        <div className="crm-tx-date">{new Date(t.created_at).toLocaleString()}</div>
                      </div>
                      <div className="crm-tx-pts">
                        {t.points_delta > 0 ? '+' : ''}{t.points_delta}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
