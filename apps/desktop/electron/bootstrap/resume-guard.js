// @ts-check
/**
 * 休眠 / 唤醒重算守卫。
 *
 * 背景：调度器把「墙钟目标时间」换算成**一次性**相对延时 setTimeout
 * （shared-utils/src/scheduler.js:228-248），只在武装时算一次
 * `publishTimestamp - Date.now()`。这带来两类漂移：
 *
 *   1. 休眠跨越到点时间 —— 进程内 setTimeout 在挂起期间不推进，唤醒后才会触发。
 *      目标时间落在休眠窗口内时表现为「唤醒即补发」（可接受，语义等同 catch-up）；
 *      但目标时间在**休眠开始前**、机器睡了数小时后才唤醒时，会在唤醒后才发布，
 *      用户设定的时刻被推迟数小时，且没有任何提示。
 *   2. 系统时钟跳变（NTP 校正 / 用户手动改表）—— 已武装的定时器不受影响，
 *      仅当任务跨越 MAX_TIMER_DELAY（≈24.86 天）分片边界时才会在 armNextSegment
 *      重算时被动纠正。也就是说短周期任务在跳变后会**持续偏移**。
 *
 * 做法：监听 Electron powerMonitor 的 resume 事件，强制调度器重新评估所有未到点任务。
 * 调度器本就按「重新武装」幂等（scheduleTimer 内 isTaskTracked 去重），所以
 * 「重算」= 停掉现有定时器再 restore 一次，重叠的到点任务不会双派发。
 */

/**
 * @param {{
 *   powerMonitor?: { on: Function, removeListener?: Function },
 *   scheduler?: { rearm: Function } | null,
 *   getOwnerState?: () => unknown,
 *   logger?: { notify: Function },
 *   minSleepGapMs?: number
 * }} deps
 */
function createResumeGuard (deps) {
  const {
    powerMonitor,
    scheduler,
    getOwnerState,
    logger,
    minSleepGapMs = 60 * 1000
  } = deps

  let lastResumeAt = 0
  let attached = false

  function onResume () {
    const now = Date.now()
    // 系统休眠之外的小睡（锁屏、切换用户、应用最小化）也会触发 resume。
    // 只有确实「睡了有意义的时间」才值得重算，避免每次唤醒都做全量文件重写。
    if (lastResumeAt && now - lastResumeAt < minSleepGapMs) {
      lastResumeAt = now
      return
    }
    lastResumeAt = now

    if (!scheduler || typeof scheduler.rearm !== 'function') return
    try {
      const state = typeof getOwnerState === 'function' ? getOwnerState() : undefined
      const rearmed = scheduler.rearm(state)
      if (logger && rearmed > 0) {
        logger.notify('Scheduler', 'pending-tasks-rearmed-after-resume', { params: { count: rearmed } })
      }
    } catch (error) {
      // 恢复属旁路：唤醒后重算失败不能影响应用运行，下一次 resume 或重启仍会兜底。
      if (logger) {
        logger.notify('Scheduler', 'resume-rearm-failed', {
          level: 'WARN',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  function attach () {
    if (attached) return false
    if (!powerMonitor || typeof powerMonitor.on !== 'function') return false
    if (!scheduler || typeof scheduler.rearm !== 'function') return false
    powerMonitor.on('resume', onResume)
    attached = true
    return true
  }

  function detach () {
    if (!attached || !powerMonitor) return false
    if (typeof powerMonitor.removeListener === 'function') {
      powerMonitor.removeListener('resume', onResume)
    } else if (typeof powerMonitor.off === 'function') {
      powerMonitor.off('resume', onResume)
    }
    attached = false
    return true
  }

  return { attach, detach, onResume, isAttached: () => attached }
}

module.exports = { createResumeGuard }