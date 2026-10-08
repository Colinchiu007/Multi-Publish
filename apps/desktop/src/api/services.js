/**
 * Services API 封装 — 服务状态面板（状态查询 / 重启）
 *
 * M-9 收敛：改走 electron-bridge，行为与旧实现一致
 * （无 API / 缺方法时回 SERVICES_API_UNAVAILABLE 信封）。
 */
import { invokeWithFallback } from './electron-bridge'

const UNAVAILABLE = Object.freeze({ code: -1, message: 'SERVICES_API_UNAVAILABLE' })

export async function servicesGetStatus() {
  return invokeWithFallback('servicesGetStatus', UNAVAILABLE)
}

export async function servicesRestart(key) {
  return invokeWithFallback('servicesRestart', UNAVAILABLE, key)
}
