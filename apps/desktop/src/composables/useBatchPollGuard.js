/**
 * useBatchPollGuard —— 批量轮询的失败兜底守卫（报告 M-3）
 *
 * 缺陷背景：`Collection.vue` 的 `startBatchPolling` 里 catch 分支是空的 ——
 * 只写了一句注释「轮询失败不立即中断，继续下次轮询」，既不计数、也不设总时长
 * 上限、也不给用户任何提示、也不复位 `batchCollecting`。于是只要 IPC 持续失败
 * （主进程重启 / 任务记录丢失 / 鉴权失效），`batchCollecting` 永远为 true：
 *   - 两个发起按钮被 `:disabled="batchCollecting"` 永久锁死；
 *   - 进度条停在中间值；
 *   - 用户看不到任何错误文案，只能靠猜「取消」退出。
 *
 * 已实证（基线 770967c0，报告附录 C）：连续 20 轮 reject（约 40 秒）后
 * `batchCollecting` 仍为 true、`batchError` 为空、轮询仍在运行。
 *
 * 本守卫抽成 composable 而非塞在组件里，有两个原因：
 *   1. `Collection.vue` 早已在 max-lines 台账上（登记 2721），再加内联逻辑会
 *      触发 LEDGER_GREW；
 *   2. 「连续失败计数 + 总时长上限 + 统一收口」是与视图无关的纯状态机，
 *      换个页面要轮询同样能直接复用。
 */

/** 轮询间隔（与调用方 setInterval 保持一致） */
export const BATCH_POLL_INTERVAL_MS = 2000

/**
 * 连续失败阈值。2000ms × 10 ≈ 20 秒，足以覆盖「主进程重启 / 任务记录短暂丢失 /
 * 鉴权刷新」这类瞬时故障；超过即视为不可恢复。
 */
export const BATCH_POLL_MAX_CONSECUTIVE_FAILURES = 10

/** 总时长上限：兜「每轮都成功但任务永不终结」的活锁（10 分钟） */
export const BATCH_POLL_MAX_DURATION_MS = 600000

/**
 * 创建一轮轮询的失败守卫。
 *
 * @param {object} deps
 * @param {(msg: string) => void} deps.onFail   收口回调：提示 + 停止 + 复位
 * @param {() => number} [deps.now]            时间源（默认 Date.now，测试可注入）
 * @returns {{
 *   reset: () => void,
 *   onSuccess: () => void,
 *   checkDuration: () => boolean,
 *   recordFailure: () => { failed: boolean, count: number },
 *   elapsed: () => number,
 * }}
 */
export function useBatchPollGuard ({ onFail, now = Date.now } = {}) {
  let consecutiveFailures = 0
  // startedAt 用 null 而非 0 表示「未开始计时」：注入的时间源完全可能返回 0，
  // 用 0 当哨兵会把「刚好从 0 时刻开始」误判成「没开始」，从而永远不超时。
  let startedAt = null

  return {
    /** 开始一轮新的轮询：重置计数与计时 */
    reset () {
      consecutiveFailures = 0
      startedAt = now()
    },

    /**
     * 查询成功即清零 —— 只统计「连续」失败。
     * 间歇性抖动（失败一次、成功一次）绝不能累计到阈值把正常采集误停。
     */
    onSuccess () {
      consecutiveFailures = 0
    },

    /**
     * 总时长上限检查。返回 true 表示已超限、调用方应停止轮询。
     * 用 `>` 而非 `>=` 是为了让「恰好 10 分钟」仍算有效。
     */
    checkDuration () {
      if (startedAt === null) return false
      return now() - startedAt > BATCH_POLL_MAX_DURATION_MS
    },

    /**
     * 记录一次失败。返回 `{ failed, count }`：
     *   - `failed: true` 表示已达阈值，调用方应走 onFail 收口；
     *   - `count` 是当前连续失败次数，用于向用户说明「连续 N 次」。
     */
    recordFailure () {
      consecutiveFailures += 1
      return {
        failed: consecutiveFailures >= BATCH_POLL_MAX_CONSECUTIVE_FAILURES,
        count: consecutiveFailures,
      }
    },

    /** 已轮询时长（毫秒），便于测试与诊断 */
    elapsed () {
      return startedAt === null ? 0 : now() - startedAt
    },
  }
}
