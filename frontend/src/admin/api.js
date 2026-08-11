const BASE = ''

function getToken() {
  return localStorage.getItem('admin_token')
}

class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized — sessiya tugagan')
    this.name = 'UnauthorizedError'
    this.status = 401
  }
}

// Navigate once, then reject all subsequent requests so `.then` chains don't
// receive `undefined`.  Individual callers can still catch and ignore.
function handle401() {
  localStorage.removeItem('admin_token')
  if (window.location.pathname !== '/panel' && window.location.pathname !== '/panel/login') {
    window.location.href = '/panel'
  }
  throw new UnauthorizedError()
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) handle401()

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }

  return res.json()
}

async function upload(path, file) {
  const token = getToken()
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: fd, // Content-Type'ni brauzer o'zi (boundary bilan) qo'yadi
  })
  if (res.status === 401) handle401()
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

async function download(path, filename) {
  const token = getToken()
  const res = await fetch(BASE + path, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  })
  if (res.status === 401) handle401()
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  patch:  (path, body)  => request('PATCH',  path, body),
  delete: (path)        => request('DELETE', path),
  upload,
  download,
}
