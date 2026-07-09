// @ts-check
/**
 * useOfflineStatus.js — 离线状态 composable（从 App.vue 拆分）
 *
 * 职责：
 *   - 维护 isOffline / cachedTaskCount 状态
 *   - init 调用 electronAPI.offlineStatus 获取初始状态 + 注册 onOfflineRestored 监听
 */
import { ref } from 'vue'

/**
 * 离线状态 composable
 * @returns {object} 响应式状态 + 方法
 */
export function useOfflineStatus() {
  const isOffline = ref(false)
  const cachedTaskCount = ref(0)

  function init() {
    const api = window.electronAPI
    if (!api) return
    if (api.offlineStatus) {
      try {
        api.offlineStatus().then(function (res) {
          if (res && res.code === 0 && res.data) {
            isOffline.value = res.data.offline
            cachedTaskCount.value = res.data.cachedCount
          }
        }).catch(function () { /* 静默失败 */ })
      } catch (e) { /* 同步抛错也静默 */ }
    }
    if (api.onOfflineRestored) {
      api.onOfflineRestored(function (data) {
        isOffline.value = false
        cachedTaskCount.value = (data && data.cachedCount) || 0
      })
    }
  }

  return {
    isOffline,
    cachedTaskCount,
    init,
  }
}
