import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { listAccounts } from '@/api/publisher'

/**
 * 账号管理 Store
 * 统一管理各平台账号列表，替代 App.vue / Publish.vue / Accounts.vue 中的重复 loadAccounts()
 */
export const useAccountStore = defineStore('accounts', () => {
  const accounts = ref([])
  const loading = ref(false)
  const error = ref(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const res = await listAccounts()
      if (res && res.code === 0 && Array.isArray(res.data)) {
        accounts.value = res.data
      } else if (Array.isArray(res)) {
        accounts.value = res
      } else {
        accounts.value = []
      }
    } catch (e) {
      error.value = e.message
      accounts.value = []
    } finally {
      loading.value = false
    }
  }

  /** 按平台分组 */
  const byPlatform = computed(() => {
    const map = {}
    for (const acc of accounts.value) {
      const p = acc.platform
      if (!map[p]) map[p] = []
      map[p].push(acc)
    }
    return map
  })

  /** 获取指定平台的第一个可用账号 */
  function getDefault(platform) {
    const list = byPlatform.value[platform]
    if (!list || list.length === 0) return null
    return list.find(a => a.is_default) || list[0]
  }

  return { accounts, loading, error, load, byPlatform, getDefault }
})
