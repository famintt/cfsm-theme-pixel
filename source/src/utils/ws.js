import { getWsUrl } from './config'

const MAX_RECONNECTS = 8

export function createLiveSocket({
  base,
  subscribe = 'all',
  ids = [],
  getToken,
  timeoutMinutes = 0,
  onUpdate,
  onStatus,
  onTimeout,
  onError
}) {
  let socket = null
  let closed = false
  let paused = false
  let attempts = 0
  let reconnectTimer = null
  let lifetimeTimer = null
  let state = 'idle'

  let crossOrigin = false
  try {
    crossOrigin = new URL(base).origin !== window.location.origin
  } catch {
    crossOrigin = false
  }

  function setState(next, detail = {}) {
    state = next
    onStatus?.(next, detail)
  }

  function buildUrl() {
    const token = crossOrigin ? getToken?.() || '' : ''
    return getWsUrl(base, { subscribe, token })
  }

  function clearTimers() {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    clearTimeout(lifetimeTimer)
    lifetimeTimer = null
  }

  function armLifetime() {
    clearTimeout(lifetimeTimer)
    const minutes = Number(timeoutMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) return
    lifetimeTimer = setTimeout(() => {
      if (closed || paused) return
      paused = true
      clearTimers()
      const current = socket
      socket = null
      try {
        current?.close(1000, 'timed out')
      } catch {
        /* ignore */
      }
      setState('timeout')
      onTimeout?.()
    }, minutes * 60 * 1000)
  }

  function scheduleReconnect() {
    if (closed || paused) return
    if (attempts >= MAX_RECONNECTS) {
      setState('failed', { attempts })
      return
    }
    const delay = Math.min(30000, 1000 * 2 ** attempts) + Math.floor(Math.random() * 400)
    attempts += 1
    setState('reconnecting', { attempts })
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, delay)
  }

  function connect() {
    if (closed || paused) return
    reconnectTimer = null
    setState(attempts ? 'reconnecting' : 'connecting', { attempts })

    let nextSocket
    try {
      nextSocket = new WebSocket(buildUrl())
    } catch {
      scheduleReconnect()
      return
    }
    socket = nextSocket

    nextSocket.onopen = () => {
      if (socket !== nextSocket) return
      attempts = 0
      setState('online')
      if (subscribe === 'all') {
        try {
          nextSocket.send(JSON.stringify({ type: 'subscribe', scope: 'all', ids }))
        } catch {
          /* ignore */
        }
      }
      armLifetime()
    }

    nextSocket.onmessage = (event) => {
      let message
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      if (message?.type === 'batchUpdate') {
        for (const update of message.updates || []) {
          for (const sample of update.samples || []) {
            const data = sample?.data || sample?.payload || sample?.metrics
            if (data) onUpdate?.(update.serverId, data, sample.ts || message.ts)
          }
        }
      } else if (message?.type === 'error') {
        onError?.(message)
      }
    }

    nextSocket.onclose = (event) => {
      if (socket === nextSocket) socket = null
      clearTimeout(lifetimeTimer)
      lifetimeTimer = null
      if (closed) return
      if (!paused) {
        setState('offline', { code: event.code })
        if (event.code === 1008 || event.code === 4401 || event.code === 4403) {
          setState('failed', { code: event.code })
          return
        }
        scheduleReconnect()
      }
    }

    nextSocket.onerror = () => {
      /* onclose handles retry */
    }
  }

  function closeSilently() {
    const current = socket
    socket = null
    if (current) {
      try {
        current.close(1000, 'client close')
      } catch {
        /* ignore */
      }
    }
  }

  function pause() {
    if (closed) return
    paused = true
    clearTimers()
    closeSilently()
    setState('paused')
  }

  function resume() {
    if (closed) return
    paused = false
    attempts = 0
    clearTimers()
    closeSilently()
    connect()
  }

  function close() {
    closed = true
    paused = false
    clearTimers()
    closeSilently()
    setState('closed')
  }

  connect()

  return {
    pause,
    resume,
    close,
    get state() {
      return state
    }
  }
}
