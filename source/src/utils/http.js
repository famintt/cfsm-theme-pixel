import {
  apiUrl,
  getApiBases,
  getJwtToken,
  getTurnstileToken,
  getTurnstileVerified,
  setTurnstileToken,
  setTurnstileVerified
} from './config'

export class ApiError extends Error {
  constructor(message, { status = 0, code = '', payload = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.payload = payload
  }
}

function emit(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }))
  } catch {
    /* ignore */
  }
}

function buildHeaders({ auth, turnstile, body }) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = getJwtToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  if (turnstile) {
    const verified = getTurnstileVerified()
    const token = getTurnstileToken()
    if (verified) headers['X-Turnstile-Verified'] = verified
    else if (token) headers['X-Turnstile-Token'] = token
  }
  return headers
}

export async function request(base, path, options = {}) {
  const {
    method = 'GET',
    body,
    auth = true,
    turnstile = true,
    timeout = 15000,
    signal
  } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const abortFromOutside = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', abortFromOutside, { once: true })
  }

  try {
    const response = await fetch(apiUrl(base, path), {
      method,
      headers: buildHeaders({ auth, turnstile, body }),
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal: controller.signal
    })

    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }

    if (!response.ok) {
      const message = payload?.message || payload?.error || `HTTP ${response.status}`
      const code = payload?.code || ''
      if (response.status === 401) {
        emit('cfsm:unauthorized', { base, path, status: 401 })
      } else if (response.status === 403) {
        setTurnstileVerified('')
        setTurnstileToken('')
        emit('cfsm:forbidden', { base, path, status: 403 })
      }
      throw new ApiError(message, { status: response.status, code, payload })
    }

    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error?.name === 'AbortError') {
      throw new ApiError('Request timeout', { status: 0, code: 'TIMEOUT' })
    }
    throw new ApiError(error?.message || 'Network error', { status: 0, code: 'NETWORK' })
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', abortFromOutside)
  }
}

export function getJson(base, path, options = {}) {
  return request(base, path, { ...options, method: 'GET' })
}

export async function getAllBases(path, options = {}) {
  const bases = getApiBases()
  return Promise.all(
    bases.map(async (base) => {
      try {
        const data = await getJson(base, path, options)
        return { base, data, error: null }
      } catch (error) {
        return { base, data: null, error }
      }
    })
  )
}

export function postJson(base, path, body, options = {}) {
  return request(base, path, { ...options, method: 'POST', body })
}
