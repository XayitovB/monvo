// Profile tab — 1:1 with Flutter profile_screen.dart:
// avatar + name (+ masked phone), "Hisob" (Yutuqlar · Bildirishnomalar),
// "Sozlamalar" (Til · Tungi rejim), partner card, privacy, logout, delete.
import { useApp, useTheme, useT } from '../store'
import { api, logout as apiLogout } from '../api'
import { AppBar, Card, Eyebrow, Icon, Button } from '../ui'
import { hexA, FONT, MONO } from '../theme'
import { haptic, showConfirm, showAlert, openLink, tg } from '../tg'

export default function Profile() {
  const { me, tgUser, push, lang, setLang, themeMode, setMode, theme } = useApp()
  const t = useTheme()
  const tr = useT()

  const name = me?.name || tgUser?.first_name || (lang === 'ru' ? 'Гость' : 'Mehmon')
  const phone = maskPhone(me?.phone)
  const photo = tgUser?.photo_url
  const isDark = themeMode === 'dark' || (themeMode === 'system' && theme.isDark)

  async function editName() {
    const v = window.prompt(tr('profileTitle'), name)
    if (v && v.trim()) { try { await api.updateName(v.trim()) } catch (_) {} }
  }

  async function doLogout() {
    haptic('warning')
    const ok = await showConfirm(lang === 'ru' ? 'Выйти из аккаунта?' : 'Hisobdan chiqasizmi?')
    if (!ok) return
    apiLogout()
    tg?.close?.()
  }

  async function doDelete() {
    haptic('warning')
    const ok = await showConfirm(tr('deleteConfirm'))
    if (!ok) return
    try { await api.deleteAccount(); apiLogout(); tg?.close?.() }
    catch (e) { showAlert(e.message || tr('error')) }
  }

  function becomePartner() {
    haptic('light')
    openLink('https://t.me/monvo_business')
  }

  return (
    <div style={{ background: t.paper, minHeight: '100dvh', fontFamily: FONT, paddingBottom: 100 }}>
      <AppBar title={tr('profileTitle')} transparent />

      {/* Hero — avatar + name + phone */}
      <div style={{ padding: '8px 20px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          background: `linear-gradient(135deg, ${t.accent}, ${t.accentDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 22, fontWeight: 700,
        }}>
          {photo ? <img src={photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div onClick={editName} style={{ fontSize: 17, fontWeight: 700, color: t.ink, letterSpacing: -0.3 }}>{name}</div>
          {phone ? <div style={{ fontFamily: MONO, fontSize: 12, color: t.inkMute, marginTop: 2 }}>{phone}</div> : null}
        </div>
      </div>

      {/* Hisob */}
      <Section label={tr('you') === 'Siz' ? 'Hisob' : 'Аккаунт'} t={t}>
        <ProfileRow icon="trophy" label={tr('achievements')} onClick={() => push('gamification')} divider />
        <ProfileRow icon="bell" label={tr('notifs')} onClick={() => push('notifications')} />
      </Section>

      {/* Sozlamalar */}
      <Section label={tr('settings')} t={t}>
        <ProfileRow icon="globe" label={tr('language')} value={lang === 'ru' ? 'Русский' : "O'zbekcha"}
          onClick={() => push('settings')} divider />
        <ProfileRow icon="moon" label={tr('themeDark')}
          trailing={<Toggle on={isDark} onClick={() => setMode(isDark ? 'light' : 'dark')} t={t} />} />
      </Section>

      {/* Partner */}
      <div style={{ padding: '16px 20px 0' }}>
        <Card pad={0}>
          <ProfileRow icon="store" label={lang === 'ru' ? 'Стать партнёром Monvo' : "Monvo hamkori bo'lish"}
            value={lang === 'ru' ? 'Бизнес' : 'Biznes'} onClick={becomePartner} />
        </Card>
      </div>

      {/* Privacy */}
      <div style={{ padding: '16px 20px 0' }}>
        <Card pad={0}>
          <ProfileRow icon="check" label={lang === 'ru' ? 'Политика конфиденциальности' : 'Maxfiylik siyosati'}
            onClick={() => openLink(`${window.location.origin}/privacy?lang=${lang}`)} />
        </Card>
      </div>

      {/* Logout */}
      <div style={{ padding: '16px 20px 0' }}>
        <Button variant="danger" leading={<Icon name="close" size={18} color={t.danger} />} onClick={doLogout}>
          {lang === 'ru' ? 'Выйти' : 'Chiqish'}
        </Button>
      </div>

      {/* Delete account */}
      <div style={{ padding: '10px 20px 0', display: 'flex', justifyContent: 'center' }}>
        <button onClick={doDelete} style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: t.inkMute, fontFamily: FONT, fontSize: 13, fontWeight: 500 }}>
          <Icon name="trash" size={16} color={t.inkMute} />{tr('deleteAccount')}
        </button>
      </div>
    </div>
  )
}

function Section({ label, t, children }) {
  return (
    <div style={{ padding: '20px 20px 0' }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ height: 8 }} />
      <Card pad={0}>{children}</Card>
    </div>
  )
}

function ProfileRow({ icon, label, value, trailing, onClick, divider }) {
  const t = useTheme()
  return (
    <div onClick={onClick ? () => { haptic('light'); onClick() } : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: onClick ? 'pointer' : 'default', borderBottom: divider ? `0.5px solid ${t.line}` : 'none' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: t.paperAlt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={16} color={t.ink} />
      </div>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: t.ink }}>{label}</div>
      {value ? <span style={{ fontSize: 12, color: t.inkMute, marginRight: 8 }}>{value}</span> : null}
      {trailing ?? <Icon name="chevron-right" size={18} color={t.inkFaint} />}
    </div>
  )
}

function Toggle({ on, onClick, t }) {
  return (
    <button onClick={() => { haptic('light'); onClick() }} style={{
      width: 46, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', position: 'relative',
      background: on ? t.accent : t.lineStrong, transition: 'background 0.2s',
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  )
}

function initials(s) {
  const parts = (s || '').trim().split(/\s+/)
  if (!parts[0]) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function maskPhone(p) {
  if (!p) return ''
  const d = p.replace(/\D/g, '')
  if (d.length < 9) return p
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`.trim()
}
