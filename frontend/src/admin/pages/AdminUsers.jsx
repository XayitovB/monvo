import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, Shield } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'

const ROLES = {
  super_admin: { label: 'Super Admin', color: '#EF4444' },
  support: { label: 'Support', color: '#3F9C5C' },
  analyst: { label: 'Analyst', color: '#8B5CF6' },
  marketing: { label: 'Marketing', color: '#F59E0B' },
}

export default function AdminUsers() {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  async function load() {
    try { setList(await api.get('/admin/admins') || []) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])

  async function save() {
    try {
      if (editing.id) {
        const body = { ...editing }
        delete body.id; delete body.username; delete body.password; delete body.last_login_at; delete body.created_at
        await api.patch(`/admin/admins/${editing.id}`, body)
      } else {
        await api.post('/admin/admins', editing)
      }
      setEditing(null); await load()
    } catch (e) { setErr(e.message) }
  }

  async function del(id) {
    if (!confirm("Admin o'chirilsin?")) return
    try { await api.delete(`/admin/admins/${id}`); await load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Adminlar</div>
          <div className="a-page-sub">Platforma foydalanuvchilari va ruxsatlar</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing({
          username: '', password: '', full_name: '', email: '',
          role: 'support', is_active: true,
        })}><Plus size={14} /> Admin qo'shish</button>
      </div>

      {err && <div className="lb-error">{err}</div>}

      <div className="lb-list">
        {list.map(u => (
          <div key={u.id} className={`lb-card ${u.is_active ? '' : 'inactive'}`}>
            <div className="lb-card-icon" style={{ background: (ROLES[u.role]?.color||'#888')+'22', color: ROLES[u.role]?.color||'#888' }}>
              <Shield size={20} />
            </div>
            <div className="lb-card-body">
              <div className="lb-card-title">{u.full_name || u.username}</div>
              <div className="lb-card-config">@{u.username} · {u.email || '—'}</div>
              <div className="lb-card-type">
                <span style={{ color: ROLES[u.role]?.color }}>{ROLES[u.role]?.label || u.role}</span>
                {u.last_login_at && ` · so'nggi: ${new Date(u.last_login_at).toLocaleDateString()}`}
              </div>
            </div>
            <div className="lb-card-actions">
              <button className="lb-icon-btn" onClick={() => setEditing({ ...u, new_password: '' })}>✎</button>
              <button className="lb-icon-btn danger" onClick={() => del(u.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="lb-modal-bg" onClick={() => setEditing(null)}>
          <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-title">{editing.id ? 'Admin' : 'Yangi admin'}</div>
            {!editing.id && (
              <>
                <label className="lb-field"><span>Username</span><input value={editing.username} onChange={(e) => setEditing({ ...editing, username: e.target.value })} /></label>
                <label className="lb-field"><span>Parol</span><input type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} /></label>
              </>
            )}
            {editing.id && (
              <label className="lb-field"><span>Yangi parol (ixtiyoriy)</span><input type="password" value={editing.new_password || ''} onChange={(e) => setEditing({ ...editing, new_password: e.target.value })} /></label>
            )}
            <label className="lb-field"><span>To'liq ism</span><input value={editing.full_name || ''} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></label>
            <label className="lb-field"><span>Email</span><input value={editing.email || ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></label>
            <label className="lb-field">
              <span>Rol</span>
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
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
