<script setup>
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { t } from '../utils/i18n'
import { formatDateTime } from '../utils/format'

const props = defineProps({
  series: { type: Array, default: () => [] },
  height: { type: Number, default: 224 },
  yMax: { type: Number, default: 0 },
  area: { type: Boolean, default: true },
  formatValue: { type: Function, default: (value) => String(value) },
  formatTime: { type: Function, default: (value) => String(value) },
  formatTooltipTime: { type: Function, default: (value) => formatDateTime(value) },
  emptyText: { type: String, default: '' }
})

const pad = { left: 58, right: 16, top: 16, bottom: 28 }
const uid = `chart-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

const wrapper = ref(null)
const svgEl = ref(null)
const hover = ref(null)
const chartWidth = ref(860)
let resizeObserver = null

onMounted(() => {
  if (!wrapper.value) return
  const measure = () => {
    const width = wrapper.value?.getBoundingClientRect().width || 0
    if (width > 0) chartWidth.value = Math.max(300, Math.round(width))
  }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(wrapper.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

const prepared = computed(() => props.series
  .map((item) => {
    const points = (item.points || [])
      .filter((point) => Number.isFinite(point.x))
      .sort((a, b) => a.x - b.x)
    let last = null
    for (let index = points.length - 1; index >= 0; index -= 1) {
      if (Number.isFinite(points[index].y)) {
        last = Number(points[index].y)
        break
      }
    }
    return {
      name: item.name || '',
      color: item.color || 'var(--text)',
      points,
      last
    }
  })
  .filter((item) => item.points.length > 0))

const validPoints = computed(() => prepared.value.flatMap((item) => item.points.filter((point) => Number.isFinite(point.y))))
const hasData = computed(() => validPoints.value.length > 0)

const plotWidth = computed(() => Math.max(40, chartWidth.value - pad.left - pad.right))
const plotHeight = computed(() => Math.max(40, props.height - pad.top - pad.bottom))

const domain = computed(() => {
  const xs = prepared.value.flatMap((item) => item.points.map((point) => point.x))
  const ys = validPoints.value.map((point) => Number(point.y))
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  if (!Number.isFinite(minX) || minX === maxX) {
    minX = (minX || Date.now()) - 30000
    maxX = (maxX || Date.now()) + 30000
  }
  const rawMax = Math.max(...ys, 1)
  return {
    minX,
    maxX,
    maxY: props.yMax > 0 ? props.yMax : niceCeil(rawMax * 1.08)
  }
})

function niceCeil(value) {
  if (!Number.isFinite(value) || value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * power
}

function xPos(x) {
  return pad.left + ((x - domain.value.minX) / (domain.value.maxX - domain.value.minX)) * plotWidth.value
}

function yPos(y) {
  return pad.top + plotHeight.value - (Number(y) / domain.value.maxY) * plotHeight.value
}

function splitSegments(points) {
  const segments = []
  let current = []
  for (const point of points) {
    if (Number.isFinite(point.y)) {
      current.push(point)
    } else if (current.length) {
      segments.push(current)
      current = []
    }
  }
  if (current.length) segments.push(current)
  return segments
}

function linePath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xPos(point.x).toFixed(2)},${yPos(point.y).toFixed(2)}`).join(' ')
}

function areaPath(points) {
  if (points.length < 2) return ''
  const base = pad.top + plotHeight.value
  return `${linePath(points)} L${xPos(points[points.length - 1].x).toFixed(2)},${base} L${xPos(points[0].x).toFixed(2)},${base} Z`
}

const rendered = computed(() => prepared.value.map((item, index) => {
  const segments = splitSegments(item.points)
  return {
    ...item,
    id: `${uid}-${index}`,
    lines: segments.map((segment) => linePath(segment)),
    areas: props.area ? segments.map((segment) => areaPath(segment)) : []
  }
}))

const gridLines = computed(() => [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
  const y = pad.top + plotHeight.value * ratio
  const value = domain.value.maxY * (1 - ratio)
  return { y, value }
}))

const timeTicks = computed(() => [0, 1 / 3, 2 / 3, 1].map((ratio) => {
  const timestamp = domain.value.minX + (domain.value.maxX - domain.value.minX) * ratio
  return {
    x: pad.left + plotWidth.value * ratio,
    label: props.formatTime(timestamp)
  }
}))

function nearestPoint(points, targetX) {
  let best = null
  let bestDistance = Infinity
  for (const point of points) {
    if (!Number.isFinite(point.y)) continue
    const distance = Math.abs(point.x - targetX)
    if (distance < bestDistance) {
      bestDistance = distance
      best = point
    }
  }
  return best
}

function onMove(event) {
  if (!hasData.value || !svgEl.value) return
  const rect = svgEl.value.getBoundingClientRect()
  if (!rect.width) return
  const px = ((event.clientX - rect.left) / rect.width) * chartWidth.value
  if (px < pad.left || px > chartWidth.value - pad.right) {
    hover.value = null
    return
  }
  const targetX = domain.value.minX + ((px - pad.left) / plotWidth.value) * (domain.value.maxX - domain.value.minX)
  const rows = []
  for (const item of prepared.value) {
    const point = nearestPoint(item.points, targetX)
    if (!point) continue
    rows.push({
      name: item.name,
      color: item.color,
      value: Number(point.y),
      x: point.x,
      y: point.y
    })
  }
  if (!rows.length) {
    hover.value = null
    return
  }
  const wrapperRect = wrapper.value?.getBoundingClientRect()
  const localLeft = wrapperRect ? event.clientX - wrapperRect.left : 0
  const safeLeft = Math.max(88, Math.min((wrapperRect?.width || rect.width) - 88, localLeft))
  hover.value = {
    px,
    left: safeLeft,
    time: targetX,
    rows
  }
}

function clearHover() {
  hover.value = null
}
</script>

<template>
  <div ref="wrapper" class="line-chart" :style="{ '--chart-height': `${height}px` }">
    <div v-if="prepared.length" class="chart-legend">
      <span v-for="item in prepared" :key="item.name" class="legend-item">
        <i :style="{ background: item.color }"></i>
        <span>{{ item.name }}</span>
        <b class="mono">{{ item.last === null ? '—' : formatValue(item.last) }}</b>
      </span>
    </div>

    <svg
      ref="svgEl"
      :viewBox="`0 0 ${chartWidth} ${height}`"
      class="chart-svg"
      role="img"
      :aria-label="t('history')"
      @mousemove="onMove"
      @mouseleave="clearHover"
    >
      <defs>
        <linearGradient v-for="item in rendered" :id="item.id" :key="item.id" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="item.color" stop-opacity="0.10" />
          <stop offset="100%" :stop-color="item.color" stop-opacity="0" />
        </linearGradient>
      </defs>

      <g class="chart-grid">
        <line
          v-for="line in gridLines"
          :key="line.y"
          :x1="pad.left"
          :x2="chartWidth - pad.right"
          :y1="line.y"
          :y2="line.y"
        />
        <text
          v-for="line in gridLines"
          :key="`t-${line.y}`"
          :x="pad.left - 9"
          :y="line.y + 3"
          text-anchor="end"
        >
          {{ formatValue(line.value) }}
        </text>
      </g>

      <g class="chart-axis">
        <text v-for="tick in timeTicks" :key="tick.x" :x="tick.x" :y="height - 8" text-anchor="middle">
          {{ tick.label }}
        </text>
      </g>

      <g v-for="item in rendered" :key="item.id" class="chart-series">
        <path
          v-for="(area, index) in item.areas"
          :key="`area-${index}`"
          :d="area"
          :fill="`url(#${item.id})`"
          stroke="none"
        />
        <path
          v-for="(line, index) in item.lines"
          :key="`line-${index}`"
          :d="line"
          :stroke="item.color"
          stroke-width="1.8"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </g>

      <g v-if="hover" class="chart-hover">
        <line
          :x1="hover.px"
          :x2="hover.px"
          :y1="pad.top"
          :y2="pad.top + plotHeight"
          stroke="var(--line-strong)"
          stroke-dasharray="3 4"
          vector-effect="non-scaling-stroke"
        />
        <circle
          v-for="row in hover.rows"
          :key="row.name"
          :cx="xPos(row.x)"
          :cy="yPos(row.y)"
          r="3"
          :fill="row.color"
          stroke="var(--surface-solid)"
          stroke-width="1.5"
        />
      </g>
    </svg>

    <div v-if="!hasData" class="chart-empty">
      {{ emptyText || t('noHistory') }}
    </div>

    <div v-if="hover" class="chart-tooltip" :style="{ left: `${hover.left}px` }">
      <div class="tooltip-time mono">{{ formatTooltipTime(hover.time) }}</div>
      <div v-for="row in hover.rows" :key="row.name" class="tooltip-row">
        <span class="tooltip-dot" :style="{ background: row.color }"></span>
        <span class="tooltip-name">{{ row.name }}</span>
        <strong class="mono">{{ formatValue(row.value) }}</strong>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-chart {
  position: relative;
  width: 100%;
  min-width: 0;
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px 14px;
  margin-bottom: 4px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 9.5px;
  white-space: nowrap;
}

.legend-item i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
}

.legend-item b {
  color: var(--text-soft);
  font-size: 9.5px;
  font-weight: 600;
}

.chart-svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.chart-grid line {
  stroke: var(--line);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.chart-grid text {
  fill: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}

.chart-axis text {
  fill: var(--faint);
  font-family: var(--font-mono);
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}

.chart-series path {
  pointer-events: none;
}

.chart-hover {
  pointer-events: none;
}

.chart-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--faint);
  font-size: 10.5px;
  transform: translate(-50%, -50%);
  backdrop-filter: blur(8px);
}

.chart-tooltip {
  position: absolute;
  top: 12px;
  z-index: 4;
  min-width: 132px;
  padding: 8px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  background: var(--surface-strong);
  box-shadow: var(--shadow-soft);
  pointer-events: none;
  transform: translateX(-50%);
  backdrop-filter: blur(14px);
}

.tooltip-time {
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--line);
  color: var(--faint);
  font-size: 8.5px;
  white-space: nowrap;
}

.tooltip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
  font-size: 9.5px;
}

.tooltip-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.tooltip-name {
  flex: 1;
  color: var(--muted);
  white-space: nowrap;
}

.tooltip-row strong {
  color: var(--text);
  font-size: 9.5px;
  font-weight: 600;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .chart-legend {
    justify-content: flex-start;
  }
}
</style>
