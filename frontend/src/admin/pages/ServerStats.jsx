import { useState, useEffect, useCallback } from 'react'
import { Cpu, HardDrive, Wifi, Clock, RefreshCw } from 'lucide-react'
import { api } from '../api'

const SAFE_GREEN = '#3F9C5C'

function GaugeBar({ value, color = SAFE_GREEN, label, sublabel }) {
  const pct = Math.min(100, Math.max(0, value))
  const barColor = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : color

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--a-text)' }}>{label}</span>
        <span style={{ fontWeight: 800, fontSize: 14, color: barColor }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{
        background: 'var(--a-border)', borderRadius: 8, height: 10, overflow: 'hidden'
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 8,
          background: barColor,
          transition: 'width 0.5s ease',
        }} />
      </div>
      {sublabel && (
        <div style={{ fontSize: 12, color: 'var(--a-muted)', marginTop: 4 }}>{sublabel}</div>
      )}
    </div>
  )
}

function StatCard({ icon, title, children }) {
  return (
    <div style={{
      background: 'var(--a-card)', border: '1px solid var(--a-border)',
      borderRadius: 14, padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ color: SAFE_GREEN, display: 'inline-flex' }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--a-text)' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const parts = []
  if (d) parts.push(`${d}k`)
  if (h) parts.push(`${h}s`)
  parts.push(`${m}d`)
  return parts.join(' ')
}

export default function ServerStats() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const load = useCallback(() => {
    api.get('/admin/server-stats')
      .then(d => { setData(d); setLastUpdate(new Date()) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [autoRefresh, load])

  if (loading) return (
    <div className="a-loading"><div className="a-spinner" /><span>Yuklanmoqda...</span></div>
  )

  if (!data) return (
    <div style={{ color: 'var(--a-muted)', padding: 40, textAlign: 'center' }}>
      Ma'lumot olishda xato
    </div>
  )

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">Server Nagruzka</div>
          <div className="a-page-sub">
            {lastUpdate ? `Yangilangan: ${lastUpdate.toLocaleTimeString()}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
            />
            Auto (10s)
          </label>
          <button className="a-btn a-btn-secondary" onClick={load} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <RefreshCw size={14} /> Yangilash
          </button>
        </div>
      </div>

      {/* Uptime */}
      <div style={{
        background: 'var(--a-card)', border: '1px solid var(--a-border)',
        borderRadius: 14, padding: '14px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Clock size={18} style={{ color: SAFE_GREEN }} />
        <span style={{ fontWeight: 600, color: 'var(--a-text)' }}>Server uptime:</span>
        <span style={{
          color: '#10B981',
          fontWeight: 800,
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          letterSpacing: 0.3,
        }}>{fmtUptime(data.uptime_sec)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>

        {/* CPU */}
        <StatCard icon={<Cpu size={20} />} title={`CPU (${data.cpu.count} yadro)`}>
          <GaugeBar value={data.cpu.percent} label="Yuklama" />
        </StatCard>

        {/* Memory */}
        <StatCard icon={<span>🧠</span>} title="Operativ xotira (RAM)">
          <GaugeBar
            value={data.memory.percent}
            label={`${data.memory.used_mb} / ${data.memory.total_mb} MB`}
            sublabel={`Bo'sh: ${data.memory.free_mb} MB`}
          />
        </StatCard>

        {/* Disk */}
        <StatCard icon={<HardDrive size={20} />} title="Disk">
          <GaugeBar
            value={data.disk.percent}
            label={`${data.disk.used_gb} / ${data.disk.total_gb} GB`}
            sublabel={`Bo'sh: ${data.disk.free_gb} GB`}
          />
        </StatCard>

        {/* Network */}
        <StatCard icon={<Wifi size={20} />} title="Tarmoq (boot'dan beri)">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Yuborildi', val: `${data.network.bytes_sent_mb} MB` },
              { label: 'Qabul qilindi', val: `${data.network.bytes_recv_mb} MB` },
              { label: 'Paketlar (out)', val: data.network.packets_sent?.toLocaleString() },
              { label: 'Paketlar (in)', val: data.network.packets_recv?.toLocaleString() },
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: 'var(--a-muted)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--a-text)' }}>{val}</div>
              </div>
            ))}
          </div>
        </StatCard>
      </div>

      {/* Top Processes */}
      {data.top_processes?.length > 0 && (
        <div style={{
          background: 'var(--a-card)', border: '1px solid var(--a-border)',
          borderRadius: 14, padding: '20px 24px',
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: 'var(--a-text)' }}>
            Top jarayonlar (CPU bo'yicha)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--a-border)', color: 'var(--a-muted)' }}>
                {['PID', 'Nom', 'CPU %', 'RAM %'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.top_processes.map(p => (
                <tr key={p.pid} style={{ borderBottom: '1px solid var(--a-border)' }}>
                  <td style={{ padding: '8px 10px', color: 'var(--a-muted)' }}>{p.pid}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--a-text)' }}>{p.name}</td>
                  <td style={{ padding: '8px 10px', color: p.cpu_pct > 50 ? '#ef4444' : 'var(--a-text)' }}>
                    {p.cpu_pct}%
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--a-text)' }}>{p.mem_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
