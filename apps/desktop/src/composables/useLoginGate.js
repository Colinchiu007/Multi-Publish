/**
 * useLoginGate.js — 主动操作登录门（渐进式登录）
 *
 * 场景：未登录用户触发「主动操作」（发布 / 批量发布 / AI 写作 / 流水线启动等）时，
 * 不再只显示错误提示，而是弹登录引导 → 登录成功后自动继续原操作。
 *
 * 规则：
 * - 已登录（isAuthenticated）→ 直接放行
 * - 身份服务未配置/不可用（status === 'disabled' | 'error'）→ 提示后拒绝（fail-closed，不弹登录）
 * - 未登录 → 弹确认框「立即登录」→ identityStore.signIn()（主进程打开 Logto OAuth）→
 *   登录成功且 authenticated → 放行；用户取消 / 登录失败 → 拒绝
 *
 * 单例防重入：并发多处触发时只弹一次登录，其余等待同一登录流程。
 */
import { ElMessageBox, ElMessage } from 'element-plus'
import { useIdentityStore } from '@/stores/identity'

let activeSignIn = null

export function useLoginGate () {
  const identityStore = useIdentityStore()

  async function openSignIn () {
    if (activeSignIn) return activeSignIn
    activeSignIn = identityStore.signIn().finally(() => { activeSignIn = null })
    return activeSignIn
  }

  /**
   * 主动操作登录前置守卫。
   * @param {object} [options]
   * @param {string} [options.message] 未登录确认框文案
   * @param {string} [options.disabledMessage] 身份服务不可用提示
   * @returns {Promise<boolean>} 已登录 / 登录成功 = true；取消 / 失败 / 不可用 = false
   */
  async function ensureLogin (options = {}) {
    const message = options.message || '该功能需要登录后使用，是否立即登录？'
    const disabledMessage = options.disabledMessage || '当前身份服务未配置，无法登录。请在主进程配置身份服务后重试。'

    if (identityStore.isAuthenticated) return true
    if (identityStore.status === 'disabled' || identityStore.status === 'error') {
      ElMessage.warning(disabledMessage)
      return false
    }
    try {
      await ElMessageBox.confirm(message, '需要登录', {
        confirmButtonText: '立即登录',
        cancelButtonText: '暂不',
        type: 'warning',
      })
    } catch {
      return false // 用户取消
    }
    const ok = await openSignIn()
    if (!ok || !identityStore.isAuthenticated) {
      ElMessage.warning('登录未完成，操作已取消')
      return false
    }
    return true
  }

  /** 登录成功后才执行 action（简单场景便捷封装） */
  async function requireLogin (action, options = {}) {
    if (await ensureLogin(options)) return action()
    return false
  }

  return { ensureLogin, requireLogin, openSignIn }
}

export default useLoginGate
