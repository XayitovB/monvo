// api.js — full Monvo customer API client for the Telegram mini-app.
// Mirrors lib/services/api_service.dart (customer surface) 1:1.
//
// Production: backend serves /tg static + API on the same origin → BASE = ''.
// Dev: vite proxies the paths below to localhost:8181.
const BASE = import.meta.env.VITE_API_URL || ''

const TOKEN_KEY = 'tg_token'
export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }
export function hasToken() { return !!getToken() }

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
  get isUnauthorized() { return this.status === 401 }
}

const TIMEOUT = 15000

async function req(method, path, { body, form, auth = true } = {}) {
  const headers = { Accept: 'application/json' }
  const token = getToken()
  if (auth && token) headers['Authorization'] = `Bearer ${token}`

  let payload
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    payload = new URLSearchParams(form).toString()
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: payload, signal: ctrl.signal })
  } catch (e) {
    clearTimeout(timer)
    throw new ApiError(0, 'Tarmoq xatosi')
  }
  clearTimeout(timer)

  if (!res.ok) {
    let msg = 'Xato yuz berdi'
    try {
      const j = await res.json()
      if (j?.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch (_) {}
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ── Tiny TTL cache for slow-changing GETs (rewards, branches, achievements) ──
const _cache = new Map()
export function clearCache(prefix) {
  if (!prefix) return _cache.clear()
  for (const k of [..._cache.keys()]) if (k.includes(prefix)) _cache.delete(k)
}
async function cachedGet(key, ttlMs, fn) {
  const hit = _cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.data
  const data = await fn()
  _cache.set(key, { data, exp: Date.now() + ttlMs })
  return data
}

export const api = {
  // ── Auth ──
  loginTelegram: async (initData) => {
    const data = await req('POST', '/auth/telegram', { auth: false, body: { init_data: initData } })
    if (data?.access_token) setToken(data.access_token)
    return data
  },
  getMe: () => req('GET', '/auth/me'),
  patchMe: (patch) => req('PATCH', '/auth/me', { body: patch }),
  updateName: (name) => req('PATCH', '/auth/me', { body: { name } }),
  updateLanguage: (language) => req('PATCH', '/auth/me', { body: { language } }),
  updateBirthday: (ymd) => req('PATCH', '/auth/me', { body: { birth_date: ymd } }),
  deleteAccount: () => req('DELETE', '/auth/me'),

  // ── Cards ──
  getMyCards: () => req('GET', '/cards/my'),
  getPublicCard: (cardUid) => req('GET', `/cards/public/${cardUid}`, { auth: false }),
  signupByMerchant: (merchantId) => req('POST', `/cards/signup-by-merchant/${merchantId}`),
  billzVoucher: (cardUid) => req('POST', `/cards/my/${cardUid}/billz-voucher`),
  redeemCode: (cardUid) => req('POST', `/cards/my/${cardUid}/redeem-code`),

  // ── Rewards ──
  getPublicRewards: (merchantId) =>
    cachedGet(`R:${merchantId}`, 180000, () =>
      req('GET', `/rewards/public/${merchantId}`, { auth: false })),

  // ── Transactions ──
  getMyTransactions: (limit = 30, offset = 0) =>
    req('GET', `/transactions/mine?limit=${limit}&offset=${offset}`),

  // ── Notifications ──
  getNotifications: () => req('GET', '/notifications'),
  markNotificationRead: (id) => req('PATCH', `/notifications/${id}/read`),
  deleteNotification: (id) => req('DELETE', `/notifications/${id}`),
  markAllRead: () => req('POST', '/notifications/read-all'),

  // ── Announcements ──
  getActiveAnnouncements: (target = 'users') =>
    req('GET', `/announcements/active?target=${target}`, { auth: false }),

  // ── Discover (public) ──
  getDiscoverBranches: () =>
    cachedGet('DISCOVER', 600000, () => req('GET', '/discover/branches', { auth: false })),
  getNearbyBranches: (lat, lng, radiusKm = 20, limit = 50) =>
    req('GET', `/discover/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}&limit=${limit}`, { auth: false }),

  // ── Gamification ──
  getMyStats: () => req('GET', '/gamification/me'),
  getMyAchievements: (category) =>
    cachedGet(`ACH:${category || ''}`, 300000, () =>
      req('GET', `/gamification/achievements${category ? `?category=${category}` : ''}`)),
  getGlobalLeaderboard: (limit = 100) => req('GET', `/gamification/leaderboard?limit=${limit}`),
  getMerchantLeaderboard: (merchantId) => req('GET', `/gamification/leaderboard/merchant/${merchantId}`),

  // ── Contests ──
  getContests: ({ includeFinished = false, merchantId } = {}) => {
    const qp = []
    if (includeFinished) qp.push('include_finished=true')
    if (merchantId) qp.push(`merchant_id=${merchantId}`)
    return req('GET', `/contests${qp.length ? `?${qp.join('&')}` : ''}`)
  },
  getContest: (id) => req('GET', `/contests/${id}`),
  joinContest: (id) => req('POST', `/contests/${id}/join`, { body: {} }),
  getContestLeaderboard: (id, limit = 100) => req('GET', `/contests/${id}/leaderboard?limit=${limit}`),

  // ── Games ──
  getGameQuota: () => req('GET', '/games/quota'),
  startGame: (gameType) => req('POST', '/games/start', { body: { game_type: gameType } }),
  finishGame: (sessionToken, score, durationSeconds) =>
    req('POST', '/games/finish', { body: { session_token: sessionToken, score, duration_seconds: durationSeconds } }),
  getGameLeaderboard: (game, period = 'weekly', limit = 50) =>
    req('GET', `/games/leaderboard?game=${game}&period=${period}&limit=${limit}`),
  getSpinStatus: () => req('GET', '/games/spin/status'),
  spinWheel: () => req('POST', '/games/spin', { body: {} }),

  // ── Push ──
  registerFcmToken: (fcmToken, platform = 'web') =>
    req('POST', '/push/register', { body: { token: fcmToken, platform } }),
}

export function logout() {
  clearToken()
  clearCache()
}
