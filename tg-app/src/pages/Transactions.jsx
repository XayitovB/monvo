// Transactions — filter chips + day-grouped history with infinite scroll
// (Flutter transactions_screen.dart).
import { useEffect, useState, useCallback } from 'react'
import { useApp, useTheme, useT } from '../store'
import { api } from '../api'
import { AppBar, BackBtn, Spinner, EmptyState, ErrorState, Chip, Card, Eyebrow, Icon, Center } from '../ui'
import { groupSep, MONO, FONT } from '../theme'

const PAGE = 30

export default function Transactions() {
  const { pop, lang } = useApp()
  const t = useTheme()
  const tr = useT()
  const [items, setItems] = useState(null)
  const [err, setErr] = useState(null)
  const [filter, setFilter] = useState('all')
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const load = useCallback(async () => {
    setErr(null); setItems(null)
    try {
      const data = await api.getMyTransactions(PAGE, 0) || []
      setItems(data); setHasMore(data.length === PAGE)
    } catch (e) { setErr(e.message) }
  }, [])

  useEffect(() => { load() }, [load])

  async function more() {
    if (loadingMore || !hasMore || !items) return
    setLoadingMore(true)
    try {
      const data = await api.getMyTransactions(PAGE, items.length) || []
      setItems(prev => [...prev, ...data]); setHasMore(data.length === PAGE)
    } catch (_) {} finally { setLoadingMore(false) }
  }

  function onScroll(e) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) more()
  }

  const visible = (items || []).filter(tx =>
    filter === 'all' ? true : filter === 'earn' ? tx.points_delta >= 0 : tx.points_delta < 0)

  const monthEarn = (items || [])
    .filter(tx => tx.points_delta >= 0 && tx.created_at && new Date(tx.created_at).getMonth() === new Date().getMonth())
    .reduce((s, tx) => s + tx.points_delta, 0)

  return (
    <div style={{ background: t.paper, height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: FONT }}>
      <AppBar title={tr('historyTitle')}
        subtitle={monthEarn ? `+ ${groupSep(monthEarn)} ${tr('som')} ${tr('perMonth')}` : null}
        leading={<BackBtn onClick={pop} />} />

      <div style={{ display: 'flex', gap: 6, padding: '6px 20px 12px' }}>
        <Chip active={filter === 'all'} accent onClick={() => setFilter('all')}>{tr('all')}</Chip>
        <Chip active={filter === 'earn'} onClick={() => setFilter('earn')}>{tr('earns')}</Chip>
        <Chip active={filter === 'redeem'} onClick={() => setFilter('redeem')}>{tr('redeems')}</Chip>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }} onScroll={onScroll}>
        {err ? <ErrorState message={err} onRetry={load} retryLabel={tr('retry')} />
          : items == null ? <Center><Spinner /></Center>
          : visible.length === 0 ? <EmptyState icon="receipt" title={tr('emptyHistory')} />
          : (
            <div style={{ padding: '4px 20px 24px' }}>
              {groupByDay(visible, tr).map(([label, rows]) => (
                <div key={label} style={{ marginBottom: 16 }}>
                  <div style={{ padding: '4px 2px 8px' }}><Eyebrow>{label}</Eyebrow></div>
                  <Card pad={0}>
                    {rows.map((tx, i) => <TxRow key={tx.id} tx={tx} divider={i < rows.length - 1} tr={tr} />)}
                  </Card>
                </div>
              ))}
              {loadingMore ? <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spinner size={22} /></div> : null}
            </div>
          )}
      </div>
    </div>
  )
}

function groupByDay(list, tr) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 86400000
  const map = new Map()
  for (const tx of list) {
    const dt = tx.created_at ? new Date(tx.created_at) : new Date(0)
    const key = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
    let label
    if (key === today) label = tr('today')
    else if (key === yesterday) label = tr('yesterday')
    else label = dt.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    if (!map.has(label)) map.set(label, [])
    map.get(label).push(tx)
  }
  return [...map.entries()]
}

function TxRow({ tx, divider, tr }) {
  const t = useTheme()
  const isPlus = tx.points_delta >= 0
  const title = tx.merchant_name || tr('purchase')
  const amount = tx.amount > 0 ? ` · ${groupSep(Math.round(tx.amount))} ${tr('som')}` : ''
  const sub = tx.tx_type === 'redeem' ? (tx.reward_title || tr('exchange')) : `${tr('purchase')}${amount}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: divider ? `0.5px solid ${t.line}` : 'none' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: isPlus ? t.goodSoft : t.paperAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={isPlus ? 'arrow-up' : 'gift'} size={14} color={isPlus ? t.good : t.inkMute} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ fontSize: 11, color: t.inkMute, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: isPlus ? t.good : t.ink }}>
        {isPlus ? '+ ' : '− '}{groupSep(Math.abs(tx.points_delta))} {tr('som')}
      </div>
    </div>
  )
}
