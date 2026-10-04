/**
 * 登录门禁判定（渲染端共享）
 *
 * 主进程 license-access-control 对非公开通道返回 `{ code: -3, errorCode: 'AUTH_REQUIRED' }`
 * （未登录）或 `{ code: -3, errorCode: 'ENTITLEMENT_REQUIRED' }`（登录但权益不足）。
 * 两者同为 code:-3 —— 判定必须按 errorCode，数值码只在 errorCode 缺失时兜底（遗留形态）。
 * 权限拒绝 ≠ 传输故障，调用方必须分流展示，禁止把 AUTH_REQUIRED 写成「服务连接失败」。
 *
 * 范式来源：PR #1854（publish-history 登录引导门控，2026-09-15）。
 * 详细规格：01-docs/PRD-PUBLISH-HISTORY-LOGIN-GATE-2026-09-15.md
 */
export function isAuthGateResult (result) {
  if (!result || typeof result !== 'object') return false
  if (result.errorCode === 'AUTH_REQUIRED' || result.errorCode === 'NOT_SIGNED_IN') return true
  return result.errorCode == null && result.code === -3
}

/**
 * 「抛错形态」的权限拒绝判定（与上面的信封形态成对，唯一实现仍在本文件）。
 *
 * 为什么必须单独存在：`electron/preload/access-control.js` 对受限方法在**调用 IPC 之前**
 * 就 `throw createPermissionError()`（name='LicensePermissionError'、code=-3），
 * 而 `invokeWithFallback` 不捕获异常 —— 于是未登录用户走的是 reject 分支，不是 code:-3 信封分支。
 * 只判信封的调用方会把「没登录」渲染成「加载失败」（QM-6 后端轴 FB6 实测）。
 * 判据取 name/code 这两个契约字段，不取错误文案（文案是给人看的，会随措辞变）。
 */
export function isAuthGateError (error) {
  if (!error || typeof error !== 'object') return false
  if (error.name === 'LicensePermissionError') return true
  return error.code === -3 && typeof error.message === 'string'
}
