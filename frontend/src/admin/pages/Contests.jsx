import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Trophy, Play, PauseCircle, X, Edit3, Flag, CheckCircle2 } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'
import './Gamification.css'

const STATUS_COLORS = {
  draft: '#888',
  active: '#10B981',
  finished: '#3F9C5C',
  cancelled: '#EF4444',
}

const TYPE_LABELS = {
  top_scanner: 'Top scanner (eng ko\'p QR scan)',
  top_spender: 'Top spender (eng ko\'p sarflagan)',
  top_streak:  'Top streak (eng uzoq streak)',
  top_xp:      'Top XP (eng ko\'p tajriba ball)',
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

export default function Contests() {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  async function load() {
    setLoading(true)
    try {
      const path = filter ? `/admin/contests?status=${filter}` : '/admin/contests'
      setList(await api.get(path) || [])
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [filter])

  async function save() {
    setErr('')
    try {
      if (!editing.title || !editing.contest_type || !editing.starts_at || !editing.ends_at) {
        setErr("Sarlavha, turi va sanalar majburiy")
        return
      }
      const body = {
        ...editing,
        starts_at: new Date(editing.starts_at).toISOString(),
        ends_at: new Date(editing.ends_at).toISOString(),
        prize_xp: Number(editing.prize_xp) || 0,
        max_winners: Number(editing.max_winners) || 1,
        merchant_id: editing.merchant_id ? Number(editing.merchant_id) : null,
      }
      if (editing.id) {
        const { id, contest_type, ...patch } = body
        await api.patch(`/admin/contests/${editing.id}`, patch)
      } else {
        await api.post('/admin/contests', body)
      }
      setEditing(null); await load()
    } catch (e) { setErr(e.message) }
  }

  async function setStatus(c, status) {
    try {
      await api.patch(`/admin/contests/${c.id}`, { status })
      await load()
    } catch (e) { setErr(e.message) }
  }

  async function finalize(id) {
    if (!confirm("Musobaqa qo'lda yakunlansinmi? G'oliblarga XP beriladi.")) return
    try {
      const res = await api.post(`/admin/contests/${id}/finalize`)
      alert(`G'oliblar: ${res.winners}, qatnashchi: ${res.participants}`)
      await load()
    } catch (e) { setErr(e.message) }
  }

  async function del(id) {
    if (!confirm("Musobaqa o'chirilsin?")) return
    try { await api.delete(`/admin/contests/${id}`); await load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Musobaqalar (Contests)</div>
          <div className="a-page-sub">Vaqt cheklangan reytingli musobaqalar</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="a-btn" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">Hammasi</option>
            <option value="draft">Draft</option>
            <option value="active">Faol</option>
            <option value="finished">Tugagan</option>
            <option value="cancelled">Bekor qilingan</option>
          </select>
          <button className="a-btn a-btn-primary" onClick={() => {
            const now = new Date()
            const week = new Date(now.getTime() + 7 * 86400000)
            setEditing({
              title: '', description: '',
              title_ru: '', description_ru: '',
              icon: 'trophy', banner_url: '',
              contest_type: 'top_scanner', merchant_id: '',
              status: 'draft',
              starts_at: toLocalInput(now.toISOString()),
              ends_at: toLocalInput(week.toISOString()),
              prize_description: '', prize_description_ru: '',
              prize_xp: 1000, max_winners: 10,
              auto_join: true,
            })
          }}><Plus size={14} /> Yangi musobaqa</button>
        </div>
      </div>

      {err && <div className="lb-error">{err}</div>}
      {loading && <div className="lb-loading">Yuklanmoqda…</div>}

      <div className="lb-list">
        {list.map(c => {
          const color = STATUS_COLORS[c.status] || '#888'
          return (
            <div key={c.id} className="lb-card" style={{ borderLeft: `3px solid ${color}` }}>
              <div className="lb-card-icon" style={{ background: color, color: '#fff' }}>
                <Trophy size={20} />
              </div>
              <div className="lb-card-body">
                <div className="lb-card-title">{c.title}
                  <span className="gm-badge" style={{
                    marginLeft: 10,
                    background: color,
                    color: '#fff',
                    fontSize: 10,
                    letterSpacing: 0.4,
                  }}>{c.status}</span>
                </div>
                <div className="lb-card-config">{c.description || '—'}</div>
                <div className="lb-card-type">
                  {TYPE_LABELS[c.contest_type] || c.contest_type}
                  {c.merchant_id ? ` · merchant#${c.merchant_id}` : ' · global'}
                  &nbsp;· prize: {c.prize_xp} XP × {c.max_winners}
                </div>
                <div className="gm-stat-row" style={{ marginTop: 6 }}>
                  <span>boshlanish:<b>{new Date(c.starts_at).toLocaleString()}</b></span>
                  <span>tugash:<b>{new Date(c.ends_at).toLocaleString()}</b></span>
                </div>
              </div>
              <div className="lb-card-actions">
                {c.status === 'draft' && (
                  <button className="lb-icon-btn on" title="Faollashtirish" onClick={() => setStatus(c, 'active')}>
                    <Play size={14} />
                  </button>
                )}
                {c.status === 'active' && (
                  <>
                    <button className="lb-icon-btn off" title="Pauza" onClick={() => setStatus(c, 'draft')}>
                      <PauseCircle size={14} />
                    </button>
                    <button className="lb-icon-btn" title="Yakunlash" onClick={() => finalize(c.id)}>
                      <Flag size={14} />
                    </button>
                  </>
                )}
                {c.status === 'finished' && (
                  <span className="lb-icon-btn on" title="Tugagan"><CheckCircle2 size={14} /></span>
                )}
                <button className="lb-icon-btn" onClick={() => setEditing({ ...c, starts_at: toLocalInput(c.starts_at), ends_at: toLocalInput(c.ends_at) })}>
                  <Edit3 size={14} />
                </button>
                <button className="lb-icon-btn danger" onClick={() => del(c.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })}
        {!list.length && !loading && <div className="lb-empty">Hozircha musobaqa yo'q</div>}
      </div>

      {editing && (
        <div className="gm-modal-bg" onClick={() => setEditing(null)}>
          <div className="gm-modal" onClick={e => e.stopPropagation()}>
            <div className="gm-modal-head">
              <span>{editing.id ? 'Musobaqa tahrirlash' : 'Yangi musobaqa'}</span>
              <button className="lb-icon-btn" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>

            <div className="gm-modal-body">
              <div className="gm-section-label">Sarlavha</div>
              <div className="gm-row">
                <label className="gm-field">O'zbekcha
                  <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Aprel oyi g'oliblari" />
                </label>
                <label className="gm-field">Русский
                  <input value={editing.title_ru || ''} onChange={e => setEditing({ ...editing, title_ru: e.target.value })} placeholder="Победители апреля" />
                </label>
              </div>
              <div className="gm-section-label">Tavsif</div>
              <div className="gm-row">
                <label className="gm-field">O'zbekcha
                  <textarea rows={2} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
                </label>
                <label className="gm-field">Русский
                  <textarea rows={2} value={editing.description_ru || ''} onChange={e => setEditing({ ...editing, description_ru: e.target.value })} />
                </label>
              </div>
              <label className="gm-field">Musobaqa turi
                <select value={editing.contest_type}
                        onChange={e => setEditing({ ...editing, contest_type: e.target.value })}
                        disabled={!!editing.id}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <div className="gm-row">
                <label className="gm-field" style={{ flex: 1 }}>Boshlanish
                  <input type="datetime-local" value={editing.starts_at} onChange={e => setEditing({ ...editing, starts_at: e.target.value })} />
                </label>
                <label className="gm-field" style={{ flex: 1 }}>Tugash
                  <input type="datetime-local" value={editing.ends_at} onChange={e => setEditing({ ...editing, ends_at: e.target.value })} />
                </label>
              </div>
              <div className="gm-section-label">Mukofot tavsifi</div>
              <div className="gm-row">
                <label className="gm-field">O'zbekcha
                  <input value={editing.prize_description || ''} onChange={e => setEditing({ ...editing, prize_description: e.target.value })} placeholder="iPhone 17, 1,000,000 so'm" />
                </label>
                <label className="gm-field">Русский
                  <input value={editing.prize_description_ru || ''} onChange={e => setEditing({ ...editing, prize_description_ru: e.target.value })} placeholder="iPhone 17, 1 000 000 сум" />
                </label>
              </div>
              <div className="gm-row">
                <label className="gm-field" style={{ flex: 1 }}>Prize XP (har g'olibga)
                  <input type="number" min="0" value={editing.prize_xp} onChange={e => setEditing({ ...editing, prize_xp: e.target.value })} />
                </label>
                <label className="gm-field" style={{ flex: 1 }}>G'oliblar soni
                  <input type="number" min="1" value={editing.max_winners} onChange={e => setEditing({ ...editing, max_winners: e.target.value })} />
                </label>
              </div>
              <label className="gm-field">Merchant ID (bo'sh = global)
                <input type="number" value={editing.merchant_id || ''} onChange={e => setEditing({ ...editing, merchant_id: e.target.value })} placeholder="Bo'sh qoldiring" />
              </label>
              <label className="gm-check">
                <input type="checkbox" checked={!!editing.auto_join}
                       onChange={e => setEditing({ ...editing, auto_join: e.target.checked })} />
                Avtomatik qo'shilish (har scan'da userlar avtomatik qo'shiladi)
              </label>
              <label className="gm-field">Holat
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="active">Faol</option>
                  <option value="finished">Tugagan</option>
                  <option value="cancelled">Bekor qilingan</option>
                </select>
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
