// BottomNav.jsx — 4 tabs + center QR FAB, mirroring the Flutter HFTabBar
// (Home · Cards · [QR] · Places · Profile).
import { useTheme, useT } from '../store'
import { Icon } from '../ui'
import { hexA, FONT } from '../theme'
import { haptic } from '../tg'

const TABS = [
  { key: 'home', icon: 'home', label: 'tabHome' },
  { key: 'cards', icon: 'card', label: 'tabCards' },
  { key: '__fab', icon: 'qr' },
  { key: 'places', icon: 'store', label: 'tabPlaces' },
  { key: 'profile', icon: 'user', label: 'tabProfile' },
]

export default function BottomNav({ active, onChange, onScan }) {
  const t = useTheme()
  const tr = useT()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      display: 'flex', alignItems: 'flex-end',
      background: t.paper, borderTop: `1px solid ${t.line}`,
      paddingBottom: 'env(safe-area-inset-bottom)', fontFamily: FONT,
    }}>
      {TABS.map(tab => {
        if (tab.key === '__fab') {
          return (
            <div key="fab" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => { haptic('medium'); onScan?.() }}
                style={{
                  transform: 'translateY(-22px)', width: 60, height: 60, borderRadius: '50%',
                  border: 'none', background: t.accent, color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 6px 20px ${hexA(t.accent, 0.4)}`,
                }}>
                <Icon name="qr" size={28} color="#fff" />
              </button>
            </div>
          )
        }
        const isActive = active === tab.key
        return (
          <button key={tab.key} onClick={() => { haptic('light'); onChange(tab.key) }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '9px 4px 8px', border: 'none', background: 'none', cursor: 'pointer',
            }}>
            <Icon name={tab.icon} size={22} color={isActive ? t.ink : t.inkMute} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 500, color: isActive ? t.ink : t.inkMute }}>
              {tr(tab.label)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
