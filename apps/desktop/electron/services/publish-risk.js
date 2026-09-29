'use strict'
/**
 * publish-risk.js — 桌面侧风控命中判定（W1 §5.4 生产端）
 *
 * 从发布失败的错误文本识别 risk_blocked（风控命中），与引擎 publish-mode-runner 的 RISK_RE 词表保持同义。
 * 纯函数、零依赖、可测；命中后由 phase4-events 发 publish:risk-hold IPC，供渲染层通知中心与后续挂起守卫消费。
 * 合规红线：风控即停、绝不自动换号绕过——本模块只做识别，不含任何自动恢复逻辑。
 *
 * 2026-10-08 P0-2 词表增强（参考产品 4.13.19 逆向取证）：补 canvas illegal
 * （抖音/西瓜风控特征串，参考产品 -110 码族的触发条件之一）与「账号存在风险」
 * （参考产品风控提示原文）。只加特征明确、无误伤面的串；宽泛词（如「服务异常」）
 * 会把普通服务端错误误判成风控，刻意不加。
 */
const RISK_RE = /风控|risk|滑块|601|10000015|frequent|频繁|verify|验证|安全验证|操作频繁|captcha|canvas illegal|账号存在风险/i

/**
 * @param {unknown} errorMessage - 发布失败的错误文本（task.error）
 * @returns {boolean} true 表示疑似风控命中，应挂起该平台并通知
 */
function isRiskBlocked (errorMessage) {
  if (typeof errorMessage !== 'string' || !errorMessage) return false
  return RISK_RE.test(errorMessage)
}

module.exports = { isRiskBlocked }
