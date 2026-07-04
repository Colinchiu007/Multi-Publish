/**
 * License Store — Pinia
 * Manages license/pro status for the frontend
 */
import { defineStore } from "pinia"
import { ref, computed } from "vue"

const getApi = () => window.electronAPI || null

export const useLicenseStore = defineStore("license", () => {
  const info = ref({ type: "free", isPro: false, features: [], daysRemaining: 0 })
  const loading = ref(false)

  async function load() {
    const api = getApi()
    if (!api) return
    loading.value = true
    try {
      const res = await api.licenseInfo()
      if (res && res.code === 0) {
        info.value = res.data
      }
    } catch (e) {
      info.value = { type: "free", isPro: false, features: [], daysRemaining: 0 }
    } finally {
      loading.value = false
    }
  }

  async function activate(key) {
    const api = getApi()
    if (!api) return null
    try {
      const res = await api.licenseActivate(key)
      if (res && res.code === 0) {
        await load()
        return true
      }
      return false
    } catch (e) {
      return false
    }
  }

  async function deactivate() {
    const api = getApi()
    if (!api) return
    await api.licenseDeactivate()
    await load()
  }

  async function activateTrial() {
    const api = getApi()
    if (!api) return false
    try {
      const res = await api.licenseActivateTrial()
      if (res && res.code === 0) {
        await load()
        return true
      }
      return false
    } catch (e) {
      return false
    }
  }

  const isPro = computed(() => info.value.isPro || false)
  const isTrial = computed(() => info.value.isTrial || false)
  const isFree = computed(() => !info.value.isPro)
  const licenseType = computed(() => info.value.type || "free")
  const daysRemaining = computed(() => info.value.daysRemaining || 0)

  return {
    info, loading, load, activate, deactivate, activateTrial,
    isPro, isTrial, isFree, licenseType, daysRemaining,
  }
})
