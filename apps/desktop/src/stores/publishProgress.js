// @ts-check
/**
 * publishProgress.js — 发布进度全局承载 store（publish-progress-ux）
 *
 * 契约（01-docs/PRD-PUBLISH-PROGRESS-UX-2026-09-28 §5.2）：
 * - `publish:progress` / `batch:progress` 订阅在 App 级绑定一次（init 幂等），
 *   不随任何页面组件卸载注销——修复单篇/批量监听器「毫秒级死亡」bug 的承载面。
 * - 多并发会话（单篇按 taskIds、批量按 batchId、孤儿按事件自动收纳）；
 *   渲染层重载经 `queue:status` 快照领养孤儿任务（恢复会话，状态级如实呈现）。
 * - 终态吸收：success/failed 后迟到的 progress/start 不回退状态（PRD §4.3）。
 * - 面板形态：panelVisible（展开浮卡）/ panelMinimized（常驻胶囊）互斥；
 *   首次隐藏教育 toast 标志持久化 localStorage（仅一次）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  onProgress,
  onBatchProgress,
  getQueueStatus,
  retryTask,
} from '@/api/publisher'

/** 会话列表上限：超出裁剪最旧已完成会话；全 running 不裁剪（宁多勿丢） */
export const MAX_SESSIONS = 5
/** 首次隐藏教育 toast 的 localStorage 键 */
export const FIRST_HIDE_TOAST_STORAGE_KEY = 'mp-publish-first-hide-toast-shown'

const PHASE_ENUM = new Set(['start', 'progress', 'success', 'failed', 'retry', 'blocked'])
const STAGE_KEY_ENUM = new Set([
  'prepare', 'upload', 'fill', 'submit', 'verify', 'waiting', 'done', 'failed', 'detail',
])
const TERMINAL_PHASES = new Set(['success', 'failed'])

let _sessionCounter = 0

function newSessionId() {
  _sessionCounter += 1
  return 's_' + _sessionCounter + '_' + Date.now()
}

function normalizePercent(value) {
  if (value === null || value === undefined) return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0 || num > 100) return null
  return num
}

function nowTimeString() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const usePublishProgressStore = defineStore('publishProgress', () => {
  const sessions = ref([])
  const panelVisible = ref(false)
  const panelMinimized = ref(false)
  const firstHideToastShown = ref(false)
  const retrying = ref(false)

  let listenersBound = false
  let offProgress = null
  let offBatchProgress = null

  // ─── 内部工具 ────────────────────────────────────────────────

  function _findSessionByTaskId(taskId) {
    return sessions.value.find((s) => Object.prototype.hasOwnProperty.call(s.tasks, taskId))
  }

  function _findSessionByBatchId(batchId) {
    return sessions.value.find((s) => s.batchId === batchId)
  }

  function _ensureTask(session, taskId, platform) {
    if (!session.tasks[taskId]) {
      session.tasks[taskId] = {
        taskId,
        platform: platform || '',
        phase: 'queued',
        stageKey: 'detail',
        stage: '',
        percent: null,
        result: null,
        error: null,
        remainingWait: null,
        retriesLeft: null,
        startedAt: null,
        endedAt: null,
        lastEventAt: null,
      }
      session.taskOrder.push(taskId)
    }
    return session.tasks[taskId]
  }

  function _appendLog(session, text, type) {
    session.log.push({ time: nowTimeString(), text, type })
    if (session.log.length > 200) session.log.splice(0, session.log.length - 200)
  }

  function _recomputeSessionStatus(session) {
    const taskIds = Object.keys(session.tasks)
    if (taskIds.length === 0) return
    const allTerminal = taskIds.every((id) => TERMINAL_PHASES.has(session.tasks[id].phase))
    if (allTerminal && session.status !== 'done') {
      session.status = 'done'
      session.finishedAt = Date.now()
    } else if (!allTerminal && session.status === 'done') {
      // 重试失败项后会话回到 running
      session.status = 'running'
      session.finishedAt = null
    }
  }

  function _pruneSessions() {
    if (sessions.value.length <= MAX_SESSIONS) return
    const overflow = sessions.value.length - MAX_SESSIONS
    const finished = sessions.value.filter((s) => s.status === 'done')
    if (finished.length === 0) return // 全 running：不裁剪
    const toRemove = new Set(finished.slice(0, overflow).map((s) => s.id))
    sessions.value = sessions.value.filter((s) => !toRemove.has(s.id))
  }

  // ─── 事件处理 ────────────────────────────────────────────────

  function handleProgressEvent(data) {
    if (!data || typeof data !== 'object') return
    const taskId = typeof data.taskId === 'string' ? data.taskId : ''
    const platform = typeof data.platform === 'string' ? data.platform : ''
    if (!taskId || !platform) {
      // R9：非法事件丢弃（不建会话）
      console.warn('[publishProgress] dropped invalid event (missing taskId/platform)')
      return
    }
    let session = _findSessionByTaskId(taskId)
    if (!session && typeof data.batchId === 'string' && data.batchId) {
      session = _findSessionByBatchId(data.batchId)
    }
    if (!session) {
      // R3：孤儿事件自动收纳
      session = _createSession({ title: null, batchId: null })
      _appendLog(session, platform, 'primary')
    }
    const task = _ensureTask(session, taskId, platform)
    task.platform = platform
    const phase = PHASE_ENUM.has(data.phase) ? data.phase : 'progress'
    const stageKey = STAGE_KEY_ENUM.has(data.stageKey) ? data.stageKey : 'detail'
    const isTerminalNow = TERMINAL_PHASES.has(phase)
    // 终态吸收：终态后迟到的非终态事件不回退状态（PRD §4.3）
    if (TERMINAL_PHASES.has(task.phase) && !isTerminalNow) {
      task.lastEventAt = Date.now()
      return
    }
    task.phase = phase
    task.stageKey = stageKey
    task.stage = typeof data.stage === 'string' ? data.stage : ''
    task.percent = normalizePercent(data.percent)
    task.lastEventAt = Date.now()
    if (data.result !== undefined) task.result = data.result || null
    if (data.error !== undefined) task.error = data.error || null
    if (data.remainingWait !== undefined) task.remainingWait = data.remainingWait || null
    if (data.retriesLeft !== undefined) task.retriesLeft = data.retriesLeft
    if (phase === 'start' && !task.startedAt) task.startedAt = Date.now()
    if (isTerminalNow && !task.endedAt) task.endedAt = Date.now()
    _appendLog(session, platform + ' · ' + (task.stage || phase), isTerminalNow ? (phase === 'success' ? 'success' : 'danger') : 'primary')
    _recomputeSessionStatus(session)
    _pruneSessions()
  }

  function handleBatchEvent(data) {
    if (!data || typeof data !== 'object') return
    if (typeof data.batchId !== 'string' || !data.batchId) return
    const session = _findSessionByBatchId(data.batchId)
    if (!session) return
    if (data.kind === 'batch-complete') {
      // 兜底终态：以事件计数为准，不覆盖已有任务终态
      session.status = 'done'
      session.finishedAt = Date.now()
      _appendLog(session, 'batch-complete', 'success')
      _pruneSessions()
    } else if (data.kind === 'task-complete' && typeof data.taskId === 'string' && data.taskId) {
      const task = _ensureTask(session, data.taskId, typeof data.platform === 'string' ? data.platform : '')
      if (!TERMINAL_PHASES.has(task.phase)) {
        task.phase = data.ok ? 'success' : 'failed'
        task.stageKey = data.ok ? 'done' : 'failed'
        task.percent = 100
        task.endedAt = Date.now()
        task.lastEventAt = Date.now()
        if (data.message && !data.ok) task.error = data.message
      }
      _recomputeSessionStatus(session)
    }
  }

  // ─── 会话登记 ────────────────────────────────────────────────

  function _createSession({ title, batchId }) {
    const session = {
      id: newSessionId(),
      batchId: typeof batchId === 'string' && batchId ? batchId : null,
      title: typeof title === 'string' && title ? title : '',
      createdAt: Date.now(),
      status: 'running',
      finishedAt: null,
      tasks: {},
      taskOrder: [],
      log: [],
    }
    sessions.value.push(session)
    return session
  }

  function registerSession({ taskIds, batchId, title } = {}) {
    const ids = Array.isArray(taskIds)
      ? taskIds.filter((id) => typeof id === 'string' && id)
      : []
    const hasBatch = typeof batchId === 'string' && batchId
    if (ids.length === 0 && !hasBatch) return null
    const session = _createSession({ title, batchId })
    for (const id of ids) {
      _ensureTask(session, id, '')
    }
    // 自动展开（用户主动发布才弹；孤儿领养/事件到达不打扰）
    panelVisible.value = true
    panelMinimized.value = false
    _pruneSessions()
    return session
  }

  function dismissSession(sessionId) {
    sessions.value = sessions.value.filter((s) => s.id !== sessionId)
  }

  function clearFinished() {
    sessions.value = sessions.value.filter((s) => s.status !== 'done')
  }

  // ─── 重试失败项 ──────────────────────────────────────────────

  async function retryFailed(sessionId) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session || retrying.value) return { ok: 0, fail: 0 }
    const failedIds = Object.keys(session.tasks).filter((id) => session.tasks[id].phase === 'failed')
    if (failedIds.length === 0) return { ok: 0, fail: 0 }
    retrying.value = true
    let ok = 0
    let fail = 0
    try {
      for (const id of failedIds) {
        try {
          const res = await retryTask(id)
          if (res && res.code === 0 && res.data && typeof res.data.taskId === 'string' && res.data.taskId) {
            const newTaskId = res.data.taskId
            if (!session.tasks[newTaskId]) {
              const platform = session.tasks[id].platform
              delete session.tasks[id]
              session.taskOrder = session.taskOrder.filter((x) => x !== id)
              _ensureTask(session, newTaskId, platform)
              ok += 1
            } else {
              // 重复重试：新 taskId 已存在，跳过
              ok += 1
            }
          } else {
            fail += 1
          }
        } catch {
          fail += 1
        }
      }
      _recomputeSessionStatus(session)
    } finally {
      retrying.value = false
    }
    return { ok, fail }
  }

  // ─── 面板形态 ────────────────────────────────────────────────

  function minimizePanel() {
    panelMinimized.value = true
    panelVisible.value = false
  }

  function expandPanel() {
    panelVisible.value = true
    panelMinimized.value = false
  }

  function consumeFirstHideToast() {
    if (firstHideToastShown.value) return false
    firstHideToastShown.value = true
    try {
      window.localStorage.setItem(FIRST_HIDE_TOAST_STORAGE_KEY, '1')
    } catch { /* localStorage 不可用时静默降级（下次再提示一次，可接受） */ }
    return true
  }

  // ─── 初始化（App 级，幂等） ──────────────────────────────────

  async function init() {
    try {
      firstHideToastShown.value = window.localStorage.getItem(FIRST_HIDE_TOAST_STORAGE_KEY) === '1'
    } catch { firstHideToastShown.value = false }
    if (!listenersBound) {
      listenersBound = true
      // 订阅所有权在 App 级：返回的 unsubscribe 故意不保存、不暴露——
      // 面板随 App.vue 常驻，订阅生命周期 == 应用生命周期（监听器死亡 bug 的结构性修复）。
      offProgress = onProgress(handleProgressEvent)
      offBatchProgress = onBatchProgress(handleBatchEvent)
    }
    // R2：渲染层重载恢复——领养不属于任何会话的运行中/排队任务（状态级，无阶段细节，如实呈现）
    try {
      const res = await getQueueStatus()
      const status = res && res.code === 0 ? res.data : null
      const running = Array.isArray(status?.running) ? status.running : []
      const queue = Array.isArray(status?.queue) ? status.queue : []
      const orphans = [...running, ...queue].filter((t) => t && typeof t.id === 'string' && !_findSessionByTaskId(t.id))
      if (orphans.length > 0) {
        const session = _createSession({ title: null, batchId: null })
        session.recovered = true
        for (const t of orphans) {
          const task = _ensureTask(session, t.id, typeof t.platform === 'string' ? t.platform : '')
          task.phase = running.includes(t) ? 'progress' : 'queued'
          task.stageKey = 'detail'
        }
      }
    } catch (e) {
      // R7：领养降级跳过，不影响事件订阅
      console.warn('[publishProgress] queue status adopt skipped:', e && e.message)
    }
  }

  // ─── getters ─────────────────────────────────────────────────

  const hasRunning = computed(() =>
    sessions.value.some((s) => s.status === 'running'),
  )

  const aggregate = computed(() => {
    let total = 0
    let done = 0
    let succeeded = 0
    let failed = 0
    for (const s of sessions.value) {
      for (const id of Object.keys(s.tasks)) {
        total += 1
        const task = s.tasks[id]
        if (task.phase === 'success') { done += 1; succeeded += 1 } else if (task.phase === 'failed') { done += 1; failed += 1 }
      }
    }
    return { total, done, succeeded, failed }
  })

  function sessionFailedCount(sessionId) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return 0
    return Object.keys(session.tasks).filter((id) => session.tasks[id].phase === 'failed').length
  }

  return {
    sessions,
    panelVisible,
    panelMinimized,
    firstHideToastShown,
    retrying,
    init,
    registerSession,
    handleProgressEvent,
    handleBatchEvent,
    retryFailed,
    dismissSession,
    clearFinished,
    minimizePanel,
    expandPanel,
    consumeFirstHideToast,
    sessionFailedCount,
    hasRunning,
    aggregate,
  }
})
