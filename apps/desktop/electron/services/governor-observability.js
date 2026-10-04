// @ts-check
'use strict'

/**
 * governor-observability.js — P1 调度可观测性累加器（纯模块，无主进程副作用依赖）
 *
 * 仅计数 provider 排队/冷却实际等待事件与总等待毫秒；不改调度语义。
 * 由用量上报取走并清零（内存计数，重启归零可接受）。
 * 与 governor-constants.js 同级：保持纯函数/纯数据，不引入 log / AsyncLocalStorage / class 依赖，
 * 以便从 api-usage-governor.js 抽离、压低其行数并维持债务熔断门禁（<500 行）。
 */

/**
 * 创建一个独立的调度可观测性累加器实例。
 * @returns {{
 *   record: (providerId: string, obs: { queuedMs?: number, cooldownMs?: number }) => void,
 *   takeSnapshot: () => Record<string, { queuedCount: number, cooldownCount: number, queueWaitMs: number, cooldownWaitMs: number }>,
 * }}
 */
function createObservabilityTracker() {
  /** @type {Map<string, { queuedCount: number, cooldownCount: number, queueWaitMs: number, cooldownWaitMs: number }>} */
  const store = new Map()

  // 跳过默认的 / 空 providerId（无有效归属维度，计入只会污染聚合）。
  function record(providerId, obs) {
    if (!providerId || providerId === 'default' || providerId === '') return
    const prev =
      store.get(providerId) ||
      { queuedCount: 0, cooldownCount: 0, queueWaitMs: 0, cooldownWaitMs: 0 }
    prev.queuedCount += obs.queuedMs > 0 ? 1 : 0
    prev.cooldownCount += obs.cooldownMs > 0 ? 1 : 0
    prev.queueWaitMs += obs.queuedMs
    prev.cooldownWaitMs += obs.cooldownMs
    store.set(providerId, prev)
  }

  // 取走并清零（读后清空，避免重复上报）。空时返回 {}。
  function takeSnapshot() {
    if (store.size === 0) return {}
    const snap = {}
    for (const [pid, v] of store) snap[pid] = { ...v }
    store.clear()
    return snap
  }

  return { record, takeSnapshot }
}

module.exports = { createObservabilityTracker }
