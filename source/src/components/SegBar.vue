<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  cells: { type: Number, default: 14 },
  height: { type: Number, default: 6 },
  gap: { type: Number, default: 3 },
  color: { type: String, default: '#3ea6ff' },
  ramp: { type: String, default: 'flat' } // flat | heat | duo
})

const pct = computed(() => Math.max(0, Math.min(100, Number(props.value) || 0)))

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function mix(a, b, t) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  const out = A.map((v, i) => Math.round(v + (B[i] - v) * t))
  return `rgb(${out.join(', ')})`
}

// heat: green -> amber -> red across the scale, so a full bar reads "hot"
function heatColor(t) {
  if (t < 0.5) return mix('#22c55e', '#eab308', t / 0.5)
  return mix('#eab308', '#ef4444', (t - 0.5) / 0.5)
}

const cellColor = (index) => {
  const t = props.cells <= 1 ? 0 : index / (props.cells - 1)
  if (props.ramp === 'heat') return heatColor(t)
  if (props.ramp === 'duo') return mix(props.color, '#8b5cf6', t)
  return props.color
}

const cellFill = (index) => {
  const perCell = 100 / props.cells
  const start = perCell * (index - 1)
  const ratio = (pct.value - start) / perCell
  return Math.max(0, Math.min(1, ratio)) * 100
}

const segStyle = computed(() => ({
  '--seg-h': `${props.height}px`,
  '--seg-gap': `${props.gap}px`
}))
</script>

<template>
  <div class="segbar" :style="segStyle" role="img" :aria-label="`${Math.round(pct)}%`">
    <span v-for="n in cells" :key="n" class="seg">
      <i :style="{ width: `${cellFill(n)}%`, background: cellColor(n - 1) }"></i>
    </span>
  </div>
</template>
