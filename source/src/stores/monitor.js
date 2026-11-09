import { reactive } from 'vue'
import {
  DEFAULT_HISTORY_HOURS,
  ONLINE_THRESHOLD_MS,
  STORAGE_KEYS,
  WS_FLUSH_MS,
  getApiBases,
  getJwtToken,
  getStoredServerBaseMap,
  getTurnstileVerified,
  isPublicConfig,
  redirectToAdmin,
  setStoredServerBaseMap,
  setTurnstileToken,
  setTurnstileVerified
} from '../utils/config'
import { ApiError, getAllBases, getJson, postJson } from '../utils/http'
import { createLiveSocket } from '../utils/ws'
import { autoLocale, locale, setLocale, t } from '../utils/i18n'
import { isServerOnline, normalizeTimestamp, serverRamPercent, serverDiskPercent, trafficPercent, monthTraffic } from '../utils/format'

const ACCENTS = ['aurora', 'emerald', 'sakura', 'amber']
const DENSITIES = ['comfortable', 'compact']
const THEME_MODES = ['auto', 'dark', 'light']
const VIEWS = ['grid', 'list']
const UI_PREF_KEY = 'cfsm-theme-ui'

// Per-browser appearance preferences. They are mirrored into
// `theme_options` when an admin is signed in, but a visitor without a
// token still keeps their choices across reloads.
function readUiPrefs() {
  try {
    const raw = localStorage.getItem(UI_PREF_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeUiPrefs() {
  try {
    localStorage.setItem(
      UI_PREF_KEY,
      JSON.stringify({
        accent: monitor.accent,
        density: monitor.density,
        sparkline: monitor.sparkline,
        view: monitor.view
      })
    )
  } catch {
    /* storage unavailable */
  }
}

export const DEFAULT_SYS_CONFIG = Object.freeze({
  show_price: true,
  show_expire: true,
  show_tf: true,
  show_three_net_details: true,
  display_mode: 'bar',
  latency_window: { points: 20, hours: 2 }
})

export const monitor = reactive({
  mode: 'dashboard',
  initialized: false,
  serversLoaded: false,
  ready: false,
  loading: true,
  error: '',
  config: null,
  version: '',
  servers: [],
  stats: {
    total: 0,
    online: 0,
    offline: 0,
    globalSpeedIn: 0,
    globalSpeedOut: 0,
    globalNetRx: 0,
    globalNetTx: 0
  },
  sysConfig: { ...DEFAULT_SYS_CONFIG },
  regionStats: {},
  connected: false,
  wsStatus: 'idle',
  wsTimeout: false,
  wsTimeoutDismissed: false,
  lastUpdate: 0,
  now: Date.now(),
  turnstileRequired: false,
  turnstileSiteKey: '',
  turnstileError: '',
  verifying: false,
  unauthorized: false,
  settingsMessage: '',
  themeMode: 'light',
  theme: 'light',
  accent: 'aurora',
  density: 'comfortable',
  sparkline: true,
  view: 'grid'
})

let configPromise = null
let serversPromise = null
let sockets = []
let flushTimer = null
let pendingUpdates = new Map()
let lastFlush = 0
let settingsTimer = null
let settingsMessageTimer = null
let unauthorizedHandled = false
let listenersBound = false
let clockTimer = null
const visibilityHandlers = new Set()

function bindListeners() {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true

  window.addEventListener('cfsm:unauthorized', () => {
    if (unauthorizedHandled) return
    unauthorizedHandled = true
    monitor.unauthorized = true
    monitor.turnstileRequired = false
    stopAllSockets()
    setTimeout(() => redirectToAdmin(), 450)
  })

  window.addEventListener('cfsm:forbidden', () => {
    monitor.turnstileRequired = true
    monitor.turnstileSiteKey = monitor.config?.turnstile_site_key || ''
    monitor.turnstileError = ''
    monitor.connected = false
    monitor.wsStatus = 'offline'
    if (monitor.config) monitor.config.verified = false
    stopAllSockets()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseAllSockets()
      monitor.connected = false
      monitor.wsStatus = 'paused'
      return
    }
    if (monitor.wsTimeout || monitor.wsTimeoutDismissed) return
    runVisibilityHandlers()
  })

  window.addEventListener('online', () => {
    if (document.visibilityState !== 'visible' || monitor.wsTimeout || monitor.wsTimeoutDismissed) return
    runVisibilityHandlers()
  })

  window.addEventListener('offline', () => {
    pauseAllSockets()
    monitor.connected = false
    monitor.wsStatus = 'offline'
  })

  const media = window.matchMedia('(prefers-color-scheme: light)')
  const onMediaChange = () => {
    if (monitor.themeMode === 'auto') applyAppearance()
  }
  if (media.addEventListener) media.addEventListener('change', onMediaChange)
  else media.addListener?.(onMediaChange)

  clockTimer = setInterval(() => {
    monitor.now = Date.now()
  }, 30000)
}

bindListeners()

function runVisibilityHandlers() {
  if (visibilityHandlers.size === 0) {
    if (monitor.servers.length) {
      loadServers().then(() => startAllSockets()).catch(() => {})
    }
    return
  }
  for (const handler of visibilityHandlers) {
    Promise.resolve(handler()).catch(() => {})
  }
}

export function registerVisibilityHandler(handler) {
  visibilityHandlers.add(handler)
  return () => visibilityHandlers.delete(handler)
}

export function setMonitorMode(mode) {
  monitor.mode = mode
}

function applyAppearance() {
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches
  const resolved = monitor.themeMode === 'auto'
    ? (prefersLight ? 'light' : 'dark')
    : monitor.themeMode
  monitor.theme = resolved
  document.documentElement.dataset.theme = resolved
  document.documentElement.dataset.accent = monitor.accent
  document.documentElement.dataset.density = monitor.density
  document.documentElement.dataset.sparkline = monitor.sparkline ? 'on' : 'off'
}

function applyConfig(config) {
  monitor.config = config
  monitor.version = config.version || ''
  monitor.turnstileSiteKey = config.turnstile_site_key || ''

  if (config.site_title) document.title = config.site_title
  if (!document.title || document.title === 'Aurora Monitor' || document.title === 'Monitor') {
    document.title = t('siteFallback')
  }

  let storedLocale = ''
  try {
    storedLocale = localStorage.getItem(STORAGE_KEYS.locale) || ''
  } catch {
    storedLocale = ''
  }
  if (!storedLocale) {
    const lang = String(config.default_language || '')
    if (lang === 'zh' || lang === 'en') setLocale(lang, { persist: false })
    else autoLocale()
  }

  const options = config.theme_options && typeof config.theme_options === 'object' ? config.theme_options : {}
  const local = readUiPrefs()

  // Local choices win, so an admin saving a default for everyone does not
  // overwrite what this browser already picked; the server value is the
  // fallback for a first visit.
  if (ACCENTS.includes(local.accent)) monitor.accent = local.accent
  else if (ACCENTS.includes(options.accent)) monitor.accent = options.accent

  if (DENSITIES.includes(local.density)) monitor.density = local.density
  else if (DENSITIES.includes(options.density)) monitor.density = options.density

  if (typeof local.sparkline === 'boolean') monitor.sparkline = local.sparkline
  else if (typeof options.sparkline === 'boolean') monitor.sparkline = options.sparkline

  if (VIEWS.includes(local.view)) monitor.view = local.view
  else if (VIEWS.includes(options.view)) monitor.view = options.view

  let storedTheme = ''
  try {
    storedTheme = localStorage.getItem(STORAGE_KEYS.theme) || ''
  } catch {
    storedTheme = ''
  }
  const preferred = storedTheme || 'light'
  monitor.themeMode = THEME_MODES.includes(preferred) ? preferred : 'light'
  applyAppearance()
}

function setSettingsMessage(message) {
  monitor.settingsMessage = message
  clearTimeout(settingsMessageTimer)
  settingsMessageTimer = setTimeout(() => {
    monitor.settingsMessage = ''
  }, 2600)
}

function scheduleThemeSave() {
  clearTimeout(settingsTimer)
  settingsTimer = setTimeout(saveThemeOptions, 450)
}

async function saveThemeOptions() {
  if (!monitor.config?.authorization || !getJwtToken()) {
    setSettingsMessage(t('settingsLocal'))
    return
  }
  try {
    const base = getApiBases()[0]
    const payload = {
      ...(monitor.config.theme_options || {}),
      accent: monitor.accent,
      density: monitor.density,
      sparkline: monitor.sparkline,
      view: monitor.view
    }
    const data = await postJson(base, '/api/theme_options', { theme_options: payload }, { auth: true, turnstile: true })
    if (data?.theme_options && typeof data.theme_options === 'object') {
      monitor.config.theme_options = data.theme_options
    }
    setSettingsMessage(t('settingsSaved'))
  } catch (error) {
    if (error?.status !== 401 && error?.status !== 403) {
      setSettingsMessage(error?.message || t('loadFailed'))
    }
  }
}

export function setThemeMode(mode) {
  const next = THEME_MODES.includes(mode) ? mode : 'auto'
  monitor.themeMode = next
  try {
    localStorage.setItem(STORAGE_KEYS.theme, next)
  } catch {
    /* storage unavailable */
  }
  applyAppearance()
}

export function toggleTheme() {
  setThemeMode(monitor.theme === 'dark' ? 'light' : 'dark')
}

export function setAccent(accent) {
  if (!ACCENTS.includes(accent)) return
  monitor.accent = accent
  applyAppearance()
  writeUiPrefs()
  scheduleThemeSave()
}

export function setDensity(density) {
  if (!DENSITIES.includes(density)) return
  monitor.density = density
  applyAppearance()
  writeUiPrefs()
  scheduleThemeSave()
}

export function setSparkline(enabled) {
  monitor.sparkline = Boolean(enabled)
  applyAppearance()
  writeUiPrefs()
  scheduleThemeSave()
}

export function setView(view) {
  if (!VIEWS.includes(view)) return
  monitor.view = view
  writeUiPrefs()
  scheduleThemeSave()
}

export function changeLocale(value) {
  setLocale(value)
}

export async function ensureConfig({ force = false } = {}) {
  if (monitor.config && !force) return monitor.config
  if (configPromise) return configPromise

  configPromise = (async () => {
    const bases = getApiBases()
    let lastError = null
    for (const base of bases) {
      try {
        const config = await getJson(base, '/api/config', { auth: true, turnstile: true, timeout: 15000 })
        if (!config || typeof config !== 'object') throw new ApiError('Invalid config response')
        applyConfig(config)
        unauthorizedHandled = false

        const verified = config.verified === true || Boolean(config.turnstile_verified)
        if (config.turnstile_verified) setTurnstileVerified(config.turnstile_verified)

        const needsTurnstile = (config.turnstile_enabled === true || config.turnstile_enabled === 'true') && !verified
        monitor.turnstileRequired = needsTurnstile
        monitor.turnstileSiteKey = config.turnstile_site_key || ''

        if (!isPublicConfig(config) && config.authorization !== true && config.authorization !== 'true') {
          monitor.unauthorized = true
          setTimeout(() => redirectToAdmin(), 500)
          return null
        }
        return config
      } catch (error) {
        lastError = error
        if (error?.status === 401 || error?.status === 403) return null
      }
    }
    throw lastError || new ApiError('Unable to load site configuration')
  })().finally(() => {
    configPromise = null
  })

  return configPromise
}

async function loadServers() {
  if (serversPromise) return serversPromise

  serversPromise = (async () => {
    const results = await getAllBases('/api/servers', { auth: true, turnstile: true, timeout: 20000 })
    const mergedServers = []
    const mergedStats = {
      total: 0,
      online: 0,
      offline: 0,
      globalSpeedIn: 0,
      globalSpeedOut: 0,
      globalNetRx: 0,
      globalNetTx: 0
    }
    const mergedRegions = {}
    let sysConfig = null
    let successCount = 0
    let lastError = null

    for (const result of results) {
      if (result.error) {
        lastError = result.error
        continue
      }
      const data = result.data || {}
      successCount += 1

      let list = []
      if (Array.isArray(data.servers)) {
        list = data.servers
      } else if (data.latestMetricsMap && typeof data.latestMetricsMap === 'object') {
        list = Object.entries(data.latestMetricsMap).map(([id, metrics]) => ({ id, ...metrics }))
      }

      for (const raw of list) {
        if (!raw || !raw.id) continue
        mergedServers.push(normalizeServer(raw, result.base))
      }

      if (data.stats) {
        mergedStats.total += Number(data.stats.total) || 0
        mergedStats.online += Number(data.stats.online) || 0
        mergedStats.offline += Number(data.stats.offline) || 0
        mergedStats.globalSpeedIn += Number(data.stats.globalSpeedIn) || 0
        mergedStats.globalSpeedOut += Number(data.stats.globalSpeedOut) || 0
        mergedStats.globalNetRx += Number(data.stats.globalNetRx) || 0
        mergedStats.globalNetTx += Number(data.stats.globalNetTx) || 0
      }

      if (data.regionStats && typeof data.regionStats === 'object') {
        for (const [code, count] of Object.entries(data.regionStats)) {
          mergedRegions[code] = (Number(mergedRegions[code]) || 0) + (Number(count) || 0)
        }
      }

      if (!sysConfig && data.sysConfig) {
        sysConfig = { ...DEFAULT_SYS_CONFIG, ...data.sysConfig }
      }
    }

    if (successCount === 0) {
      throw lastError || new ApiError('Unable to load servers')
    }

    if (!mergedStats.total && mergedStats.online === 0 && mergedStats.offline === 0) {
      mergedStats.total = mergedServers.length
      mergedStats.online = mergedServers.filter((server) => isServerOnline(server)).length
      mergedStats.offline = mergedStats.total - mergedStats.online
    }
    if (!mergedStats.globalSpeedIn) {
      mergedStats.globalSpeedIn = mergedServers.reduce((sum, server) => sum + (Number(server.net_in_speed) || 0), 0)
    }
    if (!mergedStats.globalSpeedOut) {
      mergedStats.globalSpeedOut = mergedServers.reduce((sum, server) => sum + (Number(server.net_out_speed) || 0), 0)
    }
    if (!mergedStats.globalNetRx) {
      mergedStats.globalNetRx = mergedServers.reduce((sum, server) => sum + (Number(server.net_rx) || 0), 0)
    }
    if (!mergedStats.globalNetTx) {
      mergedStats.globalNetTx = mergedServers.reduce((sum, server) => sum + (Number(server.net_tx) || 0), 0)
    }

    monitor.servers = mergedServers
    monitor.stats = mergedStats
    monitor.regionStats = mergedRegions
    monitor.sysConfig = { ...DEFAULT_SYS_CONFIG, ...(sysConfig || {}) }
    monitor.lastUpdate = Date.now()
    monitor.now = Date.now()
    monitor.error = ''
    monitor.initialized = true
    monitor.serversLoaded = true

    const baseMap = { ...getStoredServerBaseMap() }
    for (const server of mergedServers) baseMap[server.id] = server.source
    setStoredServerBaseMap(baseMap)

    return mergedServers
  })().finally(() => {
    serversPromise = null
  })

  return serversPromise
}

function normalizeServer(raw, base) {
  const server = { ...raw, source: base }
  server.last_updated = normalizeTimestamp(server.last_updated)
  const reportTimestamp = normalizeTimestamp(server.report_timestamp)
  if (reportTimestamp) server.report_timestamp = reportTimestamp
  else delete server.report_timestamp
  server.cpu = Number(server.cpu) || 0
  for (const key of ['ram_total', 'ram_used', 'swap_total', 'swap_used', 'disk_total', 'disk_used', 'net_in_speed', 'net_out_speed', 'net_rx', 'net_tx', 'net_rx_monthly', 'net_tx_monthly', 'uptime']) {
    if (server[key] !== undefined) server[key] = Number(server[key]) || 0
  }
  const load = String(server.load_avg || '').trim().split(/\s+/).map(Number)
  if (server.load_1 === undefined) server.load_1 = Number(server.load_1 ?? load[0]) || 0
  if (server.load_5 === undefined) server.load_5 = Number(server.load_5 ?? load[1]) || 0
  if (server.load_15 === undefined) server.load_15 = Number(server.load_15 ?? load[2]) || 0
  server.process_count = server.process_count ?? server.processes ?? 0
  server.tcp_conn_count = server.tcp_conn_count ?? server.tcp_conn ?? 0
  server.udp_conn_count = server.udp_conn_count ?? server.udp_conn ?? 0
  return server
}

function queueUpdate(serverId, data, ts) {
  if (!serverId || !data) return
  const clean = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) clean[key] = value
  }
  const previous = pendingUpdates.get(serverId)
  pendingUpdates.set(serverId, {
    data: { ...(previous?.data || {}), ...clean },
    ts: ts || Date.now()
  })
  if (flushTimer) return
  const wait = Math.max(16, WS_FLUSH_MS - (Date.now() - lastFlush))
  flushTimer = setTimeout(flushUpdates, wait)
}

function flushUpdates() {
  flushTimer = null
  lastFlush = Date.now()
  if (!pendingUpdates.size) return

  const byId = new Map(monitor.servers.map((server) => [server.id, server]))
  const touched = new Set()
  for (const [id, entry] of pendingUpdates) {
    const server = byId.get(id)
    if (!server) continue
    for (const [key, value] of Object.entries(entry.data)) {
      if (value !== undefined) server[key] = value
    }
    const receivedAt = Date.now()
    server.last_updated = receivedAt
    server.report_timestamp = normalizeTimestamp(entry.ts) || receivedAt
    server.is_online = true
    touched.add(id)
  }
  pendingUpdates.clear()

  if (touched.size > 0) {
    monitor.lastUpdate = Date.now()
    monitor.now = Date.now()
  }
}

function aggregateSocketStatus() {
  const statuses = sockets.map((entry) => entry.status)
  monitor.connected = statuses.includes('online')
  if (statuses.includes('online')) monitor.wsStatus = 'online'
  else if (statuses.includes('timeout')) monitor.wsStatus = 'timeout'
  else if (statuses.includes('reconnecting') || statuses.includes('connecting')) monitor.wsStatus = 'reconnecting'
  else if (statuses.includes('paused')) monitor.wsStatus = 'paused'
  else if (statuses.length) monitor.wsStatus = 'offline'
  else monitor.wsStatus = 'idle'
}

function createSocketEntry(base, subscribe, ids) {
  const entry = { status: 'connecting', socket: null }
  const timeoutMinutes = Number(monitor.config?.frontend_ws_timeout_minutes) || 0
  entry.socket = createLiveSocket({
    base,
    subscribe,
    ids,
    getToken: getJwtToken,
    timeoutMinutes,
    onUpdate: queueUpdate,
    onStatus: (status) => {
      entry.status = status
      aggregateSocketStatus()
    },
    onTimeout: () => {
      monitor.wsTimeout = true
      monitor.wsTimeoutDismissed = false
      monitor.connected = false
      monitor.wsStatus = 'timeout'
    }
  })
  sockets.push(entry)
  return entry
}

export function startAllSockets() {
  monitor.wsTimeout = false
  monitor.wsTimeoutDismissed = false
  stopAllSockets()
  if (!monitor.servers.length) {
    monitor.wsStatus = 'idle'
    return
  }

  const bases = getApiBases()
  const grouped = new Map()
  for (const server of monitor.servers) {
    const base = server.source || bases[0]
    if (!grouped.has(base)) grouped.set(base, [])
    grouped.get(base).push(server.id)
  }

  for (const [base, allIds] of grouped) {
    const unique = [...new Set(allIds)]
    for (let offset = 0; offset < unique.length; offset += 500) {
      const ids = unique.slice(offset, offset + 500)
      if (ids.length) createSocketEntry(base, 'all', ids)
    }
  }
  aggregateSocketStatus()
}

export function startServerSocket(base, id, handlers = {}) {
  monitor.wsTimeout = false
  monitor.wsTimeoutDismissed = false
  stopAllSockets()
  const entry = { status: 'connecting', socket: null }
  const timeoutMinutes = Number(monitor.config?.frontend_ws_timeout_minutes) || 0
  entry.socket = createLiveSocket({
    base,
    subscribe: id,
    ids: [],
    getToken: getJwtToken,
    timeoutMinutes,
    onUpdate: (...args) => {
      queueUpdate(...args)
      handlers.onUpdate?.(...args)
    },
    onStatus: (status) => {
      entry.status = status
      aggregateSocketStatus()
      handlers.onStatus?.(status)
    },
    onTimeout: () => {
      monitor.wsTimeout = true
      monitor.wsTimeoutDismissed = false
      monitor.connected = false
      monitor.wsStatus = 'timeout'
      handlers.onTimeout?.()
    }
  })
  sockets.push(entry)
  aggregateSocketStatus()
  return entry
}

export function pauseAllSockets() {
  for (const entry of sockets) entry.socket?.pause()
}

export function resumeAllSockets() {
  monitor.wsTimeout = false
  monitor.wsTimeoutDismissed = false
  for (const entry of sockets) {
    entry.socket?.resume()
  }
  if (!sockets.length && monitor.servers.length) startAllSockets()
}

export function dismissWsTimeout() {
  monitor.wsTimeout = false
  monitor.wsTimeoutDismissed = true
  stopAllSockets()
  monitor.wsStatus = 'paused'
}

export function stopAllSockets() {
  for (const entry of sockets) entry.socket?.close()
  sockets = []
  clearTimeout(flushTimer)
  flushTimer = null
  pendingUpdates.clear()
  monitor.connected = false
  monitor.wsStatus = 'idle'
}

export async function initMonitor() {
  monitor.loading = !monitor.ready || (monitor.mode !== 'detail' && !monitor.serversLoaded)
  monitor.error = ''
  try {
    const config = await ensureConfig()
    if (!config) {
      monitor.loading = false
      return false
    }
    if (monitor.turnstileRequired) {
      monitor.loading = false
      return false
    }
    await continueBoot()
    return true
  } catch (error) {
    monitor.loading = false
    monitor.ready = false
    monitor.error = error?.message || t('loadFailed')
    return false
  }
}

async function continueBoot() {
  if (monitor.mode === 'detail') {
    monitor.loading = false
    monitor.ready = true
    monitor.initialized = true
    window.dispatchEvent(new CustomEvent('cfsm:verified'))
    return
  }
  if (monitor.serversLoaded) {
    startAllSockets()
    monitor.loading = false
    monitor.ready = true
    monitor.error = ''
    return
  }
  await loadServers()
  startAllSockets()
  monitor.loading = false
  monitor.ready = true
  monitor.error = ''
}

export async function verifyTurnstile(token) {
  monitor.verifying = true
  monitor.turnstileError = ''
  setTurnstileToken(token)
  try {
    const base = getApiBases()[0]
    const config = await getJson(base, '/api/config', { auth: true, turnstile: true, timeout: 20000 })
    const verified = config?.verified === true || Boolean(config?.turnstile_verified)
    if (!verified) {
      monitor.turnstileError = t('turnstileError')
      return false
    }
    if (config.turnstile_verified) setTurnstileVerified(config.turnstile_verified)
    setTurnstileToken('')
    applyConfig(config)
    monitor.turnstileRequired = false
    monitor.unauthorized = false
    unauthorizedHandled = false
    if (!isPublicConfig(config) && config.authorization !== true && config.authorization !== 'true') {
      redirectToAdmin()
      return false
    }
    await continueBoot()
    return true
  } catch (error) {
    monitor.turnstileError = error?.status === 403 ? t('turnstileError') : (error?.message || t('turnstileError'))
    return false
  } finally {
    monitor.verifying = false
  }
}

export async function retryMonitor() {
  monitor.error = ''
  if (!monitor.config) return initMonitor()
  if (monitor.turnstileRequired) return false
  monitor.loading = true
  try {
    await continueBoot()
    return true
  } catch (error) {
    monitor.error = error?.message || t('loadFailed')
    monitor.loading = false
    return false
  }
}

export async function refreshDashboard() {
  try {
    await loadServers()
    startAllSockets()
  } catch (error) {
    if (error?.status !== 401 && error?.status !== 403) {
      monitor.error = error?.message || t('loadFailed')
    }
  }
}

export async function fetchServer(id) {
  const bases = getApiBases()
  const map = getStoredServerBaseMap()
  const preferred = map[id]
  const ordered = preferred ? [preferred, ...bases.filter((base) => base !== preferred)] : bases
  let lastError = null

  for (const base of ordered) {
    try {
      const data = await getJson(base, `/api/server?id=${encodeURIComponent(id)}`, { auth: true, turnstile: true, timeout: 20000 })
      if (!data || typeof data !== 'object') continue
      const server = data.server && !data.id ? data.server : data
      return { server: normalizeServer(server, base), base }
    } catch (error) {
      lastError = error
      if (error?.status === 404) continue
      if (error?.status === 401 || error?.status === 403) throw error
    }
  }
  throw lastError || new ApiError('Server not found', { status: 404 })
}

export async function fetchHistory(base, id, hours = DEFAULT_HISTORY_HOURS) {
  const data = await getJson(
    base,
    `/api/history/all?id=${encodeURIComponent(id)}&hours=${hours}`,
    { auth: true, turnstile: true, timeout: 30000 }
  )
  if (!Array.isArray(data)) return []
  return data
    .map((row) => ({
      ...row,
      timestamp: normalizeTimestamp(row.timestamp ?? row.ts)
    }))
    .filter((row) => row.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp)
}

export function getServerCardMetrics(server) {
  return {
    ramPercent: serverRamPercent(server),
    diskPercent: serverDiskPercent(server),
    trafficPercent: trafficPercent(server),
    monthTraffic: monthTraffic(server),
    online: isServerOnline(server, monitor.now)
  }
}

export { ONLINE_THRESHOLD_MS, locale }
