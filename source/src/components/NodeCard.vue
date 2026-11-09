<script setup>
import { computed } from 'vue'
import { monitor } from '../stores/monitor'
import { locale, t } from '../utils/i18n'
import {
  expireInfo,
  flagUrl,
  formatBytes,
  formatSpeed,
  isServerOnline,
  latencyRoutes,
  monthTraffic,
  osIconUrl,
  pairBytes,
  priceInfo,
  serverDiskPercent,
  serverRamPercent,
  serverUptimeSeconds,
  trafficLimitBytes,
  trafficPercent
} from '../utils/format'
import AppIcon from './AppIcon.vue'
import SegBar from './SegBar.vue'
import DotRow from './DotRow.vue'

const props = defineProps({
  server: { type: Object, required: true }
})

const sys = computed(() => monitor.sysConfig || {})
const online = computed(() => isServerOnline(props.server, monitor.now))
const flag = computed(() => flagUrl(props.server.region))
const osIcon = computed(() => osIconUrl(props.server.os))

const cores = computed(() => Number(props.server.cpu_cores) || 0)
const cpuPct = computed(() => {
  const value = Number(props.server.cpu)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
})
const ramPct = computed(() => serverRamPercent(props.server))
const diskPct = computed(() => serverDiskPercent(props.server))

const loadValues = computed(() => {
  const raw = String(props.server.load_avg || '').trim()
  if (raw) {
    return raw.split(/\s+/).slice(0, 3).map((value) => Number(value))
  }
  return [props.server.load_1, props.server.load_5, props.server.load_15].map((value) => Number(value))
})
const loadFirst = computed(() => {
  const value = loadValues.value[0]
  return Number.isFinite(value) ? value : 0
})
const loadPct = computed(() => {
  const coresCount = cores.value || 1
  return Math.max(0, Math.min(100, (loadFirst.value / coresCount) * 100))
})
const loadFoot = computed(() =>
  loadValues.value.map((value) => (Number.isFinite(value) ? value.toFixed(2) : '0.00')).join(' / ')
)

const ramFoot = computed(() => {
  const used = (Number(props.server.ram_used) || 0) * 1024 * 1024
  const total = (Number(props.server.ram_total) || 0) * 1024 * 1024
  return total > 0 ? pairBytes(used, total) : '—'
})
const diskFoot = computed(() => {
  const used = (Number(props.server.disk_used) || 0) * 1024 * 1024
  const total = (Number(props.server.disk_total) || 0) * 1024 * 1024
  return total > 0 ? pairBytes(used, total) : '—'
})

const limit = computed(() => trafficLimitBytes(props.server))
const usedTraffic = computed(() => monthTraffic(props.server))
const trafficPct = computed(() => (limit.value > 0 ? trafficPercent(props.server) : 0))
const trafficText = computed(() => {
  if (limit.value > 0) return `${formatBytes(usedTraffic.value)} / ${formatBytes(limit.value)}`
  return `${formatBytes(usedTraffic.value)} / ∞`
})

const expire = computed(() => expireInfo(props.server.expire_date, locale.value, monitor.now))
const price = computed(() => priceInfo(props.server))
const uptimeDays = computed(() => Math.floor(serverUptimeSeconds(props.server, monitor.now) / 86400))

const showTraffic = computed(() => Boolean(sys.value.show_tf))
const showPings = computed(() => Boolean(sys.value.show_three_net_details))

const latRows = computed(() => {
  const names = {
    ct: sys.value.custom_ct_name || t('telecom'),
    cu: sys.value.custom_cu_name || t('unicom'),
    cm: sys.value.custom_cm_name || t('mobile')
  }
  const all = latencyRoutes(props.server)
  return ['ct', 'cu', 'cm'].map((key) => {
    const route = all.find((item) => item.key === key) || {}
    const raw = route.value
    const ok = route.state === 'ok'
    const ms = ok ? Math.round(Number(raw)) : 0
    const lossRaw = props.server[`loss_${key}`]
    const loss = Number(lossRaw)
    return {
      key,
      name: names[key],
      ok,
      ms,
      lossText: Number.isFinite(loss) && loss > 0 ? `${loss.toFixed(1)}%` : '',
      lossBad: Number.isFinite(loss) && loss > 0,
      tone: ok ? (ms < 120 ? 'good' : ms < 250 ? 'warn' : 'bad') : 'off',
      // gauge: 0-500ms mapped onto the dot row
      gauge: ok ? Math.max(6, Math.min(100, 100 - (ms / 400) * 100)) : 0
    }
  })
})

const latColor = (tone) =>
  tone === 'good' ? '#22c55e' : tone === 'warn' ? '#eab308' : tone === 'bad' ? '#ef4444' : '#3a3b42'

const fmtPct = (value) => {
  const number = Math.max(0, Math.min(100, Number(value) || 0))
  return number < 10 ? number.toFixed(2) : number.toFixed(1)
}
</script>

<template>
  <RouterLink class="node" :to="`/server/${encodeURIComponent(server.id)}`" :aria-label="server.name">
    <header class="node-head">
      <span class="node-dot" :class="online ? 'on' : 'off'"></span>
      <h3 class="node-name" :title="server.name">{{ server.name || server.id }}</h3>
      <div class="node-flags">
        <img v-if="osIcon" class="os" :src="osIcon" :alt="server.os" />
        <img v-if="flag" :src="flag" :alt="server.region" />
      </div>
    </header>

    <div class="metrics">
      <section class="metric">
        <div class="metric-top">
          <AppIcon name="cpu" :size="14" class="tone-cpu" />
          <span class="metric-label tone-cpu">{{ t('cpu') }}</span>
          <span class="metric-value">{{ online ? fmtPct(cpuPct) : '—' }}<span>%</span></span>
        </div>
        <div class="metric-sub">{{ cores ? t('cores', { n: cores }) : '—' }}</div>
        <SegBar :value="online ? cpuPct : 0" :cells="15" :height="7" :color="'#3ea6ff'" />
      </section>

      <section class="metric">
        <div class="metric-top">
          <AppIcon name="memory" :size="14" class="tone-ram" />
          <span class="metric-label tone-ram">{{ t('memory') }}</span>
          <span class="metric-value">{{ online ? fmtPct(ramPct) : '—' }}<span>%</span></span>
        </div>
        <div class="metric-sub">{{ ramFoot }}</div>
        <SegBar :value="online ? ramPct : 0" :cells="15" :height="7" :color="'#a855f7'" />
      </section>

      <section class="metric">
        <div class="metric-top">
          <AppIcon name="disk" :size="14" class="tone-disk" />
          <span class="metric-label tone-disk">{{ t('disk') }}</span>
          <span class="metric-value">{{ online ? fmtPct(diskPct) : '—' }}<span>%</span></span>
        </div>
        <div class="metric-sub">{{ diskFoot }}</div>
        <SegBar :value="online ? diskPct : 0" :cells="15" :height="7" :color="'#f59e0b'" />
      </section>

      <section class="metric">
        <div class="metric-top">
          <AppIcon name="activity" :size="14" class="tone-load" />
          <span class="metric-label tone-load">{{ t('load') }}</span>
          <span class="metric-value">{{ online ? loadFirst.toFixed(2) : '—' }}</span>
        </div>
        <div class="metric-sub">{{ online ? loadFoot : '—' }}</div>
        <SegBar :value="online ? loadPct : 0" :cells="15" :height="7" :color="'#ec4899'" />
      </section>
    </div>

    <div class="divider"></div>

    <div class="net">
      <div class="net-item">
        <AppIcon name="upload" :size="13" class="tone-up" />
        <span class="net-label">{{ t('upload') }}</span>
        <span class="net-value tone-up">{{ formatSpeed(server.net_out_speed) }}</span>
      </div>
      <div class="net-item">
        <AppIcon name="download" :size="13" class="tone-down" />
        <span class="net-label">{{ t('download') }}</span>
        <span class="net-value tone-down">{{ formatSpeed(server.net_in_speed) }}</span>
      </div>
      <div class="net-item">
        <AppIcon name="globe" :size="13" class="tone-up" />
        <span class="net-label">{{ t('monthOut') }}</span>
        <span class="net-value">{{ formatBytes(server.net_tx_monthly) }}</span>
      </div>
      <div class="net-item">
        <AppIcon name="globe" :size="13" class="tone-down" />
        <span class="net-label">{{ t('monthIn') }}</span>
        <span class="net-value">{{ formatBytes(server.net_rx_monthly) }}</span>
      </div>
    </div>

    <template v-if="showTraffic">
      <div class="divider"></div>
      <div class="traffic-head">
        <span class="traffic-note">
          <AppIcon name="clock" :size="13" />
          {{ t('monthTraffic') }}
        </span>
        <span class="traffic-value">
          <b>{{ trafficText }}</b>
          <span v-if="limit > 0"> · {{ trafficPct.toFixed(1) }}%</span>
        </span>
      </div>
      <SegBar :value="trafficPct" :cells="22" :ramp="'heat'" :height="7" />
    </template>

    <template v-if="showPings">
      <div class="divider"></div>
      <div class="latency">
        <div v-for="row in latRows" :key="row.key" class="lat-row">
          <span class="lat-name">{{ row.name }}</span>
          <span class="lat-ms" :style="{ color: latColor(row.tone) }">
            {{ row.ok ? `${row.ms} ms` : '—' }}
          </span>
          <span class="lat-loss" :style="row.lossBad ? { color: '#f59e0b' } : null">
            {{ row.lossText || '0%' }}
          </span>
          <DotRow class="lat-dots" :value="row.gauge" :total="22" :color="latColor(row.tone)" />
        </div>
      </div>
    </template>

    <div class="node-foot">
      <div class="foot-cell">
        <span class="foot-label">{{ t('expire') }}</span>
        <span
          class="foot-value"
          :style="expire && expire.tone === 'bad' ? { color: '#f87171' } : expire && expire.tone === 'warn' ? { color: '#fbbf24' } : null"
        >
          {{ expire ? `${Math.max(0, expire.days)} ${t('days')}` : '∞' }}
        </span>
      </div>
      <div class="foot-cell">
        <span class="foot-label">{{ t('price') }}</span>
        <span class="foot-value">{{ price ? price.text : '—' }}</span>
      </div>
      <div class="foot-cell">
        <span class="foot-label">{{ t('online') }}</span>
        <span class="foot-value">{{ online ? `${uptimeDays} ${t('days')}` : '—' }}</span>
      </div>
    </div>
  </RouterLink>
</template>
