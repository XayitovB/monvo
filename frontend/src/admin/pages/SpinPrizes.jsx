import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Save, Gift, X, Edit3, Eye, EyeOff, Play, RotateCcw } from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'
import './Gamification.css'

const ICONS = ['gift', 'star', 'crown', 'trophy', 'zap', 'sparkles', 'gem', 'x']

// Weighted-random pick: returns the prize index based on weights.
function pickWeightedIndex(prizes) {
  const weights = prizes.map(p => Math.max(1, Number(p.weight) || 1))
  const total = weights.reduce((a, b) => a + b, 0)
  const r = Math.random() * total
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]
    if (r <= acc) return i
  }
  return weights.length - 1
}

// Wheel preview: SVG slices with labels, rotates on demo-spin.
function SpinWheelPreview({ prizes }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState(null)
  const [history, setHistory] = useState([])
  const spinTokenRef = useRef(0)

  const active = prizes.filter(p => p.is_active)
  const n = active.length
  const sweep = n > 0 ? 360 / n : 0
  const radius = 130

  function spin() {
    if (spinning || n === 0) return
    const idx = pickWeightedIndex(active)
    // Slice idx center sits at (-90 + idx*sweep). Pointer at -90 (top of SVG).
    // We rotate the wheel by `rot` deg clockwise; final visible angle is
    // (-90 + idx*sweep + rot) mod 360. Want = -90 mod 360 = 270.
    // So rot mod 360 == (360 - idx*sweep) mod 360.
    const landing = ((360 - idx * sweep) % 360 + 360) % 360
    const newRotation = rotation + 360 * 6 + (landing - (rotation % 360))
    setSpinning(true)
    setWinner(null)
    setRotation(newRotation)
    const tk = ++spinTokenRef.current
    setTimeout(() => {
      if (spinTokenRef.current !== tk) return
      const w = active[idx]
      setWinner(w)
      setHistory(h => [{ label: w.label, xp: w.xp, color: w.color }, ...h].slice(0, 8))
      setSpinning(false)
    }, 4500)
  }

  function reset() {
    setRotation(0)
    setWinner(null)
    setHistory([])
  }

  if (n === 0) {
    return (
      <div style={{
        padding: 30,
        textAlign: 'center',
        color: 'var(--a-muted)',
        background: 'var(--a-card)',
        border: '1px dashed var(--a-border)',
        borderRadius: 14,
      }}>
        Hech qanday faol sovrin yo'q — demo uchun avval sovrin qo'shing
      </div>
    )
  }

  // Build SVG arcs — each slice is a pie wedge.
  const slices = active.map((p, i) => {
    const startA = -90 + i * sweep - sweep / 2
    const endA = startA + sweep
    const sx = radius + radius * Math.cos((startA * Math.PI) / 180)
    const sy = radius + radius * Math.sin((startA * Math.PI) / 180)
    const ex = radius + radius * Math.cos((endA * Math.PI) / 180)
    const ey = radius + radius * Math.sin((endA * Math.PI) / 180)
    const largeArc = sweep > 180 ? 1 : 0
    const path = `M ${radius} ${radius} L ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey} Z`
    const labelA = (startA + endA) / 2
    const lx = radius + radius * 0.62 * Math.cos((labelA * Math.PI) / 180)
    const ly = radius + radius * 0.62 * Math.sin((labelA * Math.PI) / 180)
    return { p, path, lx, ly, labelA, color: p.color || '#7C3AED' }
  })

  const totalWeight = active.reduce((s, p) => s + Math.max(1, Number(p.weight) || 1), 0)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(280px, 320px) 1fr',
      gap: 20,
      padding: 16,
      background: 'var(--a-card)',
      border: '1px solid var(--a-border)',
      borderRadius: 14,
      marginBottom: 16,
    }}>
      {/* Wheel */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: radius * 2, height: radius * 2 + 18 }}>
          {/* Pointer */}
          <div style={{
            position: 'absolute',
            top: -2,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '12px solid transparent',
            borderRight: '12px solid transparent',
            borderTop: '20px solid #D4AF37',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
            zIndex: 2,
          }} />
          <svg
            width={radius * 2}
            height={radius * 2}
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 4.5s cubic-bezier(0.17, 0.67, 0.21, 1)' : 'none',
              filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.15))',
              borderRadius: '50%',
              border: '6px solid #B45309',
            }}
            viewBox={`0 0 ${radius * 2} ${radius * 2}`}
          >
            {slices.map((s, i) => (
              <g key={i}>
                <path d={s.path} fill={s.color} stroke="#fff" strokeWidth="2" />
                <text
                  x={s.lx}
                  y={s.ly}
                  fill="#fff"
                  fontSize="13"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${s.labelA + 90}, ${s.lx}, ${s.ly})`}
                  style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.3)', strokeWidth: 0.6 }}
                >
                  {s.p.label}
                </text>
              </g>
            ))}
          </svg>
          {/* Center hub */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 50,
            height: 50,
            borderRadius: '50%',
            background: '#D4AF37',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
            zIndex: 1,
          }}><i className="bi bi-trophy" style={{fontSize:16}}/></div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="a-btn a-btn-primary" onClick={spin} disabled={spinning}>
            {spinning ? '🌀 Aylanmoqda…' : <>< Play size={14} /> Demo aylantirish</>}
          </button>
          <button className="a-btn" onClick={reset} disabled={spinning}>
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Right side: result + history */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Demo natija</div>
        {winner ? (
          <div style={{
            padding: 14,
            borderRadius: 12,
            background: `linear-gradient(135deg, ${winner.color || '#7C3AED'}, ${winner.color || '#7C3AED'}cc)`,
            color: '#fff',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>SIZ YUTDINGIZ</div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>{winner.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginTop: 2 }}>+{winner.xp} XP</div>
          </div>
        ) : (
          <div style={{
            padding: 14,
            borderRadius: 12,
            border: '1px dashed var(--a-border)',
            color: 'var(--a-muted)',
            fontSize: 13,
            marginBottom: 14,
          }}>
            "Demo aylantirish" bosing — natija shu yerda chiqadi
          </div>
        )}

        {history.length > 0 && (
          <>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--a-muted)', marginBottom: 6 }}>
              Oxirgi {history.length} ta demo (jami yutgan XP: {history.reduce((s, h) => s + (h.xp || 0), 0)})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {history.map((h, i) => (
                <div
                  key={i}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: (h.color || '#7C3AED') + '20',
                    color: h.color || '#7C3AED',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {h.label}
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{
          marginTop: 14,
          padding: 10,
          fontSize: 11,
          color: 'var(--a-muted)',
          background: 'rgba(124, 58, 237, 0.06)',
          borderRadius: 8,
        }}>
          ℹ️ Demo client tomonida — backend'ga ta'sir qilmaydi, real spin'ga hisoblanmaydi.
          Vazn yig'indisi: <b>{totalWeight}</b>
        </div>
      </div>
    </div>
  )
}

export default function SpinPrizes() {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try { setList(await api.get('/admin/spin/prizes') || []) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Compute weighted probability for display
  const totalWeight = list.filter(p => p.is_active).reduce((s, p) => s + (Number(p.weight) || 1), 0)

  async function save() {
    setErr('')
    try {
      if (!editing.label || editing.xp == null) {
        setErr("Label va XP majburiy")
        return
      }
      const body = {
        ...editing,
        xp: Number(editing.xp) || 0,
        weight: Number(editing.weight) || 1,
        sort_order: Number(editing.sort_order) || 100,
      }
      if (editing.id) {
        const { id, ...patch } = body
        await api.patch(`/admin/spin/prizes/${editing.id}`, patch)
      } else {
        await api.post('/admin/spin/prizes', body)
      }
      setEditing(null); await load()
    } catch (e) { setErr(e.message) }
  }

  async function toggle(p) {
    try {
      await api.patch(`/admin/spin/prizes/${p.id}`, { is_active: !p.is_active })
      await load()
    } catch (e) { setErr(e.message) }
  }

  async function del(id) {
    if (!confirm("Sovrin o'chirilsin?")) return
    try { await api.delete(`/admin/spin/prizes/${id}`); await load() }
    catch (e) { setErr(e.message) }
  }

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Spin sovrinlari</div>
          <div className="a-page-sub">Daily Spin g'ildiragidagi mukofotlar</div>
        </div>
        <button className="a-btn a-btn-primary" onClick={() => setEditing({
          label: '', label_ru: '', xp: 50, weight: 10,
          color: '#7C3AED', icon: 'gift',
          is_active: true, sort_order: 100,
        })}><Plus size={14} /> Yangi sovrin</button>
      </div>

      {err && <div className="lb-error">{err}</div>}
      {loading && <div className="lb-loading">Yuklanmoqda…</div>}

      {/* Demo wheel — preview how it'll look + simulate weighted spins */}
      {!loading && list.length > 0 && <SpinWheelPreview prizes={list} />}

      {totalWeight > 0 && (
        <div style={{
          marginBottom: 14,
          padding: 12,
          borderRadius: 10,
          background: 'rgba(124, 58, 237, 0.08)',
          fontSize: 12,
          color: 'var(--a-muted)',
        }}>
          ℹ️ Faol sovrinlar yig'indisi: <b>{totalWeight}</b>. Foizlar pastda har sovrin ostida ko'rinadi.
        </div>
      )}

      <div className="lb-list">
        {list.map(p => {
          const pct = p.is_active && totalWeight > 0
            ? ((Number(p.weight) || 1) / totalWeight * 100).toFixed(1)
            : null
          return (
            <div key={p.id} className={`lb-card ${p.is_active ? '' : 'inactive'}`}
                 style={{ borderLeft: `3px solid ${p.color || '#7C3AED'}` }}>
              <div className="lb-card-icon" style={{ background: p.color || '#7C3AED', color: '#fff' }}>
                <Gift size={20} />
              </div>
              <div className="lb-card-body">
                <div className="lb-card-title">{p.label}
                  {p.label_ru && <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.55 }}>({p.label_ru})</span>}
                </div>
                <div className="lb-card-config">+{p.xp} XP · vazn: {p.weight}</div>
                <div className="lb-card-type" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {pct !== null && (
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 9px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#047857',
                    }}>{pct}% tushish ehtimoli</span>
                  )}
                  <span style={{ opacity: 0.7 }}>icon: {p.icon}</span>
                </div>
              </div>
              <div className="lb-card-actions">
                <button
                  className={`lb-icon-btn ${p.is_active ? 'on' : 'off'}`}
                  onClick={() => toggle(p)}
                  title={p.is_active ? "Faol" : "O'chirilgan"}
                >
                  {p.is_active ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button className="lb-icon-btn" onClick={() => setEditing({ ...p })}><Edit3 size={14} /></button>
                <button className="lb-icon-btn danger" onClick={() => del(p.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          )
        })}
        {!list.length && !loading && <div className="lb-empty">Hozircha sovrin yo'q</div>}
      </div>

      {editing && (
        <div className="gm-modal-bg" onClick={() => setEditing(null)}>
          <div className="gm-modal" onClick={e => e.stopPropagation()}>
            <div className="gm-modal-head">
              <span>{editing.id ? 'Sovrinni tahrirlash' : 'Yangi sovrin'}</span>
              <button className="lb-icon-btn" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>

            <div className="gm-modal-body">
              <div className="gm-section-label">Sarlavha</div>
              <div className="gm-row">
                <label className="gm-field">O'zbekcha
                  <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} placeholder="100 XP" />
                </label>
                <label className="gm-field">Русский
                  <input value={editing.label_ru || ''} onChange={e => setEditing({ ...editing, label_ru: e.target.value })} placeholder="100 XP" />
                </label>
              </div>

              <div className="gm-section-label">Mukofot</div>
              <div className="gm-row">
                <label className="gm-field">XP miqdori
                  <input type="number" min="0" value={editing.xp}
                         onChange={e => setEditing({ ...editing, xp: e.target.value })} />
                </label>
                <label className="gm-field">Vazn (yuqori = ko'p tushadi)
                  <input type="number" min="1" max="1000" value={editing.weight}
                         onChange={e => setEditing({ ...editing, weight: e.target.value })} />
                </label>
              </div>

              <div className="gm-section-label">Ko'rinish</div>
              <div className="gm-row">
                <label className="gm-field">Icon
                  <select value={editing.icon} onChange={e => setEditing({ ...editing, icon: e.target.value })}>
                    {ICONS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
                <label className="gm-field">Rang
                  <input type="color" value={editing.color || '#7C3AED'} onChange={e => setEditing({ ...editing, color: e.target.value })} />
                </label>
                <label className="gm-field">Tartib
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
                <span>{editing.is_active ? 'Faol — g\'ildirakda ko\'rinadi' : 'Yashirilgan'}</span>
              </label>
            </div>

            <div className="gm-modal-foot">
              <button className="a-btn" onClick={() => setEditing(null)}>Bekor</button>
              <button className="a-btn a-btn-primary" onClick={save}><Save size={14} /> Saqlash</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
