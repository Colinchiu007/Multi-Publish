import axios from 'axios'
import { useAuthStore } from '../stores/auth'

/**
 * 统一 API 客户端工厂：
 * - 请求自动携带 localStorage 中的 ops_token（Bearer）
 * - 收到 401 时清理登录态（Pinia 内存态 + localStorage）并跳转登录页，
 *   杜绝"半登录态"：token 失效后页面仍放行、接口全部报令牌无效。
 */
/**
 * 统一 API 错误文案：
 * - 传输层失败（e.response 缺失：后端未启动 / 开发服务器不可达 / 连接被拒）时，
 *   给出可操作提示，避免用户只看到裸 "Network Error" 无法自助排查；
 * - HTTP 错误优先展示后端 detail，缺失时回退到 axios message。
 */
export function apiErrorMessage(e, fallback = '操作失败，请稍后重试') {
  if (!e) return fallback
  if (!e.response) {
    // 仅真正连接失败（axios ERR_NETWORK）映射为可操作提示；超时/取消等保留原 message
    const isConnectionFailure = e.code === 'ERR_NETWORK' || e.message === 'Network Error'
    if (isConnectionFailure) {
      return '无法连接后端服务（Network Error）：请确认 ops-center 后端已启动（uvicorn main:app --port 8010），然后刷新页面重试'
    }
    return e.message || fallback
  }
  return e.response.data?.detail || e.message || fallback
}

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
