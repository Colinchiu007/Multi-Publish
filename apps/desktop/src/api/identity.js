/**
 * Identity API 封装 — 调用 Electron IPC（登录态 / 账号切换 / 诊断）
 *
 * M-9 收敛：不再自持 getApi 副本，改走 electron-bridge。
 * 行为保持与旧实现逐字段一致：
 *   - invoke 失败 / preload 缺方法时回 IDENTITY_API_UNAVAILABLE 信封
 *     （invokeWithFallback 的 fallback 即此信封；主进程真返回的错误原样透传）；
 *   - onIdentityStateChanged 无监听能力时返回空取消函数。
 */
import { invokeWithFallback, on } from './electron-bridge'

const UNAVAILABLE = Object.freeze({ code: -1, message: 'IDENTITY_API_UNAVAILABLE' })

export async function identityGetState() {
  return invokeWithFallback('identityGetState', UNAVAILABLE)
}

export async function identitySignIn() {
  return invokeWithFallback('identitySignIn', UNAVAILABLE)
}

export async function identitySwitchAccount() {
  return invokeWithFallback('identitySwitchAccount', UNAVAILABLE)
}

export async function identitySignOut() {
  return invokeWithFallback('identitySignOut', UNAVAILABLE)
}

export async function identityDiagnosticReport() {
  return invokeWithFallback('identityDiagnosticReport', UNAVAILABLE)
}

export function onIdentityStateChanged(callback) {
  return on('IdentityStateChanged', callback)
}
