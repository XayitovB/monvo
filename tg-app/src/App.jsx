import { useEffect, useState, lazy, Suspense } from 'react'
import { AppProvider, useApp, useTheme, useT } from './store'
import { init, getInitData } from './tg'
import { api, hasToken } from './api'
import { Spinner, Center, Icon, Logo } from './ui'
import BottomNav from './components/BottomNav'

// Core tabs — eager (always needed on first paint)
import Home from './pages/Home'
import Cards from './pages/Cards'
import Profile from './pages/Profile'
import CardDetail from './pages/CardDetail'
import QrShow from './pages/QrShow'
import Rewards from './pages/Rewards'
import Transactions from './pages/Transactions'
import Notifications from './pages/Notifications'
import Settings from './pages/Settings'
import Gamification from './pages/Gamification'
import Leaderboard from './pages/Leaderboard'
import Contests from './pages/Contests'

// Heavy / less-frequent — lazy (code-split out of the main bundle):
// Places pulls in Leaflet, QrScan pulls in jsQR, games are large.
const Places = lazy(() => import('./pages/Places'))
const QrScan = lazy(() => import('./pages/QrScan'))
const GamesHub = lazy(() => import('./pages/games/GamesHub'))
const Spin = lazy(() => import('./pages/games/Spin'))
const Clicker = lazy(() => import('./pages/games/Clicker'))
const Game2048 = lazy(() => import('./pages/games/Game2048'))

const TABS = { home: Home, cards: Cards, places: Places, profile: Profile }
const SCREENS = {
  cardDetail: CardDetail, qrShow: QrShow, rewards: Rewards, transactions: Transactions,
  notifications: Notifications, settings: Settings, gamification: Gamification,
  leaderboard: Leaderboard, contests: Contests, games: GamesHub,
  spin: Spin, clicker: Clicker, game2048: Game2048, qrScan: QrScan,
}

export default function App() {
  return (
    <AppProvider>
      <AuthGate />
    </AppProvider>
  )
}

function AuthGate() {
  const { loadMe, loadCards } = useApp()
  const t = useTheme()
  const tr = useT()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    init()
    ;(async () => {
      const initData = getInitData()
      try {
        if (initData) {
          await api.loginTelegram(initData)
        } else if (!hasToken()) {
          setError(tr('onlyTelegram'))
          return
        }
        await Promise.all([loadMe(), loadCards()])
        setReady(true)
      } catch (e) {
        if (hasToken()) {
          await Promise.all([loadMe(), loadCards()]).catch(() => {})
          setReady(true)
        } else {
          setError(e.message || tr('error'))
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div style={{ minHeight: '100dvh', background: t.paper, color: t.ink }}>
        <Center minH="100dvh">
          <Icon name="cloud-off" size={42} color={t.inkFaint} />
          <div style={{ fontWeight: 700, fontSize: 16, marginTop: 14 }}>{tr('error')}</div>
          <div style={{ color: t.inkMute, fontSize: 14, marginTop: 8, maxWidth: 280 }}>{error}</div>
        </Center>
      </div>
    )
  }

  if (!ready) {
    return (
      <div style={{ minHeight: '100dvh', background: t.paper }}>
        <Center minH="100dvh">
          <Logo height={40} />
          <div style={{ marginTop: 22 }}><Spinner /></div>
        </Center>
      </div>
    )
  }

  return <Shell />
}

function Shell() {
  const { tab, switchTab, stack, push } = useApp()
  const t = useTheme()

  // Center FAB opens the in-app camera scanner (custom UI, like the mobile app).
  const scanToAddCard = () => push('qrScan', { fullscreen: true })

  const TabComp = TABS[tab] || Home
  const top = stack[stack.length - 1]
  const ScreenComp = top ? SCREENS[top.screen] : null

  const fallback = <Center minH="100dvh"><Spinner /></Center>

  return (
    <div style={{ minHeight: '100dvh', background: t.paper }}>
      {/* Tab layer (kept mounted under the stack) */}
      <div style={{ display: top ? 'none' : 'block', paddingBottom: 84 }}>
        <Suspense fallback={fallback}><TabComp /></Suspense>
      </div>

      {/* Pushed screen layer */}
      {top ? (
        <div style={{ minHeight: '100dvh', background: t.paper }}>
          <Suspense fallback={fallback}><ScreenComp {...top.props} key={stack.length} /></Suspense>
        </div>
      ) : null}

      {/* Bottom nav hidden when a fullscreen pushed screen is up (qrShow) */}
      {!(top && top.props?.fullscreen) ? (
        <BottomNav active={tab} onChange={switchTab} onScan={scanToAddCard} />
      ) : null}
    </div>
  )
}

