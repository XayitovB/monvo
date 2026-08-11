import React, { useCallback, useEffect, useRef, useState } from 'react';

// ── Floating AI chat widget ────────────────────────────────────────────────
// Bottom-right launcher button → small chat panel (styled like the app's
// existing modal cards: rounded surface, soft shadow, brand accent).
// Talks to POST /support/chat, which the backend proxies to GigaChat.

function uid() {
  return Math.random().toString(36).slice(2);
}

export default function ChatWidget({ T }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    { id: 'greeting', role: 'assistant', text: T.chat_greeting },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  // Keep the greeting in sync when the language changes, but only while
  // no real conversation has started yet.
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].id === 'greeting'
        ? [{ id: 'greeting', role: 'assistant', text: T.chat_greeting }]
        : prev
    );
  }, [T.chat_greeting]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg = { id: uid(), role: 'user', text };
    const history = messages
      .filter((m) => m.id !== 'greeting')
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json().catch(() => null);
      const reply = data && typeof data.reply === 'string' && data.reply.trim()
        ? data.reply.trim()
        : T.chat_error;
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', text: T.chat_error }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, T.chat_error]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={T.chat_title}
          style={{
            position: 'fixed',
            right: 20,
            bottom: 96,
            width: 'min(360px, calc(100vw - 32px))',
            height: 'min(520px, calc(100vh - 140px))',
            background: 'var(--k-surface)',
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.24), 0 0 0 1px var(--k-line)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9998,
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '16px 18px',
              background: 'var(--k-brand)',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <img
              src="/chat-assistant-icon.png"
              alt=""
              width={32} height={32}
              style={{ borderRadius: 10, background: 'rgba(255,255,255,0.18)', padding: 4, flexShrink: 0 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 14.5, lineHeight: 1.3 }}>{T.chat_title}</span>
              <span style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.3 }}>{T.chat_subtitle}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                marginLeft: 'auto', width: 28, height: 28, borderRadius: 9,
                border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, fontSize: 16, lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1, overflowY: 'auto', padding: '16px 14px',
              display: 'flex', flexDirection: 'column', gap: 10,
              background: 'var(--k-bg)',
            }}
          >
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '84%',
                  background: m.role === 'user' ? 'var(--k-brand)' : 'var(--k-surface-alt)',
                  color: m.role === 'user' ? '#fff' : 'var(--k-ink)',
                  padding: '9px 13px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {m.text}
              </div>
            ))}
            {sending && (
              <div
                style={{
                  alignSelf: 'flex-start', fontSize: 13, color: 'var(--k-ink-mute)',
                  padding: '9px 13px', background: 'var(--k-surface-alt)', borderRadius: '14px 14px 14px 4px',
                }}
              >
                …
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex', gap: 8, padding: 12,
              borderTop: '1px solid var(--k-line)', background: 'var(--k-surface)', flexShrink: 0,
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={T.chat_placeholder}
              rows={1}
              style={{
                flex: 1, resize: 'none', border: '1px solid var(--k-line)', borderRadius: 12,
                padding: '9px 12px', fontSize: 13.5, fontFamily: 'var(--k-font)',
                background: 'var(--k-bg)', color: 'var(--k-ink)', outline: 'none', maxHeight: 90,
              }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              aria-label={T.chat_send}
              style={{
                border: 'none', borderRadius: 12, padding: '0 16px',
                background: 'var(--k-brand)', color: '#fff', fontWeight: 600, fontSize: 13,
                cursor: sending || !input.trim() ? 'default' : 'pointer',
                opacity: sending || !input.trim() ? 0.55 : 1,
                flexShrink: 0,
              }}
            >
              {T.chat_send}
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={T.chat_bubble_label}
        aria-expanded={open}
        style={{
          position: 'fixed', right: 20, bottom: 20,
          width: 58, height: 58, borderRadius: '50%',
          border: 'none', background: 'var(--k-brand)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 9999, padding: 0,
        }}
      >
        {open ? (
          <span style={{ color: '#fff', fontSize: 24, lineHeight: 1 }}>×</span>
        ) : (
          <img src="/chat-assistant-icon.png" alt="" width={32} height={32} />
        )}
      </button>
    </>
  );
}
