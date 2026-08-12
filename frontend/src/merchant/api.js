// Monvo Business — merchant API client.
// Wraps fetch with auth token + JSON helpers.

const BASE_URL = import.meta.env.VITE_API_URL || 'https://monvo.uz';
const TOKEN_KEY = 'merchant_token';

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(v) {
    if (v) localStorage.setItem(TOKEN_KEY, v);
    else localStorage.removeItem(TOKEN_KEY);
  },
  clear() { localStorage.removeItem(TOKEN_KEY); },
  get isAuthed() { return !!localStorage.getItem(TOKEN_KEY); },
};

class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, opts = {}) {
  const headers = {
    'Accept': 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...opts.headers,
  };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!res.ok) {
    if (res.status === 401) auth.clear();
    const detail = body?.detail;
    // HTTP/2'da res.statusText bo'sh bo'ladi — `??` bo'sh satrni tutmaydi,
    // shuning uchun `||` bilan har doim ko'rinadigan xabar beramiz (status kodli).
    const msg = (Array.isArray(detail)
      ? detail.map(e => e?.msg || JSON.stringify(e)).join('; ')
      : (typeof detail === 'string' ? detail : ''))
      || res.statusText
      || `Xatolik (HTTP ${res.status})`;
    throw new ApiError(res.status, msg, body);
  }
  return body;
}

function normalizePhone(input) {
  let p = (input || '').trim().replace(/\s/g, '');
  if (!p) return p;
  if (!p.startsWith('+')) p = '+' + p.replace(/^\+/, '');
  return p;
}

// One-off helper: hit endpoint with a non-default token.
async function requestWithToken(path, token, opts = {}) {
  const headers = {
    'Accept': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...opts.headers,
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && body.detail) || res.statusText || 'Request failed';
    throw new ApiError(res.status, msg, body);
  }
  return body;
}

const api = {
  // ── Auth: email/login + password ─────────────────────────────────────────
  // Avval merchant login sinab ko'riladi, muvaffaqiyatsiz bo'lsa admin login.
  // Qaytaradi: { kind: 'merchant' | 'admin', ...data }
  async loginWithEmail({ email, password }) {
    const identifier = (email || '').trim();
    const pw = password || '';

    // 1) Merchant login — form-urlencoded
    try {
      const body = new URLSearchParams();
      body.set('username', identifier.toLowerCase());
      body.set('password', pw);
      const res = await fetch('/merchants/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.access_token) {
          auth.token = data.access_token;
          return {
            kind: 'merchant',
            merchant_id: data.merchant_id,
            business_name: data.business_name,
          };
        }
      }
    } catch { /* tarmoq xatosi — admin'ni ham sinaymiz */ }

    // 2) Admin login — avval multi-admin DB, keyin legacy .env endpoint.
    //    Ikkalasi ham bir xil JSON shartli; faqat path va saqlanadigan
    //    qo'shimcha maydonlar farq qiladi.
    const tryAdminLogin = async (path) => {
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: identifier, password: pw }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.access_token) return null;
        localStorage.setItem('admin_token', data.access_token);
        if (data.role) localStorage.setItem('admin_role', data.role);
        if (data.full_name) localStorage.setItem('admin_name', data.full_name);
        return { kind: 'admin', ...data };
      } catch {
        return null; // tarmoq xatosi — keyingi variantni sinaymiz
      }
    };

    const adminResult =
      (await tryAdminLogin('/admin/admins/login')) ??
      (await tryAdminLogin('/admin/login'));
    if (adminResult) return adminResult;

    throw new ApiError(401, "Email/login yoki parol noto'g'ri");
  },

  logout() { auth.clear(); },

  // ── Profile ────────────────────────────────────────────────────────────
  me: () => request('/merchants/me'),
  updateProfile: (body) => request('/merchants/me', { method: 'PATCH', body }),
  updateCredentials: (body) => request('/merchants/me/credentials', { method: 'PATCH', body }),

  // ── Cards (real list endpoint) ─────────────────────────────────────────
  cardsList: async (q = {}) => {
    const clean = Object.fromEntries(
      Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const qs = new URLSearchParams(clean).toString();
    const r = await request(`/merchants/me/customers${qs ? '?' + qs : ''}`);
    if (Array.isArray(r)) return r;
    return r?.customers || r?.data || [];
  },

  // ── Transactions (merchant token) ──
  // /transactions backend endpoint already scopes by current merchant token
  // and returns enriched rows (customer/branch/staff/reward).
  transactionsList: async (q = {}) => {
    // Frontend uses `type` for tx_type filter — map it to the backend param.
    const mapped = { ...q };
    if (mapped.type !== undefined) {
      mapped.tx_type = mapped.type;
      delete mapped.type;
    }
    const clean = Object.fromEntries(
      Object.entries(mapped).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const qs = new URLSearchParams(clean).toString();
    const r = await request(`/transactions${qs ? '?' + qs : ''}`);
    if (Array.isArray(r)) return r;
    return r?.transactions || r?.data || [];
  },


  // ── Billing / Tariffs ──────────────────────────────────────────────────
  myBilling: () => request('/merchants/me/billing'),
  myTariff:  () => request('/merchants/me/tariff'),
  tariffs:   () => request('/tariffs'),
  checkoutPayme: (tariffId, cycle = 'monthly', lang = 'uz') =>
    request('/merchants/me/billing/checkout/payme', {
      method: 'POST',
      body: { tariff_id: tariffId, cycle, lang,
        return_url: `${window.location.origin}/merchant/billing?paid=1` },
    }),

  // ── Stats / Dashboard ──────────────────────────────────────────────────
  stats: () => request('/merchants/stats'),
  // Backend qaytaradi: { days, data: [...] } — frontend uchun `data` ni chiqarib beramiz
  trend: async (days = 14, dateFrom = null, dateTo = null) => {
    let qs = dateFrom && dateTo
      ? `date_from=${dateFrom}&date_to=${dateTo}`
      : `days=${days}`;
    const r = await request(`/merchants/analytics/trend?${qs}`);
    return Array.isArray(r) ? r : (r?.data || []);
  },
  peakHours: async () => {
    const r = await request('/merchants/analytics/peak-hours');
    return Array.isArray(r) ? r : (r?.data || []);
  },
  overview: () => request('/merchants/me/analytics/overview'),
  rfm: () => request('/merchants/me/analytics/rfm'),
  cohort: () => request('/merchants/me/analytics/cohort'),
  heatmap: () => request('/merchants/me/analytics/heatmap'),
  ruleRoi: () => request('/merchants/me/analytics/rule-roi'),

  // ── Customers (CRM) ────────────────────────────────────────────────────
  // Backend qaytaradi: { total, customers: [...] } — array sifatida unwrap
  customers: async (q = {}) => {
    // null/undefined qiymatlarni filtrlash
    const clean = Object.fromEntries(
      Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== '')
    );
    const qs = new URLSearchParams(clean).toString();
    const r = await request(`/merchants/me/customers${qs ? '?' + qs : ''}`);
    if (Array.isArray(r)) return r;
    return r?.customers || r?.data || [];
  },
  customerDetail: (cardUid) => request(`/merchants/me/customers/${cardUid}`),
  updateCustomer: (cardUid, body) => request(`/merchants/me/customers/${cardUid}`, { method: 'PATCH', body }),
  createCustomer: (body) => request('/merchants/me/customers', { method: 'POST', body }),
  adjustPoints: (cardUid, body) => request(`/merchants/me/customers/${cardUid}/adjust`, { method: 'POST', body }),
  segmentCounts: () => request('/merchants/customers/segments/counts'),
  inbox: () => request('/merchants/me/inbox'),
  inboxUnread: () => request('/merchants/me/inbox/unread-count'),
  markInboxRead: (mid) => request(`/merchants/me/inbox/${mid}/read`, { method: 'POST' }),

  // ── Branches ───────────────────────────────────────────────────────────
  branches: () => request('/merchants/me/branches'),
  createBranch: (body) => request('/merchants/me/branches', { method: 'POST', body }),
  updateBranch: (id, body) => request(`/merchants/me/branches/${id}`, { method: 'PATCH', body }),
  deleteBranch: (id) => request(`/merchants/me/branches/${id}`, { method: 'DELETE' }),

  // ── Staff ──────────────────────────────────────────────────────────────
  staff: () => request('/merchants/me/staff'),
  createStaff: (body) => request('/merchants/me/staff', { method: 'POST', body }),
  updateStaff: (id, body) => request(`/merchants/me/staff/${id}`, { method: 'PATCH', body }),
  deleteStaff: (id) => request(`/merchants/me/staff/${id}`, { method: 'DELETE' }),

  // ── Push / Notifications ───────────────────────────────────────────────
  pushTemplates: () => request('/merchants/me/notifications/templates'),
  createPushTemplate: (body) => request('/merchants/me/notifications/templates', { method: 'POST', body }),
  // {title, body, segment} → backend: {channel, title, body, target_segment}
  // Push banner rasmini yuklash → { url } (https). FormData multipart.
  uploadImage: async (file) => {
    const headers = {};
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE_URL}/merchants/me/upload-image`, {
      method: 'POST', headers, body: fd,
    });
    if (!res.ok) {
      let msg = 'Rasm yuklash xatosi';
      try { const j = await res.json(); msg = j.detail || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    return res.json();
  },
  broadcastPush: ({ title, body, segment, imageUrl, route, routeId }) => request('/merchants/me/notifications/broadcast', {
    method: 'POST', body: {
      channel: 'push', title, body, target_segment: segment || 'all',
      image_url: imageUrl || '', route: route || '', route_id: routeId || '',
    },
  }),
  broadcastSms: ({ body, segment }) => request('/merchants/me/notifications/broadcast', {
    method: 'POST', body: { channel: 'sms', body, target_segment: segment || 'all' },
  }),
  smsAudience: (segment) => request('/merchants/me/notifications/sms-audience', {
    method: 'POST', body: { target_segment: segment || 'all' },
  }),
  // Telegram bot orqali broadcast (botga ulangan mijozlarga)
  broadcastTelegram: ({ title, body, segment }) => request('/merchants/me/notifications/broadcast', {
    method: 'POST', body: { channel: 'telegram', title, body, target_segment: segment || 'all' },
  }),
  telegramAudience: (segment) => request('/merchants/me/notifications/telegram-audience', {
    method: 'POST', body: { target_segment: segment || 'all' },
  }),
  pushAudience: (segment) => request('/merchants/me/notifications/push-audience', {
    method: 'POST', body: { target_segment: segment || 'all' },
  }),
  pushLogs: () => request('/merchants/me/notifications/logs'),
  pushStats: () => request('/merchants/me/push-stats'),
  segmentTargetedPush: (body) => request('/merchants/campaigns/push', { method: 'POST', body }),

  // ── Tiers + Card design ────────────────────────────────────────────────
  tiers: () => request('/merchants/me/tiers'),
  saveTiers: (body) => request('/merchants/me/tiers', { method: 'PUT', body }),

  // ── Loyalty rules (mobil ilova bilan bir xil endpoint) ─────────────────
  loyaltyRules:        ()             => request('/merchants/me/loyalty/rules'),
  loyaltyRuleTypes:    ()             => request('/merchants/me/loyalty/rule-types'),
  createLoyaltyRule:   (body)         => request('/merchants/me/loyalty/rules', { method: 'POST', body }),
  updateLoyaltyRule:   (id, body)     => request(`/merchants/me/loyalty/rules/${id}`, { method: 'PATCH', body }),
  deleteLoyaltyRule:   (id)           => request(`/merchants/me/loyalty/rules/${id}`, { method: 'DELETE' }),
  toggleLoyaltyRule:   (id, isActive) => request(`/merchants/me/loyalty/rules/${id}/toggle`, { method: 'PATCH', body: { is_active: isActive } }),
  cardDesign: () => request('/merchants/me/card-design'),
  saveCardDesign: (body) => request('/merchants/me/card-design', { method: 'PUT', body }),

  // ── Reports ────────────────────────────────────────────────────────────
  monthlyReport: (year, month) => request(`/merchants/me/reports/monthly?year=${year}&month=${month}`),

  // ── API tokens (saytlar/botlar uchun integratsiya) ────────────────────
  apiTokensList:   () => request('/merchants/me/api-tokens'),
  apiTokensCreate: (name, expiresInDays) => request('/merchants/me/api-tokens', {
    method: 'POST',
    body: { name, ...(expiresInDays ? { expires_in_days: expiresInDays } : {}) },
  }),
  apiTokensRevoke: (id) => request(`/merchants/me/api-tokens/${id}`, { method: 'DELETE' }),

  // ── POS integratsiyalar ───────────────────────────────────────────────
  posList:       () => request('/merchants/me/pos-integrations'),
  posConnect:    (provider, credentials) => request('/merchants/me/pos-integrations', {
    method: 'POST', body: { provider, credentials },
  }),
  posTest:       (provider, credentials) => request('/merchants/me/pos-integrations/test', {
    method: 'POST', body: { provider, credentials },
  }),
  posDisconnect: (provider) => request(`/merchants/me/pos-integrations/${provider}`, { method: 'DELETE' }),
  posVerify:     (provider) => request(`/merchants/me/pos-integrations/${provider}/verify`, { method: 'POST', body: {} }),

  // ── AI yordamchi (to'liq ekranli chat, xotirasi bazada saqlanadi) ──────
  aiAssistantMessages: () => request('/merchant/ai-assistant/messages'),
  aiAssistantSend:     (message) => request('/merchant/ai-assistant', { method: 'POST', body: { message } }),
  aiAssistantClear:    () => request('/merchant/ai-assistant/messages', { method: 'DELETE' }),
};

export default api;
export { ApiError, BASE_URL };
