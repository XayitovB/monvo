// Notifications — list with read/delete + mark-all (Flutter notifications_screen.dart).
import { useEffect, useState, useCallback } from 'react'
import { useApp, useTheme, useT } from '../store'
import { api } from '../api'
import { AppBar, BackBtn, IconBtn, Spinner, EmptyState, Icon, Center } from '../ui'
import { hexA, FONT } from '../theme'
import { haptic } from '../tg'

export default function Notifications() {
  const { pop } = useApp()
  const t = useTheme()
  const tr = useT()
  const [items, setItems] = useState(null)

  const load = useCallback(async () => {
    try { setItems(await api.getNotifications() || []) } catch (_) { setItems([]) }
  }, [])
  useEffect(() => { load() }, [load])

  async function markRead(n) {
    if (n.is_read) return
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    api.markNotificationRead(n.id).catch(() => {})
  }
  async function remove(n) {
    haptic('light')
    setItems(prev => prev.filter(x => x.id !== n.id))
    api.deleteNotification(n.id).catch(() => {})
  }
  async function readAll() {
    haptic('light')
    setItems(prev => prev.map(x => ({ ...x, is_read: true })))
    api.markAllRead().catch(() => {})
  }

  const hasUnread = (items || []).some(n => !n.is_read)

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('notifs')} leading={<BackBtn onClick={pop} />}
        trailing={hasUnread ? <IconBtn onClick={readAll}><Icon name="check" size={20} /></IconBtn> : null} />

      {items == null ? <Center><Spinner /></Center>
        : items.length === 0 ? <EmptyState icon="bell" title={tr('noNotifs')} />
        : (
          <div style={{ padding: '6px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(n => (
              <div key={n.id} onClick={() => markRead(n)} style={{
                display: 'flex', gap: 12, padding: 14, borderRadius: 16, cursor: 'pointer',
                background: n.is_read ? t.paperRaised : hexA(t.accent, 0.07),
                border: `1px solid ${n.is_read ? t.line : hexA(t.accent, 0.25)}`,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: t.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="bell" size={17} color={t.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: n.is_read ? 600 : 700, color: t.ink }}>{n.title}</div>
                  {n.body ? <div style={{ fontSize: 12.5, color: t.inkSoft, marginTop: 3, lineHeight: 1.4 }}>{n.body}</div> : null}
                  {n.created_at ? <div style={{ fontSize: 11, color: t.inkFaint, marginTop: 5 }}>{new Date(n.created_at).toLocaleDateString()}</div> : null}
                </div>
                <button onClick={(e) => { e.stopPropagation(); remove(n) }} style={{ border: 'none', background: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}>
                  <Icon name="close" size={16} color={t.inkFaint} />
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
