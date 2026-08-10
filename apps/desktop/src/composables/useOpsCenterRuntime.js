/**
 * useOpsCenterRuntime.js — 运营后台运行时策略 composable
 *
 * 读取主进程 OpsCenterSync 缓存的公告 / 内容安全策略状态，
 * 供 App.vue 公告横幅展示；无同步配置或未拉取时为空（静默）。
 */
import { ref } from 'vue'
import { opsCenterSyncRuntime } from '@/api/ops-center-sync'

const SEVERITY_LABELS = { info: '提示', warning: '重要提醒', maintenance: '系统维护' }

export function useOpsCenterRuntime () {
  const announcements = ref([])
  const updatePolicy = ref(null)
  const contentPolicy = ref(null)
  const syncedAt = ref('')
  const loaded = ref(false)

  async function loadRuntime () {
    const res = await opsCenterSyncRuntime()
    if (res.code === 0 && res.data) {
      announcements.value = Array.isArray(res.data.announcements) ? res.data.announcements : []
      updatePolicy.value = res.data.updatePolicy || null
      contentPolicy.value = res.data.contentPolicy || null
      syncedAt.value = res.data.syncedAt || ''
    }
    loaded.value = true
    return res
  }

  return {
    announcements,
    updatePolicy,
    contentPolicy,
    syncedAt,
    loaded,
    loadRuntime,
    SEVERITY_LABELS,
  }
}
