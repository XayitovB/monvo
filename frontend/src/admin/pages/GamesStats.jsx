import { useEffect, useState } from 'react'
import { api } from '../api'
import './LoyaltyBuilder.css'
import './Gamification.css'

const GAME_LABELS = {
  clicker: { uz: 'Klikker', ru: 'Кликер', color: '#10B981', icon: 'bi-mouse2' },
  '2048':  { uz: '2048',    ru: '2048',   color: '#7C3AED', icon: 'bi-grid-3x3' },
}

export default function GamesStats() {
  const [stats, setStats] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const data = await api.get('/admin/games/stats')
      setStats(data)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  if (loading) return <div className="lb-loading">Yuklanmoqda…</div>
  if (err) return <div className="lb-error">{err}</div>
  if (!stats) return null

  const games = stats.games || []

  return (
    <div>
      <div className="a-page-header">
        <div>
          <div className="a-page-title">O'yinlar statistikasi</div>
          <div className="a-page-sub">Sessiyalar, berilgan XP, eng yaxshi natijalar</div>
        </div>
        <button className="a-btn" onClick={load}>
          <i className="bi bi-arrow-clockwise" /> Yangilash
        </button>
      </div>

      {/* Per-game cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 20 }}>
        {games.map(g => {
          const meta = GAME_LABELS[g.game_type] || { uz: g.game_type, color: '#888' }
          return (
            <div key={g.game_type} style={{
              padding: 18,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${meta.color}, ${meta.color}cc)`,
              color: '#fff',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <i className={`bi ${meta.icon || 'bi-controller'}`} style={{ fontSize: 20 }} />
                <div style={{ fontSize: 16, fontWeight: 800 }}>{meta.uz}</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 2 }}>
                {g.sessions.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 12 }}>jami sessiya</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                <div>
                  <div style={{ opacity: 0.85 }}>Berilgan XP</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{g.total_xp_awarded.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.85 }}>Eng yuqori</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{g.best_score.toLocaleString()}</div>
                </div>
              </div>
            </div>
          )
        })}
        {games.length === 0 && (
          <div className="lb-empty" style={{ gridColumn: '1 / -1' }}>
            Hozircha o'yin sessiyalari yo'q
          </div>
        )}
      </div>

      {/* Spin stats */}
      <div style={{
        padding: 18,
        borderRadius: 14,
        background: 'linear-gradient(135deg, #EC4899, #EF4444)',
        color: '#fff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <i className="bi bi-trophy-fill" style={{ fontSize: 20 }} />
          <div style={{ fontSize: 16, fontWeight: 800 }}>Daily Spin (oxirgi 7 kun)</div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              {(stats.spins_last_7d || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>aylantirish</div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              +{(stats.spin_xp_awarded_last_7d || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>XP berildi</div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>
              {stats.spins_last_7d > 0
                ? Math.round(stats.spin_xp_awarded_last_7d / stats.spins_last_7d)
                : 0}
            </div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>o'rtacha XP/spin</div>
          </div>
        </div>
      </div>
    </div>
  )
}
