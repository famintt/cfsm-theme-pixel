<script setup>
import { RouterView } from 'vue-router'
import { monitor } from './stores/monitor'
import { t } from './utils/i18n'
import TurnstileGate from './components/TurnstileGate.vue'
import WsTimeoutModal from './components/WsTimeoutModal.vue'
import AppIcon from './components/AppIcon.vue'
</script>

<template>
  <div class="app-background" aria-hidden="true"></div>

  <RouterView v-slot="{ Component, route }">
    <Transition name="page" mode="out-in">
      <component :is="Component" :key="route.path" />
    </Transition>
  </RouterView>

  <Transition name="toast">
    <div v-if="monitor.settingsMessage" class="app-toast" role="status">
      <AppIcon name="check" :size="15" />
      <span>{{ monitor.settingsMessage }}</span>
    </div>
  </Transition>

  <TurnstileGate v-if="monitor.turnstileRequired" />
  <WsTimeoutModal v-if="monitor.wsTimeout" />

  <Transition name="toast">
    <div v-if="monitor.unauthorized" class="auth-gate">
      <div class="auth-card glass">
        <span class="auth-spinner"><AppIcon name="refresh" :size="22" class="spin" /></span>
        <h2>{{ monitor.config?.site_title || t('siteFallback') }}</h2>
        <p>{{ t('adminLogin') }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.app-toast {
  position: fixed;
  left: 50%;
  bottom: 26px;
  z-index: 120;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 32px);
  padding: 10px 15px;
  border: 1px solid rgba(var(--accent-rgb), 0.3);
  border-radius: 999px;
  background: var(--surface-strong);
  box-shadow: var(--shadow);
  color: var(--text-soft);
  font-size: 12px;
  transform: translateX(-50%);
  backdrop-filter: blur(16px);
}

.app-toast :deep(svg) {
  color: var(--accent);
  flex: 0 0 auto;
}

.auth-gate {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--bg) 80%, transparent);
  backdrop-filter: blur(14px);
}

.auth-card {
  width: min(390px, 100%);
  padding: 30px;
  text-align: center;
}

.auth-spinner {
  display: inline-grid;
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  place-items: center;
  border: 1px solid rgba(var(--accent-rgb), 0.3);
  border-radius: 14px;
  background: rgba(var(--accent-rgb), 0.09);
  color: var(--accent);
}

.auth-card h2 {
  margin: 0 0 6px;
  font-size: 17px;
}

.auth-card p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
