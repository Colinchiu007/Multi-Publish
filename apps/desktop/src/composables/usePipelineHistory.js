// @ts-check
/**
 * usePipelineHistory.js — 流水线历史记录 composable
 *
 * 职责：
 *   - 加载并合并 story2video 项目 + 流水线运行记录
 *   - stale running 检测（30 分钟阈值）
 *   - 运行中任务轮询刷新
 *   - 历史记录辅助方法（状态标签、阶段状态、时间格式化等）
 */
import { ref, computed } from 'vue'
import { pipelineHistory, story2videoListProjects } from '@/api/publisher'
import { historyLoadFailureDetail } from '@/i18n/story2video-locale'

const HISTORY_LOAD_TIMEOUT_MS = 5000
const STALE_RUNNING_THRESHOLD_MS = 30 * 60 * 1000

/**
 * 带超时的请求包装
 * @param {() => Promise} request
 * @returns {Promise}
 */
function settleHistoryRequest(request) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(Object.assign(new Error('历史记录加载超时'), { code: 'HISTORY_LOAD_TIMEOUT' })), HISTORY_LOAD_TIMEOUT_MS)
    request().then(result => { clearTimeout(timeoutId); resolve(result) }, err => { clearTimeout(timeoutId); reject(err) })
  })
}

/**
 * 流水线历史记录 composable
 * @param {object} [options]
 * @param {(msg: object) => void} [options.onError] 错误回调（用于弹窗等组件特定行为）
 * @returns {object} 响应式状态 + 方法
 */
export function usePipelineHistory(options = {}) {
  const history = ref([])
  const historyLoading = ref(false)
  const historyLocalMode = ref(false)
  const historyFilter = ref('all')
  const story2videoResuming = ref(false)
  const historyRequestId = ref(0)
  /** @type {ReturnType<typeof setInterval> | null} */
  let historyPollTimer = null
  let _historyRefreshing = false

  const filteredHistory = computed(() => {
    if (historyFilter.value === 'all') return history.value
    return history.value.filter(item => item.status === historyFilter.value)
  })

  const historyLocalModeText = computed(() => {
    if (!historyLocalMode.value) return ''
    return '当前为本地模式（未登录），历史记录仅保存在本机'
  })

  /**
   * 加载历史记录（合并 story2video 项目 + 流水线运行）
   * @param {object} [callbacks]
   * @param {(msg: object) => void} [callbacks.onError]
   */
  async function loadHistory(callbacks = {}) {
    const requestId = ++historyRequestId.value
    historyLoading.value = true
    const onError = callbacks.onError || options.onError
    try {
      const [projectsResult, pipelineResult] = await Promise.allSettled([
        settleHistoryRequest(() => story2videoListProjects()),
        settleHistoryRequest(() => pipelineHistory()),
      ])
      if (requestId !== historyRequestId.value) return

      const hasProjects = projectsResult.status === 'fulfilled'
        && projectsResult.value?.code === 0
        && Array.isArray(projectsResult.value.data)
      const hasRuns = pipelineResult.status === 'fulfilled'
        && pipelineResult.value?.code === 0
        && Array.isArray(pipelineResult.value.data)

      historyLocalMode.value = projectsResult.status === 'fulfilled'
        && projectsResult.value?.localMode === true

      const projects = hasProjects
        ? projectsResult.value.data.map(project => ({ ...project, historyType: 'story2video-project' }))
        : []
      const projectIds = new Set(projects.map(project => project.projectId))
      const runs = hasRuns
        ? pipelineResult.value.data.filter(run => !projectIds.has(run.id))
        : []

      // stale running 检测：updatedAt 超过 30 分钟仍为 running 的任务视为已暂停
      const now = Date.now()
      for (const run of runs) {
        if (run.status === 'running') {
          const updatedAt = run.updatedAt ? new Date(run.updatedAt).getTime() : 0
          if (updatedAt && (now - updatedAt) > STALE_RUNNING_THRESHOLD_MS) {
            run.status = 'paused'
            if (!run.pausedStage) {
              const stages = Array.isArray(run.stages) ? run.stages : []
              const runningStage = stages.find(s => s && s.status === 'running') || stages[stages.length - 1]
              run.pausedStage = runningStage ? (runningStage.name || runningStage.stage || '') : ''
            }
          }
        }
      }

      // failed 任务也视为已暂停：超时/崩溃遗留的 failed 任务统一显示为"已暂停"
      for (const run of runs) {
        if (run.status === 'failed') {
          run.status = 'paused'
          if (!run.pausedStage) {
            const stages = Array.isArray(run.stages) ? run.stages : []
            const failedStage = stages.find(s => s && s.status === 'failed')
              || stages.find(s => s && s.status !== 'completed')
              || stages[stages.length - 1]
            run.pausedStage = failedStage ? (failedStage.name || failedStage.stage || '') : ''
          }
        }
      }

      // 运行中流水线置顶，其次已完成项目，最后终态流水线
      history.value = [
        ...runs.filter(run => run.status === 'running'),
        ...projects,
        ...runs.filter(run => run.status !== 'running'),
      ]

      scheduleHistoryRefresh()

      if (!hasProjects || !hasRuns) {
        const failureMessages = [projectsResult, pipelineResult]
          .map(result => result.status === 'fulfilled' ? (result.value?.message || '') : (result.reason?.message || ''))
          .filter(Boolean)
        const failureMessage = failureMessages.find(message => historyLoadFailureDetail(message) !== '') || failureMessages[0] || ''
        if (onError) {
          onError({
            messageKey: 'HISTORY_LOAD_FAILED',
            detail: historyLoadFailureDetail(failureMessage),
          })
        }
      }
    } catch (_) {
      if (requestId !== historyRequestId.value) return
      history.value = []
      if (onError) {
        onError({ messageKey: 'HISTORY_LOAD_FAILED' })
      }
    } finally {
      if (requestId === historyRequestId.value) historyLoading.value = false
    }
  }

  function scheduleHistoryRefresh() {
    if (historyPollTimer) { clearInterval(historyPollTimer); historyPollTimer = null }
    const hasRunning = (history.value || []).some(item => item && item.status === 'running')
    if (!hasRunning) return
    historyPollTimer = setInterval(() => { refreshRunningHistory() }, 5000)
  }

  async function refreshRunningHistory() {
    if (_historyRefreshing) return
    _historyRefreshing = true
    try {
      const r = await settleHistoryRequest(() => pipelineHistory())
      if (!r || r.code !== 0 || !Array.isArray(r.data)) return
      const runningById = new Map(r.data.filter(item => item && item.status === 'running').map(item => [item.id, item]))
      const list = history.value || []
      let finishedTransition = false
      for (let i = list.length - 1; i >= 0; i--) {
        const item = list[i]
        if (!item || item.status !== 'running') continue
        const fresh = runningById.get(item.id)
        if (fresh) {
          item.stages = fresh.stages || item.stages
          item.currentStage = fresh.currentStage
          item.updatedAt = fresh.updatedAt || item.updatedAt
          runningById.delete(item.id)
        } else {
          finishedTransition = true
          list.splice(i, 1)
        }
      }
      if (finishedTransition) {
        await loadHistory()
        return
      }
      if (runningById.size > 0) {
        list.unshift(...runningById.values())
      }
    } catch (_) {
      // 刷新失败保留现有状态
    } finally {
      _historyRefreshing = false
    }
  }

  function destroy() {
    if (historyPollTimer) { clearInterval(historyPollTimer); historyPollTimer = null }
  }

  /**
   * 判断历史项是否可断点恢复
   * @param {object} item
   * @returns {boolean}
   */
  function historyItemResumable(item) {
    if (!item || (item.status !== 'failed' && item.status !== 'paused') || !(item.id || item.runId)) return false
    if (/needs_user_input|content[_-\s]?policy|可能需要修改文案/i.test(String(item.error || ''))) return false
    return true
  }

  /**
   * 阶段状态分类
   * @param {object} stage
   * @returns {string}
   */
  function historyStageState(stage) {
    if (!stage || typeof stage !== 'object') return ''
    const status = stage.status || ''
    if (status === 'completed') return 'done'
    if (status === 'running') return 'active'
    if (status === 'failed' || status === 'needs_user_input' || status === 'cancelled') return 'failed'
    return 'pending'
  }

  function historyStageLabel(stage) {
    if (!stage) return ''
    return typeof stage === 'object' ? (stage.name || stage.stage || '') : String(stage)
  }

  function historyStageTitle(stage) {
    const name = historyStageLabel(stage)
    const status = stage && typeof stage === 'object' ? (stage.status || '') : ''
    return name + (status ? ' · ' + status : '')
  }

  function formatTime(iso) {
    if (!iso) return ''
    try { return new Date(iso).toLocaleString('zh-CN') } catch (_) { return iso }
  }

  function truncateError(error) {
    if (!error) return ''
    const msg = String(error)
    return msg.length > 60 ? msg.slice(0, 57) + '...' : msg
  }

  return {
    history,
    historyLoading,
    historyLocalMode,
    historyLocalModeText,
    historyFilter,
    filteredHistory,
    story2videoResuming,
    loadHistory,
    destroy,
    historyItemResumable,
    historyStageState,
    historyStageLabel,
    historyStageTitle,
    formatTime,
    truncateError,
  }
}
