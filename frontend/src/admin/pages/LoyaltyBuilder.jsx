import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Power, ArrowLeft, Coins, Percent, Crown, Ticket,
  Gift, Clock, Sparkles, Users, DoorOpen, Save, Play, PauseCircle, Settings, Cake,
} from 'lucide-react'
import './LoyaltyBuilder.css'

const ICONS = {
  coins: Coins, percent: Percent, crown: Crown, ticket: Ticket,
  gift: Gift, clock: Clock, sparkles: Sparkles, users: Users,
  door: DoorOpen, settings: Settings, cake: Cake,
}

function merchantFetch(path, options = {}) {
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

export default function LoyaltyBuilder() {
  const navigate = useNavigate()
  const [types, setTypes] = useState([])
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [editingRule, setEditingRule] = useState(null) // {rule_type, config, id?}

  useEffect(() => {
    document.body.classList.add('admin-body')
    if (!localStorage.getItem('merchant_token')) {
      navigate('/merchant/login')
      return
    }
    loadAll()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [typesData, rulesData] = await Promise.all([
        merchantFetch('/merchants/me/loyalty/rule-types'),
        merchantFetch('/merchants/me/loyalty/rules'),
      ])
      setTypes(typesData || [])
      setRules(rulesData || [])
    } catch (e) {
      setError(e.message || 'Xato')
    } finally {
      setLoading(false)
    }
  }

  async function createRule(typeMeta) {
    const body = {
      rule_type: typeMeta.key,
      name: typeMeta.label,
      is_active: true,
      priority: 100,
      config: { ...typeMeta.defaults },
    }
    try {
      await merchantFetch('/merchants/me/loyalty/rules', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setShowPicker(false)
      await loadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  async function toggleRule(id) {
    try {
      await merchantFetch(`/merchants/me/loyalty/rules/${id}/toggle`, { method: 'PATCH' })
      await loadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  async function deleteRule(id) {
    if (!confirm("Qoidani o'chirishni tasdiqlaysizmi?")) return
    try {
      await merchantFetch(`/merchants/me/loyalty/rules/${id}`, { method: 'DELETE' })
      await loadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveRuleConfig(rule) {
    try {
      await merchantFetch(`/merchants/me/loyalty/rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: rule.name,
          description: rule.description,
          priority: rule.priority,
          config: rule.config,
        }),
      })
      setEditingRule(null)
      await loadAll()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) {
    return <div className="lb-loading"><div className="a-spinner" /></div>
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}>
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div>
          <div className="lb-title">Loyalty Konstruktor</div>
          <div className="lb-sub">Bonus qoidalarini o'zingiz yig'ing</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={() => setShowPicker(true)}>
          <Plus size={16} /> Qoida qo'shish
        </button>
      </header>

      <div className="lb-container">
        {error && <div className="lb-error">{error}</div>}

        {rules.length === 0 ? (
          <EmptyState onAdd={() => setShowPicker(true)} />
        ) : (
          <div className="lb-list">
            {rules.map((r) => (
              <RuleCard
                key={r.id}
                rule={r}
                typeMeta={types.find(t => t.key === r.rule_type)}
                onToggle={() => toggleRule(r.id)}
                onEdit={() => setEditingRule({ ...r })}
                onDelete={() => deleteRule(r.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showPicker && (
        <TypePicker
          types={types}
          existing={rules}
          onClose={() => setShowPicker(false)}
          onPick={createRule}
        />
      )}

      {editingRule && (
        <RuleEditor
          rule={editingRule}
          typeMeta={types.find(t => t.key === editingRule.rule_type)}
          onChange={setEditingRule}
          onSave={saveRuleConfig}
          onClose={() => setEditingRule(null)}
        />
      )}
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onAdd }) {
  return (
    <div className="lb-empty">
      <div className="lb-empty-icon"><Gift size={32} /></div>
      <div className="lb-empty-title">Hali qoidalar yo'q</div>
      <div className="lb-empty-desc">
        Birinchi qoidani qo'shing — mijozlar har xaridda bonus olishni boshlaydi.
      </div>
      <button className="a-btn a-btn-primary" onClick={onAdd}>
        <Plus size={16} /> Birinchi qoidani qo'shish
      </button>
    </div>
  )
}

// ── Rule card ────────────────────────────────────────────────────────────────
function RuleCard({ rule, typeMeta, onToggle, onEdit, onDelete }) {
  const Icon = ICONS[rule.type_icon] || Settings
  return (
    <div className={`lb-card ${rule.is_active ? '' : 'inactive'}`}>
      <div className="lb-card-icon"><Icon size={20} /></div>
      <div className="lb-card-body">
        <div className="lb-card-title">{rule.name}</div>
        <div className="lb-card-type">{rule.type_label}</div>
        <div className="lb-card-config">{summarizeConfig(rule, typeMeta)}</div>
      </div>
      <div className="lb-card-actions">
        <button
          className={`lb-icon-btn ${rule.is_active ? 'on' : 'off'}`}
          onClick={onToggle}
          title={rule.is_active ? 'O\'chirish' : 'Yoqish'}
        >
          {rule.is_active ? <Play size={14} /> : <PauseCircle size={14} />}
        </button>
        <button className="lb-icon-btn" onClick={onEdit} title="Sozlash">
          <Settings size={14} />
        </button>
        <button className="lb-icon-btn danger" onClick={onDelete} title="O'chirish">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function summarizeConfig(rule, typeMeta) {
  const c = rule.config || {}
  switch (rule.rule_type) {
    case 'classic_points': return `Har ${c.amount_per_point || 0} so'm = 1 ball`
    case 'per_visit': return `Har tashrif = ${c.points_per_visit || 0} ball`
    case 'cashback_percent': return `Cashback ${c.percent || 0}% (ball sifatida)`
    case 'tier_cashback': {
      const t = c.tiers || {}
      return `Bronze ${t.bronze||0}% · Silver ${t.silver||0}% · Gold ${t.gold||0}% · Platinum ${t.platinum||0}%`
    }
    case 'punch_card': return `Har ${c.threshold || 0}-tashrif: ${c.reward_title || ''} (+${c.reward_points || 0} ball)`
    case 'spend_threshold': return `${(c.threshold_amount||0).toLocaleString()} so'm / ${c.period_days||30} kun → +${c.reward_points||0} ball`
    case 'happy_hour': {
      const days = (c.days || []).map(d => ['Du','Se','Ch','Pa','Ju','Sh','Ya'][d]).join(',')
      return `×${c.multiplier || 1} ${days} ${c.start_hour||0}:00–${c.end_hour||0}:00`
    }
    case 'first_visit': return `Yangi kartaga +${c.bonus_points || 0} ball`
    case 'birthday_bonus': return `Tug'ilgan kun ±${c.window_days||0} kun: ×${c.multiplier||1} + ${c.bonus_points||0} ball`
    case 'referral': return `Taklif qilgan: +${c.referrer_points || 0} · Yangi: +${c.referee_points || 0}`
    default: return typeMeta?.description || ''
  }
}

// ── Type picker ──────────────────────────────────────────────────────────────
function TypePicker({ types, existing, onClose, onPick }) {
  return (
    <div className="lb-modal-bg" onClick={onClose}>
      <div className="lb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lb-modal-title">Qoida turini tanlang</div>
        <div className="lb-modal-sub">Istalgancha qoida qo'sha olasiz — ular birga ishlaydi</div>
        <div className="lb-type-grid">
          {types.map((t) => {
            const Icon = ICONS[t.icon] || Settings
            const count = existing.filter((r) => r.rule_type === t.key).length
            return (
              <button key={t.key} className="lb-type-item" onClick={() => onPick(t)}>
                <div className="lb-type-icon"><Icon size={20} /></div>
                <div className="lb-type-label">{t.label}</div>
                <div className="lb-type-desc">{t.description}</div>
                {count > 0 && <div className="lb-type-count">Qo'shilgan: {count}</div>}
              </button>
            )
          })}
        </div>
        <button className="a-btn a-btn-secondary lb-modal-close" onClick={onClose}>
          Yopish
        </button>
      </div>
    </div>
  )
}

// ── Rule editor ──────────────────────────────────────────────────────────────
function RuleEditor({ rule, typeMeta, onChange, onSave, onClose }) {
  if (!typeMeta) return null

  function setField(key, value) {
    const next = { ...rule, config: { ...(rule.config || {}) } }
    if (key.includes('.')) {
      const [parent, child] = key.split('.')
      next.config[parent] = { ...(next.config[parent] || {}), [child]: value }
    } else {
      next.config[key] = value
    }
    onChange(next)
  }

  function getField(key) {
    const c = rule.config || {}
    if (key.includes('.')) {
      const [p, ch] = key.split('.')
      return (c[p] || {})[ch]
    }
    return c[key]
  }

  const days = ['Du','Se','Ch','Pa','Ju','Sh','Ya']

  return (
    <div className="lb-modal-bg" onClick={onClose}>
      <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()}>
        <div className="lb-modal-title">{typeMeta.label} — sozlash</div>
        <div className="lb-modal-sub">{typeMeta.description}</div>

        <label className="lb-field">
          <span>Nomi</span>
          <input
            type="text"
            value={rule.name || ''}
            onChange={(e) => onChange({ ...rule, name: e.target.value })}
            placeholder={typeMeta.label}
          />
        </label>

        {typeMeta.fields.map((f) => {
          if (f.type === 'days') {
            const selected = getField(f.key) || []
            return (
              <div className="lb-field" key={f.key}>
                <span>{f.label}</span>
                <div className="lb-days">
                  {days.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`lb-day ${selected.includes(i) ? 'on' : ''}`}
                      onClick={() => {
                        const next = selected.includes(i)
                          ? selected.filter((x) => x !== i)
                          : [...selected, i].sort()
                        setField(f.key, next)
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )
          }
          return (
            <label className="lb-field" key={f.key}>
              <span>{f.label}</span>
              <input
                type={f.type === 'number' ? 'number' : 'text'}
                value={getField(f.key) ?? ''}
                min={f.min}
                max={f.max}
                step={f.step || (f.type === 'number' ? 1 : undefined)}
                onChange={(e) => {
                  const v = f.type === 'number' ? Number(e.target.value) : e.target.value
                  setField(f.key, v)
                }}
              />
            </label>
          )
        })}

        <label className="lb-field">
          <span>Ustuvorlik (kichik qiymat — oldin qo'llaniladi)</span>
          <input
            type="number"
            value={rule.priority ?? 100}
            onChange={(e) => onChange({ ...rule, priority: Number(e.target.value) })}
          />
        </label>

        <div className="lb-modal-actions">
          <button className="a-btn a-btn-secondary" onClick={onClose}>Bekor qilish</button>
          <button className="a-btn a-btn-primary" onClick={() => onSave(rule)}>
            <Save size={14} /> Saqlash
          </button>
        </div>
      </div>
    </div>
  )
}
