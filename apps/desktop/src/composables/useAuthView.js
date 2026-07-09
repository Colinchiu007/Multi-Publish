// @ts-check
/**
 * useAuthView.js — 登录视图 composable（从 App.vue 拆分）
 *
 * 职责：
 *   - 维护 authViewVisible 状态
 *   - 注册 onAuthViewOpened / onAuthViewClosed / onAuthCompleted 监听
 *   - 提供 closeLogin 方法（调用 electronAPI.authClose）
 */
import { ref } from 'vue'

/**
 * 登录视图 composable
 * @returns {object} 响应式状态 + 方法
 */
export function useAuthView() {
  const authViewVisible = ref(false)

  function registerListeners() {
    const api = window.electronAPI
    if (!api) return
    if (api.onAuthViewOpened) {
      api.onAuthViewOpened(function () { authViewVisible.value = true })
    }
    if (api.onAuthViewClosed) {
      api.onAuthViewClosed(function () { authViewVisible.value = false })
    }
    if (api.onAuthCompleted) {
      api.onAuthCompleted(function () { authViewVisible.value = false })
    }
  }

  function closeLogin() {
    const api = window.electronAPI
    if (api && api.authClose) api.authClose()
    authViewVisible.value = false
  }

  return {
    authViewVisible,
    registerListeners,
    closeLogin,
  }
}
