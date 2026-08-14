import axios from 'axios'
import { useAuthStore } from '../stores/auth'

/**
 * 统一 API 客户端工厂：
 * - 请求自动携带 localStorage 中的 ops_token（Bearer）
 * - 收到 401 时清理登录态（Pinia 内存态 + localStorage）并跳转登录页，
 *   杜绝"半登录态"：token 失效后页面仍放行、接口全部报令牌无效。
 */
export function createApiClient(config = {}) {
  const api = axios.create({ baseURL: '/api/v1', ...config })

  api.interceptors.request.use((reqConfig) => {
    const saved = localStorage.getItem('ops_token')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        if (data.token) reqConfig.headers.Authorization = 'Bearer ' + data.token
      } catch { /* 忽略损坏的本地存储 */ }
    }
    return reqConfig
  })

  api.interceptors.response.use(
    (res) => res,
    (err) => {
      if (err.response?.status === 401) {
        try {
          useAuthStore().logout()
        } catch {
          // Pinia 未初始化（极端情况）：至少清理持久化 token，刷新后路由守卫会跳登录页
          localStorage.removeItem('ops_token')
          window.location.reload()
        }
        if (window.location.hash !== '#/login') {
          window.location.hash = '#/login'
        }
      }
      return Promise.reject(err)
    }
  )

  return api
}
