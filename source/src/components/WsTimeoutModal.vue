<script setup>
import { dismissWsTimeout, resumeAllSockets } from '../stores/monitor'
import { t } from '../utils/i18n'
import AppIcon from './AppIcon.vue'

function keepAlive() {
  resumeAllSockets()
}

function close() {
  dismissWsTimeout()
}
</script>

<template>
  <div class="ws-backdrop">
    <div class="ws-card glass" role="dialog" aria-modal="true" aria-labelledby="ws-timeout-title">
      <div class="ws-mark">
        <AppIcon name="wifi" :size="23" />
      </div>
      <div class="eyebrow">LIVE CONNECTION</div>
      <h2 id="ws-timeout-title">{{ t('wsTimeoutTitle') }}</h2>
      <p>{{ t('wsTimeoutHint') }}</p>
      <div class="ws-actions">
        <button class="btn" type="button" @click="close">{{ t('wsTimeoutClose') }}</button>
        <button class="btn btn-primary" type="button" @click="keepAlive">
          <AppIcon name="bolt" :size="15" />
          {{ t('wsTimeoutContinue') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ws-backdrop {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(12px);
}

.ws-card {
  width: min(430px, 100%);
  padding: 30px;
  text-align: center;
}

.ws-mark {
  display: inline-grid;
  width: 52px;
  height: 52px;
  margin-bottom: 16px;
  place-items: center;
  border: 1px solid rgba(var(--warn-rgb), 0.28);
  border-radius: 15px;
  background: rgba(var(--warn-rgb), 0.09);
  color: var(--warn);
}

.ws-card h2 {
  margin: 8px 0 8px;
  font-size: 19px;
  letter-spacing: -0.02em;
}

.ws-card p {
  margin: 0 auto;
  max-width: 330px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.65;
}

.ws-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

@media (max-width: 500px) {
  .ws-actions {
    flex-direction: column-reverse;
  }
}
</style>
