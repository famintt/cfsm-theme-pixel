<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 }, // 0-100
  total: { type: Number, default: 22 },
  color: { type: String, default: '#22c55e' },
  empty: { type: String, default: '' }
})

const lit = computed(() => {
  const ratio = Math.max(0, Math.min(100, Number(props.value) || 0)) / 100
  return Math.round(ratio * props.total)
})
</script>

<template>
  <div class="dots" :aria-label="`${Math.round(value)}%`">
    <b
      v-for="n in total"
      :key="n"
      :style="n <= lit ? { background: color, boxShadow: `0 0 6px ${color}55` } : empty ? { background: empty } : null"
    ></b>
  </div>
</template>
