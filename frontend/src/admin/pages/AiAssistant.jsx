import { useEffect, useRef, useState } from 'react'
import { Bot, Send, Trash2, Loader2, User } from 'lucide-react'
import { api } from '../api'
import './AiAssistant.css'

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
            {messages.map(m => (
              <div key={m.id} className={`aia-msg aia-msg-${m.role}`}>
                <div className="aia-avatar">{m.role === 'user' ? <User size={15} /> : <Bot size={15} />}</div>
                <div className="aia-bubble">{m.content}</div>
              </div>
            ))}
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
