import { useEffect, useState } from 'react'
import {
  Plus, Play, PauseCircle, Trash2, Save, FlaskConical,
  X, Crown, Beaker, Check, AlertTriangle,
} from 'lucide-react'
import { api } from '../api'
import './LoyaltyBuilder.css'
import './Analytics.css'

const DAYS = ['Du','Se','Ch','Pa','Ju','Sh','Ya']

const VARIANT_PALETTE = ['#2F6B3F', '#5FAE6F', '#3F9C5C', '#1F4D2C', '#84CC16', '#F59E0B', '#7C3AED', '#EC4899']

function _VariantsEditor({ variants, onChange }) {
  const total = (variants || []).reduce((s, v) => s + (Number(v.weight) || 0), 0)
  const isValid = total === 100
  const colorFor = (i) => VARIANT_PALETTE[i % VARIANT_PALETTE.length]

  function update(i, patch) {
    const next = variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v))
    onChange(next)
  }

  function setControl(i) {
    onChange(variants.map((v, idx) => ({ ...v, is_control: idx === i })))
  }

  function addVariant() {
    if (variants.length >= 6) return
    const letter = String.fromCharCode(65 + (variants.length - 1)) // A, B, C...
    const remaining = Math.max(0, 100 - total)
    const last = variants[variants.length - 1]
    // Steal half of last variant's weight if no room left
    let next = [...variants]
    if (remaining < 5 && last) {
      const give = Math.floor((Number(last.weight) || 0) / 2)
      next = next.map((v, i) => (i === next.length - 1 ? { ...v, weight: (Number(v.weight) || 0) - give } : v))
    }
    next.push({
      name: `Variant ${letter}`,
      is_control: false,
      weight: remaining < 5 ? Math.floor((Number(last?.weight) || 0) / 2) || 25 : remaining,
      description: '',
    })
    onChange(next)
  }

  function removeVariant(i) {
    if (variants.length <= 2) return
    const removed = variants[i]
    const next = variants.filter((_, idx) => idx !== i)
    // Re-distribute removed weight onto first item
    if (next.length > 0) {
      next[0] = { ...next[0], weight: (Number(next[0].weight) || 0) + (Number(removed.weight) || 0) }
    }
    // Ensure exactly one control
    if (removed.is_control && !next.some(v => v.is_control)) {
      next[0].is_control = true
    }
    onChange(next)
  }

  function autoBalance() {
    if (!variants.length) return
    const each = Math.floor(100 / variants.length)
    const remainder = 100 - each * variants.length
    onChange(variants.map((v, i) => ({ ...v, weight: each + (i === 0 ? remainder : 0) })))
  }

  return (
    <div className="vx-section">
      <div className="vx-head">
        <div>
          <div className="vx-title">Variantlar</div>
          <div className="vx-sub">Trafik taqsimoti — vazn yig'indisi 100% bo'lishi kerak</div>
        </div>
        <div className={`vx-total ${isValid ? 'ok' : 'bad'}`}>
          {isValid ? <Check size={14} /> : <AlertTriangle size={14} />}
          <span>{total}%</span>
        </div>
      </div>

      {/* Stacked weight bar (visual feedback) */}
      <div className="vx-bar">
        {variants.map((v, i) => {
          const w = Number(v.weight) || 0
          if (w <= 0) return null
          return (
            <div
              key={i}
              className="vx-bar-seg"
              style={{ flexBasis: `${(w / Math.max(total, 1)) * 100}%`, background: colorFor(i) }}
              title={`${v.name}: ${w}%`}
            />
          )
        })}
        {total < 100 && (
          <div className="vx-bar-seg vx-bar-empty" style={{ flexBasis: `${100 - (total / Math.max(total, 1)) * 100}%` }} />
        )}
      </div>

      <div className="vx-list">
        {variants.map((v, i) => (
          <div key={i} className={`vx-row ${v.is_control ? 'is-control' : ''}`}>
            <div className="vx-dot" style={{ background: colorFor(i) }}>
              {v.is_control ? <Crown size={11} /> : <Beaker size={11} />}
            </div>

            <input
              className="vx-name"
              value={v.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder={`Variant ${String.fromCharCode(65 + i)}`}
            />

            <div className="vx-weight">
              <input
                type="range"
                min="0"
                max="100"
                value={v.weight}
                onChange={(e) => update(i, { weight: Number(e.target.value) })}
              />
              <input
                type="number"
                min="0"
                max="100"
                className="vx-num"
                value={v.weight}
                onChange={(e) => update(i, { weight: Number(e.target.value) })}
              />
              <span className="vx-pct">%</span>
            </div>

            <button
              type="button"
              className={`vx-control-btn ${v.is_control ? 'on' : ''}`}
              onClick={() => setControl(i)}
              title="Control variant"
            >
              <Crown size={12} />
              <span>Control</span>
            </button>

            <button
              type="button"
              className="vx-remove"
              onClick={() => removeVariant(i)}
              disabled={variants.length <= 2}
              title="O'chirish"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="vx-actions">
        <button type="button" className="vx-btn" onClick={addVariant} disabled={variants.length >= 6}>
          <Plus size={13} /> Variant qo'shish
        </button>
        <button type="button" className="vx-btn vx-btn-ghost" onClick={autoBalance}>
          ⚖ Avto-balans
        </button>
      </div>
    </div>
  )
}

export default function Analytics() {
  const [tab, setTab] = useState('heatmap')
  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Analytics</div>
          <div className="a-page-sub">Heatmap, Cohort, RFM, A/B testing</div>
        </div>
      </div>

      <div className="ma-tabs">
        {['heatmap','cohort','rfm','ab'].map(t => (
          <button key={t} className={`ma-tab ${tab===t?'on':''}`} onClick={() => setTab(t)}>
            {t === 'ab' ? 'A/B Testing' : t}
          </button>
        ))}
      </div>

      {tab === 'heatmap' && <HeatmapTab />}
      {tab === 'cohort' && <CohortTab />}
      {tab === 'rfm' && <RfmTab />}
      {tab === 'ab' && <ABTab />}
    </div>
  )
}

function HeatmapTab() {
  const [data, setData] = useState(null)
  const [metric, setMetric] = useState('count')
  const [days, setDays] = useState(30)

  useEffect(() => {
    api.get(`/admin/analytics/heatmap?days=${days}&metric=${metric}`).then(setData).catch(()=>{})
  }, [metric, days])

  if (!data) return <div className="a-loading"><div className="a-spinner" /></div>
  const maxVal = Math.max(1, ...data.matrix.flat())

  return (
    <div className="ma-card">
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8 }}>
          <option value="count">Tranzaksiyalar soni</option>
          <option value="revenue">Savdo summasi</option>
          <option value="points">Berilgan ballar</option>
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8 }}>
          <option value={7}>7 kun</option>
          <option value={30}>30 kun</option>
          <option value={90}>90 kun</option>
          <option value={365}>1 yil</option>
        </select>
      </div>
      <div className="ma-heatmap">
        <div className="ma-hm-hours">
          <div />
          {data.hours.map(h => <div key={h} className="ma-hm-hour">{h}</div>)}
        </div>
        {data.matrix.map((row, d) => (
          <div key={d} className="ma-hm-row">
            <div className="ma-hm-day">{DAYS[d]}</div>
            {row.map((v, h) => (
              <div key={h} className="ma-hm-cell"
                   title={`${DAYS[d]} ${h}:00 — ${v}`}
                   style={{ background: `rgba(47,107,63,${v / maxVal})` }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--a-muted)' }}>
        Peak: <b>{data.peak.day} {data.peak.hour}:00</b> ({data.peak.value.toLocaleString()}) ·
        Jami: {data.total.toLocaleString()}
      </div>
    </div>
  )
}

function CohortTab() {
  const [data, setData] = useState(null)
  const [weeks, setWeeks] = useState(8)
  useEffect(() => {
    api.get(`/admin/analytics/cohort?weeks=${weeks}`).then(setData).catch(()=>{})
  }, [weeks])
  if (!data) return <div className="a-loading"><div className="a-spinner" /></div>

  return (
    <div className="ma-card">
      <div style={{ marginBottom: 14 }}>
        <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8 }}>
          <option value={4}>4 hafta</option>
          <option value={8}>8 hafta</option>
          <option value={12}>12 hafta</option>
          <option value={26}>26 hafta</option>
        </select>
      </div>
      <div className="ma-cohort">
        <div className="ma-co-row ma-co-head">
          <div>Cohort</div>
          <div>Hajm</div>
          {Array.from({ length: data.weeks }).map((_, i) => <div key={i}>W{i}</div>)}
        </div>
        {data.cohorts.map((c, i) => (
          <div key={i} className="ma-co-row">
            <div>{c.cohort}</div>
            <div>{c.size}</div>
            {c.values.map((v, j) => (
              <div key={j} className="ma-co-cell"
                   style={{ background: v !== null ? `rgba(16, 185, 129, ${v/100})` : 'transparent' }}>
                {v !== null ? `${v}%` : ''}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function RfmTab() {
  const [data, setData] = useState(null)
  const [days, setDays] = useState(180)
  useEffect(() => {
    api.get(`/admin/analytics/rfm?days=${days}`).then(setData).catch(()=>{})
  }, [days])
  if (!data) return <div className="a-loading"><div className="a-spinner" /></div>

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: 8, background: 'var(--a-bg)', border: '1px solid var(--a-border)', borderRadius: 8 }}>
          <option value={90}>90 kun</option>
          <option value={180}>180 kun</option>
          <option value={365}>1 yil</option>
        </select>
      </div>
      <div className="ma-grid">
        {Object.entries(data.segments).map(([seg, cnt]) => (
          <div key={seg} className="ma-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{cnt}</div>
            <div style={{ fontSize: 12, color: 'var(--a-muted)' }}>{seg}</div>
          </div>
        ))}
      </div>
      <div className="ma-card">
        <div className="ma-card-title">Top mijozlar ({data.summary.total})</div>
        <table className="ma-table">
          <thead><tr><th>Ism</th><th>Email</th><th>Tel</th><th>R</th><th>F</th><th>M</th><th>Segment</th></tr></thead>
          <tbody>
            {data.users.slice(0, 100).map(u => (
              <tr key={u.user_id}>
                <td>{u.name || '—'}</td>
                <td>{u.email || '—'}</td>
                <td>{u.phone || '—'}</td>
                <td>{u.r}</td><td>{u.f}</td><td>{u.m}</td>
                <td><span className="crm-tag">{u.segment}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ABTab() {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [detail, setDetail] = useState(null)

  async function load() {
    try {
      setList(await api.get('/admin/experiments') || [])
    } catch {}
  }
  useEffect(() => { load() }, [])

  async function save() {
    try {
      const body = { ...editing }
      await api.post('/admin/experiments', body)
      setEditing(null)
      await load()
    } catch (e) { alert(e.message) }
  }
  async function setStatus(id, status) {
    await api.patch(`/admin/experiments/${id}/status`, { status })
    await load()
    if (detail?.id === id) setDetail(await api.get(`/admin/experiments/${id}`))
  }
  async function del(id) {
    if (!confirm("Eksperimentni o'chirish?")) return
    await api.delete(`/admin/experiments/${id}`)
    await load()
    if (detail?.id === id) setDetail(null)
  }
  async function showDetail(exp) {
    setDetail(await api.get(`/admin/experiments/${exp.id}`))
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <button className="a-btn a-btn-primary" onClick={() => setEditing({
          name: '', description: '', primary_metric: 'conversion',
          variants: [
            { name: 'Control', is_control: true, weight: 50, description: '' },
            { name: 'Variant A', is_control: false, weight: 50, description: '' },
          ],
        })}>
          <Plus size={14} /> Yangi A/B test
        </button>
      </div>

      <div className="lb-list">
        {list.map(e => (
          <div key={e.id} className="lb-card">
            <div className="lb-card-icon"><FlaskConical size={20} /></div>
            <div className="lb-card-body">
              <div className="lb-card-title">{e.name}</div>
              <div className="lb-card-config">{e.description || '—'}</div>
              <div className="lb-card-type">
                {e.primary_metric} · {e.variants_count} variant · {e.events_count} event · {e.status}
              </div>
            </div>
            <div className="lb-card-actions">
              <button className="lb-icon-btn" onClick={() => showDetail(e)}>👁</button>
              {e.status === 'running' ? (
                <button className="lb-icon-btn off" onClick={() => setStatus(e.id, 'paused')}><PauseCircle size={14} /></button>
              ) : (
                <button className="lb-icon-btn on" onClick={() => setStatus(e.id, 'running')}><Play size={14} /></button>
              )}
              <button className="lb-icon-btn danger" onClick={() => del(e.id)}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="lb-empty"><div className="lb-empty-title">Eksperimentlar yo'q</div></div>}
      </div>

      {editing && (
        <div className="lb-modal-bg" onClick={() => setEditing(null)}>
          <div className="lb-modal lb-modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-title">Yangi A/B eksperiment</div>
            <label className="lb-field"><span>Nom</span><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label className="lb-field"><span>Tavsif</span><textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
            <label className="lb-field"><span>Gipoteza</span><textarea rows={2} value={editing.hypothesis || ''} onChange={(e) => setEditing({ ...editing, hypothesis: e.target.value })} /></label>
            <label className="lb-field">
              <span>Asosiy metrika</span>
              <select value={editing.primary_metric} onChange={(e) => setEditing({ ...editing, primary_metric: e.target.value })}>
                <option value="conversion">Conversion rate</option>
                <option value="revenue">Revenue</option>
                <option value="retention">Retention</option>
              </select>
            </label>
            <_VariantsEditor
              variants={editing.variants}
              onChange={(variants) => setEditing({ ...editing, variants })}
            />
            <div className="lb-modal-actions">
              <button className="a-btn a-btn-secondary" onClick={() => setEditing(null)}>Bekor</button>
              <button className="a-btn a-btn-primary" onClick={save}><Save size={14} /> Yaratish</button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="lb-modal-bg" onClick={() => setDetail(null)}>
          <div className="lb-modal" onClick={(e) => e.stopPropagation()}>
            <div className="lb-modal-title">{detail.name}</div>
            <div className="lb-modal-sub">{detail.description}</div>
            <table className="ma-table">
              <thead><tr><th>Variant</th><th>Impressions</th><th>Conversions</th><th>CR</th><th>Lift</th></tr></thead>
              <tbody>
                {detail.variants.map(v => (
                  <tr key={v.id} style={{ background: v.is_control ? 'rgba(212,175,55,0.08)' : 'transparent' }}>
                    <td>{v.name} {v.is_control && <span style={{ fontSize: 10, color: '#D4AF37' }}>[control]</span>}</td>
                    <td>{v.impressions}</td>
                    <td>{v.conversions}</td>
                    <td>{v.conversion_rate}%</td>
                    <td>{v.lift_vs_control !== null ? `${v.lift_vs_control > 0 ? '+' : ''}${v.lift_vs_control}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="a-btn a-btn-secondary lb-modal-close" onClick={() => setDetail(null)}>Yopish</button>
          </div>
        </div>
      )}
    </>
  )
}
