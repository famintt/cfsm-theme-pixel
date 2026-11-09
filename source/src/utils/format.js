import { ONLINE_THRESHOLD_MS, publicAssetUrl } from './config'

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export const LATENCY_ROUTES = Object.freeze([
  { key: 'ct', label: 'CT', ping: 'ping_ct', loss: 'loss_ct', color: '#1c1c1c' },
  { key: 'cu', label: 'CU', ping: 'ping_cu', loss: 'loss_cu', color: '#525252' },
  { key: 'cm', label: 'CM', ping: 'ping_cm', loss: 'loss_cm', color: '#8a8a8a' },
  { key: 'bd', label: 'BGP', ping: 'ping_bd', loss: 'loss_bd', color: '#b5b5b5' }
])

const REGION_NAMES = {
  zh: {
    CN: '中国', HK: '香港', TW: '台湾', MO: '澳门', JP: '日本', KR: '韩国', SG: '新加坡',
    US: '美国', CA: '加拿大', MX: '墨西哥', BR: '巴西', AR: '阿根廷', CL: '智利',
    GB: '英国', DE: '德国', FR: '法国', NL: '荷兰', BE: '比利时', LU: '卢森堡',
    CH: '瑞士', AT: '奥地利', SE: '瑞典', NO: '挪威', DK: '丹麦', FI: '芬兰',
    IS: '冰岛', IE: '爱尔兰', IT: '意大利', ES: '西班牙', PT: '葡萄牙', PL: '波兰',
    CZ: '捷克', SK: '斯洛伐克', HU: '匈牙利', RO: '罗马尼亚', BG: '保加利亚',
    GR: '希腊', UA: '乌克兰', RU: '俄罗斯', TR: '土耳其', IL: '以色列',
    AE: '阿联酋', SA: '沙特', QA: '卡塔尔', IN: '印度', PK: '巴基斯坦',
    BD: '孟加拉', LK: '斯里兰卡', TH: '泰国', VN: '越南', MY: '马来西亚',
    ID: '印度尼西亚', PH: '菲律宾', AU: '澳大利亚', NZ: '新西兰', ZA: '南非',
    NG: '尼日利亚', EG: '埃及', KE: '肯尼亚', KZ: '哈萨克斯坦', MN: '蒙古'
  },
  en: {
    CN: 'China', HK: 'Hong Kong', TW: 'Taiwan', MO: 'Macau', JP: 'Japan', KR: 'South Korea',
    SG: 'Singapore', US: 'United States', CA: 'Canada', MX: 'Mexico', BR: 'Brazil',
    AR: 'Argentina', CL: 'Chile', GB: 'United Kingdom', DE: 'Germany', FR: 'France',
    NL: 'Netherlands', BE: 'Belgium', LU: 'Luxembourg', CH: 'Switzerland',
    AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland',
    IS: 'Iceland', IE: 'Ireland', IT: 'Italy', ES: 'Spain', PT: 'Portugal',
    PL: 'Poland', CZ: 'Czechia', SK: 'Slovakia', HU: 'Hungary', RO: 'Romania',
    BG: 'Bulgaria', GR: 'Greece', UA: 'Ukraine', RU: 'Russia', TR: 'Turkey',
    IL: 'Israel', AE: 'UAE', SA: 'Saudi Arabia', QA: 'Qatar', IN: 'India',
    PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka', TH: 'Thailand',
    VN: 'Vietnam', MY: 'Malaysia', ID: 'Indonesia', PH: 'Philippines',
    AU: 'Australia', NZ: 'New Zealand', ZA: 'South Africa', NG: 'Nigeria',
    EG: 'Egypt', KE: 'Kenya', KZ: 'Kazakhstan', MN: 'Mongolia'
  }
}

const BILLING_CYCLES = {
  month: { zh: '月付', en: 'Monthly', shortZh: '月', shortEn: 'M' },
  quarter: { zh: '季付', en: 'Quarterly', shortZh: '季', shortEn: 'Q' },
  half_year: { zh: '半年付', en: 'Half-yearly', shortZh: '半年', shortEn: 'HY' },
  year: { zh: '年付', en: 'Yearly', shortZh: '年', shortEn: 'Y' },
  two_years: { zh: '两年付', en: 'Biennial', shortZh: '2年', shortEn: '2Y' },
  three_years: { zh: '三年付', en: 'Triennial', shortZh: '3年', shortEn: '3Y' },
  four_years: { zh: '四年付', en: 'Four years', shortZh: '4年', shortEn: '4Y' },
  five_years: { zh: '五年付', en: 'Five years', shortZh: '5年', shortEn: '5Y' }
}

const OS_META = [
  { test: /istoreos/i, image: 'os-istore.png', label: 'iStoreOS' },
  { test: /immortalwrt/i, image: 'os-openwrt.svg', label: 'ImmortalWrt' },
  { test: /openwrt/i, image: 'os-openwrt.svg', label: 'OpenWrt' },
  { test: /proxmox/i, image: 'os-proxmox.ico', label: 'Proxmox VE' },
  { test: /synology|dsm/i, image: 'os-synology.ico', label: 'Synology DSM' },
  { test: /alpine/i, image: 'os-alpine.webp', label: 'Alpine Linux' },
  { test: /arch/i, image: 'os-arch.svg', label: 'Arch Linux' },
  { test: /armbian/i, image: 'os-armbian.png', label: 'Armbian' },
  { test: /ubuntu/i, image: 'os-ubuntu.svg', label: 'Ubuntu' },
  { test: /debian/i, image: 'os-debian.svg', label: 'Debian' },
  { test: /centos/i, image: 'os-centos.svg', label: 'CentOS' },
  { test: /rocky/i, image: 'os-rocky.svg', label: 'Rocky Linux' },
  { test: /alma/i, image: 'os-alma.svg', label: 'AlmaLinux' },
  { test: /fedora/i, image: 'os-fedora.svg', label: 'Fedora' },
  { test: /opensuse|suse/i, image: 'os-openSUSE.svg', label: 'openSUSE' },
  { test: /gentoo/i, image: 'os-gentoo.svg', label: 'Gentoo' },
  { test: /nixos/i, image: 'os-nix.svg', label: 'NixOS' },
  { test: /mint/i, image: 'os-mint.svg', label: 'Linux Mint' },
  { test: /manjaro/i, image: 'os-manjaro-.svg', label: 'Manjaro' },
  { test: /kali/i, image: 'os-kail.svg', label: 'Kali Linux' },
  { test: /oracle/i, image: 'os-oracle.svg', label: 'Oracle Linux' },
  { test: /red\s*hat|rhel/i, image: 'os-redhat.svg', label: 'Red Hat' },
  { test: /opencloud/i, image: 'os-opencloud.svg', label: 'OpenCloudOS' },
  { test: /alibaba|aliyun/i, image: 'os-alibaba.svg', label: 'Alibaba Cloud Linux' },
  { test: /macos|darwin|osx/i, image: 'os-macos.svg', label: 'macOS' },
  { test: /windows/i, image: 'os-windows.svg', label: 'Windows' }
]

export function formatBytes(bytes, digits = 1) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), BYTE_UNITS.length - 1)
  const scaled = value / 1024 ** index
  const fixed = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(digits)
  return `${Number(fixed)} ${BYTE_UNITS[index]}`
}

export function formatSpeed(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatNumber(value, digits = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function clampPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, number))
}

export function percent(used, total) {
  const totalNumber = Number(total)
  if (!Number.isFinite(totalNumber) || totalNumber <= 0) return 0
  return clampPercent((Number(used) / totalNumber) * 100)
}

export function serverRamPercent(server) {
  return percent(server?.ram_used, server?.ram_total)
}

export function serverDiskPercent(server) {
  return percent(server?.disk_used, server?.disk_total)
}

export function serverSwapPercent(server) {
  return percent(server?.swap_used, server?.swap_total)
}

export function monthTraffic(server) {
  return (Number(server?.net_rx_monthly) || 0) + (Number(server?.net_tx_monthly) || 0)
}

export function trafficLimitBytes(server) {
  const raw = server?.traffic_limit
  if (raw === undefined || raw === null || raw === '') return 0
  if (typeof raw === 'number') return raw > 0 ? raw * 1024 ** 3 : 0
  const text = String(raw).trim().toUpperCase()
  const match = text.match(/^([\d.]+)\s*(TB|T|GB|G|MB|M|KB|K|B)?$/)
  if (!match) return 0
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return 0
  const unit = match[2] || 'GB'
  const powers = { B: 0, K: 1, KB: 1, M: 2, MB: 2, G: 3, GB: 3, T: 4, TB: 4 }
  return value * 1024 ** (powers[unit] ?? 3)
}

export function trafficPercent(server) {
  const limit = trafficLimitBytes(server)
  if (!limit) return 0
  return clampPercent((monthTraffic(server) / limit) * 100)
}

export function usageTone(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 'good'
  if (number >= 90) return 'bad'
  if (number >= 70) return 'warn'
  return 'good'
}

export function normalizeTimestamp(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 0
  return number < 1e12 ? number * 1000 : number
}

export function serverTimestamp(server) {
  const report = normalizeTimestamp(server?.report_timestamp)
  if (report) return report
  return normalizeTimestamp(server?.last_updated)
}

export function isServerOnline(server, now = Date.now()) {
  const updated = serverTimestamp(server)
  return Boolean(updated && now - updated < ONLINE_THRESHOLD_MS)
}

export function regionCode(region) {
  const code = String(region || '').trim().toUpperCase()
  if (!code || code === 'UNKNOWN' || code === 'XX') return ''
  return code === 'TW' ? 'CN' : code
}

export function flagUrl(region) {
  const code = regionCode(region).toLowerCase()
  if (!code) return ''
  return publicAssetUrl(`flags/${code}.svg`)
}

export function regionLabel(region, locale = 'zh') {
  const code = String(region || '').trim().toUpperCase()
  if (!code) return locale === 'en' ? 'Unknown' : '未知'
  const names = REGION_NAMES[locale === 'en' ? 'en' : 'zh']
  return names[code] || code
}

export function osMeta(os) {
  const text = String(os || '')
  return OS_META.find((item) => item.test.test(text)) || { image: 'os-unknown.svg', label: text || 'Linux' }
}

export function osLabel(os) {
  return osMeta(os).label
}

export function osIconUrl(os) {
  return publicAssetUrl(`os-icons/${osMeta(os).image}`)
}

export function billingInfo(cycle, locale = 'zh') {
  const key = String(cycle || 'month')
  const item = BILLING_CYCLES[key] || BILLING_CYCLES.month
  return {
    key,
    label: locale === 'en' ? item.en : item.zh,
    short: locale === 'en' ? item.shortEn : item.shortZh
  }
}

export function priceInfo(server) {
  const raw = String(server?.price ?? '').trim()
  if (!raw) return null
  const price = Number.parseFloat(raw.replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(price) || price <= 0) return null
  let symbol = String(server?.currency || '').trim()
  const symbols = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', AUD: 'A$', CAD: 'C$', SGD: 'S$' }
  symbol = symbols[symbol.toUpperCase()] || symbol
  if (!symbol) {
    const match = raw.match(/^[^\d-]+/)
    symbol = match ? match[0].trim() : '¥'
  }
  return { price, symbol, text: `${symbol}${Number.isInteger(price) ? price : price.toFixed(2)}` }
}

export function expireInfo(dateValue, locale = 'zh', now = Date.now()) {
  const raw = String(dateValue || '').trim()
  if (!raw) return null
  const date = new Date(raw.includes('T') ? raw : `${raw}T23:59:59`)
  if (Number.isNaN(date.getTime())) return null
  const diff = date.getTime() - now
  const days = Math.ceil(diff / 86400000)
  let text = ''
  let tone = 'good'
  if (days < 0) {
    tone = 'bad'
    text = locale === 'en' ? `Expired ${Math.abs(days)}d ago` : `已过期 ${Math.abs(days)} 天`
  } else if (days === 0) {
    tone = 'warn'
    text = locale === 'en' ? 'Expires today' : '今天到期'
  } else if (days <= 7) {
    tone = 'warn'
    text = locale === 'en' ? `${days}d left` : `${days} 天后到期`
  } else {
    text = locale === 'en' ? `${days}d left` : `${days} 天后到期`
  }
  return { date, days, text, tone }
}

export function formatDate(value, locale = 'zh') {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

export function formatClock(value = new Date(), locale = 'zh') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(value)
}

export function formatDateTime(value, locale = 'zh') {
  const date = value instanceof Date ? value : new Date(normalizeTimestamp(value) || Date.now())
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}

export function timeAgo(value, locale = 'zh', now = Date.now()) {
  const timestamp = normalizeTimestamp(value)
  if (!timestamp) return '-'
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 10) return locale === 'en' ? 'just now' : '刚刚'
  if (seconds < 60) return locale === 'en' ? `${seconds}s ago` : `${seconds} 秒前`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return locale === 'en' ? `${minutes}m ago` : `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === 'en' ? `${hours}h ago` : `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return locale === 'en' ? `${days}d ago` : `${days} 天前`
}

export function uptimeText(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  if (!total) return '-'
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * Uptime in the reference's wording: "5 天 21 小时", "23 小时 36 分".
 * CF-Server-Monitor reports `boot_time` rather than `uptime` on the list
 * endpoint, so fall back to it when the direct field is absent.
 */
export function serverUptimeSeconds(server, now = Date.now()) {
  const direct = Number(server?.uptime)
  if (Number.isFinite(direct) && direct > 0) return direct
  const boot = normalizeTimestamp(server?.boot_time)
  if (boot && now > boot) return (now - boot) / 1000
  return 0
}

export function durationText(seconds, locale = 'zh') {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  if (!total) return ''
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (locale === 'en') {
    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }
  if (days > 0) return `${days} 天 ${hours} 小时`
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分`
}

export function elapsedText(timestamp, now = Date.now(), locale = 'zh') {
  const ts = normalizeTimestamp(timestamp)
  if (!ts) return ''
  const seconds = Math.max(0, Math.round((now - ts) / 1000))
  if (seconds < 60) return locale === 'en' ? 'just now' : '刚刚'
  return durationText(seconds, locale)
}

/**
 * A "used / total" pair sharing one unit, matching the reference's compact
 * meter feet ("34.58 / 122.07 MB"). Different units fall back to two values.
 */
export function pairBytes(used, total) {
  const u = Math.max(0, Number(used) || 0)
  const t = Math.max(0, Number(total) || 0)
  const unitOf = (n) => (n < 1 ? 0 : Math.min(Math.floor(Math.log(n) / Math.log(1024)), BYTE_UNITS.length - 1))
  const unit = unitOf(t)
  if (u > 0 && t > 0 && unitOf(u) === unit) {
    const fixed = (n) => (n / 1024 ** unit).toFixed(unit === 0 ? 0 : 2)
    return `${fixed(u)} / ${fixed(t)} ${BYTE_UNITS[unit]}`
  }
  return `${formatBytes(u)} / ${formatBytes(t)}`
}

export function latencyState(value) {
  if (value === false || value === undefined || value === null) {
    return value === null ? 'timeout' : 'off'
  }
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number === 0) return 'off'
  return 'ok'
}

export function latencyTone(value) {
  const state = latencyState(value)
  if (state === 'timeout') return 'bad'
  if (state === 'off') return 'off'
  const number = Number(value)
  if (number < 80) return 'good'
  if (number < 160) return 'warn'
  return 'bad'
}

export function latencyRoutes(server) {
  return LATENCY_ROUTES.map((route) => ({
    ...route,
    value: server?.[route.ping],
    state: latencyState(server?.[route.ping]),
    tone: latencyTone(server?.[route.ping])
  }))
}

export function averageLatency(server) {
  const values = LATENCY_ROUTES
    .map((route) => server?.[route.ping])
    .filter((value) => latencyState(value) === 'ok')
    .map((value) => Number(value))
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function tagsOf(server) {
  return String(server?.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function parseGpuInfo(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function axisTimeLabel(timestamp, spanHours) {
  const date = new Date(normalizeTimestamp(timestamp))
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  if (spanHours <= 1) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (spanHours <= 24) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${date.getMonth() + 1}/${date.getDate()}`
}
