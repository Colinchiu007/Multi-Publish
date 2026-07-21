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
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  batchCreate,
  batchExecute,
  batchSchedule,
  batchGet,
  retryTask,
  onBatchProgress,
  onProgress,
} from '@/api/publisher'
import { buildPublishTargets, validateScheduleEntries } from '@/features/publish/publish-contract'

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
  const isAccountAvailable = typeof options.isAccountAvailable === 'function'
    ? options.isAccountAvailable
    : null
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
  const failedBatchTasks = ref([])
  const retryingFailed = ref(false)
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
      return s + buildPublishTargets(a.platforms || [], a.accounts || a.selectedAccounts || {}).length
    }, 0)
  })

  function getArticleTargets (articleItem) {
    const normalized = buildPublishTargets(
      articleItem.platforms || [],
      articleItem.accounts || articleItem.selectedAccounts || {},
    )
    const hasExplicitAccount = normalized.some(target => target.accountId)
    // 保持旧批量 IPC 的字符串形态；只有实际选择账号时才发送对象目标。
    return hasExplicitAccount ? normalized : (articleItem.platforms || []).slice()
  }

  function checkBatchAccess() {
    if (batchMode.value && licenseStore && !licenseStore.isPro) {
      batchMode.value = false
    }
  }

  function toggleBatchAccount (articleItem, platformId, accountId) {
    if (!articleItem.accounts) articleItem.accounts = {}
    const selected = Array.isArray(articleItem.accounts[platformId])
      ? articleItem.accounts[platformId].slice()
      : (articleItem.accounts[platformId] ? [articleItem.accounts[platformId]] : [])
    const index = selected.indexOf(accountId)
    if (index === -1) selected.push(accountId)
    else selected.splice(index, 1)
    articleItem.accounts[platformId] = selected
  }

  function isBatchAccountSelected (articleItem, platformId, accountId) {
    const value = articleItem?.accounts?.[platformId]
    return Array.isArray(value) ? value.includes(accountId) : value === accountId
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
      accounts: {},
      author: '',
      cover_url: '',
      video_path: '',
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
      accounts: JSON.parse(JSON.stringify(orig.accounts || orig.selectedAccounts || {})),
      author: orig.author || '',
      cover_url: orig.cover_url || '',
      video_path: orig.video_path || '',
      publishTime: '',
      _key: freshKey(),
    })
    // 复制标题加后缀
    articles.value[idx + 1].title = orig.title + ' (复制)'
  }

  async function retryFailedBatch () {
    if (retryingFailed.value || failedBatchTasks.value.length === 0) return
    retryingFailed.value = true
    const pending = failedBatchTasks.value.slice()
    const remaining = []
    let accepted = 0

    try {
      for (const task of pending) {
        try {
          const response = await retryTask(task.taskId)
          if (!response || response.code !== 0) {
            throw new Error(response?.message || '任务无法重试')
          }
          accepted += 1
          batchProgress.value.push({
            text: `↻ [${task.platform}] ${task.title || task.taskId}: 已重新提交`,
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type: 'primary',
          })
        } catch (error) {
          remaining.push(task)
          batchProgress.value.push({
            text: `✗ [${task.platform}] ${task.title || task.taskId}: ${error?.message || '重新提交失败'}`,
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type: 'danger',
          })
        }
      }
      failedBatchTasks.value = remaining
      if (accepted > 0 && remaining.length === 0) {
        ElMessage.success(`已重新提交 ${accepted} 个失败任务`)
      } else if (accepted > 0) {
        ElMessage.warning(`已重新提交 ${accepted} 个任务，${remaining.length} 个任务仍失败`)
      } else {
        ElMessage.error('失败任务重新提交失败')
      }
    } finally {
      retryingFailed.value = false
    }
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
        if (
          isAccountAvailable &&
          buildPublishTargets(a.platforms, a.accounts || a.selectedAccounts || {})
            .some(target => target.accountId && !isAccountAvailable(target.platform, target.accountId))
        ) {
          ElMessage.warning('批量文章中有账号已失效，请重新选择发布账号')
          return
        }
      }

      const scheduleEntries = articles.value.flatMap(function (a) {
        if (!a.publishTime) return []
        return buildPublishTargets(
          a.platforms || [],
          a.accounts || a.selectedAccounts || {},
        ).map(function (target) {
          return { ...target, publishTime: a.publishTime }
        })
      })
      const scheduleCheck = validateScheduleEntries(scheduleEntries)
      if (!scheduleCheck.valid) {
        ElMessage.warning(scheduleCheck.message)
        return
      }

      try {
        await ElMessageBox.confirm(
          `即将发布 ${articles.value.length} 篇内容，共 ${totalPlatformTasks.value} 个平台账号任务。请确认各平台表单信息完整。`,
          '确认批量发布',
          {
            confirmButtonText: '确认发布',
            cancelButtonText: '取消',
            type: 'warning',
          },
        )
      } catch (_) {
        return
      }

      clearBatchTracking()
      batchProgress.value = []
      failedBatchTasks.value = []
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
            platforms: getArticleTargets(a),
            publishTime: a.publishTime || null,
            precheck: precheckEnabled.value,
            author: a.author || '',
            cover_url: a.cover_url || '',
            video_path: a.video_path || '',
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
      // 检查是否有定时任务
      const hasScheduled = articles.value.some(function (a) { return a.publishTime })
      if (hasScheduled) {
        const scheduleRes = await batchSchedule(batchId)
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

        const unsubscribe = onBatchProgress(function (data) {
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
          if (!data.ok && typeof data.taskId === 'string' && data.taskId &&
              !failedBatchTasks.value.some(task => task.taskId === data.taskId)) {
            failedBatchTasks.value.push({
              taskId: data.taskId,
              platform,
              title,
            })
          }

          receivedTaskCount += 1
          if (data.ok) succeededTaskCount += 1
          else failedTaskCount += 1
          if (receivedTaskCount >= expectedTaskCount) finishBatchProgress()
        })
        stopBatchProgress = typeof unsubscribe === 'function' ? unsubscribe : null
        if (completedBeforeSubscribe) clearBatchTracking()

        const executeRes = await batchExecute(batchId)
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
            if (typeof batchGet === 'function') {
              const statusRes = await batchGet(batchId)
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
    failedBatchTasks,
    retryingFailed,
    templateTargetIdx,
    showTemplatePicker,
    batchDone,
    batchFail,
    totalPlatformTasks,
    addArticle,
    removeArticle,
    duplicateArticle,
    handleBatchPublish,
    retryFailedBatch,
    applyTemplate,
    checkBatchAccess,
    toggleBatchAccount,
    isBatchAccountSelected,
  }
}
