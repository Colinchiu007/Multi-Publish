// @ts-check
/**
 * useBatchPublish.js — 批量发布 composable（从 Publish.vue 拆分）
 *
 * 职责：
 *   - 维护 batchMode / articles / batchProgress / templateTargetIdx / precheckEnabled 状态
 *   - addArticle / removeArticle / duplicateArticle / applyTemplate 文章管理
 *   - handleBatchPublish 批量发布流程（batchCreate + batchSchedule/batchExecute）
 *   - checkBatchAccess 权限检查（Pro 才能用批量模式）
 *   - watch batchMode 切换时自动初始化 articles
 *
 * 依赖（参数传入）：
 *   - article: reactive 对象（单篇模式 applyTemplate 目标）
 *   - licenseStore: { isPro: boolean }
 */
import { ref, computed, watch, getCurrentScope, onScopeDispose } from 'vue'
import { ElMessage } from 'element-plus'
import { batchCreate, onProgress } from '@/api/publisher'

let _keyCounter = 1

function freshKey() {
  return 'a_' + (_keyCounter++) + '_' + Date.now()
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value))
}

const DEFAULT_BATCH_STATUS_POLL_INTERVAL_MS = 5000
const DEFAULT_BATCH_STATUS_POLL_MAX_ATTEMPTS = 180

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * 批量发布 composable
 * @param {object} options
 * @param {object} options.article - 单篇模式 reactive article
 * @param {object} options.licenseStore - { isPro: boolean }
 * @returns {object} 响应式状态 + 方法
 */
export function useBatchPublish(options) {
  const article = options.article
  const licenseStore = options.licenseStore
  const batchStatusPollIntervalMs = positiveInteger(
    options.batchStatusPollIntervalMs,
    DEFAULT_BATCH_STATUS_POLL_INTERVAL_MS,
  )
  const batchStatusPollMaxAttempts = positiveInteger(
    options.batchStatusPollMaxAttempts,
    DEFAULT_BATCH_STATUS_POLL_MAX_ATTEMPTS,
  )

  const batchMode = ref(false)
  const batchPublishing = ref(false)
  const precheckEnabled = ref(false)
  const articles = ref([])
  const batchProgress = ref([])
  const templateTargetIdx = ref(-1)
  const showTemplatePicker = ref(false)
  let stopBatchProgress = null
  let batchStatusPollTimer = null

  function clearBatchStatusPollTimer() {
    if (batchStatusPollTimer !== null) {
      clearTimeout(batchStatusPollTimer)
      batchStatusPollTimer = null
    }
  }

  function clearBatchProgressListener() {
    if (typeof stopBatchProgress === 'function') {
      const stop = stopBatchProgress
      stopBatchProgress = null
      stop()
    }
  }

  function clearBatchTracking() {
    clearBatchStatusPollTimer()
    clearBatchProgressListener()
  }

  if (getCurrentScope()) {
    onScopeDispose(clearBatchTracking)
  }

  const batchDone = computed(function () {
    return batchProgress.value.filter(function (p) { return p.type === 'success' }).length
  })

  const batchFail = computed(function () {
    return batchProgress.value.filter(function (p) { return p.type === 'danger' }).length
  })

  const totalPlatformTasks = computed(function () {
    return articles.value.reduce(function (s, a) {
      return s + (a.platforms ? a.platforms.length : 0)
    }, 0)
  })

  function checkBatchAccess() {
    if (batchMode.value && licenseStore && !licenseStore.isPro) {
      batchMode.value = false
    }
  }

  function applyTemplate(data) {
    if (batchMode.value && templateTargetIdx.value >= 0) {
      const a = articles.value[templateTargetIdx.value]
      if (a) {
        a.title = data.title
        a.content = data.content
      }
    } else {
      article.title = data.title
      article.content = data.content
    }
    showTemplatePicker.value = false
  }

  function addArticle() {
    articles.value.push({
      _key: freshKey(),
      title: '',
      content: '',
      platforms: [],
      publishTime: '',
    })
  }

  function removeArticle(idx) {
    if (idx >= 0 && idx < articles.value.length) {
      articles.value.splice(idx, 1)
    }
  }

  function duplicateArticle(idx) {
    const orig = articles.value[idx]
    if (!orig) return
    articles.value.splice(idx + 1, 0, {
      title: orig.title,
      content: orig.content,
      platforms: orig.platforms ? orig.platforms.slice() : [],
      publishTime: '',
      _key: freshKey(),
    })
    // 复制标题加后缀
    articles.value[idx + 1].title = orig.title + ' (复制)'
  }

  async function handleBatchPublish() {
    if (batchPublishing.value) return
    batchPublishing.value = true

    let offProgress
    let keepPublishingLock = false
    try {
      // 验证每篇文章
      for (const a of articles.value) {
        if (!a.title.trim()) {
          ElMessage.warning('有文章缺少标题')
          return
        }
        if (!a.content.trim()) {
          ElMessage.warning('有文章缺少正文')
          return
        }
        if (!a.platforms || a.platforms.length === 0) {
          ElMessage.warning('"' + a.title.slice(0, 20) + '" 未选择发布平台')
          return
        }
      }

      clearBatchTracking()
      offProgress = onProgress(function (data) {
        batchProgress.value.push({
          text: '[' + data.platform + '] ' + data.stage,
          time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          type: data.type || 'primary',
        })
      })

      const createRes = await batchCreate(toPlainJson({
        name: '批量发布 ' + new Date().toLocaleDateString('zh-CN'),
        articles: articles.value.map(function (a) {
          return {
            title: a.title,
            content: a.content,
            platforms: a.platforms,
            publishTime: a.publishTime || null,
            precheck: precheckEnabled.value,
          }
        }),
      }))

      if (!createRes || createRes.code !== 0) {
        throw new Error((createRes && createRes.message) || '创建批量任务失败')
      }
      if (!createRes.data || !createRes.data.id) {
        throw new Error('创建批量任务失败：响应缺少批次 ID')
      }

      const batchId = createRes.data.id
      const api = window.electronAPI

      // 检查是否有定时任务
      const hasScheduled = articles.value.some(function (a) { return a.publishTime })
      if (hasScheduled) {
        const scheduleRes = await api.batchSchedule(batchId)
        if (!scheduleRes || scheduleRes.code !== 0) {
          throw new Error((scheduleRes && scheduleRes.message) || '批量排期失败')
        }
        batchProgress.value.push({
          text: '✅ 已排期 ' + articles.value.length + ' 篇文章',
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'success',
        })
      } else {
        const expectedTaskCount = totalPlatformTasks.value
        let receivedTaskCount = 0
        let succeededTaskCount = 0
        let failedTaskCount = 0
        let completedBeforeSubscribe = false
        let batchSettled = false
        let pollAttempts = 0
        const seenTaskIds = new Set()

        const finishBatchProgress = function (counts) {
          if (batchSettled) return
          batchSettled = true
          batchPublishing.value = false
          const succeeded = counts && Number.isInteger(counts.succeeded)
            ? counts.succeeded
            : succeededTaskCount
          const failed = counts && Number.isInteger(counts.failed)
            ? counts.failed
            : failedTaskCount
          const total = counts && Number.isInteger(counts.total)
            ? counts.total
            : expectedTaskCount

          if (failed === total && total > 0) {
            ElMessage.error('批量发布失败：' + failed + ' 个任务全部失败')
          } else if (failed > 0) {
            ElMessage.warning('批量发布完成：' + succeeded + ' 个成功，' + failed + ' 个失败')
          } else {
            ElMessage.success('批量发布完成：' + succeeded + ' 个任务全部成功')
          }

          if (stopBatchProgress) clearBatchTracking()
          else completedBeforeSubscribe = true
        }

        const unsubscribe = api.onBatchProgress(function (data) {
          if (!data || (data.batchId && data.batchId !== batchId)) return
          if (data.kind === 'batch-complete') {
            finishBatchProgress(data)
            return
          }
          if (data.taskId && seenTaskIds.has(data.taskId)) return
          if (data.taskId) seenTaskIds.add(data.taskId)

          const title = String(data.title || '').slice(0, 20)
          const platform = data.platform || '未知平台'
          batchProgress.value.push({
            text: data.ok
              ? '✅ [' + platform + '] ' + title + ': 发布成功'
              : '❌ [' + platform + '] ' + title + ': ' + (data.message || '发布失败'),
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            type: data.ok ? 'success' : 'danger',
          })

          receivedTaskCount += 1
          if (data.ok) succeededTaskCount += 1
          else failedTaskCount += 1
          if (receivedTaskCount >= expectedTaskCount) finishBatchProgress()
        })
        stopBatchProgress = typeof unsubscribe === 'function' ? unsubscribe : null
        if (completedBeforeSubscribe) clearBatchTracking()

        const executeRes = await api.batchExecute(batchId)
        if (!executeRes || executeRes.code !== 0) {
          throw new Error((executeRes && executeRes.message) || '批量执行失败')
        }
        const executeContract = executeRes.data && typeof executeRes.data === 'object'
          ? executeRes.data
          : executeRes
        const acceptedCount = Number.isInteger(executeContract.accepted)
          ? executeContract.accepted
          : expectedTaskCount
        const enqueueFailedCount = Number.isInteger(executeContract.failed)
          ? executeContract.failed
          : 0
        batchProgress.value.push({
          text: enqueueFailedCount > 0
            ? '🚀 已接受 ' + acceptedCount + ' 个发布任务，' + enqueueFailedCount + ' 个入队失败'
            : '🚀 已接受 ' + acceptedCount + ' 个发布任务',
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'primary',
        })

        const pollBatchStatus = async function () {
          if (batchSettled) return
          pollAttempts += 1
          try {
            if (typeof api.batchGet === 'function') {
              const statusRes = await api.batchGet(batchId)
              const status = statusRes && statusRes.code === 0 ? statusRes.data : null
              if (status && status.status === 'done') {
                const completed = Number.isInteger(status.completed) ? status.completed : expectedTaskCount
                const failed = Number.isInteger(status.failed) ? status.failed : failedTaskCount
                finishBatchProgress({
                  total: Number.isInteger(status.total) ? status.total : expectedTaskCount,
                  succeeded: Math.max(0, completed - failed),
                  failed,
                })
                return
              }
            }
          } catch (_) {
            // IPC 瞬时失败由下一次有界轮询重试，达到上限后统一提示。
          }

          if (batchSettled) return
          if (pollAttempts >= batchStatusPollMaxAttempts) {
            batchSettled = true
            batchPublishing.value = false
            ElMessage.error('批量发布状态确认超时，请在任务记录中查看最终结果')
            clearBatchTracking()
            return
          }
          scheduleBatchStatusPoll()
        }

        const scheduleBatchStatusPoll = function () {
          if (batchSettled) return
          batchStatusPollTimer = setTimeout(function () {
            batchStatusPollTimer = null
            void pollBatchStatus()
          }, batchStatusPollIntervalMs)
          if (batchStatusPollTimer && typeof batchStatusPollTimer.unref === 'function') {
            batchStatusPollTimer.unref()
          }
        }

        if (!batchSettled) {
          keepPublishingLock = true
          scheduleBatchStatusPoll()
        }
      }
    } catch (e) {
      keepPublishingLock = false
      clearBatchTracking()
      batchProgress.value.push({
        text: '❌ 批量发布失败: ' + ((e && e.message) || '未知错误'),
        time: new Date().toLocaleTimeString('zh-CN'),
        type: 'danger',
      })
    } finally {
      if (!keepPublishingLock) batchPublishing.value = false
      if (typeof offProgress === 'function') {
        try {
          offProgress()
        } catch (cleanupError) {
          batchProgress.value.push({
            text: '⚠️ 全局进度监听清理失败: ' + ((cleanupError && cleanupError.message) || '未知错误'),
            time: new Date().toLocaleTimeString('zh-CN'),
            type: 'warning',
          })
        }
      }
    }
  }

  // 批量模式切换时初始化
  watch(batchMode, function (val) {
    if (val && articles.value.length === 0) addArticle()
  })

  return {
    batchMode,
    batchPublishing,
    precheckEnabled,
    articles,
    batchProgress,
    templateTargetIdx,
    showTemplatePicker,
    batchDone,
    batchFail,
    totalPlatformTasks,
    addArticle,
    removeArticle,
    duplicateArticle,
    handleBatchPublish,
    applyTemplate,
    checkBatchAccess,
  }
}
