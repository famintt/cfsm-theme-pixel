<script setup>
import { computed } from 'vue'
import { monitor } from '../stores/monitor'
import { t } from '../utils/i18n'
import { averageLatency, formatBytes, formatSpeed, isServerOnline, monthTraffic } from '../utils/format'
import AppIcon from './AppIcon.vue'

const servers = computed(() => monitor.servers || [])
const total = computed(() => servers.value.length || monitor.stats.total || 0)
const online = computed(() =>
  servers.value.length
    ? servers.value.filter((server) => isServerOnline(server, monitor.now)).length
    : monitor.stats.online || 0
)

const monthIn = computed(() => servers.value.reduce((sum, server) => sum + (Number(server.net_rx_monthly) || 0), 0))
const monthOut = computed(() => servers.value.reduce((sum, server) => sum + (Number(server.net_tx_monthly) || 0), 0))
const monthTotal = computed(() => servers.value.reduce((sum, server) => sum + monthTraffic(server), 0))

const speedIn = computed(() => monitor.stats.globalSpeedIn || 0)
const speedOut = computed(() => monitor.stats.globalSpeedOut || 0)
const speedTotal = computed(() => speedIn.value + speedOut.value)

const latency = computed(() => {
  const values = servers.value
    .filter((server) => isServerOnline(server, monitor.now))
    .map((server) => averageLatency(server))
    .filter((value) => value !== null)
  if (!values.length) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
})
</script>

<template>
  <section class="strip">
    <div class="strip-cell">
      <span class="strip-label"><AppIcon name="server" :size="13" /> {{ t('nodes') }}</span>
      <div class="strip-value">
        {{ online }}<em>/ {{ total }}</em>
      </div>
      <span class="strip-sub">{{ t('onlineCount', { n: online }) }}</span>
    </div>

    <div class="strip-cell">
      <span class="strip-label"><AppIcon name="network" :size="13" /> {{ t('monthTraffic') }}</span>
      <div class="strip-value">{{ formatBytes(monthTotal) }}</div>
      <span class="strip-sub">↓ {{ formatBytes(monthIn) }} · ↑ {{ formatBytes(monthOut) }}</span>
    </div>

    <div class="strip-cell">
      <span class="strip-label"><AppIcon name="bolt" :size="13" /> {{ t('liveSpeed') }}</span>
      <div class="strip-value">{{ formatSpeed(speedTotal) }}</div>
      <span class="strip-sub">↓ {{ formatSpeed(speedIn) }} · ↑ {{ formatSpeed(speedOut) }}</span>
    </div>

    <div class="strip-cell">
      <span class="strip-label"><AppIcon name="wifi" :size="13" /> {{ t('avgLatency') }}</span>
      <div class="strip-value">{{ latency === null ? '—' : latency }}<em>ms</em></div>
      <span class="strip-sub">{{ t('threeNet') }}</span>
    </div>
  </section>
</template>

<style scoped>
.strip-sub {
  color: var(--faint);
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.01em;
}
</style>
