import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Send, Trash2, Loader2, User } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { api } from '../api'
import './AiAssistant.css'

const CHART_COLORS = ['#2F6B3F', '#5FAE6F', '#3F9C5C', '#1F4D2C', '#84CC16']
const CHART_BLOCK_RE = /```chart\s*([\s\S]*?)```/

// AI javobidan ```chart{...}``` blokini ajratib oladi — muvaffaqiyatsiz
// bo'lsa (JSON buzuq yoki shakl noto'g'ri) butun matnni o'zgarishsiz qaytaradi.
function parseAiContent(content) {
  const match = content.match(CHART_BLOCK_RE)
  if (!match) return { text: content, chart: null }
  try {
    const spec = JSON.parse(match[1])
    const labels = Array.isArray(spec.labels) ? spec.labels : null
    const series = Array.isArray(spec.series) ? spec.series : null
    if (!labels || !series || !series.every(s => s && typeof s.name === 'string' && Array.isArray(s.data))) {
      return { text: content, chart: null }
    }
    const text = content.replace(CHART_BLOCK_RE, '').trim()
    return { text, chart: { ...spec, labels, series } }
  } catch {
    return { text: content, chart: null }
  }
}

function useAdminTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') || 'dark')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}

function AiChart({ spec }) {
  const theme = useAdminTheme()
  const isLight = theme === 'light'
  const tickColor = isLight ? '#64748B' : '#94A3B8'
  const gridColor = isLight ? 'rgba(11,16,32,0.06)' : 'rgba(255,255,255,0.05)'
  const axisTick = { fill: tickColor, fontSize: 11 }
  const tooltipStyle = {
    contentStyle: {
      background: isLight ? '#FFFFFF' : '#121829',
      border: isLight ? '1px solid rgba(11,16,32,0.1)' : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, fontSize: 12,
      color: isLight ? '#0B1020' : '#FFFFFF',
    },
    labelStyle: { color: isLight ? '#475569' : '#94A3B8' },
  }

  const data = useMemo(() => spec.labels.map((label, i) => {
    const row = { date: label }
    spec.series.forEach(s => { row[s.name] = Number(s.data[i]) || 0 })
    return row
  }), [spec])

  const isBar = spec.type === 'bar'
  const showLegend = spec.series.length > 1

  return (
    <div className="aia-chart">
      {spec.title && <div className="aia-chart-title">{spec.title}</div>}
      <ResponsiveContainer width="100%" height={220}>
        {isBar ? (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={gridColor} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip {...tooltipStyle} cursor={{ fill: gridColor }} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {spec.series.map((s, i) => (
              <Bar key={s.name} dataKey={s.name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={gridColor} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {spec.series.map((s, i) => (
              <Line key={s.name} type="monotone" dataKey={s.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

function MessageContent({ content }) {
  const { text, chart } = useMemo(() => parseAiContent(content), [content])
  return (
    <>
      {text && <div className="aia-bubble-text">{text}</div>}
      {chart && <AiChart spec={chart} />}
    </>
  )
}

export default function AiAssistant() {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)
  const [err, setErr]           = useState('')
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  async function loadHistory() {
    setLoading(true)
    try {
      const res = await api.get('/admin/ai-assistant/messages')
      setMessages(res.messages || [])
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadHistory() }, [])
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setErr('')
    setInput('')
    setMessages(m => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: text, created_at: null }])
    setSending(true)
    try {
      const reply = await api.post('/admin/ai-assistant', { message: text })
      setMessages(m => [...m, reply])
    } catch (e) {
      setErr(e.message)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  async function clearHistory() {
    if (!confirm("Suhbat tarixini butunlay o'chirishni tasdiqlaysizmi?")) return
    try {
      await api.delete('/admin/ai-assistant/messages')
      setMessages([])
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="aia-root">
      <div className="aia-header">
        <div className="aia-title">
          <Bot size={20} />
          <span>AI yordamchi</span>
        </div>
        <button className="aia-clear" onClick={clearHistory} disabled={!messages.length} title="Tarixni tozalash">
          <Trash2 size={15} /> Tozalash
        </button>
      </div>

      <div className="aia-body">
        {loading ? (
          <div className="aia-empty"><Loader2 size={20} className="aia-spin" /> Yuklanmoqda...</div>
        ) : messages.length === 0 ? (
          <div className="aia-empty">
            <Bot size={36} />
            <p>Salom! Men Monvo admin AI yordamchisiman.</p>
            <p className="aia-empty-sub">Merchantlar, tranzaksiyalar, push-xabar matnlari yoki platforma bo'yicha savol bering.</p>
          </div>
        ) : (
          <div className="aia-messages">
            {messages.map(m => {
              const hasChart = m.role === 'assistant' && CHART_BLOCK_RE.test(m.content)
              return (
                <div key={m.id} className={`aia-msg aia-msg-${m.role} ${hasChart ? 'aia-msg-chart' : ''}`}>
                  <div className="aia-avatar">{m.role === 'user' ? <User size={15} /> : <Bot size={15} />}</div>
                  <div className="aia-bubble">
                    {m.role === 'assistant' ? <MessageContent content={m.content} /> : m.content}
                  </div>
                </div>
              )
            })}
            {sending && (
              <div className="aia-msg aia-msg-assistant">
                <div className="aia-avatar"><Bot size={15} /></div>
                <div className="aia-bubble aia-typing">
                  <span></span><span></span><span></span>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {err && <div className="aia-error">{err}</div>}

      <div className="aia-input-row">
        <textarea
          ref={inputRef}
          className="aia-input"
          placeholder="Xabar yozing... (Enter — yuborish, Shift+Enter — yangi qator)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
        />
        <button className="aia-send" onClick={send} disabled={sending || !input.trim()}>
          {sending ? <Loader2 size={17} className="aia-spin" /> : <Send size={17} />}
        </button>
      </div>
    </div>
  )
}
