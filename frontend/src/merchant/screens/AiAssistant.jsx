import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I, T, Button, LineChart as KitLineChart, BarChart as KitBarChart } from '../kit';
import Topbar from '../layout/Topbar';
import { useLang } from '../i18n/LangContext';
import api from '../api';

const CHART_COLORS = ['#2F6B3F', '#0F766E', '#B45309', '#7C4A8C', '#9F1239'];
const CHART_BLOCK_RE = /```chart\s*([\s\S]*?)```/;

// AI javobidan ```chart{...}``` blokini ajratib oladi — muvaffaqiyatsiz
// bo'lsa (JSON buzuq yoki shakl noto'g'ri) butun matnni o'zgarishsiz qaytaradi.
function parseAiContent(content) {
  const match = content.match(CHART_BLOCK_RE);
  if (!match) return { text: content, chart: null };
  try {
    const spec = JSON.parse(match[1]);
    const labels = Array.isArray(spec.labels) ? spec.labels : null;
    const series = Array.isArray(spec.series) ? spec.series : null;
    if (!labels || !series || !series.every(s => s && typeof s.name === 'string' && Array.isArray(s.data))) {
      return { text: content, chart: null };
    }
    const text = content.replace(CHART_BLOCK_RE, '').trim();
    return { text, chart: { ...spec, labels, series } };
  } catch {
    return { text: content, chart: null };
  }
}

function AiChart({ spec }) {
  const isBar = spec.type === 'bar' && spec.series.length === 1;
  return (
    <div style={{ width: '100%' }}>
      {spec.title && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--m-ink-mute)', marginBottom: 6 }}>{spec.title}</div>}
      <div style={{ overflowX: 'auto' }}>
        {isBar ? (
          <KitBarChart data={spec.series[0].data} labels={spec.labels} color={CHART_COLORS[0]} w={520} h={160} />
        ) : (
          <KitLineChart
            series={spec.series.map((s, i) => ({ data: s.data, color: CHART_COLORS[i % CHART_COLORS.length], fill: i === 0 }))}
            labels={spec.labels}
            w={520}
            h={200}
          />
        )}
      </div>
      {spec.series.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
          {spec.series.map((s, i) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--m-ink-soft)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length] }}/>
              {s.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bubble({ role, content }) {
  const isUser = role === 'user';
  const { text, chart } = useMemo(
    () => (isUser ? { text: content, chart: null } : parseAiContent(content)),
    [content, isUser]
  );
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
      maxWidth: chart ? '96%' : '78%',
      width: chart ? '96%' : undefined,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUser ? 'var(--m-brand)' : 'var(--m-surface-alt)',
        color: isUser ? '#fff' : 'var(--m-ink-mute)',
      }}>
        {isUser ? <I.user size={14}/> : <I.bot size={14}/>}
      </div>
      <div style={{
        padding: '10px 14px', borderRadius: 14,
        fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word',
        background: isUser ? 'var(--m-brand)' : 'var(--m-surface-alt)',
        color: isUser ? '#fff' : 'var(--m-ink)',
        borderBottomRightRadius: isUser ? 4 : 14,
        borderBottomLeftRadius: isUser ? 14 : 4,
        display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0,
      }}>
        {text && <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>}
        {chart && <AiChart spec={chart}/>}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', alignSelf: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--m-surface-alt)', color: 'var(--m-ink-mute)',
      }}><I.bot size={14}/></div>
      <div style={{
        padding: '14px', borderRadius: 14, borderBottomLeftRadius: 4,
        background: 'var(--m-surface-alt)', display: 'flex', gap: 4,
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%', background: 'var(--m-ink-mute)',
            animation: `aiaBounce 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}/>
        ))}
      </div>
      <style>{`@keyframes aiaBounce { 0%,60%,100% { transform: translateY(0); opacity:.5 } 30% { transform: translateY(-4px); opacity:1 } }`}</style>
    </div>
  );
}

export default function AiAssistant() {
  const { t } = useLang();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.aiAssistantMessages()
      .then(r => setMessages(r?.messages || []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setErr('');
    setInput('');
    setMessages(m => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: text }]);
    setSending(true);
    try {
      const reply = await api.aiAssistantSend(text);
      setMessages(m => [...m, reply]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function clearHistory() {
    if (!confirm(t('aia.clear_confirm'))) return;
    try {
      await api.aiAssistantClear();
      setMessages([]);
    } catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar
        title={t('aia.title')}
        actions={
          <Button variant="ghost" size="sm" icon={<I.x/>} onClick={clearHistory} disabled={!messages.length}>
            {t('aia.clear')}
          </Button>
        }
      />

      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        margin: '16px 28px 28px', background: 'var(--m-surface)',
        border: '1px solid var(--m-line)', borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading ? (
            <div style={{ margin: 'auto', color: 'var(--m-ink-mute)', fontSize: 13 }}>{t('aia.loading')}</div>
          ) : messages.length === 0 ? (
            <div style={{
              margin: 'auto', textAlign: 'center', maxWidth: 360,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: 'var(--m-brand-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--m-brand)', marginBottom: 6,
              }}><I.bot size={22}/></div>
              <div style={{ ...T.h2 }}>{t('aia.empty_title')}</div>
              <div style={{ ...T.body }}>{t('aia.empty_sub')}</div>
            </div>
          ) : (
            <>
              {messages.map(m => <Bubble key={m.id} role={m.role} content={m.content}/>)}
              {sending && <TypingBubble/>}
            </>
          )}
          <div ref={bottomRef}/>
        </div>

        {err && (
          <div style={{ margin: '0 20px 12px', padding: '10px 14px', borderRadius: 10, background: 'var(--m-bad-soft)', color: 'var(--m-bad)', fontSize: 13 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--m-line)' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('aia.placeholder')}
            rows={1}
            style={{
              flex: 1, resize: 'none', maxHeight: 140,
              padding: '11px 14px', borderRadius: 12,
              border: '1px solid var(--m-line)', background: 'var(--m-surface-alt)',
              color: 'var(--m-ink)', fontFamily: 'var(--m-sans)', fontSize: 14, lineHeight: 1.4,
              outline: 'none',
            }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0, border: 'none',
              background: 'var(--m-brand)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: (sending || !input.trim()) ? 0.45 : 1,
              cursor: (sending || !input.trim()) ? 'not-allowed' : 'pointer',
            }}
          >
            <I.send size={17}/>
          </button>
        </div>
      </div>
    </div>
  );
}
