import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Megaphone, Play, PauseCircle } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'

const TYPE_COLORS = {
  info: '#3F9C5C',
  warning: '#F59E0B',
  critical: '#EF4444',
  success: '#10B981',
}

export default function Announcements() {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  async function load() {
    try { setList(await api.get('/admin/announcements') || []) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    try {
      const body = { ...editing }
      if (editing.id) await api.patch(`/admin/announcements/${editing.id}`, body)
      else await api.post('/admin/announcements', body)
      setEditing(null); await load()
    } catch (e) { setErr(e.message) }
  }

  async function toggleActive(a) {
    try {
      await api.patch(`/admin/announcements/${a.id}`, { is_active: !a.is_active })
      await load()
    } catch (e) { setErr(e.message) }
  }

  async function del(id) {
    if (!confirm("Banner o'chirilsin?")) return
    try { await api.delete(`/admin/announcements/${id}`); await load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Bannerlar</div>
          <div className="a-page-sub">Platforma bo'ylab e'lonlar</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing({
          title: '', body: '', type: 'info', target: 'all',
          cta_label: '', cta_url: '', is_active: true,
        })}><Plus size={14} /> Banner qo'shish</button>
      </div>

      {err && <div className="lb-error">{err}</div>}

      <div className="lb-list">
        {list.map(a => (
          <div key={a.id} className={`lb-card ${a.is_active ? '' : 'inactive'}`}
               style={{ borderLeft: `3px solid ${TYPE_COLORS[a.type] || '#888'}` }}>
            <div className="lb-card-icon" style={{ background: TYPE_COLORS[a.type]+'22', color: TYPE_COLORS[a.type] }}>
              <Megaphone size={20} />
            </div>
            <div className="lb-card-body">
              <div className="lb-card-title">{a.title}</div>
              <div className="lb-card-config">{a.body}</div>
              <div className="lb-card-type">
                {a.type.toUpperCase()} · {a.target}
                {a.starts_at && ` · ${new Date(a.starts_at).toLocaleDateString()}`}
                {a.ends_at && ` → ${new Date(a.ends_at).toLocaleDateString()}`}
              </div>
            </div>
            <div className="lb-card-actions">
              <button className={`lb-icon-btn ${a.is_active ? 'on' : 'off'}`} onClick={() => toggleActive(a)}>
                {a.is_active ? <Play size={14} /> : <PauseCircle size={14} />}
              </button>
              <button className="lb-icon-btn" onClick={() => setEditing({ ...a })}>✎</button>
              <button className="lb-icon-btn danger" onClick={() => del(a.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="lb-empty"><div className="lb-empty-title">Banner yo'q</div></div>}
      </div>

      {editing && (
        <div className="lb-modal-bg" onClick={() => setEditing(null)}>
          <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-title">{editing.id ? 'Banner' : 'Yangi banner'}</div>
            <label className="lb-field"><span>Sarlavha</span><input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
            <label className="lb-field"><span>Matn</span><textarea rows={3} value={editing.body || ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="lb-field">
                <span>Tur</span>
                <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                  <option value="success">Success</option>
                </select>
              </label>
              <label className="lb-field">
                <span>Target</span>
                <select value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value })}>
                  <option value="all">Hammasi</option>
                  <option value="landing">Landing</option>
                  <option value="users">Users</option>
                  <option value="merchants">Merchants</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="lb-field"><span>CTA label</span><input value={editing.cta_label || ''} onChange={(e) => setEditing({ ...editing, cta_label: e.target.value })} /></label>
              <label className="lb-field"><span>CTA URL</span><input value={editing.cta_url || ''} onChange={(e) => setEditing({ ...editing, cta_url: e.target.value })} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="lb-field"><span>Boshlanish</span><input type="date" value={editing.starts_at ? editing.starts_at.slice(0,10) : ''} onChange={(e) => setEditing({ ...editing, starts_at: e.target.value ? e.target.value + 'T00:00:00Z' : null })} /></label>
              <label className="lb-field"><span>Tugash</span><input type="date" value={editing.ends_at ? editing.ends_at.slice(0,10) : ''} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value ? e.target.value + 'T23:59:59Z' : null })} /></label>
            </div>
            <div className="lb-modal-actions">
              <button className="a-btn a-btn-secondary" onClick={() => setEditing(null)}>Bekor</button>
              <button className="a-btn a-btn-primary" onClick={save}><Save size={14} /> Saqlash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
