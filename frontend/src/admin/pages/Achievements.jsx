import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Trophy, X, Edit3, Eye, EyeOff } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'
import './Gamification.css'

const CATEGORY_COLORS = {
  scanner: '#10B981',
  spender: '#F59E0B',
  streak: '#EF4444',
  explorer: '#3F9C5C',
  general: '#7C3AED',
  social: '#EC4899',
}

const CRITERIA_TYPES = [
  { value: 'total_scans',      label: 'QR scan soni' },
  { value: 'unique_merchants', label: 'Turli merchant soni' },
  { value: 'total_spent',      label: "Sarflangan summa (so'm)" },
  { value: 'total_redeems',    label: 'Olingan mukofot soni' },
  { value: 'streak_days',      label: 'Streak (kunlar)' },
  { value: 'level_reached',    label: 'Yetilgan level' },
]

const CATEGORIES = [
  { value: 'general',  label: 'Umumiy' },
  { value: 'scanner',  label: 'Scanner' },
  { value: 'spender',  label: 'Xaridchi' },
  { value: 'streak',   label: 'Streak' },
  { value: 'explorer', label: 'Tadqiqotchi' },
  { value: 'social',   label: 'Ijtimoiy' },
]

const ICONS = ['trophy', 'award', 'star', 'crown', 'flame', 'zap', 'shield', 'gift', 'qr-code', 'scan', 'compass', 'map', 'shopping-bag', 'trending-up']

export default function Achievements() {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try { setList(await api.get('/admin/achievements') || []) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    setErr('')
    try {
      if (!editing.code || !editing.title || !editing.criteria_type) {
        setErr("Code, sarlavha va mezon majburiy")
        return
      }
      const body = {
        ...editing,
        criteria_threshold: Number(editing.criteria_threshold) || 1,
        xp_reward: Number(editing.xp_reward) || 0,
        sort_order: Number(editing.sort_order) || 100,
      }
      if (editing.id) {
        const { code, criteria_type, id, ...patch } = body
        await api.patch(`/admin/achievements/${editing.id}`, patch)
      } else {
        await api.post('/admin/achievements', body)
      }
      setEditing(null); await load()
    } catch (e) { setErr(e.message) }
  }

  async function toggle(a) {
    try {
      await api.patch(`/admin/achievements/${a.id}`, { is_active: !a.is_active })
      await load()
    } catch (e) { setErr(e.message) }
  }

  async function del(id) {
    if (!confirm("Achievement o'chirilsin?")) return
    try { await api.delete(`/admin/achievements/${id}`); await load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Achievements</div>
          <div className="a-page-sub">Foydalanuvchilar uchun badge / unvonlar</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing({
          code: '', title: '', description: '',
          title_ru: '', description_ru: '',
          icon: 'trophy', color: '#F59E0B', category: 'general',
          criteria_type: 'total_scans', criteria_threshold: 1, xp_reward: 100,
          is_active: true, sort_order: 100,
        })}><Plus size={14} /> Yangi badge</button>
      </div>

      {err && <div className="lb-error">{err}</div>}
      {loading && <div className="lb-loading">Yuklanmoqda…</div>}

      <div className="lb-list">
        {list.map(a => {
          const color = CATEGORY_COLORS[a.category] || a.color || '#7C3AED'
          return (
            <div key={a.id} className={`lb-card ${a.is_active ? '' : 'inactive'}`}
                 style={{ borderLeft: `3px solid ${color}` }}>
              <div className="lb-card-icon" style={{ background: color, color: '#fff' }}>
                <Trophy size={20} />
              </div>
              <div className="lb-card-body">
                <div className="lb-card-title">{a.title}
                  <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.55, fontWeight: 400 }}>{a.code}</span>
                </div>
                <div className="lb-card-config">{a.description || '—'}</div>
                <div className="lb-card-type" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 9px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    background: color,
                    color: '#fff',
                  }}>{a.category}</span>
                  <span style={{ opacity: 0.7 }}>{a.criteria_type} ≥ {a.criteria_threshold}</span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 9px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'rgba(212, 175, 55, 0.16)',
                    color: '#B45309',
                  }}>+{a.xp_reward} XP</span>
                </div>
              </div>
              <div className="lb-card-actions">
                <button
                  className={`lb-icon-btn ${a.is_active ? 'on' : 'off'}`}
                  onClick={() => toggle(a)}
                  title={a.is_active ? 'Faol — bosing yashirish uchun' : "Yashirilgan — bosing ko'rinishi uchun"}
                >
                  {a.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className="lb-icon-btn" onClick={() => setEditing({ ...a })}><Edit3 size={14} /></button>
                <button className="lb-icon-btn danger" onClick={() => del(a.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })}
        {!list.length && !loading && <div className="lb-empty">Hozircha badge yo'q</div>}
      </div>

      {editing && (
        <div className="gm-modal-bg" onClick={() => setEditing(null)}>
          <div className="gm-modal" onClick={e => e.stopPropagation()}>
            <div className="gm-modal-head">
              <span>{editing.id ? 'Badge tahrirlash' : 'Yangi badge'}</span>
              <button className="lb-icon-btn" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>

            <div className="gm-modal-body">
              <label className="gm-field">Code (yagona, ingl.)
                <input value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })}
                       disabled={!!editing.id} placeholder="first_scan" />
              </label>
              <div className="gm-section-label">Sarlavha</div>
              <div className="gm-row">
                <label className="gm-field">O'zbekcha
                  <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Birinchi qadam" />
                </label>
                <label className="gm-field">Русский
                  <input value={editing.title_ru || ''} onChange={e => setEditing({ ...editing, title_ru: e.target.value })} placeholder="Первый шаг" />
                </label>
              </div>
              <div className="gm-section-label">Tavsif</div>
              <div className="gm-row">
                <label className="gm-field">O'zbekcha
                  <textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={2} />
                </label>
                <label className="gm-field">Русский
                  <textarea value={editing.description_ru || ''} onChange={e => setEditing({ ...editing, description_ru: e.target.value })} rows={2} />
                </label>
              </div>
              <div className="gm-row">
                <label className="gm-field" style={{ flex: 1 }}>Kategoriya
                  <select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
                <label className="gm-field" style={{ flex: 1 }}>Icon
                  <select value={editing.icon} onChange={e => setEditing({ ...editing, icon: e.target.value })}>
                    {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
                <label className="gm-field" style={{ width: 90 }}>Rang
                  <input type="color" value={editing.color || '#F59E0B'} onChange={e => setEditing({ ...editing, color: e.target.value })} />
                </label>
              </div>

              <label className="gm-field">Mezon turi
                <select value={editing.criteria_type}
                        onChange={e => setEditing({ ...editing, criteria_type: e.target.value })}
                        disabled={!!editing.id}>
                  {CRITERIA_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>

              <div className="gm-row">
                <label className="gm-field" style={{ flex: 1 }}>Mezon qiymati (≥)
                  <input type="number" min="1" value={editing.criteria_threshold}
                         onChange={e => setEditing({ ...editing, criteria_threshold: e.target.value })} />
                </label>
                <label className="gm-field" style={{ flex: 1 }}>XP mukofot
                  <input type="number" min="0" value={editing.xp_reward}
                         onChange={e => setEditing({ ...editing, xp_reward: e.target.value })} />
                </label>
                <label className="gm-field" style={{ flex: 1 }}>Tartib
                  <input type="number" value={editing.sort_order || 100}
                         onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </label>
              </div>

              <label className="gm-switch">
                <input type="checkbox" checked={!!editing.is_active}
                       onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                <span className="gm-switch-track">
                  <span className="gm-switch-thumb" />
                </span>
                <span>{editing.is_active ? 'Faol — userlar ko\'radi' : 'Yashirilgan'}</span>
              </label>
            </div>

            <div className="gm-modal-foot">
              <button className="a-btn" onClick={() => setEditing(null)}>Bekor qilish</button>
              <button className="a-btn a-btn-primary" onClick={save}><Save size={14} /> Saqlash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
