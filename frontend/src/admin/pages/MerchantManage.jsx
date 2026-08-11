import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Save, MapPin, Users, Send, Star,
  Play, PauseCircle, Megaphone, MessageCircle,
} from 'lucide-react'
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
    if (r.status === 401) { localStorage.removeItem('merchant_token'); window.location.href = '/merchant/login'; return }
    if (!r.ok) throw new Error((await r.json().catch(()=>({}))).detail || `HTTP ${r.status}`)
    if (r.status === 204) return null
    return r.json()
  })
}

/* ─────────────── BRANCHES ─────────────── */
export function MerchantBranches() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) { navigate('/merchant/login'); return }
    document.body.classList.add('admin-body')
    load()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function load() {
    try { setList(await mf('/merchants/me/branches') || []) }
    catch (e) { setErr(e.message) }
  }

  async function save() {
    try {
      const body = { ...editing }
      if (editing.id) await mf(`/merchants/me/branches/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      else await mf('/merchants/me/branches', { method: 'POST', body: JSON.stringify(body) })
      setEditing(null); await load()
    } catch (e) { setErr(e.message) }
  }

  async function del(id) {
    if (!confirm("Filialni o'chirish?")) return
    try { await mf(`/merchants/me/branches/${id}`, { method: 'DELETE' }); await load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}><ArrowLeft size={16} /> Orqaga</button>
        <div><div className="lb-title">Filiallar</div><div className="lb-sub">Do'kon manzillaringiz</div></div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing({ name: '', address: '', phone: '', is_active: true })}>
          <Plus size={16} /> Filial qo'shish
        </button>
      </header>
      <div className="lb-container">
        {err && <div className="lb-error">{err}</div>}
        <div className="lb-list">
          {list.map(b => (
            <div key={b.id} className="lb-card">
              <div className="lb-card-icon"><MapPin size={20} /></div>
              <div className="lb-card-body">
                <div className="lb-card-title">{b.name}</div>
                <div className="lb-card-config">{b.address || '—'} · {b.phone || '—'}</div>
                <div className="lb-card-type">
                  {b.stats.cards} karta · {b.stats.transactions} tx · {b.working_hours || 'ish vaqti belgilanmagan'}
                </div>
              </div>
              <div className="lb-card-actions">
                <button className="lb-icon-btn" onClick={() => setEditing({ ...b })}>✎</button>
                <button className="lb-icon-btn danger" onClick={() => del(b.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {list.length === 0 && <div className="lb-empty"><div className="lb-empty-title">Filial yo'q</div></div>}
        </div>
      </div>

      {editing && (
        <div className="lb-modal-bg" onClick={() => setEditing(null)}>
          <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-title">{editing.id ? 'Filialni tahrirlash' : 'Yangi filial'}</div>
            {['name','address','phone','working_hours'].map(f => (
              <label key={f} className="lb-field">
                <span>{f}</span>
                <input value={editing[f] || ''} onChange={(e) => setEditing({ ...editing, [f]: e.target.value })} />
              </label>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="lb-field"><span>Lat</span><input type="number" step="0.000001" value={editing.lat || ''} onChange={(e) => setEditing({ ...editing, lat: e.target.value ? Number(e.target.value) : null })} /></label>
              <label className="lb-field"><span>Lng</span><input type="number" step="0.000001" value={editing.lng || ''} onChange={(e) => setEditing({ ...editing, lng: e.target.value ? Number(e.target.value) : null })} /></label>
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

/* ─────────────── STAFF ─────────────── */
export function MerchantStaff() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [branches, setBranches] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) { navigate('/merchant/login'); return }
    document.body.classList.add('admin-body')
    load()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function load() {
    try {
      const [staff, brs] = await Promise.all([mf('/merchants/me/staff'), mf('/merchants/me/branches')])
      setList(staff || []); setBranches(brs || [])
    } catch (e) { setErr(e.message) }
  }

  async function save() {
    try {
      if (editing.id) {
        const body = {}
        ;['full_name','phone','role','branch_id','is_active'].forEach(k => body[k] = editing[k])
        if (editing.new_password) body.new_password = editing.new_password
        await mf(`/merchants/me/staff/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      } else {
        await mf('/merchants/me/staff', { method: 'POST', body: JSON.stringify(editing) })
      }
      setEditing(null); await load()
    } catch (e) { setErr(e.message) }
  }

  async function del(id) {
    if (!confirm("Kassirni o'chirish?")) return
    try { await mf(`/merchants/me/staff/${id}`, { method: 'DELETE' }); await load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}><ArrowLeft size={16} /> Orqaga</button>
        <div><div className="lb-title">Kassirlar</div><div className="lb-sub">Xodimlar uchun login yaratish</div></div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing({ username: '', password: '', role: 'cashier', is_active: true })}>
          <Plus size={16} /> Kassir qo'shish
        </button>
      </header>
      <div className="lb-container">
        {err && <div className="lb-error">{err}</div>}
        <div className="lb-list">
          {list.map(s => (
            <div key={s.id} className="lb-card">
              <div className="lb-card-icon"><Users size={20} /></div>
              <div className="lb-card-body">
                <div className="lb-card-title">{s.full_name || s.username}</div>
                <div className="lb-card-config">@{s.username} · {s.role}{s.branch_id ? ' · filial #'+s.branch_id : ''}</div>
                <div className="lb-card-type">{s.is_active ? '✓ faol' : '✗ bloklangan'}{s.last_login_at ? ' · so\'nggi kirish: '+new Date(s.last_login_at).toLocaleDateString() : ''}</div>
              </div>
              <div className="lb-card-actions">
                <button className="lb-icon-btn" onClick={() => setEditing({ ...s, new_password: '' })}>✎</button>
                <button className="lb-icon-btn danger" onClick={() => del(s.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="lb-modal-bg" onClick={() => setEditing(null)}>
          <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-title">{editing.id ? 'Kassirni tahrirlash' : 'Yangi kassir'}</div>
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
            <label className="lb-field"><span>Telefon</span><input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></label>
            <label className="lb-field">
              <span>Rol</span>
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                <option value="cashier">Kassir</option>
                <option value="manager">Menejer</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {branches.length > 0 && (
              <label className="lb-field">
                <span>Filial</span>
                <select value={editing.branch_id || ''} onChange={(e) => setEditing({ ...editing, branch_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— har qaysi —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
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

/* ─────────────── CAMPAIGNS ─────────────── */
export function MerchantCampaigns() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) { navigate('/merchant/login'); return }
    document.body.classList.add('admin-body')
    load()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function load() {
    try { setList(await mf('/merchants/me/campaigns') || []) } catch (e) { setErr(e.message) }
  }

  async function save() {
    try {
      if (editing.id) await mf(`/merchants/me/campaigns/${editing.id}`, { method: 'PATCH', body: JSON.stringify(editing) })
      else await mf('/merchants/me/campaigns', { method: 'POST', body: JSON.stringify(editing) })
      setEditing(null); await load()
    } catch (e) { setErr(e.message) }
  }

  async function toggleStatus(c) {
    const next = c.status === 'active' ? 'paused' : 'active'
    await mf(`/merchants/me/campaigns/${c.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
    await load()
  }

  async function del(id) {
    if (!confirm("Kampaniyani o'chirish?")) return
    await mf(`/merchants/me/campaigns/${id}`, { method: 'DELETE' }); await load()
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}><ArrowLeft size={16} /> Orqaga</button>
        <div><div className="lb-title">Kampaniyalar</div><div className="lb-sub">Muddatli aksiyalar</div></div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing({ name: '', campaign_type: 'boost', target_segment: 'all', config: {} })}>
          <Plus size={16} /> Kampaniya
        </button>
      </header>
      <div className="lb-container">
        {err && <div className="lb-error">{err}</div>}
        <div className="lb-list">
          {list.map(c => (
            <div key={c.id} className={`lb-card ${c.status!=='active'?'inactive':''}`}>
              <div className="lb-card-icon"><Megaphone size={20} /></div>
              <div className="lb-card-body">
                <div className="lb-card-title">{c.name}</div>
                <div className="lb-card-config">{c.description || '—'}</div>
                <div className="lb-card-type">
                  {c.campaign_type} · {c.target_segment} · {c.status}
                  {c.starts_at && ` · ${new Date(c.starts_at).toLocaleDateString()}`}
                  {c.ends_at && ` → ${new Date(c.ends_at).toLocaleDateString()}`}
                </div>
              </div>
              <div className="lb-card-actions">
                <button className={`lb-icon-btn ${c.status==='active'?'on':'off'}`} onClick={() => toggleStatus(c)}>
                  {c.status==='active' ? <Play size={14} /> : <PauseCircle size={14} />}
                </button>
                <button className="lb-icon-btn" onClick={() => setEditing({ ...c })}>✎</button>
                <button className="lb-icon-btn danger" onClick={() => del(c.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="lb-modal-bg" onClick={() => setEditing(null)}>
          <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-title">{editing.id ? 'Kampaniya' : 'Yangi kampaniya'}</div>
            <label className="lb-field"><span>Nom</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="lb-field"><span>Tavsif</span><textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
            <label className="lb-field">
              <span>Tur</span>
              <select value={editing.campaign_type} onChange={(e) => setEditing({ ...editing, campaign_type: e.target.value })}>
                <option value="boost">Boost (ball ×N)</option>
                <option value="flash">Flash sale</option>
                <option value="segment">Segment (VIP)</option>
              </select>
            </label>
            <label className="lb-field">
              <span>Target segment</span>
              <select value={editing.target_segment} onChange={(e) => setEditing({ ...editing, target_segment: e.target.value })}>
                <option value="all">Hammasi</option>
                <option value="tier:bronze">Bronze</option>
                <option value="tier:silver">Silver</option>
                <option value="tier:gold">Gold</option>
                <option value="tier:platinum">Platinum</option>
              </select>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="lb-field"><span>Boshlanish</span><input type="date" value={editing.starts_at ? editing.starts_at.slice(0,10) : ''} onChange={(e) => setEditing({ ...editing, starts_at: e.target.value + 'T00:00:00Z' })} /></label>
              <label className="lb-field"><span>Tugash</span><input type="date" value={editing.ends_at ? editing.ends_at.slice(0,10) : ''} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value + 'T23:59:59Z' })} /></label>
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

/* ─────────────── NOTIFICATIONS ─────────────── */
export function MerchantNotifications() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('broadcast')
  const [form, setForm] = useState({ channel: 'push', title: '', body: '', target_segment: 'all' })
  const [templates, setTemplates] = useState([])
  const [logs, setLogs] = useState([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) { navigate('/merchant/login'); return }
    document.body.classList.add('admin-body')
    load()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function load() {
    try {
      const [t, l] = await Promise.all([mf('/merchants/me/notifications/templates'), mf('/merchants/me/notifications/logs')])
      setTemplates(t || []); setLogs(l || [])
    } catch (e) { setErr(e.message) }
  }

  async function sendBroadcast() {
    setMsg(''); setErr('')
    try {
      const res = await mf('/merchants/me/notifications/broadcast', { method: 'POST', body: JSON.stringify(form) })
      setMsg(`Yuborildi: ${res.sent} ta · Xatolar: ${res.failed} · Target user: ${res.target_users}`)
      await load()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}><ArrowLeft size={16} /> Orqaga</button>
        <div><div className="lb-title">Xabarlar</div><div className="lb-sub">Push / SMS / Email kampaniyalar</div></div>
      </header>
      <div className="lb-container">
        {err && <div className="lb-error">{err}</div>}
        {msg && <div style={{ padding: 10, background: 'rgba(16,185,129,0.15)', color: '#10b981', borderRadius: 10, marginBottom: 14 }}>{msg}</div>}
        <div className="ma-tabs">
          {['broadcast','logs'].map(t => <button key={t} className={`ma-tab ${tab===t?'on':''}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>

        {tab === 'broadcast' && (
          <div className="ma-card">
            <label className="lb-field">
              <span>Kanal</span>
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                <option value="push">Push</option>
                <option value="sms">SMS (hozircha o'chirilgan)</option>
                <option value="email">Email (hozircha o'chirilgan)</option>
              </select>
            </label>
            <label className="lb-field"><span>Sarlavha</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="lb-field"><span>Matn</span><textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
            <label className="lb-field">
              <span>Target</span>
              <select value={form.target_segment} onChange={(e) => setForm({ ...form, target_segment: e.target.value })}>
                <option value="all">Hammasi</option>
                <option value="tier:bronze">Bronze</option>
                <option value="tier:silver">Silver</option>
                <option value="tier:gold">Gold</option>
                <option value="tier:platinum">Platinum</option>
              </select>
            </label>
            <button className="a-btn a-btn-primary" onClick={sendBroadcast}><Send size={14} /> Yuborish</button>
          </div>
        )}

        {tab === 'logs' && (
          <div className="ma-card">
            <table className="ma-table">
              <thead><tr><th>Kanal</th><th>Sarlavha</th><th>Target</th><th>Yuborildi</th><th>Xato</th><th>Vaqt</th></tr></thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td>{l.channel}</td><td>{l.title}</td><td>{l.target}</td>
                    <td>{l.sent_count}</td><td>{l.failed_count}</td>
                    <td>{new Date(l.sent_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────── REVIEWS ─────────────── */
export function MerchantReviews() {
  const navigate = useNavigate()
  const [list, setList] = useState([])
  const [summary, setSummary] = useState(null)
  const [replyFor, setReplyFor] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!localStorage.getItem('merchant_token')) { navigate('/merchant/login'); return }
    document.body.classList.add('admin-body')
    load()
    return () => document.body.classList.remove('admin-body')
  }, [])

  async function load() {
    try {
      const [r, s] = await Promise.all([mf('/merchants/me/reviews'), mf('/merchants/me/reviews/summary')])
      setList(r || []); setSummary(s)
    } catch (e) { setErr(e.message) }
  }

  async function sendReply() {
    try {
      await mf(`/merchants/me/reviews/${replyFor}/reply`, { method: 'POST', body: JSON.stringify({ reply: replyText }) })
      setReplyFor(null); setReplyText(''); await load()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="lb-root">
      <header className="lb-header">
        <button className="lb-back" onClick={() => navigate('/merchant/home')}><ArrowLeft size={16} /> Orqaga</button>
        <div><div className="lb-title">Mijoz Izohlari</div><div className="lb-sub">Reyting va xabarlar</div></div>
      </header>
      <div className="lb-container">
        {err && <div className="lb-error">{err}</div>}

        {summary && (
          <div className="ma-grid">
            <div className="ma-card" style={{ textAlign: 'center' }}>
              <div className="ma-kpi-value">{summary.average.toFixed(1)} ⭐</div>
              <div className="ma-kpi-label">O'rtacha</div>
            </div>
            <div className="ma-card" style={{ textAlign: 'center' }}>
              <div className="ma-kpi-value">{summary.total}</div>
              <div className="ma-kpi-label">Jami izohlar</div>
            </div>
            {[5,4,3,2,1].map(r => (
              <div key={r} className="ma-card" style={{ textAlign: 'center' }}>
                <div className="ma-kpi-value">{summary.distribution[r] || 0}</div>
                <div className="ma-kpi-label">{'⭐'.repeat(r)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="lb-list" style={{ marginTop: 14 }}>
          {list.map(r => (
            <div key={r.id} className="lb-card">
              <div className="lb-card-icon"><Star size={20} /></div>
              <div className="lb-card-body">
                <div className="lb-card-title">{'⭐'.repeat(r.rating)}</div>
                <div className="lb-card-config">{r.comment || '—'}</div>
                {r.reply && (
                  <div style={{ marginTop: 8, padding: 8, background: 'var(--a-bg)', borderRadius: 8, fontSize: 12 }}>
                    <b>Javobingiz:</b> {r.reply}
                  </div>
                )}
                <div className="lb-card-type">{new Date(r.created_at).toLocaleString()}</div>
              </div>
              {!r.reply && (
                <button className="lb-icon-btn" onClick={() => setReplyFor(r.id)}><MessageCircle size={14} /></button>
              )}
            </div>
          ))}
          {list.length === 0 && <div className="lb-empty"><div className="lb-empty-title">Izohlar yo'q</div></div>}
        </div>
      </div>

      {replyFor && (
        <div className="lb-modal-bg" onClick={() => setReplyFor(null)}>
          <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-title">Javob yozish</div>
            <label className="lb-field">
              <span>Javobingiz</span>
              <textarea rows={4} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
            </label>
            <div className="lb-modal-actions">
              <button className="a-btn a-btn-secondary" onClick={() => setReplyFor(null)}>Bekor</button>
              <button className="a-btn a-btn-primary" onClick={sendReply}><Send size={14} /> Yuborish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
