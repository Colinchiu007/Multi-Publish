/**
 * publish-failure-draft-saver — 发布失败自动存草稿的渲染层提示（publish-fail-draft-guard）
 *
 * 纯 DI 工厂，不触碰渲染框架（node/jsdom 均可测），风格对齐 risk-hold-notifier。
 *
 * 职责边界（PRD §5.3）：**只做一次性提示**。去重与写入的真源都在主进程
 * （draftSave 内容指纹幂等 + task:failed 自动回存）；本模块不感知保存结果，
 * 不承载进度状态（发布进度状态唯一承载是 stores/publishProgress.js）。
 *
 * @param {Object} deps
 * @param {(cb: Function) => Function} deps.onProgress - 订阅 publish:progress（api.onProgress）
 * @param {(payload: Object) => void} deps.notify - 失败提示（注入以隔离 UI；由调用方转 i18n toast）
 * @param {number} [deps.maxSeen] - 已提示 taskId 记忆上限，默认 100（防长会话内存增长）
 */
export function createFailureDraftSaver(deps) {
  const { onProgress, notify } = deps || {}
  if (typeof onProgress !== 'function') throw new TypeError('createFailureDraftSaver: onProgress must be a function')
  if (typeof notify !== 'function') throw new TypeError('createFailureDraftSaver: notify must be a function')
  const maxSeen = Number.isFinite(deps.maxSeen) && deps.maxSeen > 0 ? deps.maxSeen : 100

  const seenTaskIds = new Set()
  let unsubscribe = null

  function handle(payload) {
    const p = payload || {}
    if (p.phase !== 'failed') return
    if (typeof p.taskId !== 'string' || !p.taskId) return
    if (seenTaskIds.has(p.taskId)) return
    seenTaskIds.add(p.taskId)
    while (seenTaskIds.size > maxSeen) {
      const oldest = seenTaskIds.values().next().value
      seenTaskIds.delete(oldest)
    }
    try {
      notify(p)
    } catch (_) {
      // 提示失败不影响订阅回调
    }
  }

  function start() {
    if (unsubscribe) return unsubscribe
    unsubscribe = onProgress(handle)
    return unsubscribe
  }

  function stop() {
    if (typeof unsubscribe === 'function') {
      try { unsubscribe() } catch (_) { /* 取消订阅失败不抛出 */ }
    }
    unsubscribe = null
  }

  return { start, stop, handle }
}
