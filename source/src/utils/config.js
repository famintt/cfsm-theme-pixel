export const STORAGE_KEYS = Object.freeze({
  jwt: 'jwt_token',
  turnstileToken: 'turnstile_token',
  turnstileVerified: 'turnstile_verified',
  theme: 'theme_preference_v2',
  locale: 'cfsm_theme_locale',
  serverBase: 'cfsm_server_base_map'
})

export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000
export const WS_FLUSH_MS = 1000
export const DEFAULT_HISTORY_HOURS = 0.167

function normalizeBase(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw === '/') return window.location.origin
  try {
    return new URL(raw, window.location.origin).toString().replace(/\/+$/, '')
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

export function getApiBases() {
  const meta = document.querySelector('meta[name="apiBase"]')
  const content = meta?.getAttribute('content')?.trim() || ''
  const bases = content
    .split(',')
    .map((item) => normalizeBase(item))
    .filter(Boolean)
  if (bases.length > 0) return [...new Set(bases)]
  return [window.location.origin]
}

export function isExternalApiBase() {
  const bases = getApiBases()
  return bases.some((base) => {
    try {
      return new URL(base).origin !== window.location.origin
    } catch {
      return false
    }
  })
}

export function apiUrl(base, path) {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function publicAssetUrl(path) {
  const clean = String(path || '').replace(/^\/+/, '')
  if (!clean) return './'
  const base = getApiBases()[0]
  try {
    const url = new URL(base)
    if (url.origin !== window.location.origin) return `${url.origin}/${clean}`
  } catch {
    /* fall back to the same-origin default skin */
  }
  return `/${clean}`
}

export function getWsUrl(base, { subscribe = 'all', token = '' } = {}) {
  const url = new URL(base || window.location.origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/ws`
  const params = new URLSearchParams({ subscribe })
  if (token) params.set('token', token)
  url.search = params.toString()
  return url.toString()
}

export function getJwtToken() {
  try {
    return localStorage.getItem(STORAGE_KEYS.jwt) || ''
  } catch {
    return ''
  }
}

export function getTurnstileVerified() {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.turnstileVerified) || ''
  } catch {
    return ''
  }
}

export function setTurnstileVerified(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEYS.turnstileVerified, value)
    else sessionStorage.removeItem(STORAGE_KEYS.turnstileVerified)
  } catch {
    /* storage unavailable */
  }
}

export function getTurnstileToken() {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.turnstileToken) || ''
  } catch {
    return ''
  }
}

export function setTurnstileToken(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEYS.turnstileToken, value)
    else sessionStorage.removeItem(STORAGE_KEYS.turnstileToken)
  } catch {
    /* storage unavailable */
  }
}

export function clearAuthState() {
  try {
    localStorage.removeItem(STORAGE_KEYS.jwt)
  } catch {
    /* storage unavailable */
  }
  setTurnstileVerified('')
  setTurnstileToken('')
}

export function adminUrl() {
  const base = getApiBases()[0]
  try {
    const url = new URL(base)
    if (url.origin !== window.location.origin) return `${url.origin}/admin#/admin`
  } catch {
    /* fall back to same-origin admin */
  }
  return '/admin#/admin'
}

export function redirectToAdmin() {
  if (window.location.pathname.startsWith('/admin')) return
  window.location.replace(adminUrl())
}

export function isPublicConfig(config) {
  if (!config) return true
  return String(config.is_public) === 'true' || config.is_public === true
}

export function getStoredServerBaseMap() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.serverBase)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function setStoredServerBaseMap(map) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.serverBase, JSON.stringify(map))
  } catch {
    /* storage unavailable */
  }
}
