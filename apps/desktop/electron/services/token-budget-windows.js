'use strict'
/**
 * token-budget-windows.js — ApiUsageGovernor 的额度窗口准入/归还（从主文件拆出）
 *
 * 拆分理由：主文件因这套逻辑越过逐文件行数门禁；更重要的是这两步有独立且可单测的契约
 * （「判定与提交分离」「归还按代次」），放在同一文件里容易被后续改动连带动到。
 * governor 侧只保留 `_reserveTokenBudget` / `_releaseTokenBudget` / `_quotaExceeded` 三个薄委托，
 * 窗口对象的解析（精确 key vs provider 级共享）仍归 governor 所有 —— 本模块只吃已解析好的数组。
 */

const { ProviderError, ERROR_CODES } = require('./adapters/_base/provider-error')

/**
 * 额度超限时抛出的错误。文案按窗口字段分词：
 * requests 窗口计的是**请求次数**（coding plan 的 5h 次数限额），说成 "token 额度" 会把用户
 * 引向「去买更多 token」这种错误处置；两类窗口的语义不同，文案必须分开。
 */
function quotaExceededError (key, win) {
  const label = win.windowMs >= 7 * 24 * 3600 * 1000 ? '每周' : (win.windowMs >= 3600 * 1000 ? '每 5 小时' : '当前周期')
  const unit = win.field === 'requests' ? '请求次数额度' : 'token 额度'
  return new ProviderError(
    ERROR_CODES.QUOTA_EXCEEDED,
    '该模型 API 的' + label + ' ' + unit + '（' + win.limit + '）已用完，请检查套餐额度或更换模型后再试。',
    { providerId: key },
  )
}

/**
 * 额度窗口准入。按请求次数计的窗口做**原子的检查并预留**：判定通过的同一时刻即 used += 1，
 * 因此并发在途请求读到的一定是已含自己的计数，第 limit+1 个起根本不会去执行真实调用。
 * 按 token 数计的窗口无法预扣（成本未知），不参与预留，只由调用方做事后断言。
 *
 * 必须分两遍：第一遍只做判定、第二遍统一提交。逐窗口「边检查边 +1」会在后面的窗口判满时抛错，
 * 而预留凭据此刻还没返回给调用方（调用方只在受管执行失败时归还），前面窗口已经 +1
 * 的那几份就**永久泄漏**——配了多个窗口的 provider 会让宽窗白吃额度。
 * @param {string} key 仅用于错误上下文
 * @param {Array<object>} windows 已由 governor 解析好的运行时窗口对象
 * @returns {Array<{win: object, startedAt: number}>} 本次调用拿到的预留凭据（按窗口代次）
 */
function reserveRequestsBudget (key, windows) {
  if (!windows || windows.length === 0) return []
  const now = Date.now()
  // 第一遍：纯判定，不修改任何窗口状态
  const plans = []
  for (const win of windows) {
    const isRequests = win.field === 'requests'
    const expired = now - win.startedAt >= win.windowMs
    if (expired && !isRequests) continue // token 类过期仍由记账路径重置
    const baseUsed = expired ? 0 : win.used
    if (baseUsed >= win.limit) throw quotaExceededError(key, win)
    if (!isRequests) continue
    plans.push({ win, expired })
  }
  // 第二遍：统一提交。此段不会再抛错，因此不存在「部分预留」
  const reservations = []
  for (const plan of plans) {
    if (plan.expired) {
      plan.win.used = 0
      plan.win.startedAt = now
    }
    plan.win.used += 1
    reservations.push({ win: plan.win, startedAt: plan.win.startedAt })
  }
  return reservations
}

/**
 * 归还**requests 类**窗口的预留（token 类没有预留，凭据数组对它们是空的）。
 * 只作用于自己那一代窗口：窗口若在调用期间过期并被重置，新计数里并没有这次占用，
 * 减它会把新窗口打穿到负数——所以代次不符一律跳过。
 */
function releaseRequestsBudget (reservations) {
  if (!reservations || reservations.length === 0) return
  for (const r of reservations) {
    if (r.win.startedAt !== r.startedAt) continue
    r.win.used = Math.max(0, r.win.used - 1)
  }
}

module.exports = { quotaExceededError, reserveRequestsBudget, releaseRequestsBudget }
