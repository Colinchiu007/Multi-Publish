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
import { normalizeAccountIds } from '@/features/publish/publish-contract'

const VIDEO_PLATFORMS = ['douyin', 'tencent_video', 'kuaishou']

/**
 * 平台选择 composable
 * @param {object} accountStore - 账号 store（需有 byPlatform / getDefault）
 * @returns {object} 响应式状态 + 方法
 */
export function usePlatformSelection(accountStore) {
  const selectedPlatforms = ref(['wechat_mp'])
  const selectedAccounts = ref({}) // { platformId: accountId[] }

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
    const byPlatform = accountStore.byPlatform?.value || accountStore.byPlatform
    return (byPlatform && byPlatform[platformId]) || []
  }

  function getDefaultAccount(platformId) {
    return accountStore.getDefault(platformId)
  }

  function getSelectedAccountIds(platformId) {
    return normalizeAccountIds(selectedAccounts.value[platformId])
  }

  function setSelectedAccountIds(platformId, accountIds) {
    selectedAccounts.value[platformId] = normalizeAccountIds(accountIds)
  }

  function toggleAccount(platformId, accountId) {
    const current = getSelectedAccountIds(platformId)
    const index = current.indexOf(accountId)
    if (index === -1) current.push(accountId)
    else current.splice(index, 1)
    setSelectedAccountIds(platformId, current)
  }

  function isAccountSelected(platformId, accountId) {
    return getSelectedAccountIds(platformId).includes(accountId)
  }

  function getAvailableAccountIds(platformId) {
    return normalizeAccountIds(getAccounts(platformId).map(account => (
      account?.id || account?.accountId || account?.account_id
    )))
  }

  function isAccountAvailable(platformId, accountId) {
    return getAvailableAccountIds(platformId).includes(accountId)
  }

  function sameAccountIds(rawValue, accountIds) {
    if (!Array.isArray(rawValue) || rawValue.length !== accountIds.length) return false
    return rawValue.every((id, index) => id === accountIds[index])
  }

  function reconcileSelectedAccounts() {
    const newPlatforms = Array.isArray(selectedPlatforms.value) ? selectedPlatforms.value : []
    for (const pid of newPlatforms) {
      const availableIds = getAvailableAccountIds(pid)
      const availableIdSet = new Set(availableIds)
      let selected = getSelectedAccountIds(pid).filter(accountId => availableIdSet.has(accountId))
      if (selected.length === 0 && availableIds.length > 0) {
        const def = getDefaultAccount(pid)
        const defaultId = def?.id || def?.accountId || def?.account_id
        if (typeof defaultId === 'string' && availableIdSet.has(defaultId)) selected = [defaultId]
      }
      if (selected.length > 0) {
        if (!sameAccountIds(selectedAccounts.value[pid], selected)) {
          setSelectedAccountIds(pid, selected)
        }
      } else if (Object.prototype.hasOwnProperty.call(selectedAccounts.value, pid)) {
        delete selectedAccounts.value[pid]
      }
    }
    for (const pid of Object.keys(selectedAccounts.value)) {
      if (newPlatforms.indexOf(pid) === -1) {
        delete selectedAccounts.value[pid]
      }
    }
  }

  watch(
    [selectedPlatforms, () => accountStore.byPlatform?.value || accountStore.byPlatform, selectedAccounts],
    reconcileSelectedAccounts,
    { deep: true },
  )

  return {
    selectedPlatforms,
    selectedAccounts,
    hasVideoPlatforms,
    togglePlatform,
    getAccounts,
    getDefaultAccount,
    getSelectedAccountIds,
    setSelectedAccountIds,
    toggleAccount,
    isAccountSelected,
    getAvailableAccountIds,
    isAccountAvailable,
    reconcileSelectedAccounts,
  }
}
