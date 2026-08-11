// scan.js — resolve a scanned QR payload into a card (mirrors CardsProvider.addCard).
// Accepts the canonical monvo:// schemes plus the legacy "kartly://" typo.
import { api } from './api'

export function isMonvoQr(raw) {
  const v = (raw || '').trim().toLowerCase()
  return v.startsWith('monvo://card/') || v.startsWith('monvo://signup/')
    || v.startsWith('kartly://card/') || v.startsWith('kartly://signup/')
    || /signup(-by-merchant)?\/\d+/.test(v) || /\/(?:bot\/)?j\/\d+/.test(v)
    || /\/card\/[a-z0-9_-]+/i.test(v)
}

export async function resolveScannedCard(raw) {
  if (!raw) return null
  let uid = raw.trim().replace(/^kartly:\/\//i, 'monvo://')

  if (uid.toLowerCase().startsWith('monvo://signup/')) {
    const merchantId = parseInt(uid.slice('monvo://signup/'.length), 10)
    if (Number.isNaN(merchantId)) throw new Error("QR kod noto'g'ri formatda")
    const res = await api.signupByMerchant(merchantId)
    uid = res?.card_uid || ''
    if (!uid) throw new Error('Karta yaratilmadi')
  } else if (uid.toLowerCase().startsWith('monvo://card/')) {
    uid = uid.slice('monvo://card/'.length)
  } else {
    // signup/<id>, signup-by-merchant/<id>, yoki universal join QR: (bot/)j/<id>
    const m = uid.match(/(?:signup(?:-by-merchant)?|(?:bot\/)?j)\/(\d+)/)
    if (m) {
      const res = await api.signupByMerchant(parseInt(m[1], 10))
      uid = res?.card_uid || ''
    } else {
      const c = uid.match(/card\/([A-Za-z0-9_-]+)/)
      if (c) uid = c[1]
    }
  }
  return api.getPublicCard(uid)
}
