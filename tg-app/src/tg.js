// tg.js — thin wrapper over the Telegram WebApp SDK with safe fallbacks for
// running in a plain browser during development.
export const tg = window.Telegram?.WebApp

export function init() {
  if (!tg) return
  tg.ready()
  tg.expand()
  try {
    tg.enableClosingConfirmation?.()
  } catch (_) {}
}

export function getInitData() {
  return tg?.initData || ''
}

export function getTgUser() {
  return tg?.initDataUnsafe?.user || null
}

export function haptic(type = 'light') {
  try {
    if (type === 'success' || type === 'error' || type === 'warning') {
      tg?.HapticFeedback?.notificationOccurred(type)
    } else {
      tg?.HapticFeedback?.impactOccurred(type)
    }
  } catch (_) {}
}

export function showAlert(msg) {
  if (tg?.showAlert) tg.showAlert(msg)
  else window.alert(msg)
}

export function showConfirm(msg) {
  return new Promise(resolve => {
    if (tg?.showConfirm) tg.showConfirm(msg, ok => resolve(!!ok))
    else resolve(window.confirm(msg))
  })
}

// ── Back button ────────────────────────────────────────────────────────────────
export function setBackButton(visible, onClick) {
  const bb = tg?.BackButton
  if (!bb) return () => {}
  if (visible) {
    bb.show()
    bb.onClick(onClick)
    return () => {
      bb.offClick(onClick)
      bb.hide()
    }
  }
  bb.hide()
  return () => {}
}

// ── Header / background colours ──────────────────────────────────────────────────
export function setHeaderColor(color) {
  try {
    tg?.setHeaderColor?.(color)
  } catch (_) {}
}

export function setBackgroundColor(color) {
  try {
    tg?.setBackgroundColor?.(color)
  } catch (_) {}
}

export function onThemeChanged(cb) {
  if (!tg?.onEvent) return () => {}
  tg.onEvent('themeChanged', cb)
  return () => tg.offEvent?.('themeChanged', cb)
}

export function openLink(url) {
  if (tg?.openLink) tg.openLink(url)
  else window.open(url, '_blank')
}

export function colorScheme() {
  return tg?.colorScheme || 'light'
}
