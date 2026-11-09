<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  fetchServer,
  initMonitor,
  monitor,
  startServerSocket,
  stopAllSockets
} from '../stores/monitor'
import { locale, t } from '../utils/i18n'
import {
  expireInfo,
  flagUrl,
  formatBytes,
  formatDateTime,
  formatSpeed,
  isServerOnline,
  latencyRoutes,
  monthTraffic,
  normalizeTimestamp,
  osIconUrl,
  osLabel,
  pairBytes,
  priceInfo,
  regionLabel,
  serverDiskPercent,
  serverRamPercent,
  serverUptimeSeconds,
  tagsOf,
  trafficLimitBytes,
  trafficPercent
} from '../utils/format'
import PixelHeader from '../components/PixelHeader.vue'
import PixelFooter from '../components/PixelFooter.vue'
import AppIcon from '../components/AppIcon.vue'
import SegBar from '../components/SegBar.vue'
import DotRow from '../components/DotRow.vue'

const route = useRoute()
const server = ref(null)
const base = ref('')
const loading = ref(true)
const error = ref('')

const serverId = computed(() => String(route.params.id || ''))
const sys = computed(() => monitor.sysConfig || {})
const online = computed(() => (server.value ? isServerOnline(server.value, monitor.now) : false))
const flag = computed(() => (server.value ? flagUrl(server.value.region) : ''))

const cpuPct = computed(() => {
  const value = Number(server.value?.cpu)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
})
const ramPct = computed(() => serverRamPercent(server.value))
const diskPct = computed(() => serverDiskPercent(server.value))

const loadValues = computed(() => {
  const raw = String(server.value?.load_avg || '').trim()
  if (raw) return raw.split(/\s+/).slice(0, 3).map(Number)
  return [server.value?.load_1, server.value?.load_5, server.value?.load_15].map(Number)
})
const loadFirst = computed(() => (Number.isFinite(loadValues.value[0]) ? loadValues.value[0] : 0))
const cores = computed(() => Number(server.value?.cpu_cores) || 0)
const loadPct = computed(() => Math.min(100, (loadFirst.value / (cores.value || 1)) * 100))
const loadFoot = computed(() => loadValues.value.map((v) => (Number.isFinite(v) ? v.toFixed(2) : '0.00')).join(' / '))

const ramFoot = computed(() =>
  pairBytes((Number(server.value?.ram_used) || 0) * 1024 ** 2, (Number(server.value?.ram_total) || 0) * 1024 ** 2)
)
const diskFoot = computed(() =>
  pairBytes((Number(server.value?.disk_used) || 0) * 1024 ** 2, (Number(server.value?.disk_total) || 0) * 1024 ** 2)
)

const limit = computed(() => trafficLimitBytes(server.value))
const trafficUsed = computed(() => monthTraffic(server.value))
const trafficPct = computed(() => (limit.value > 0 ? trafficPercent(server.value) : 0))
const trafficText = computed(() =>
  limit.value > 0
    ? `${formatBytes(trafficUsed.value)} / ${formatBytes(limit.value)}`
    : `${formatBytes(trafficUsed.value)} / ∞`
)

const expire = computed(() => expireInfo(server.value?.expire_date, locale.value, monitor.now))
const price = computed(() => priceInfo(server.value))
const uptime = computed(() => serverUptimeSeconds(server.value, monitor.now))
const uptimeDays = computed(() => Math.floor(uptime.value / 86400))
const tags = computed(() => tagsOf(server.value))

const latRows = computed(() => {
  const names = {
    ct: sys.value.custom_ct_name || t('telecom'),
    cu: sys.value.custom_cu_name || t('unicom'),
    cm: sys.value.custom_cm_name || t('mobile')
  }
  const all = latencyRoutes(server.value)
  return ['ct', 'cu', 'cm'].map((key) => {
    const route_ = all.find((item) => item.key === key) || {}
    const ok = route_.state === 'ok'
    const ms = ok ? Math.round(Number(route_.value)) : 0
    const loss = Number(server.value?.[`loss_${key}`])
    return {
      key,
      name: names[key],
      ok,
      ms,
      lossText: Number.isFinite(loss) && loss > 0 ? `${loss.toFixed(1)}%` : '0%',
      lossBad: Number.isFinite(loss) && loss > 0,
      tone: ok ? (ms < 120 ? 'good' : ms < 250 ? 'warn' : 'bad') : 'off',
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

let socketStarted = false

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await fetchServer(serverId.value)
    server.value = result.server
    base.value = result.base
    if (!socketStarted) {
      socketStarted = true
      startServerSocket(base.value, serverId.value, {
        onUpdate: (id, data, ts) => {
          if (String(id) !== serverId.value || !server.value) return
          for (const [key, value] of Object.entries(data || {})) {
            if (value !== undefined) server.value[key] = value
          }
          server.value.last_updated = Date.now()
          server.value.report_timestamp = normalizeTimestamp(ts) || Date.now()
        }
      })
    }
  } catch (err) {
    error.value = err?.message || t('loadFailed')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  initMonitor()
  load()
})

onBeforeUnmount(() => {
  stopAllSockets()
})
</script>

<template>
  <div>
    <PixelHeader />

    <main class="shell">
      <div class="detail-head">
        <RouterLink class="back-btn" to="/">← {{ t('detailBack') }}</RouterLink>
        <h1 class="detail-title">{{ server?.name || serverId }}</h1>
        <div v-if="server" class="detail-meta">
          <span class="chip">
            <span class="node-dot" :class="online ? 'on' : 'off'"></span>
            {{ online ? t('online') : t('offline') }}
          </span>
          <span class="chip">{{ regionLabel(server.region, locale) }}</span>
          <span class="chip">{{ osLabel(server.os) }}</span>
          <span class="chip">{{ server.arch || '—' }}</span>
        </div>
      </div>

      <div v-if="loading" class="panel">
        <AppIcon name="refresh" :size="22" class="spin" />
        <p>{{ t('loading') }}</p>
      </div>

      <div v-else-if="error" class="panel">
        <AppIcon name="alert" :size="24" />
        <h2>{{ t('loadFailed') }}</h2>
        <p>{{ error }}</p>
        <button class="btn" type="button" @click="load">{{ t('retry') }}</button>
      </div>

      <template v-else-if="server">
        <div class="detail-grid">
          <section class="panel-card wide">
            <h2 class="panel-title"><AppIcon name="cpu" :size="13" /> {{ t('resources') }}</h2>
            <div class="big-metrics">
              <div class="big">
                <div class="metric-top">
                  <AppIcon name="cpu" :size="15" class="tone-cpu" />
                  <span class="metric-label tone-cpu">{{ t('cpu') }}</span>
                  <span class="big-value">{{ online ? fmtPct(cpuPct) : '—' }}<em>%</em></span>
                </div>
                <div class="metric-sub">{{ cores ? t('cores', { n: cores }) : '—' }}</div>
                <SegBar :value="online ? cpuPct : 0" :cells="24" :height="8" color="#3ea6ff" />
              </div>

              <div class="big">
                <div class="metric-top">
                  <AppIcon name="memory" :size="15" class="tone-ram" />
                  <span class="metric-label tone-ram">{{ t('memory') }}</span>
                  <span class="big-value">{{ online ? fmtPct(ramPct) : '—' }}<em>%</em></span>
                </div>
                <div class="metric-sub">{{ ramFoot }}</div>
                <SegBar :value="online ? ramPct : 0" :cells="24" :height="8" color="#a855f7" />
              </div>

              <div class="big">
                <div class="metric-top">
                  <AppIcon name="disk" :size="15" class="tone-disk" />
                  <span class="metric-label tone-disk">{{ t('disk') }}</span>
                  <span class="big-value">{{ online ? fmtPct(diskPct) : '—' }}<em>%</em></span>
                </div>
                <div class="metric-sub">{{ diskFoot }}</div>
                <SegBar :value="online ? diskPct : 0" :cells="24" :height="8" color="#f59e0b" />
              </div>

              <div class="big">
                <div class="metric-top">
                  <AppIcon name="activity" :size="15" class="tone-load" />
                  <span class="metric-label tone-load">{{ t('load') }}</span>
                  <span class="big-value">{{ online ? loadFirst.toFixed(2) : '—' }}</span>
                </div>
                <div class="metric-sub">{{ online ? loadFoot : '—' }}</div>
                <SegBar :value="online ? loadPct : 0" :cells="24" :height="8" color="#ec4899" />
              </div>
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
                <AppIcon name="globe" :size="13" />
                <span class="net-label">{{ t('monthOut') }}</span>
                <span class="net-value">{{ formatBytes(server.net_tx_monthly) }}</span>
              </div>
              <div class="net-item">
                <AppIcon name="globe" :size="13" />
                <span class="net-label">{{ t('monthIn') }}</span>
                <span class="net-value">{{ formatBytes(server.net_rx_monthly) }}</span>
              </div>
            </div>

            <template v-if="sys.show_tf">
              <div class="divider"></div>
              <div class="traffic-head">
                <span class="traffic-note"><AppIcon name="clock" :size="13" /> {{ t('monthTraffic') }}</span>
                <span class="traffic-value">
                  <b>{{ trafficText }}</b>
                  <span v-if="limit > 0"> · {{ trafficPct.toFixed(1) }}%</span>
                </span>
              </div>
              <SegBar :value="trafficPct" :cells="32" :height="9" ramp="heat" />
            </template>
          </section>

          <section v-if="sys.show_three_net_details" class="panel-card">
            <h2 class="panel-title"><AppIcon name="wifi" :size="13" /> {{ t('latency') }}</h2>
            <div class="latency">
              <div v-for="row in latRows" :key="row.key" class="lat-row">
                <span class="lat-name">{{ row.name }}</span>
                <span class="lat-ms" :style="{ color: latColor(row.tone) }">
                  {{ row.ok ? `${row.ms} ms` : '—' }}
                </span>
                <span class="lat-loss" :style="row.lossBad ? { color: '#f59e0b' } : null">
                  {{ row.lossText }}
                </span>
                <DotRow class="lat-dots" :value="row.gauge" :total="30" :color="latColor(row.tone)" />
              </div>
            </div>
          </section>

          <section class="panel-card">
            <h2 class="panel-title"><AppIcon name="server" :size="13" /> {{ t('info') }}</h2>
            <dl class="facts">
              <div><dt>{{ t('uptime') }}</dt><dd>{{ uptimeDays }} {{ t('days') }}</dd></div>
              <div><dt>{{ t('expire') }}</dt><dd>{{ expire ? `${Math.max(0, expire.days)} ${t('days')}` : '∞' }}</dd></div>
              <div><dt>{{ t('price') }}</dt><dd>{{ price ? price.text : '—' }}</dd></div>
              <div><dt>{{ t('os') }}</dt><dd>{{ osLabel(server.os) }}</dd></div>
              <div><dt>{{ t('arch') }}</dt><dd>{{ server.arch || '—' }}</dd></div>
              <div><dt>{{ t('region') }}</dt><dd>{{ regionLabel(server.region, locale) }}</dd></div>
              <div><dt>{{ t('lastUpdate') }}</dt><dd>{{ formatDateTime(server.last_updated, locale) }}</dd></div>
              <div v-if="tags.length" class="facts-tags">
                <dt>{{ t('tags') }}</dt>
                <dd>{{ tags.join(' · ') }}</dd>
              </div>
            </dl>
            <div v-if="flag" class="flag-row">
              <img :src="flag" :alt="server.region" />
              <img :src="osIconUrl(server.os)" :alt="server.os" />
            </div>
          </section>
        </div>

        <PixelFooter />
      </template>
    </main>
  </div>
</template>

<style scoped>
.wide {
  grid-column: span 2;
}

.big-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px 30px;
}

.big-value {
  margin-left: auto;
  font-size: 27px;
  font-weight: 640;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.big-value em {
  margin-left: 2px;
  color: #7b7d86;
  font-size: 13px;
  font-style: normal;
  font-weight: 500;
}

.big .metric-sub {
  margin-bottom: 8px;
  font-size: 11.5px;
}

.facts {
  display: grid;
  gap: 10px;
  margin: 0;
}

.facts-tags {
  flex-wrap: nowrap;
}

.facts-tags dd {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: right;
}

.facts div {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.facts dt {
  color: var(--faint);
  font-size: 11.5px;
}

.facts dd {
  margin: 0 0 0 auto;
  font-family: var(--mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.flag-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line-soft);
}

.flag-row img:first-child {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}

.flag-row img:last-child {
  width: 20px;
  height: 20px;
  opacity: 0.85;
}

@media (max-width: 980px) {
  .wide {
    grid-column: span 1;
  }
}
</style>
