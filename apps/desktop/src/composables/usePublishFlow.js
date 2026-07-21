// @ts-check
/**
 * usePublishFlow.js — 单篇发布流程 composable（从 Publish.vue 拆分）
 *
 * 职责：
 *   - 维护 publishing / progress / result / copied 状态
 *   - handlePublish：标题/正文校验 → 敏感词预检 → 离线检测 → publishBatch → 进度回调
 *   - addProgress：进度条目追加
 *   - copyUrl：剪贴板复制（含 fallback）
 *
 * 依赖（参数传入，避免循环引用）：
 *   - article: reactive 对象 { title, content, author, cover_url, video_path }
 *   - selectedPlatforms: ref<string[]>
 *   - selectedAccounts: ref<{[platformId]: accountId}>
 *   - precheckEnabled: ref<boolean>
 */
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  publishBatch,
  onProgress,
  sensitiveCheck,
  offlineStatus,
  offlineAddToCache,
  schedulerCreate,
  schedulerCancel,
  cancelTask,
  showNotification,
  storeGetSetting,
  storeSetSetting,
} from '@/api/publisher'
import {
  buildPublishTargets,
  validatePlatformContent,
  validatePublishTargets,
  validateScheduleEntries,
} from '@/features/publish/publish-contract'

const MARKDOWN_RE = /^#\s|^\*\*|^>\s|^```/m
const MARKDOWN_LINK_RE = /\[.+\]\(.+\)/

function isMarkdownContent(content) {
  return MARKDOWN_RE.test(content) || MARKDOWN_LINK_RE.test(content)
}

function nowTimeString() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizePlatformOverrides (overrides) {
  if (!overrides || typeof overrides !== 'object') return {}
  return Object.fromEntries(Object.entries(overrides).flatMap(([platform, value]) => {
    if (!value || typeof value !== 'object') return []
    const normalized = {
      title: typeof value.title === 'string' ? value.title : '',
      content: typeof value.content === 'string' ? value.content : '',
    }
    if (platform === 'zhihu') {
      const declaration = Number(value.declare)
      normalized.commentPermission = 'anyone'
      normalized.declare = Number.isInteger(declaration) && declaration >= 0 && declaration <= 5
        ? declaration
        : 0
    }
    if (!normalized.title && !normalized.content && platform !== 'zhihu') return []
    return [[platform, normalized]]
  }))
}

/**
 * 单篇发布流程 composable
 * @param {object} options
 * @param {object} options.article
 * @param {object} options.selectedPlatforms
 * @param {object} options.selectedAccounts
 * @param {object} options.precheckEnabled
 * @returns {object} 响应式状态 + 方法
 */
export function usePublishFlow(options) {
  const article = options.article
  const selectedPlatforms = options.selectedPlatforms
  const selectedAccounts = options.selectedAccounts
  const precheckEnabled = options.precheckEnabled
  const diffEdits = options.diffEdits || null
  const isAccountAvailable = typeof options.isAccountAvailable === 'function'
    ? options.isAccountAvailable
    : null

  const publishing = ref(false)
  const progress = ref([])
  const result = ref(null)
  const copied = ref(false)
  const activeTaskIds = ref([])
  const activeScheduleIds = ref([])
  let precheckInitialized = false
  let loadingPrecheckPreference = false

  watch(precheckEnabled, value => {
    if (!precheckInitialized || loadingPrecheckPreference) return
    Promise.resolve(storeSetSetting('precheckEnabled', Boolean(value))).catch(() => {})
  }, { flush: 'sync' })

  async function loadPrecheckPreference() {
    loadingPrecheckPreference = true
    try {
      const value = await storeGetSetting('precheckEnabled')
      precheckEnabled.value = value === true || value === 'true'
    } catch (_) {
      precheckEnabled.value = false
    } finally {
      loadingPrecheckPreference = false
      precheckInitialized = true
    }
  }

  function addProgress(text, type) {
    const t = type === undefined ? 'primary' : type
    progress.value.push({ text: text, time: nowTimeString(), type: t })
  }

  function copyUrl(url) {
    return Promise.resolve()
      .then(function () {
        return navigator.clipboard.writeText(url)
      })
      .then(function () {
        copied.value = true
        setTimeout(function () { copied.value = false }, 2000)
      })
      .catch(function () {
        // fallback for older browsers
        const ta = document.createElement('textarea')
        ta.value = url
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        copied.value = true
        setTimeout(function () { copied.value = false }, 2000)
      })
  }

  async function notifyFailure (title, body) {
    try {
      await showNotification({ title, body })
    } catch (_) {
      // 通知失败不应覆盖发布结果。
    }
  }

  function getTargets () {
    return buildPublishTargets(selectedPlatforms.value, selectedAccounts.value)
  }

  function buildArticleData () {
    const md = isMarkdownContent(article.content)
    return {
      title: article.title,
      content: article.content,
      contentFormat: md ? 'markdown' : 'html',
      author: article.author || '',
      cover_url: article.cover_url || '',
      video_path: article.video_path || '',
      precheck: precheckEnabled.value,
      platformOverrides: normalizePlatformOverrides(diffEdits),
    }
  }

  async function scheduleTargets (targets, data) {
    const scheduleIds = []
    activeScheduleIds.value = []
    try {
      for (const target of targets) {
        const res = await schedulerCreate(toPlainJson({
          platform: target.platform,
          publishTime: article.publishTime,
          article: { ...data, accountId: target.accountId },
        }))
        if (!res || res.code !== 0) {
          throw new Error((res && res.message) || '定时任务创建失败')
        }
        const scheduleId = res.data && res.data.id
        if (!scheduleId) throw new Error('定时任务创建成功但未返回任务 ID')
        scheduleIds.push(scheduleId)
        activeScheduleIds.value = scheduleIds.slice()
      }
      return scheduleIds
    } catch (error) {
      const rollbackResults = await Promise.allSettled(
        scheduleIds.map(scheduleId => schedulerCancel(scheduleId)),
      )
      const rollbackFailedIds = scheduleIds.filter((scheduleId, index) => {
        const rollback = rollbackResults[index]
        return rollback.status === 'rejected' || !rollback.value || rollback.value.code !== 0 || rollback.value.data === false
      })
      activeScheduleIds.value = rollbackFailedIds
      if (rollbackFailedIds.length > 0) {
        const message = error && error.message ? error.message : '定时任务创建失败'
        throw new Error(`${message}；${rollbackFailedIds.length} 个定时任务回滚失败，请点击取消重试`)
      }
      throw error
    }
  }

  async function handlePublish() {
    if (publishing.value) return
    if (!article.title.trim()) {
      ElMessage.warning('请输入文章标题')
      return
    }
    if (!article.content.trim()) {
      ElMessage.warning('请输入正文内容')
      return
    }
    if (!Array.isArray(selectedPlatforms.value) || selectedPlatforms.value.length === 0) {
      ElMessage.warning('请选择至少一个发布平台')
      return
    }

    const targets = getTargets()
    if (
      isAccountAvailable &&
      targets.some(target => target.accountId && !isAccountAvailable(target.platform, target.accountId))
    ) {
      ElMessage.warning('所选账号已失效，请重新选择发布账号')
      return
    }
    const targetCheck = validatePublishTargets(targets)
    if (!targetCheck.valid) {
      ElMessage.warning(targetCheck.message)
      return
    }
    const contentCheck = validatePlatformContent({
      platforms: selectedPlatforms.value,
      article,
      platformOverrides: diffEdits || {},
    })
    if (!contentCheck.valid) {
      ElMessage.warning(contentCheck.message)
      return
    }

    publishing.value = true
    progress.value = []
    result.value = null
    activeTaskIds.value = []
    activeScheduleIds.value = []
    let off

    try {
      // 敏感词预检
      if (sensitiveCheck) {
      const titleResult = await sensitiveCheck(article.title)
      const contentResult = await sensitiveCheck(article.content)
      const allWords = [].concat(
        (titleResult.data && titleResult.data.words) || [],
        (contentResult.data && contentResult.data.words) || []
      )
        if (allWords.length > 0) {
          try {
          await ElMessageBox.confirm(
            '发布内容包含敏感词：' + allWords.join('、') + '，是否仍然发布？',
            '敏感词提示',
            { confirmButtonText: '强制发布', cancelButtonText: '修改', type: 'warning' }
          )
          } catch (e) {
            return
          }
        }
      }

      const data = buildArticleData()
      if (article.publishTime) {
        const scheduleCheck = validateScheduleEntries(
          targets.map(target => ({ ...target, publishTime: article.publishTime })),
        )
        if (!scheduleCheck.valid) {
          addProgress('✗ ' + scheduleCheck.message, 'danger')
          result.value = { success: false, message: scheduleCheck.message }
          return
        }
      }

      // 离线检测
      const offlineRes = await offlineStatus()
      if (offlineRes && offlineRes.code === 0 && offlineRes.data && offlineRes.data.offline) {
        const cacheRes = await offlineAddToCache(toPlainJson({ targets, data }))
        if (!cacheRes || cacheRes.code !== 0 || cacheRes.data === false) {
          throw new Error((cacheRes && cacheRes.message) || '离线任务缓存失败')
        }
        addProgress('📡 网络已断开，发布任务已缓存，网络恢复后自动重试', 'warning')
        ElMessage.warning('网络已断开，任务已缓存')
        return
      }

      if (article.publishTime) {
        const scheduleIds = await scheduleTargets(targets, data)
        addProgress('⏰ 已创建 ' + scheduleIds.length + ' 个定时任务', 'success')
        result.value = { success: true, message: '定时任务已创建', scheduled: true }
        return
      }

      off = onProgress(function (data) {
        addProgress('[' + data.platform + '] ' + data.stage)
      })

      addProgress('发布到 ' + targets.length + ' 个目标（含多账号）...', 'info')
      const payload = toPlainJson({ targets, data })
      const res = await publishBatch(payload.targets, payload.data)
      if (res.code === 0) {
        activeTaskIds.value = Array.isArray(res.data && res.data.taskIds)
          ? res.data.taskIds.slice()
          : []
        const count = (res.data && res.data.taskIds && res.data.taskIds.length) || ''
        addProgress('✓ 已添加 ' + count + ' 个任务', 'success')
        result.value = { success: true, message: res.message || '任务已加入队列', url: '' }
      } else {
        const message = res.message || '发布失败'
        addProgress('✗ 发布失败: ' + message, 'danger')
        result.value = { success: false, message }
        await notifyFailure('发布失败', message)
      }
    } catch (e) {
      const message = e && e.message ? e.message : '发布异常'
      addProgress('✗ 错误: ' + message, 'danger')
      result.value = { success: false, message }
      await notifyFailure('发布异常', message)
    } finally {
      publishing.value = false
      if (typeof off === 'function') off()
    }
  }

  async function cancelPublish () {
    const taskIds = activeTaskIds.value.slice()
    const scheduleIds = activeScheduleIds.value.slice()
    if (taskIds.length === 0 && scheduleIds.length === 0) {
      ElMessage.info('当前没有可取消的任务')
      return { success: false, cancelled: 0 }
    }
    const results = await Promise.all([
      ...taskIds.map(id => cancelTask(id)),
      ...scheduleIds.map(id => schedulerCancel(id)),
    ])
    const cancelled = results.filter(item => item && item.code === 0 && item.data !== false).length
    activeTaskIds.value = []
    activeScheduleIds.value = []
    addProgress('已取消 ' + cancelled + ' 个任务', 'warning')
    result.value = { success: false, cancelled, message: '任务已取消' }
    return { success: cancelled > 0, cancelled }
  }

  async function retryPublish () {
    if (!result.value || result.value.success) {
      ElMessage.info('当前没有失败的发布任务')
      return
    }
    return handlePublish()
  }

  return {
    publishing,
    progress,
    result,
    copied,
    activeTaskIds,
    activeScheduleIds,
    handlePublish,
    cancelPublish,
    retryPublish,
    loadPrecheckPreference,
    addProgress,
    copyUrl,
  }
}
