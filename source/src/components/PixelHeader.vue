<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { changeLocale, monitor } from '../stores/monitor'
import { adminUrl } from '../utils/config'
import { locale, t } from '../utils/i18n'
import AppIcon from './AppIcon.vue'

const title = computed(() => monitor.config?.site_title || t('siteFallback'))
const admin = computed(() => adminUrl())
const isLive = computed(() => Boolean(monitor.connected))
const statusText = computed(() => {
  if (monitor.wsStatus === 'timeout') return t('wsOffline')
  if (isLive.value) return t('live')
  if (monitor.wsStatus === 'connecting' || monitor.wsStatus === 'idle') return t('connecting')
  return t('wsOffline')
})

function toggleLocale() {
  changeLocale(locale.value === 'en' ? 'zh' : 'en')
}
</script>

<template>
  <header class="topbar">
    <div class="shell topbar-inner">
      <RouterLink class="brand" to="/">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="brand-text">
          <span class="brand-title">{{ title }}</span>
          <span class="brand-sub">CF-SERVER-MONITOR · v{{ monitor.version || '—' }}</span>
        </span>
      </RouterLink>

      <span class="topbar-spacer"></span>

      <span class="live-chip" :class="{ 'is-live': isLive }">
        <i class="pulse"></i>
        {{ statusText }}
      </span>

      <button class="icon-btn" type="button" :title="locale === 'en' ? '中文' : 'English'" @click="toggleLocale">
        <AppIcon name="globe" :size="15" />
      </button>

      <a class="icon-btn" :href="admin" :title="t('admin')" rel="noreferrer">
        <AppIcon name="settings" :size="15" />
      </a>
    </div>
  </header>
</template>

<style scoped>
.brand-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: 1.15;
  gap: 2px;
}
</style>
