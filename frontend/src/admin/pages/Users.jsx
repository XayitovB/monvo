import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserCheck, UserX, Trash2, ChevronLeft, ChevronRight, Download, Shield, Eye, X, Store, CreditCard, Smartphone } from 'lucide-react'
import { usePaginated } from '../hooks/usePaginated'
import { api } from '../api'
import './Table.css'

const ROLES = ['user', 'merchant', 'admin']
const ASSIGNABLE_ROLES = ['user', 'admin']
const ROLE_LABELS = { user: 'User', merchant: 'Merchant', admin: 'Admin' }
const ROLE_COLORS = { user: '#64748b', merchant: '#2F6B3F', admin: '#d97706' }

export default function Users() {
  const navigate = useNavigate()
  const [roleFilter, setRoleFilter] = useState('')
  const { data, total, page, setPage, totalPages, loading, search, setSearch, reload } =
    usePaginated('/admin/users', { role: roleFilter })
  const [changingRole, setChangingRole] = useState(null)

  async function toggleUser(id) {
    await api.patch(`/admin/users/${id}/toggle`, {})
    reload()
  }

  async function deleteUser(id, name) {
    if (!confirm(`"${name}" ni o'chirmoqchimisiz?`)) return
    await api.delete(`/admin/users/${id}`)
    reload()
  }

  async function changeRole(id, newRole) {
    setChangingRole(id)
    try {
      await api.patch(`/admin/users/${id}/role`, { role: newRole })
      reload()
    } catch (e) {
      alert(e.message || 'Xato')
    } finally {
      setChangingRole(null)
    }
  }

  async function exportCsv() {
    try {
      await api.download('/admin/users/export', `users-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (e) {
      alert(e.message || 'Export xatosi')
    }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Mijozlar</div>
          <div className="a-page-sub">Jami: {total}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="a-search-wrap">
            <Search size={14} className="a-search-icon" />
            <input className="a-input a-search-input" placeholder="Qidirish..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select
            className="a-input"
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(1) }}
            style={{ minWidth: 130, cursor: 'pointer' }}
          >
            <option value="">Barcha role</option>
            {ROLES.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button className="a-btn a-btn-secondary" onClick={exportCsv}>
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      <div className="a-table-wrap a-card">
        {loading ? <div className="a-loading"><div className="a-spinner" /></div> : (
          <table className="a-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Ism</th>
                <th>Telefon</th>
                <th>Role</th>
                <th>Til</th>
                <th>Region</th>
                <th>Holat</th>
                <th>Sana</th>
                <th>So'nggi aktiv</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {data.map(u => (
                <tr key={u.id} style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/panel/users/${u.id}`)}>
                  <td className="td-dim">#{u.id}</td>
                  <td>
                    <div className="td-bold" style={{ fontSize: 13 }}>
                      {u.name && u.name !== u.phone ? u.name : <span style={{ color: 'var(--a-muted)', fontStyle: 'italic', fontWeight: 400 }}>Ism yo'q</span>}
                    </div>
                  </td>
                  <td className="td-dim" style={{ fontSize: 12 }}>
                    {u.phone || '—'}
                  </td>
                  <td>
                    {u.role === 'merchant' ? (
                      <span
                        title="Merchant roli Merchants bo'limidan biznesga direktor biriktirilganda beriladi"
                        style={{
                          background: ROLE_COLORS.merchant + '22',
                          color: ROLE_COLORS.merchant,
                          border: `1px solid ${ROLE_COLORS.merchant}44`,
                          borderRadius: 8,
                          padding: '4px 8px',
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'inline-block',
                        }}
                      >
                        {ROLE_LABELS.merchant}
                      </span>
                    ) : (
                      <select
                        value={u.role || 'user'}
                        disabled={changingRole === u.id}
                        onChange={e => changeRole(u.id, e.target.value)}
                        style={{
                          background: ROLE_COLORS[u.role || 'user'] + '22',
                          color: ROLE_COLORS[u.role || 'user'],
                          border: `1px solid ${ROLE_COLORS[u.role || 'user']}44`,
                          borderRadius: 8,
                          padding: '4px 8px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          outline: 'none',
                        }}
                      >
                        {ASSIGNABLE_ROLES.map(r => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: u.language === 'ru' ? '#ef444422' : '#2f6b3f22',
                      color: u.language === 'ru' ? '#ef4444' : '#2F6B3F',
                    }}>
                      {u.language === 'ru' ? '🇷🇺 RU' : "🇺🇿 UZ"}
                    </span>
                  </td>
                  <td className="td-dim" style={{ fontSize: 12 }}>
                    {u.region
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>📍 {u.region}</span>
                      : '—'}
                  </td>
                  <td>
                    <span className={`a-badge ${u.is_active ? 'a-badge-green' : 'a-badge-red'}`}>
                      {u.is_active ? 'Faol' : 'Blok'}
                    </span>
                  </td>
                  <td className="td-dim">
                    {new Date(u.created_at).toLocaleDateString('uz')}
                  </td>
                  <td className="td-dim" style={{ fontSize: 12 }}>
                    {u.last_active_at || u.last_seen_at
                      ? new Date(u.last_active_at || u.last_seen_at).toLocaleDateString('uz', { timeZone: 'Asia/Tashkent' })
                      : '—'}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="td-actions">
                      <button className="a-btn a-btn-secondary td-icon-btn"
                        onClick={() => navigate(`/panel/users/${u.id}`)} title="Batafsil">
                        <Eye size={14} />
                      </button>
                      <button className="a-btn a-btn-secondary td-icon-btn"
                        onClick={() => toggleUser(u.id)} title={u.is_active ? 'Bloklash' : 'Faollashtirish'}>
                        {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                      <button className="a-btn a-btn-danger td-icon-btn"
                        onClick={() => deleteUser(u.id, u.name)} title="O'chirish">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={10} className="a-empty">Topilmadi</td></tr>
              )}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="a-pagination">
            <button className="a-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span className="td-dim" style={{ fontSize: 13 }}>{page}/{totalPages}</span>
            <button className="a-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Role legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, padding: '10px 16px',
        background: 'var(--a-card)', borderRadius: 10, border: '1px solid var(--a-border)',
        fontSize: 12, color: 'var(--a-muted)' }}>
        <Shield size={14} style={{ marginTop: 1 }} />
        {Object.entries(ROLE_LABELS).map(([k, v]) => (
          <span key={k}>
            <span style={{ fontWeight: 700, color: ROLE_COLORS[k] }}>{v}</span>
            {' '}— {k === 'user' ? 'Oddiy foydalanuvchi (kartalar)'
              : k === 'merchant' ? 'Biznes direktori — Merchants bo\'limidan tayinlanadi'
              : 'Tizim administratori'}
          </span>
        ))}
      </div>

    </div>
  )
}

function UserDetailModal({ userId, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('merchants')

  useEffect(() => {
    let cancel = false
    api.get(`/admin/users/${userId}`)
      .then(d => { if (!cancel) setData(d) })
      .catch(e => { if (!cancel) setErr(e.message || String(e)) })
    return () => { cancel = true }
  }, [userId])

  const fmtMoney = v => {
    const n = Number(v) || 0
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
    return n.toFixed(0)
  }
  const fmtDate = iso => {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleString('uz') } catch { return iso }
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 999,
  }
  const box = {
    background: 'var(--a-card)', borderRadius: 16,
    width: 'min(900px, 94vw)', maxHeight: '90vh', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', border: '1px solid var(--a-border)',
  }
  const tabBtn = active => ({
    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600,
    color: active ? 'var(--a-primary)' : 'var(--a-muted)',
    borderBottom: active ? '2px solid var(--a-primary)' : '2px solid transparent',
  })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', padding: 16, borderBottom: '1px solid var(--a-border)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>
            {data?.user?.name || 'Yuklanmoqda...'}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} className="a-btn a-btn-secondary td-icon-btn"><X size={14} /></button>
        </div>

        {err && <div className="al-error" style={{ margin: 16 }}>{err}</div>}

        {data && (
          <>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              <Stat label="Kartalar" value={data.totals.cards_count} />
              <Stat label="Bizneslar" value={data.totals.merchants_count} />
              <Stat label="Ball" value={data.totals.points_balance} />
              <Stat label="Xarid" value={fmtMoney(data.totals.total_spend)} />
            </div>
            <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--a-muted)' }}>
              {data.user.phone || data.user.email || '—'}
              {' · '}{data.user.role || 'user'}
              {' · '}Ro'yxatdan: {fmtDate(data.user.created_at)}
              {data.user.birth_date && <> {' · '}Tug'ilgan: {fmtDate(data.user.birth_date)}</>}
            </div>
            <div style={{ padding: '0 16px', display: 'flex', borderBottom: '1px solid var(--a-border)' }}>
              <button style={tabBtn(tab === 'merchants')} onClick={() => setTab('merchants')}>
                Bizneslar ({data.merchants.length})
              </button>
              <button style={tabBtn(tab === 'cards')} onClick={() => setTab('cards')}>
                Kartalar ({data.cards.length})
              </button>
              <button style={tabBtn(tab === 'history')} onClick={() => setTab('history')}>
                Tarix ({data.history.length})
              </button>
              <button style={tabBtn(tab === 'devices')} onClick={() => setTab('devices')}>
                Qurilmalar ({data.devices.length})
              </button>
            </div>
            <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
              {tab === 'merchants' && <MerchantsList items={data.merchants} />}
              {tab === 'cards' && <CardsList items={data.cards} />}
              {tab === 'history' && <HistoryList items={data.history} />}
              {tab === 'devices' && <DevicesList items={data.devices} />}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--a-border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="a-btn a-btn-secondary"
                onClick={async () => {
                  await api.patch(`/admin/users/${userId}/toggle`, {})
                  onChanged?.()
                  onClose()
                }}
              >
                {data.user.is_active ? 'Bloklash' : 'Faollashtirish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ padding: 12, background: 'var(--a-scaffold)', borderRadius: 10, border: '1px solid var(--a-border)' }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>{label}</div>
    </div>
  )
}

function MerchantsList({ items }) {
  if (!items.length) return <div style={{ color: 'var(--a-muted)', textAlign: 'center', padding: 30 }}>Biznes yo'q</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(m => (
        <div key={m.merchant_id} style={{ padding: 14, background: 'var(--a-scaffold)', borderRadius: 12, border: '1px solid var(--a-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: (m.brand_color || '#2F6B3F') + '22',
              color: m.brand_color || '#2F6B3F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Store size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{m.merchant_name}</div>
              <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>{m.tx_count} tranzaksiya</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, fontSize: 12 }}>
            <div><span style={{ color: '#10b981', fontWeight: 700 }}>+{m.points_earned}</span> olingan</div>
            <div><span style={{ color: '#ef4444', fontWeight: 700 }}>-{m.points_redeemed}</span> sarflangan</div>
            <div><span style={{ fontWeight: 700 }}>{Number(m.total_spend || 0).toLocaleString('uz')}</span> so'm</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CardsList({ items }) {
  if (!items.length) return <div style={{ color: 'var(--a-muted)', textAlign: 'center', padding: 30 }}>Karta yo'q</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(c => (
        <div key={c.card_uid} style={{ padding: 14, background: 'var(--a-scaffold)', borderRadius: 12, border: '1px solid var(--a-border)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <CreditCard size={20} style={{ color: '#D4AF37' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{c.merchant?.business_name || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--a-muted)' }}>{c.points} ball · {c.tier}</div>
            <div style={{ fontSize: 10, color: 'var(--a-muted)' }}>UID: {c.card_uid}</div>
          </div>
          <span className={`a-badge ${c.is_active ? 'a-badge-green' : 'a-badge-red'}`}>{c.is_active ? 'Faol' : 'Blok'}</span>
        </div>
      ))}
    </div>
  )
}

function HistoryList({ items }) {
  if (!items.length) return <div style={{ color: 'var(--a-muted)', textAlign: 'center', padding: 30 }}>Tarix yo'q</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(t => {
        const earn = t.tx_type === 'earn'
        return (
          <div key={t.id} style={{ padding: 10, background: 'var(--a-scaffold)', borderRadius: 10, border: '1px solid var(--a-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 18 }}>{earn ? <i className="bi bi-coin" style={{fontSize:16}}/> : <i className="bi bi-gift" style={{fontSize:16}}/>}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{t.merchant_name}</div>
              <div style={{ fontSize: 11, color: 'var(--a-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.reward_title || (earn ? 'Ball qo\'shildi' : 'Ball yechildi')}
                {' · '}{new Date(t.created_at).toLocaleString('uz')}
              </div>
            </div>
            <div style={{ fontWeight: 800, color: earn ? '#10b981' : '#ef4444' }}>
              {earn ? '+' : ''}{t.points_delta}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DevicesList({ items }) {
  if (!items.length) return <div style={{ color: 'var(--a-muted)', textAlign: 'center', padding: 30 }}>Qurilma yo'q</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(d => (
        <div key={d.id} style={{ padding: 12, background: 'var(--a-scaffold)', borderRadius: 10, border: '1px solid var(--a-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Smartphone size={18} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{(d.platform || 'other').toUpperCase()}</div>
            <div style={{ fontSize: 11, color: 'var(--a-muted)' }}>Token: {d.token_preview}</div>
            {d.updated_at && <div style={{ fontSize: 10, color: 'var(--a-muted)' }}>Faollik: {new Date(d.updated_at).toLocaleString('uz')}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
