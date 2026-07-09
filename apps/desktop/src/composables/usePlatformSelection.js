// @ts-check
/**
 * usePlatformSelection.js — 平台选择 composable（从 Publish.vue 拆分）
 *
 * 职责：
 *   - 维护 selectedPlatforms / selectedAccounts 状态
 *   - togglePlatform 切换平台选择
 *   - hasVideoPlatforms 检测视频平台
 *   - watch 同步 selectedAccounts 默认值
 *
 * 依赖：accountStore（传入参数）
 */
import { ref, computed, watch } from 'vue'

const VIDEO_PLATFORMS = ['douyin', 'tencent_video', 'kuaishou']

/**
 * 平台选择 composable
 * @param {object} accountStore - 账号 store（需有 byPlatform / getDefault）
 * @returns {object} 响应式状态 + 方法
 */
export function usePlatformSelection(accountStore) {
  const selectedPlatforms = ref(['wechat_mp'])
  const selectedAccounts = ref({}) // { platformId: accountId }

  const hasVideoPlatforms = computed(function () {
    return selectedPlatforms.value.some(function (p) {
      return VIDEO_PLATFORMS.indexOf(p) !== -1
    })
  })

  function togglePlatform(platformId) {
    const idx = selectedPlatforms.value.indexOf(platformId)
    if (idx === -1) {
      selectedPlatforms.value.push(platformId)
    } else {
      selectedPlatforms.value.splice(idx, 1)
    }
  }

  function getAccounts(platformId) {
    return (accountStore.byPlatform && accountStore.byPlatform[platformId]) || []
  }

  function getDefaultAccount(platformId) {
    return accountStore.getDefault(platformId)
  }

  // 同步 selectedAccounts 默认值
  watch(selectedPlatforms, function (newPlatforms) {
    for (const pid of newPlatforms) {
      if (!selectedAccounts.value[pid]) {
        const def = getDefaultAccount(pid)
        if (def) selectedAccounts.value[pid] = def.id
      }
    }
    // 清理已移除平台的账号
    for (const pid of Object.keys(selectedAccounts.value)) {
      if (newPlatforms.indexOf(pid) === -1) {
        delete selectedAccounts.value[pid]
      }
    }
  }, { deep: true })

  return {
    selectedPlatforms,
    selectedAccounts,
    hasVideoPlatforms,
    togglePlatform,
    getAccounts,
    getDefaultAccount,
  }
}
