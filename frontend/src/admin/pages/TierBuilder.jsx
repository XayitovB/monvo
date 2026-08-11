import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Save, Crown, GripVertical } from 'lucide-react'
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

const EMOJIS = ['🥉', '🥈', '🥇', '💎', '👑', '⭐', '🏆', '🎖️', '🏅', '💠']

export default function TierBuilder() {
  const navigate = useNavigate()
  const [tiers, setTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    try {
      const data = await mf('/merchants/me/tiers')
      setTiers(data?.tiers || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function addTier() {
    const next = [...tiers]
    const lastMin = next.length > 0 ? next[next.length - 1].min_points + 1000 : 0
    next.push({
      name: `Daraja ${next.length + 1}`,
      min_points: lastMin,
      color: '#888888',
      emoji: EMOJIS[next.length % EMOJIS.length],
      benefits: [],
    })
    setTiers(next)
  }

  function updateTier(i, patch) {
    const next = [...tiers]
    next[i] = { ...next[i], ...patch }
    setTiers(next)
  }

  function removeTier(i) {
    setTiers(tiers.filter((_, idx) => idx !== i))
  }

  function moveTier(i, dir) {
    const j = i + dir
    if (j < 0 || j >= tiers.length) return
    const next = [...tiers]
    ;[next[i], next[j]] = [next[j], next[i]]
    setTiers(next)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await mf('/merchants/me/tiers', {
        method: 'PUT',
        body: JSON.stringify({ tiers }),
      })
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="lb-loading"><div className="a-spinner" /></div>

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}>
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div>
          <div className="lb-title">Tier Konstruktor</div>
          <div className="lb-sub">Mijoz darajalari — o'zingiz belgilaysiz</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={save} disabled={saving}>
          <Save size={16} /> {saving ? 'Saqlanyapti...' : 'Saqlash'}
        </button>
      </header>

      <div className="lb-container">
        {error && <div className="lb-error">{error}</div>}

        <div className="lb-list">
          {tiers.map((t, i) => (
            <div key={i} className="tb-row" style={{ borderLeftColor: t.color }}>
              <div className="tb-move">
                <button className="lb-icon-btn" onClick={() => moveTier(i, -1)} disabled={i === 0}>↑</button>
                <button className="lb-icon-btn" onClick={() => moveTier(i, 1)} disabled={i === tiers.length - 1}>↓</button>
              </div>

              <div className="tb-preview" style={{ background: t.color }}>
                <div className="tb-preview-emoji">{t.emoji || '⭐'}</div>
                <div className="tb-preview-name">{t.name}</div>
                <div className="tb-preview-pts">{(t.min_points || 0).toLocaleString()} ball+</div>
              </div>

              <div className="tb-fields">
                <label className="lb-field">
                  <span>Nom</span>
                  <input value={t.name || ''} onChange={(e) => updateTier(i, { name: e.target.value })} />
                </label>
                <label className="lb-field">
                  <span>Min ball</span>
                  <input type="number" value={t.min_points || 0} onChange={(e) => updateTier(i, { min_points: Number(e.target.value) })} />
                </label>
                <label className="lb-field">
                  <span>Rang</span>
                  <input type="color" value={t.color || '#888'} onChange={(e) => updateTier(i, { color: e.target.value })} />
                </label>
                <div className="lb-field">
                  <span>Belgi</span>
                  <div className="tb-emojis">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        className={`tb-emoji ${t.emoji === e ? 'on' : ''}`}
                        onClick={() => updateTier(i, { emoji: e })}
                        type="button"
                      >{e}</button>
                    ))}
                  </div>
                </div>
                <label className="lb-field" style={{ gridColumn: '1 / -1' }}>
                  <span>Imtiyozlar (har qatorda bittadan)</span>
                  <textarea
                    rows={2}
                    value={(t.benefits || []).join('\n')}
                    onChange={(e) => updateTier(i, { benefits: e.target.value.split('\n').filter(Boolean) })}
                    placeholder={'Masalan:\n5% cashback\nBepul yetkazib berish'}
                  />
                </label>
              </div>

              <button className="lb-icon-btn danger" onClick={() => removeTier(i)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <button className="a-btn a-btn-secondary" onClick={addTier} style={{ marginTop: 16 }}>
          <Plus size={16} /> Daraja qo'shish
        </button>
      </div>
    </div>
  )
}
