// Settings — language, theme, delete account (Flutter settings_screen.dart).
import { useApp, useTheme, useT } from '../store'
import { api, logout } from '../api'
import { AppBar, BackBtn, Card, Row, Eyebrow, Icon } from '../ui'
import { FONT } from '../theme'
import { haptic, showConfirm, showAlert, tg } from '../tg'

export default function Settings() {
  const { pop, lang, setLang, themeMode, setMode } = useApp()
  const t = useTheme()
  const tr = useT()

  async function onDelete() {
    haptic('warning')
    const ok = await showConfirm(tr('deleteConfirm'))
    if (!ok) return
    try {
      await api.deleteAccount()
      logout()
      showAlert(tr('deleteAccount'))
      tg?.close?.()
    } catch (e) {
      showAlert(e.message || tr('error'))
    }
  }

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT }}>
      <AppBar title={tr('settings')} leading={<BackBtn onClick={pop} />} />

      {/* Language */}
      <div style={{ padding: '6px 20px 0' }}>
        <Eyebrow>{tr('language')}</Eyebrow>
        <div style={{ height: 8 }} />
        <Card pad={0}>
          <Choice label="O‘zbekcha" active={lang === 'uz'} onClick={() => setLang('uz')} />
          <Divider t={t} />
          <Choice label="Русский" active={lang === 'ru'} onClick={() => setLang('ru')} />
        </Card>
      </div>

      {/* Theme */}
      <div style={{ padding: '18px 20px 0' }}>
        <Eyebrow>{tr('theme')}</Eyebrow>
        <div style={{ height: 8 }} />
        <Card pad={0}>
          <Choice label={tr('themeSystem')} active={themeMode === 'system'} onClick={() => setMode('system')} />
          <Divider t={t} />
          <Choice label={tr('themeLight')} active={themeMode === 'light'} onClick={() => setMode('light')} />
          <Divider t={t} />
          <Choice label={tr('themeDark')} active={themeMode === 'dark'} onClick={() => setMode('dark')} />
        </Card>
      </div>

      {/* Danger */}
      <div style={{ padding: '18px 20px 24px' }}>
        <Card pad={0}>
          <Row icon="trash" danger title={tr('deleteAccount')} onClick={onDelete} />
        </Card>
      </div>
    </div>
  )
}

function Choice({ label, active, onClick }) {
  const t = useTheme()
  return (
    <Row title={label} onClick={onClick}
      trailing={active ? <Icon name="check" size={18} color={t.accent} /> : <span style={{ width: 18 }} />} />
  )
}

function Divider({ t }) {
  return <div style={{ height: 0.5, background: t.line, marginLeft: 14 }} />
}
