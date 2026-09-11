import { ref } from 'vue'
import { onAuthCompleted, onAccountStatusChanged } from '@/api/publisher'
import { reportError } from '@/utils/report-error'

/**
 * 首页「登录失效提醒」横幅状态与自动刷新。
 *
 * - expiredAccounts / expiredAccountCount / showExpiredBanner 为横幅渲染状态；
 * - refresh() 重算（accountStore.load + 过滤 expired）；
 * - 事件订阅（onAuthCompleted / onAccountStatusChanged）让凭证保存成功或
 *   账号状态变化后横幅自动刷新，用户无需切页/重进首页；
 * - dispose() 清理全部订阅（组件 onUnmounted 调用）。
 */
export function useExpiredAccountsBanner (accountStore) {
  const expiredAccounts = ref([])
  const expiredAccountCount = ref(0)
  const showExpiredBanner = ref(false)

  async function refresh () {
    try {
      await accountStore.load()
      const expired = accountStore.accounts.filter(account => account.status === 'expired')
      expiredAccounts.value = expired
      expiredAccountCount.value = expired.length
      showExpiredBanner.value = expired.length > 0
    } catch (e) {
      reportError('刷新首页失效账号失败', e)
    }
  }

  const _cleanups = []
  function subscribeAutoRefresh () {
    for (const register of [onAuthCompleted, onAccountStatusChanged]) {
      try {
        const cleanup = register(() => { refresh() })
        if (typeof cleanup === 'function') _cleanups.push(cleanup)
      } catch (_) { /* Electron bridge 在纯浏览器环境不可用时保持静默 */ }
    }
  }

  function dispose () {
    for (const cleanup of _cleanups.splice(0)) {
      try { cleanup() } catch (_) { /* ignore */ }
    }
  }

  return { expiredAccounts, expiredAccountCount, showExpiredBanner, refresh, subscribeAutoRefresh, dispose }
}
