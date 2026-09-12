import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { servicesGetStatus } from '@/api/services'

const POLL_INTERVAL_MS = 10000
const ALLOWED_STATUS = new Set(['running', 'stopped', 'standby'])

function normalizeServices (value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object' && typeof item.key === 'string')
    .map((item) => ({
      key: item.key,
      name: typeof item.name === 'string' ? item.name : item.key,
      status: ALLOWED_STATUS.has(item.status) ? item.status : 'stopped',
      port: Number.isFinite(item.port) ? item.port : 0,
    }))
}

export const useServiceStatusStore = defineStore('serviceStatus', () => {
  const services = ref([])
  const loaded = ref(false)
  const unavailable = ref(false)
  let pollTimer = null
  let pollGeneration = 0

  async function refresh () {
    const generation = ++pollGeneration
    try {
      const response = await servicesGetStatus()
      if (generation !== pollGeneration) return false
      if (response && response.code === 0 && response.data && Array.isArray(response.data.services)) {
        services.value = normalizeServices(response.data.services)
        loaded.value = true
        unavailable.value = false
        return true
      }
      unavailable.value = true
      return false
    } catch {
      if (generation !== pollGeneration) return false
      unavailable.value = true
      return false
    }
  }

  function startPolling () {
    if (pollTimer) return
    refresh()
    pollTimer = setInterval(() => { refresh() }, POLL_INTERVAL_MS)
  }

  function stopPolling () {
    pollGeneration++
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const runningCount = computed(() => services.value.filter((s) => s.status === 'running').length)
  const allRunning = computed(() => services.value.length > 0 && services.value.every((s) => s.status === 'running' || s.status === 'standby'))

  return { services, loaded, unavailable, runningCount, allRunning, refresh, startPolling, stopPolling }
})
