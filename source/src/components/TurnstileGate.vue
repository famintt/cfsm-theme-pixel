<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { monitor, verifyTurnstile } from '../stores/monitor'
import { locale, t } from '../utils/i18n'
import AppIcon from './AppIcon.vue'

const widget = ref(null)
const scriptError = ref(false)
const renderKey = ref(0)
let widgetId = null
let disposed = false
let scriptPromise = null

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cfsm-turnstile]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.turnstile))
      existing.addEventListener('error', () => reject(new Error('Turnstile script error')))
      return
    }
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.defer = true
    script.dataset.cfsmTurnstile = '1'
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => reject(new Error('Turnstile script error'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

function renderWidget() {
  if (disposed || !widget.value) return
  if (!monitor.turnstileSiteKey) {
    scriptError.value = true
    return
  }

  if (widgetId !== null && window.turnstile?.remove) {
    try {
      window.turnstile.remove(widgetId)
    } catch {
      /* ignore */
    }
    widgetId = null
  }
  widget.value.innerHTML = ''

  try {
    widgetId = window.turnstile.render(widget.value, {
      sitekey: monitor.turnstileSiteKey,
      theme: monitor.theme === 'light' ? 'light' : 'dark',
      language: locale.value === 'en' ? 'en' : 'zh-cn',
      size: 'normal',
      callback: async (token) => {
        monitor.turnstileError = ''
        await verifyTurnstile(token)
      },
      'error-callback': () => {
        monitor.turnstileError = t('turnstileError')
        return true
      },
      'expired-callback': () => {
        monitor.turnstileError = t('turnstileError')
      }
    })
  } catch {
    scriptError.value = true
  }
}

async function mountWidget() {
  scriptError.value = false
  try {
    await loadScript()
    await nextTick()
    renderWidget()
  } catch {
    scriptError.value = true
  }
}

function retry() {
  scriptError.value = false
  renderKey.value += 1
  if (window.turnstile?.reset && widgetId !== null) {
    try {
      window.turnstile.reset(widgetId)
      return
    } catch {
      /* fall through */
    }
  }
  mountWidget()
}

onMounted(() => {
  mountWidget()
})

onBeforeUnmount(() => {
  disposed = true
  if (widgetId !== null && window.turnstile?.remove) {
    try {
      window.turnstile.remove(widgetId)
    } catch {
      /* ignore */
    }
  }
})
</script>

<template>
  <div class="gate-backdrop">
    <div class="gate-card glass" role="dialog" aria-modal="true" aria-labelledby="turnstile-title">
      <div class="gate-mark">
        <AppIcon name="admin" :size="24" />
        <span class="gate-orbit"></span>
      </div>
      <div class="eyebrow">SECURITY CHECK</div>
      <h2 id="turnstile-title">{{ t('turnstileTitle') }}</h2>
      <p class="gate-hint">{{ t('turnstileHint') }}</p>

      <div :key="renderKey" ref="widget" class="gate-widget"></div>

      <p v-if="scriptError" class="gate-error">{{ t('turnstileMissing') }}</p>
      <p v-else-if="monitor.turnstileError" class="gate-error">{{ monitor.turnstileError }}</p>

      <div v-if="monitor.verifying" class="gate-verifying">
        <AppIcon name="refresh" :size="15" class="spin" />
        <span>{{ t('loading') }}</span>
      </div>

      <button v-if="scriptError" class="btn gate-retry" type="button" @click="retry">
        <AppIcon name="refresh" :size="15" />
        {{ t('retry') }}
      </button>

      <div class="gate-footer">
        <span class="gate-dot"></span>
        <span>{{ monitor.config?.site_title || t('siteFallback') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gate-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(500px 360px at 50% 18%, rgba(var(--accent-rgb), 0.08), transparent 70%),
    color-mix(in srgb, var(--bg) 86%, transparent);
  backdrop-filter: blur(16px);
}

.gate-card {
  position: relative;
  width: min(410px, 100%);
  padding: 34px 30px 24px;
  text-align: center;
  overflow: hidden;
}

.gate-card::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.5), transparent 38%, transparent 62%, rgba(var(--accent-2-rgb), 0.4));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.gate-mark {
  position: relative;
  display: inline-grid;
  width: 62px;
  height: 62px;
  margin-bottom: 18px;
  place-items: center;
  border: 1px solid rgba(var(--accent-rgb), 0.34);
  border-radius: 18px;
  background: linear-gradient(145deg, rgba(var(--accent-rgb), 0.18), rgba(var(--accent-2-rgb), 0.08));
  color: var(--accent);
}

.gate-orbit {
  position: absolute;
  inset: -7px;
  border: 1px dashed rgba(var(--accent-rgb), 0.26);
  border-radius: 22px;
  animation: spin 16s linear infinite;
}

.gate-card h2 {
  margin: 8px 0 6px;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.gate-hint {
  margin: 0 auto 20px;
  max-width: 290px;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.6;
}

.gate-widget {
  display: flex;
  min-height: 66px;
  align-items: center;
  justify-content: center;
  margin: 0 auto 8px;
}

.gate-error {
  margin: 8px 0 0;
  color: var(--bad);
  font-size: 12px;
}

.gate-verifying {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 10px;
  color: var(--accent);
  font-size: 12px;
}

.gate-retry {
  margin-top: 12px;
}

.gate-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  color: var(--faint);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.gate-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--good);
  box-shadow: 0 0 0 3px rgba(var(--good-rgb), 0.12);
}
</style>
