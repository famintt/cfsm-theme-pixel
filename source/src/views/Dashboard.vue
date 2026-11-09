<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  initMonitor,
  monitor,
  refreshDashboard,
  registerVisibilityHandler,
  retryMonitor,
  stopAllSockets
} from '../stores/monitor'
import { t } from '../utils/i18n'
import PixelHeader from '../components/PixelHeader.vue'
import DashSummary from '../components/DashSummary.vue'
import NodeCard from '../components/NodeCard.vue'
import PixelFooter from '../components/PixelFooter.vue'
import AppIcon from '../components/AppIcon.vue'

const refreshing = ref(false)
let unregisterVisibility = null

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await refreshDashboard()
  } finally {
    refreshing.value = false
  }
}

async function retry() {
  refreshing.value = true
  await retryMonitor()
  refreshing.value = false
}

onMounted(() => {
  initMonitor()
  unregisterVisibility = registerVisibilityHandler(async () => {
    await refreshDashboard()
  })
})

onBeforeUnmount(() => {
  unregisterVisibility?.()
  stopAllSockets()
})
</script>

<template>
  <div>
    <PixelHeader />

    <main class="shell">
      <template v-if="monitor.loading && !monitor.ready">
        <div class="strip">
          <div v-for="n in 4" :key="n" class="skeleton tile-skeleton"></div>
        </div>
        <div class="grid">
          <div v-for="n in 6" :key="n" class="skeleton card-skeleton"></div>
        </div>
      </template>

      <template v-else-if="monitor.error && !monitor.ready">
        <div class="panel" style="margin-top: 28px">
          <AppIcon name="alert" :size="26" />
          <h2>{{ t('loadFailed') }}</h2>
          <p>{{ monitor.error || t('loadFailedHint') }}</p>
          <button class="btn" type="button" :disabled="refreshing" @click="retry">
            <AppIcon name="refresh" :size="14" :class="{ spin: refreshing }" />
            {{ t('retry') }}
          </button>
        </div>
      </template>

      <template v-else>
        <DashSummary />

        <div class="toolbar">
          <span class="toolbar-title">
            <AppIcon name="grid" :size="14" />
            {{ t('nodeList') }} <b>{{ monitor.servers.length }}</b>
          </span>
          <span class="topbar-spacer"></span>
          <button class="icon-btn" type="button" :title="t('retry')" @click="refresh">
            <AppIcon name="refresh" :size="14" :class="{ spin: refreshing }" />
          </button>
        </div>

        <div v-if="monitor.servers.length" class="grid">
          <NodeCard v-for="server in monitor.servers" :key="server.id" :server="server" />
        </div>

        <div v-else class="panel">
          <AppIcon name="server" :size="26" />
          <h2>{{ t('noNodes') }}</h2>
          <p>{{ t('noNodesHint') }}</p>
        </div>

        <PixelFooter />
      </template>
    </main>
  </div>
</template>
