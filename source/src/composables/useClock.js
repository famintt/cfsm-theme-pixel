import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useClock(interval = 1000) {
  const now = ref(new Date())
  let timer = null

  onMounted(() => {
    now.value = new Date()
    timer = setInterval(() => {
      now.value = new Date()
    }, interval)
  })

  onBeforeUnmount(() => {
    clearInterval(timer)
  })

  return now
}
