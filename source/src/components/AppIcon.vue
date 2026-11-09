<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
  strokeWidth: { type: [Number, String], default: 1.8 }
})

const icons = {
  search: [
    { tag: 'path', attrs: { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z' } },
    { tag: 'path', attrs: { d: 'm16.7 16.7 4 4' } }
  ],
  grid: [
    { tag: 'path', attrs: { d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' } }
  ],
  list: [
    { tag: 'path', attrs: { d: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' } }
  ],
  moon: [
    { tag: 'path', attrs: { d: 'M20.7 13.1A8.7 8.7 0 0 1 10.9 3.3 8.7 8.7 0 1 0 20.7 13.1Z' } }
  ],
  sun: [
    { tag: 'path', attrs: { d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z' } },
    { tag: 'path', attrs: { d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' } }
  ],
  monitor: [
    { tag: 'path', attrs: { d: 'M3 4.5h18v12H3zM8 20.5h8M12 16.5v4' } }
  ],
  admin: [
    { tag: 'path', attrs: { d: 'M12 3 5 6v5.2c0 4.4 2.9 7.9 7 9.8 4.1-1.9 7-5.4 7-9.8V6l-7-3Z' } },
    { tag: 'path', attrs: { d: 'm9.2 12 1.9 1.9 3.8-4' } }
  ],
  arrowUp: [
    { tag: 'path', attrs: { d: 'M12 19V5M6 11l6-6 6 6' } }
  ],
  arrowDown: [
    { tag: 'path', attrs: { d: 'M12 5v14M6 13l6 6 6-6' } }
  ],
  arrowDownUp: [
    { tag: 'path', attrs: { d: 'M7 4v16M3 16l4 4 4-4' } },
    { tag: 'path', attrs: { d: 'M17 20V4M13 8l4-4 4 4' } }
  ],
  arrowLeft: [
    { tag: 'path', attrs: { d: 'M19 12H5M11 18l-6-6 6-6' } }
  ],
  arrowRight: [
    { tag: 'path', attrs: { d: 'M5 12h14M13 6l6 6-6 6' } }
  ],
  activity: [
    { tag: 'path', attrs: { d: 'M3 12h4l2.4-6.8 4.2 13.6 2.4-6.8H21' } }
  ],
  globe: [
    { tag: 'path', attrs: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z' } },
    { tag: 'path', attrs: { d: 'M3 12h18' } },
    { tag: 'path', attrs: { d: 'M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z' } }
  ],
  clock: [
    { tag: 'path', attrs: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z' } },
    { tag: 'path', attrs: { d: 'M12 7.2v5.1l3.2 1.9' } }
  ],
  chevronDown: [
    { tag: 'path', attrs: { d: 'm6 9 6 6 6-6' } }
  ],
  close: [
    { tag: 'path', attrs: { d: 'M18 6 6 18M6 6l12 12' } }
  ],
  external: [
    { tag: 'path', attrs: { d: 'M14 4h6v6M20 4 10 14' } },
    { tag: 'path', attrs: { d: 'M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5' } }
  ],
  refresh: [
    { tag: 'path', attrs: { d: 'M20 11a8 8 0 0 0-14-5L4 8' } },
    { tag: 'path', attrs: { d: 'M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2' } },
    { tag: 'path', attrs: { d: 'M20 20v-4h-4' } }
  ],
  sparkles: [
    { tag: 'path', attrs: { d: 'm12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z' } },
    { tag: 'path', attrs: { d: 'm19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z' } }
  ],
  wifi: [
    { tag: 'path', attrs: { d: 'M4.5 12.4a10.5 10.5 0 0 1 15 0M7.8 15.8a6 6 0 0 1 8.4 0M10.8 19.2a2 2 0 0 1 2.4 0' } }
  ],
  cpu: [
    { tag: 'path', attrs: { d: 'M7 7h10v10H7z' } },
    { tag: 'path', attrs: { d: 'M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4' } }
  ],
  memory: [
    { tag: 'path', attrs: { d: 'M5 7h14v10H5zM9 7v10M15 7v10M3 10h2M3 14h2M19 10h2M19 14h2' } }
  ],
  disk: [
    { tag: 'path', attrs: { d: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z' } },
    { tag: 'path', attrs: { d: 'M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7' } },
    { tag: 'path', attrs: { d: 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3' } }
  ],
  network: [
    { tag: 'path', attrs: { d: 'M12 3v5M12 16v5M5 8h14v8H5z' } },
    { tag: 'path', attrs: { d: 'M8 11h.01M16 13h.01' } }
  ],
  check: [
    { tag: 'path', attrs: { d: 'm5 12 4 4 10-10' } }
  ],
  alert: [
    { tag: 'path', attrs: { d: 'M12 3 2 21h20L12 3Z' } },
    { tag: 'path', attrs: { d: 'M12 9v5M12 18h.01' } }
  ],
  palette: [
    { tag: 'path', attrs: { d: 'M12 3a9 9 0 1 0 0 18c1.7 0 2.2-1.6 1.2-2.6-1.5-1.5-.2-3.9 1.9-3.9H17a4 4 0 0 0 4-4c0-4.2-4-7.5-9-7.5Z' } },
    { tag: 'path', attrs: { d: 'M7.5 10h.01M10 6.7h.01M14.5 6.7h.01M17 10h.01' } }
  ],
  settings: [
    { tag: 'path', attrs: { d: 'M4 7h16M4 12h16M4 17h16' } },
    { tag: 'path', attrs: { d: 'M8 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM10 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z' } }
  ],
  gauge: [
    { tag: 'path', attrs: { d: 'M4 18a8 8 0 1 1 16 0' } },
    { tag: 'path', attrs: { d: 'm12 14 4.2-4.2' } }
  ],
  terminal: [
    { tag: 'path', attrs: { d: 'M4 5h16v14H4zM8 9l3 3-3 3M13 15h4' } }
  ],
  server: [
    { tag: 'path', attrs: { d: 'M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01' } }
  ],
  eye: [
    { tag: 'path', attrs: { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z' } },
    { tag: 'path', attrs: { d: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z' } }
  ],
  printer: [
    { tag: 'path', attrs: { d: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6z' } }
  ],
  link: [
    { tag: 'path', attrs: { d: 'M10 13a5 5 0 0 0 7.1 0l1.9-1.9a5 5 0 0 0-7.1-7.1l-1 1' } },
    { tag: 'path', attrs: { d: 'M14 11a5 5 0 0 0-7.1 0l-1.9 1.9a5 5 0 0 0 7.1 7.1l1-1' } }
  ],
  bolt: [
    { tag: 'path', attrs: { d: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z' } }
  ]
}

const nodes = computed(() => icons[props.name] || icons.activity)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <component :is="node.tag" v-for="(node, index) in nodes" :key="index" v-bind="node.attrs" />
  </svg>
</template>
