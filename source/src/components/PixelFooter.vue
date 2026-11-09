<script setup>
import { computed } from 'vue'
import { monitor } from '../stores/monitor'
import { locale, t } from '../utils/i18n'
import { formatClock } from '../utils/format'
import AppIcon from './AppIcon.vue'

const stamp = computed(() => (monitor.lastUpdate ? formatClock(monitor.lastUpdate, locale.value) : '—'))
</script>

<template>
  <footer class="page-foot">
    <AppIcon name="activity" :size="13" />
    <a href="https://github.com/huilang-me/CF-Server-Monitor" target="_blank" rel="noreferrer">
      {{ t('poweredBy') }}
    </a>
    <span class="sep">/</span>
    <span>v{{ monitor.version || '—' }}</span>
    <span class="sep">/</span>
    <span>{{ t('lastUpdate') }} {{ stamp }}</span>
  </footer>
</template>
